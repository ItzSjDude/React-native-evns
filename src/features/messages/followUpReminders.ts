import {useEffect, useRef} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getWipeEpoch, registerLocalDataWiper} from '../../core/localData';
import notifee, {AndroidImportance, AuthorizationStatus, EventType, TriggerType, type Event} from '@notifee/react-native';

/**
 * Optional local "remind me to follow up" for a chat. Nothing leaves the device and the notification
 * never carries message text, only the person's name.
 */
export type ReminderOption = '1h' | 'tomorrow' | '3d';
export type FollowUp = {notificationId: string; at: string};
export type FollowUps = Record<string, FollowUp>;

export const REMINDER_OPTIONS: {id: ReminderOption; label: string}[] = [
  {id: '1h', label: 'In 1 hour'},
  {id: 'tomorrow', label: 'Tomorrow at 9:00'},
  {id: '3d', label: 'In 3 days at 9:00'},
];

const STORAGE_KEY = 'hiva.messages.followUps';
const CHANNEL_ID = 'follow-ups';
export const FOLLOW_UP_TYPE = 'FOLLOW_UP';

/** When a reminder fires. Day options use the device's local calendar, so DST never shifts them off 9:00. */
export const reminderTime = (option: ReminderOption, now: Date = new Date()): Date => {
  if (option === '1h') return new Date(now.getTime() + 3600000);
  const at = new Date(now);
  at.setDate(at.getDate() + (option === 'tomorrow' ? 1 : 3));
  at.setHours(9, 0, 0, 0);
  return at;
};

/** Logout/account change: cancel every OS-scheduled reminder (they would fire for the next account) and clear the app badge. */
registerLocalDataWiper(async () => {
  let ids: string[] = [];
  try {
    const parsed = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? '{}') as FollowUps;
    ids = Object.values(parsed ?? {}).map(item => item?.notificationId).filter((id): id is string => typeof id === 'string');
  } catch { /* Unreadable record: nothing recoverable to cancel. */ }
  const run = (call: () => Promise<unknown>) => Promise.resolve().then(call);
  await Promise.allSettled([...ids.map(id => run(() => notifee.cancelNotification(id))), run(() => notifee.setBadgeCount(0))]);
});

const save = (followUps: FollowUps) => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(followUps));

/** Pending reminders by conversation id. Ones whose time has passed have fired, so they are dropped. */
export const getFollowUps = async (now: number = Date.now()): Promise<FollowUps> => {
  let stored: FollowUps = {};
  try {
    const parsed = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) stored = parsed;
  } catch {
    return {};
  }
  const pending = Object.fromEntries(Object.entries(stored).filter(([, item]) => Date.parse(item?.at) > now));
  if (Object.keys(pending).length !== Object.keys(stored).length) await save(pending).catch(() => {});
  return pending;
};

/** Android 13+ shows the POST_NOTIFICATIONS prompt here; iOS shows its permission prompt. */
const ensurePermission = async () => {
  const settings = await notifee.requestPermission();
  return settings.authorizationStatus >= AuthorizationStatus.AUTHORIZED;
};

/** Returns the reminder, or null when notifications are not allowed. Replaces an existing reminder for the chat. */
export const scheduleFollowUp = async (conversationId: string, name: string, option: ReminderOption, now: Date = new Date()): Promise<FollowUp | null> => {
  const startedAt = getWipeEpoch();
  if (!(await ensurePermission())) return null;
  await notifee.createChannel({id: CHANNEL_ID, name: 'Follow-up reminders', importance: AndroidImportance.DEFAULT});
  const at = reminderTime(option, now);
  const notificationId = `follow-up-${conversationId}`;
  await notifee.createTriggerNotification(
    {
      id: notificationId,
      title: `Follow up with ${name}`,
      body: 'Open Messages to pick the conversation back up.',
      data: {type: FOLLOW_UP_TYPE, conversationId},
      android: {channelId: CHANNEL_ID, pressAction: {id: 'default', launchActivity: 'default'}},
    },
    {type: TriggerType.TIMESTAMP, timestamp: at.getTime()},
  );
  const followUp = {notificationId, at: at.toISOString()};
  const followUps = {...(await getFollowUps(now.getTime())), [conversationId]: followUp};
  if (startedAt !== getWipeEpoch()) {
    // The user logged out while this was being scheduled: it must not outlive the wipe.
    await notifee.cancelNotification(notificationId).catch(() => {});
    return null;
  }
  await save(followUps);
  return followUp;
};

/** Cancels the pending notification (if any) and forgets it. Safe to call when nothing is scheduled. */
export const cancelFollowUp = async (conversationId: string) => {
  const followUps = await getFollowUps();
  const existing = followUps[conversationId];
  if (!existing) return;
  await notifee.cancelNotification(existing.notificationId).catch(() => {});
  await save(Object.fromEntries(Object.entries(followUps).filter(([id]) => id !== conversationId)));
};

const isFollowUpPress = (event: Pick<Event, 'type' | 'detail'>) =>
  event.type === EventType.PRESS && event.detail.notification?.data?.type === FOLLOW_UP_TYPE;

/** Notifee warns when a press arrives with no background handler; call once at bundle load, like the push one. */
export const registerFollowUpBackgroundHandler = () => {
  try {
    notifee.onBackgroundEvent(async () => {});
  } catch {
    // Native module missing (e.g. before the rebuild): reminders just stay unavailable.
  }
};

/** Runs `onOpen` when the user taps a follow-up notification, including the one that launched the app. */
export const useFollowUpOpened = (onOpen: () => void) => {
  const latest = useRef(onOpen);
  latest.current = onOpen;
  useEffect(() => {
    let stop: (() => void) | undefined;
    try {
      notifee.getInitialNotification()
        .then(initial => { if (initial?.notification.data?.type === FOLLOW_UP_TYPE) latest.current(); })
        .catch(() => {});
      stop = notifee.onForegroundEvent(event => { if (isFollowUpPress(event)) latest.current(); });
    } catch {
      // Native module missing: nothing to listen to.
    }
    return () => stop?.();
  }, []);
};
