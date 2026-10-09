import {PermissionsAndroid, Platform} from 'react-native';
import {
  AuthorizationStatus,
  deleteToken,
  getInitialNotification,
  getMessaging,
  getToken,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
  requestPermission,
  setBackgroundMessageHandler,
  type RemoteMessage,
} from '@react-native-firebase/messaging';
import {removePushDevice} from './notificationsService';
import {resolveNotificationTarget} from './notificationTargets';
import type {DevicePlatform, ForegroundNotice, NotificationTarget} from './types';

export type {RemoteMessage};

export const devicePlatform = (): DevicePlatform => (Platform.OS === 'ios' ? 'ios' : 'android');

const messaging = () => getMessaging();

/** The API puts `type` plus the producer's data (conversationId, partyId, ...) in the data payload. */
export function targetFromRemoteMessage(message: RemoteMessage): NotificationTarget {
  const data = message.data ?? {};
  const type = typeof data.type === 'string' ? data.type : undefined;
  return resolveNotificationTarget(type, data);
}

export function noticeFromRemoteMessage(message: RemoteMessage): ForegroundNotice | null {
  const title = message.notification?.title ?? (typeof message.data?.title === 'string' ? message.data.title : undefined);
  if (!title) return null;
  const body = message.notification?.body ?? (typeof message.data?.body === 'string' ? message.data.body : null);
  return {key: message.messageId ?? `${Date.now()}`, title, body: body || null, target: targetFromRemoteMessage(message)};
}

export const getPushToken = () => getToken(messaging());
export const subscribeTokenRefresh = (listener: (token: string) => void) => onTokenRefresh(messaging(), listener);
export const subscribeForegroundMessages = (listener: (message: RemoteMessage) => void) => onMessage(messaging(), listener);
export const subscribeNotificationOpened = (listener: (message: RemoteMessage) => void) => onNotificationOpenedApp(messaging(), listener);
export const getLaunchNotification = () => getInitialNotification(messaging());

/** Invalidates this install's FCM token locally; the API prunes it on the next push (UNREGISTERED). */
export const invalidatePushToken = () => deleteToken(messaging());

/**
 * Asks for permission to show notifications. Android 13+ needs the runtime
 * POST_NOTIFICATIONS grant; older Android grants it at install time. iOS goes
 * through the Firebase (UNUserNotificationCenter) prompt.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    if (Number(Platform.Version) < 33) return true;
    const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
    if (await PermissionsAndroid.check(permission)) return true;
    return (await PermissionsAndroid.request(permission)) === PermissionsAndroid.RESULTS.GRANTED;
  }
  const status = await requestPermission(messaging());
  return status === AuthorizationStatus.AUTHORIZED || status === AuthorizationStatus.PROVISIONAL;
}

let backgroundHandlerRegistered = false;

/**
 * Must run at JS bundle load, outside React, so headless (killed/background)
 * deliveries have a handler. The API always sends a `notification` block, so the
 * OS draws the notification itself; nothing else needs to happen here, and the
 * unread badge is refreshed when the app returns to the foreground.
 */
export function registerNotificationBackgroundHandler(): void {
  if (backgroundHandlerRegistered) return;
  backgroundHandlerRegistered = true;
  try {
    setBackgroundMessageHandler(messaging(), async () => {});
  } catch (error) {
    if (__DEV__) console.warn('[notifications] background handler unavailable', error);
  }
}

/**
 * Best-effort device unregistration for logout. Call this BEFORE the session is
 * cleared (DELETE /notifications/devices/:token is authenticated). Never throws.
 */
export async function unregisterPushDevice(): Promise<void> {
  try {
    const token = await getPushToken();
    if (token) await removePushDevice(token);
  } catch {}
  try { await invalidatePushToken(); } catch {}
}
