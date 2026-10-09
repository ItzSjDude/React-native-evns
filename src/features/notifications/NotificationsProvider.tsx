import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {AppState} from 'react-native';
import {useAppSelector} from '../../core/store/hooks';
import {getUnreadCount, registerPushDevice} from './notificationsService';
import {
  devicePlatform,
  getLaunchNotification,
  getPushToken,
  invalidatePushToken,
  noticeFromRemoteMessage,
  requestNotificationPermission,
  subscribeForegroundMessages,
  subscribeNotificationOpened,
  subscribeTokenRefresh,
  targetFromRemoteMessage,
} from './pushMessaging';
import NotificationBanner from './NotificationBanner';
import NotificationsSheet from './NotificationsSheet';
import {NotificationsContext, type NotificationsContextValue} from './notificationsContext';
import type {ForegroundNotice, NotificationNavigator, NotificationTarget} from './types';

/** How long a tapped push waits for a navigator (cold start) before falling back to the sheet. */
const NAVIGATOR_WAIT_MS = 5000;
/** Lets the post-login transition settle before the OS permission dialog appears. */
const PERMISSION_DELAY_MS = 1200;

type Props = {
  children?: React.ReactNode;
  /** Optional static navigator; `useNotificationNavigator` handlers take precedence. */
  onNavigate?: NotificationNavigator;
};

