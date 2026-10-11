import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee from '@notifee/react-native';
import {cancelFollowUp, getFollowUps, reminderTime, scheduleFollowUp} from '../followUpReminders';

const mocked = notifee as unknown as Record<string, jest.Mock>;

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  mocked.requestPermission.mockResolvedValue({authorizationStatus: 1});
});

test('reminder times: an hour from now, and 9:00 local on day 1 or day 3', () => {
  const now = new Date(2026, 9, 7, 22, 30);
  expect(reminderTime('1h', now)).toEqual(new Date(2026, 9, 7, 23, 30));
  expect(reminderTime('tomorrow', now)).toEqual(new Date(2026, 9, 8, 9, 0));
  expect(reminderTime('3d', now)).toEqual(new Date(2026, 9, 10, 9, 0));
  // Month rollover and an early-morning request still land on the next calendar day's 9:00.
  expect(reminderTime('tomorrow', new Date(2026, 9, 31, 6, 0))).toEqual(new Date(2026, 10, 1, 9, 0));
  expect(reminderTime('3d', new Date(2026, 11, 30, 0, 5))).toEqual(new Date(2027, 0, 2, 9, 0));
});

test('schedules a trigger notification without message text and remembers it', async () => {
  const now = new Date(2026, 9, 7, 12, 0);
  const followUp = await scheduleFollowUp('c1', 'Ananya', 'tomorrow', now);
  expect(followUp).toEqual({notificationId: 'follow-up-c1', at: new Date(2026, 9, 8, 9, 0).toISOString()});
  expect(mocked.createChannel).toHaveBeenCalledWith(expect.objectContaining({id: 'follow-ups'}));
  const [notification, trigger] = mocked.createTriggerNotification.mock.calls[0];
  expect(notification).toMatchObject({id: 'follow-up-c1', title: 'Follow up with Ananya', data: {type: 'FOLLOW_UP', conversationId: 'c1'}});
  // Privacy: only a fixed generic line, never message text.
  expect(notification.body).toBe('Open Messages to pick the conversation back up.');
  expect(trigger).toMatchObject({timestamp: new Date(2026, 9, 8, 9, 0).getTime()});
  expect(await getFollowUps(now.getTime())).toEqual({c1: followUp});
});

test('does nothing and returns null when notifications are not allowed', async () => {
  mocked.requestPermission.mockResolvedValue({authorizationStatus: 0});
  expect(await scheduleFollowUp('c1', 'Ananya', '1h')).toBeNull();
  expect(mocked.createTriggerNotification).not.toHaveBeenCalled();
  expect(await getFollowUps()).toEqual({});
});

test('cancel removes the notification and the stored entry, and is safe when nothing is set', async () => {
  const now = new Date(); // cancel prunes against the real clock
  await scheduleFollowUp('c1', 'Ananya', '3d', now);
  await scheduleFollowUp('c2', 'Rohan', '3d', now);
  await cancelFollowUp('c1');
  expect(mocked.cancelNotification).toHaveBeenCalledWith('follow-up-c1');
  expect(Object.keys(await getFollowUps())).toEqual(['c2']);
  mocked.cancelNotification.mockClear();
  await cancelFollowUp('nope');
  expect(mocked.cancelNotification).not.toHaveBeenCalled();
});

test('reminders that already fired are dropped, and corrupt storage reads as empty', async () => {
  const now = new Date(2026, 9, 7, 12, 0);
  await scheduleFollowUp('c1', 'Ananya', '1h', now);
  await scheduleFollowUp('c2', 'Rohan', '3d', now);
  expect(Object.keys(await getFollowUps(new Date(2026, 9, 7, 14, 0).getTime()))).toEqual(['c2']);
  expect(JSON.parse((await AsyncStorage.getItem('hiva.messages.followUps')) ?? '{}')).not.toHaveProperty('c1');

  await AsyncStorage.setItem('hiva.messages.followUps', '{not json');
  expect(await getFollowUps()).toEqual({});
});
