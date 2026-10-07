import {createContext, useContext, useEffect, useRef} from 'react';
import type {NotificationNavigator, NotificationTarget} from './types';

export type NotificationsContextValue = {
  /** False outside a signed-in session; components render inert. */
  enabled: boolean;
  unreadCount: number;
  refreshUnreadCount: () => Promise<void>;
  /** Local adjustment after a mark-read, before the server count is re-fetched. */
  setUnreadCount: (updater: number | ((count: number) => number)) => void;
  /** Bumped whenever a push arrives so an open list reloads. */
  listVersion: number;
  isSheetOpen: boolean;
  openNotifications: () => void;
  closeNotifications: () => void;
  /** Routes through the registered navigator, falling back to the sheet. */
  openTarget: (target: NotificationTarget) => void;
  /** Navigator only, no fallback. Returns whether a navigator handled the target. */
  navigateTo: (target: NotificationTarget) => boolean;
  /** Prefer `useNotificationNavigator`. Returns an unregister function. */
  registerNavigator: (navigator: NotificationNavigator) => () => void;
};

const noop = () => {};
const inertContext: NotificationsContextValue = {
  enabled: false,
  unreadCount: 0,
  refreshUnreadCount: async () => {},
  setUnreadCount: noop,
  listVersion: 0,
  isSheetOpen: false,
  openNotifications: noop,
  closeNotifications: noop,
  openTarget: noop,
  navigateTo: () => false,
  registerNavigator: () => noop,
};

export const NotificationsContext = createContext<NotificationsContextValue>(inertContext);

/** Safe outside the provider (returns an inert value), so screens render in isolation and in tests. */
export const useNotifications = () => useContext(NotificationsContext);

/**
 * Registers how notification targets are opened. Mount it inside the
 * NavigationContainer (where navigation is available). The latest handler wins;
 * a push tapped before any handler is mounted is held until one registers.
 */
export function useNotificationNavigator(navigator: NotificationNavigator): void {
  const {registerNavigator} = useNotifications();
  const ref = useRef(navigator);
  ref.current = navigator;
  useEffect(() => registerNavigator(target => ref.current(target)), [registerNavigator]);
}