export function NotificationsProvider({children, onNavigate}: Props) {
  const status = useAppSelector(state => state.auth.status);
  const needsOnboarding = useAppSelector(state => state.auth.needsOnboarding);
  const signedIn = status === 'authenticated';
  const readyForPrompts = signedIn && !needsOnboarding;

  const [unreadCount, setUnreadCount] = useState(0);
  const [listVersion, setListVersion] = useState(0);
  const [isSheetOpen, setSheetOpen] = useState(false);
  const [notice, setNotice] = useState<ForegroundNotice | null>(null);

  const signedInRef = useRef(signedIn);
  signedInRef.current = signedIn;
  const registeredToken = useRef<string | null>(null);
  const navigators = useRef<NotificationNavigator[]>([]);
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;
  const pendingTarget = useRef<NotificationTarget | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const launchChecked = useRef(false);
  const permissionAsked = useRef(false);

  const refreshUnreadCount = useCallback(async () => {
    if (!signedInRef.current) return;
    try {
      const count = await getUnreadCount();
      if (signedInRef.current) setUnreadCount(count);
    } catch {
      // Keep the last known badge; the next focus or push retries.
    }
  }, []);

  const openNotifications = useCallback(() => setSheetOpen(true), []);
  const closeNotifications = useCallback(() => setSheetOpen(false), []);

  const navigate = useCallback((target: NotificationTarget): boolean => {
    if (target.kind === 'notifications') return false;
    const handler = navigators.current[navigators.current.length - 1] ?? onNavigateRef.current;
    if (!handler) return false;
    try { return handler(target) === true; } catch { return false; }
  }, []);

  const clearPending = () => {
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    pendingTimer.current = null;
    pendingTarget.current = null;
  };

  const openTarget = useCallback((target: NotificationTarget) => {
    if (!signedInRef.current) return;
    const hasNavigator = navigators.current.length > 0 || !!onNavigateRef.current;
    if (target.kind !== 'notifications' && !hasNavigator) {
      // Cold start: the navigation tree may not have mounted yet. Hold the target briefly.
      clearPending();
      pendingTarget.current = target;
      pendingTimer.current = setTimeout(() => {
        pendingTimer.current = null;
        if (pendingTarget.current) { pendingTarget.current = null; setSheetOpen(true); }
      }, NAVIGATOR_WAIT_MS);
      return;
    }
    if (!navigate(target)) setSheetOpen(true);
  }, [navigate]);

  const registerNavigator = useCallback((navigator: NotificationNavigator) => {
    navigators.current = [...navigators.current, navigator];
    const pending = pendingTarget.current;
    if (pending) {
      clearPending();
      // Let the registering screen finish mounting before navigating away from it.
      setTimeout(() => { if (!navigate(pending)) setSheetOpen(true); }, 0);
    }
    return () => { navigators.current = navigators.current.filter(item => item !== navigator); };
  }, [navigate]);

  // Device registration, token refresh, foreground messages and taps: signed-in only.
  useEffect(() => {
    if (!signedIn) return;
    let active = true;

    const register = async (token: string | null | undefined) => {
      if (!token || !active || registeredToken.current === token) return;
      try {
        await registerPushDevice(token, devicePlatform());
        if (active) registeredToken.current = token;
      } catch (error) {
        if (__DEV__) console.warn('[notifications] device registration failed', error);
      }
    };

    getPushToken().then(register, error => {
      // No Play Services (some emulators) or no APNs: in-app notifications still work.
      if (__DEV__) console.warn('[notifications] FCM token unavailable', error);
    });

    const unsubscribers = [
      subscribeTokenRefresh(token => { registeredToken.current = null; register(token); }),
      subscribeForegroundMessages(message => {
        // FCM does not draw notifications for a foregrounded app; show our own banner.
        const next = noticeFromRemoteMessage(message);
        if (next) setNotice(next);
        setListVersion(version => version + 1);
        refreshUnreadCount();
      }),
      subscribeNotificationOpened(message => openTarget(targetFromRemoteMessage(message))),
    ];

    if (!launchChecked.current) {
      launchChecked.current = true;
      getLaunchNotification()
        .then(message => { if (message && active) openTarget(targetFromRemoteMessage(message)); })
        .catch(() => {});
    }

    refreshUnreadCount();
    const appState = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      refreshUnreadCount();
      if (!registeredToken.current) getPushToken().then(register, () => {});
    });

    return () => {
      active = false;
      unsubscribers.forEach(unsubscribe => { if (typeof unsubscribe === 'function') unsubscribe(); });
      appState?.remove?.();
    };
  }, [openTarget, refreshUnreadCount, signedIn]);

  // Ask for notification permission once per process, after sign-in and onboarding.
  useEffect(() => {
    if (!readyForPrompts || permissionAsked.current) return;
    const timer = setTimeout(() => {
      permissionAsked.current = true;
      requestNotificationPermission().catch(() => {});
    }, PERMISSION_DELAY_MS);
    return () => clearTimeout(timer);
  }, [readyForPrompts]);

  // Sign-out: drop local state and invalidate this install's FCM token so the old
  // account stops receiving pushes here (the API prunes the dead token on next send).
  const wasSignedIn = useRef(signedIn);
  useEffect(() => {
    if (wasSignedIn.current && !signedIn) {
      setUnreadCount(0);
      setSheetOpen(false);
      setNotice(null);
      clearPending();
      if (registeredToken.current) {
        registeredToken.current = null;
        invalidatePushToken().catch(() => {});
      }
    }
    wasSignedIn.current = signedIn;
  }, [signedIn]);

  useEffect(() => () => { if (pendingTimer.current) clearTimeout(pendingTimer.current); }, []);

  const value = useMemo<NotificationsContextValue>(() => ({
    enabled: signedIn,
    unreadCount,
    refreshUnreadCount,
    setUnreadCount,
    listVersion,
    isSheetOpen,
    openNotifications,
    closeNotifications,
    openTarget,
    navigateTo: navigate,
    registerNavigator,
  }), [closeNotifications, isSheetOpen, listVersion, navigate, openNotifications, openTarget, refreshUnreadCount, registerNavigator, signedIn, unreadCount]);

  const dismissNotice = useCallback(() => setNotice(null), []);
  const pressNotice = useCallback((target: NotificationTarget) => { setNotice(null); openTarget(target); }, [openTarget]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      {signedIn && <NotificationBanner notice={notice} onPress={pressNotice} onDismiss={dismissNotice} />}
      {signedIn && <NotificationsSheet visible={isSheetOpen} onClose={closeNotifications} />}
    </NotificationsContext.Provider>
  );
}
