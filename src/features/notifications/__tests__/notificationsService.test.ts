import {apiRequest, apiRequestPage} from '../../../core/api/apiClient';
import {
  getNotificationsPage, getUnreadCount, markNotificationsRead, registerPushDevice, removePushDevice,
} from '../notificationsService';
import {formatNotificationTime, resolveNotificationTarget} from '../notificationTargets';

jest.mock('../../../core/api/apiClient', () => ({apiRequest: jest.fn(), apiRequestPage: jest.fn()}));
const request = apiRequest as jest.Mock;
const requestPage = apiRequestPage as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); });

test('registers the device with the exact body the API validates', async () => {
  request.mockResolvedValueOnce({id: 'd1'});
  await registerPushDevice('fcm-token-123456', 'android');
  expect(request).toHaveBeenCalledWith('/notifications/devices', {
    method: 'POST', auth: 'required', body: JSON.stringify({token: 'fcm-token-123456', platform: 'android'}),
  });
});

test('removes a device by url-encoded token', async () => {
  request.mockResolvedValueOnce(undefined);
  await removePushDevice('abc:def/ghi');
  expect(request).toHaveBeenCalledWith('/notifications/devices/abc%3Adef%2Fghi', {method: 'DELETE', auth: 'required'});
});

test('reads the unread count and tolerates junk', async () => {
  request.mockResolvedValueOnce({count: 7});
  await expect(getUnreadCount()).resolves.toBe(7);
  request.mockResolvedValueOnce({count: 'x'});
  await expect(getUnreadCount()).resolves.toBe(0);
});

test('mark-all-read sends no ids; mark-one sends the id', async () => {
  request.mockResolvedValue({marked: true});
  await markNotificationsRead();
  expect(request).toHaveBeenLastCalledWith('/notifications/read', {method: 'POST', auth: 'required', body: '{}'});
  await markNotificationsRead(['n1']);
  expect(request).toHaveBeenLastCalledWith('/notifications/read', {method: 'POST', auth: 'required', body: '{"ids":["n1"]}'});
});

test('maps snake_case rows and resolves deep-link targets', async () => {
  requestPage.mockResolvedValueOnce({
    data: [
      {id: 'n1', user_id: 'u', type: 'NEW_MESSAGE', title: 'New message', body: 'hi', data: {conversationId: 'c1', eventId: null}, read_at: null, created_at: '2026-10-08T10:00:00Z'},
      {id: 'n2', user_id: 'u', type: 'CREDITS_LOW', title: 'Low', body: null, data: {workspaceId: 'w', delta: -2}, read_at: '2026-10-08T11:00:00Z', created_at: '2026-10-08T09:00:00Z'},
    ],
    meta: {limit: 20, offset: 0, hasMore: false},
  });
  const page = await getNotificationsPage(0);
  expect(requestPage).toHaveBeenCalledWith('/notifications?limit=20&offset=0', {auth: 'required'});
  expect(page.nextOffset).toBe(2);
  expect(page.items[0]).toMatchObject({id: 'n1', readAt: null, createdAt: '2026-10-08T10:00:00Z', target: {kind: 'conversation', id: 'c1'}});
  expect(page.items[1]).toMatchObject({readAt: '2026-10-08T11:00:00Z', data: {delta: '-2'}, target: {kind: 'notifications'}});
});

test.each([
  ['PARTY_INVITE', {partyId: 'p1', kind: 'AUDIO'}, 'party', 'p1'],
  ['PARTY_CANCELLED', {partyId: 'p1'}, 'notifications', undefined],
  ['PURCHASE_REQUESTED', {eventId: 'e1', conversationId: 'c9', userId: 'u2'}, 'conversation', 'c9'],
  ['USER_ARRIVED', {userId: 'u2'}, 'user', 'u2'],
  ['EVENT_REMINDER', {eventId: 'e1', workspaceId: 'w1'}, 'event', 'e1'],
  ['VIBE_NOTE_NEARBY', {noteId: 'v1'}, 'vibeNote', 'v1'],
  ['POST_LIKED', {postId: 'post-1'}, 'post', 'post-1'],
])('%s resolves to %s', (type, data, kind, id) => {
  const target = resolveNotificationTarget(type, data);
  expect(target.kind).toBe(kind);
  if (id) expect(target).toMatchObject({id});
});

test('formats relative times', () => {
  const now = Date.parse('2026-10-08T12:00:00Z');
  expect(formatNotificationTime('2026-10-08T11:59:30Z', now)).toBe('now');
  expect(formatNotificationTime('2026-10-08T11:30:00Z', now)).toBe('30m');
  expect(formatNotificationTime('2026-10-08T09:00:00Z', now)).toBe('3h');
  expect(formatNotificationTime('2026-10-06T12:00:00Z', now)).toBe('2d');
});
