import {
  applyRealtimeToConversations, applyRealtimeToMessages, createTypingThrottle, mergeMessages, parseRealtimeEvent,
} from '../realtimeEvents';
import type {ApiMessage, Conversation, RealtimeMessageEvent} from '../types';

const message = (overrides: Partial<ApiMessage> = {}): ApiMessage => ({
  id: 'm1', conversation_id: 'c1', sender_id: 'u2', sender_role: 'ATTENDEE', type: 'TEXT', body: 'hey',
  metadata: {}, created_at: '2026-10-08T10:00:00.000Z', edited_at: null, deleted_at: null, ...overrides,
});

const conversation = (overrides: Partial<Conversation> = {}): Conversation => ({
  id: 'c1', kind: 'DIRECT', status: 'OPEN', title: 'Ananya', avatarUrl: null, contactId: 'u2', unreadCount: 0,
  lastActivityAt: '2026-10-08T09:00:00.000Z', lastMessageAt: '2026-10-08T09:00:00.000Z', lastMessage: null, ...overrides,
});

const created = (row: ApiMessage, conversationId = 'c1'): RealtimeMessageEvent => ({type: 'message.created', conversationId, message: row});

test('parses chat frames and ignores pong, party and malformed frames', () => {
  expect(parseRealtimeEvent({type: 'message.created', conversationId: 'c1', message: message(), eventId: 'e1', seq: 1, v: 1}))
    .toEqual({type: 'message.created', conversationId: 'c1', message: message()});
  expect(parseRealtimeEvent({type: 'typing', conversationId: 'c1', userId: 'u2'})).toEqual({type: 'typing', conversationId: 'c1', userId: 'u2'});
  expect(parseRealtimeEvent({type: 'reaction.added', conversationId: 'c1', messageId: 'm1', userId: 'u2', emoji: '🔥'})).toMatchObject({type: 'reaction.added'});
  expect(parseRealtimeEvent({type: 'pong'})).toBeNull();
  expect(parseRealtimeEvent({type: 'party.chat', conversationId: 'c1'})).toBeNull();
  expect(parseRealtimeEvent({type: 'message.created', conversationId: 'c1', message: {body: 'no id'}})).toBeNull();
  expect(parseRealtimeEvent({type: 'typing', conversationId: 'c1'})).toBeNull();
});

test('a new message from the other side moves the thread to the top and bumps unread', () => {
  const list = [conversation({id: 'c0', contactId: 'u9'}), conversation({unreadCount: 1})];
  const row = message({id: 'm2'});
  const {conversations, missing} = applyRealtimeToConversations(list, created(row), null);
  expect(missing).toBe(false);
  expect(conversations.map(item => item.id)).toEqual(['c1', 'c0']);
  expect(conversations[0]).toMatchObject({unreadCount: 2, lastMessage: row, lastMessageAt: row.created_at, lastActivityAt: row.created_at});

  // The same row again (duplicate delivery) is not counted twice.
  expect(applyRealtimeToConversations(conversations, created(row), null).conversations[0].unreadCount).toBe(2);
});

test('no unread bump for the open thread or for my own messages; unknown threads ask for a refetch', () => {
  const list = [conversation()];
  expect(applyRealtimeToConversations(list, created(message()), 'c1').conversations[0]).toMatchObject({unreadCount: 0, lastMessage: message()});
  expect(applyRealtimeToConversations(list, created(message({sender_id: 'me'})), null).conversations[0].unreadCount).toBe(0);
  expect(applyRealtimeToConversations(list, created(message(), 'c-new'), null)).toEqual({conversations: list, missing: true});
  expect(applyRealtimeToConversations(list, {...created(message(), 'c-new'), type: 'message.deleted'}, null).missing).toBe(false);
});

test('edits and deletes update the list preview in place', () => {
  const list = [conversation({id: 'c0'}), conversation({lastMessage: message({sender_name: 'Ananya'})})];
  const deleted = message({body: null, deleted_at: '2026-10-08T10:01:00.000Z'});
  const {conversations} = applyRealtimeToConversations(list, {type: 'message.deleted', conversationId: 'c1', message: deleted}, null);
  expect(conversations.map(item => item.id)).toEqual(['c0', 'c1']);
  expect(conversations[1].lastMessage).toMatchObject({body: null, deleted_at: deleted.deleted_at, sender_name: 'Ananya'});
  expect(conversations[1].unreadCount).toBe(0);
});

test('open thread appends live rows, applies deletes and ignores edits to rows it never loaded', () => {
  const first = message({sender_name: 'Ananya'});
  const appended = applyRealtimeToMessages([first], created(message({id: 'm2', created_at: '2026-10-08T10:05:00.000Z'})));
  expect(appended.map(row => row.id)).toEqual(['m1', 'm2']);
  expect(applyRealtimeToMessages(appended, created(message({id: 'm2', created_at: '2026-10-08T10:05:00.000Z'})))).toHaveLength(2);

  const deleted = applyRealtimeToMessages(appended, {type: 'message.deleted', conversationId: 'c1', message: message({body: null, deleted_at: '2026-10-08T10:06:00.000Z'})});
  expect(deleted[0]).toMatchObject({id: 'm1', body: null, sender_name: 'Ananya'});
  expect(deleted[0].deleted_at).toBeTruthy();

  const unknownEdit = applyRealtimeToMessages(appended, {type: 'message.edited', conversationId: 'c1', message: message({id: 'old'})});
  expect(unknownEdit).toBe(appended);
  expect(mergeMessages([], [message({id: 'b', created_at: '2026-10-08T11:00:00Z'}), message({id: 'a'})]).map(row => row.id)).toEqual(['a', 'b']);
});

test('typing frames go out at most once every 3s, and an unsent frame does not start the window', () => {
  let now = 0;
  const send = jest.fn(() => true);
  const throttle = createTypingThrottle(send, 3000, () => now);
  expect(throttle('c1')).toBe(true);
  now = 1000; expect(throttle('c1')).toBe(false);
  now = 2999; expect(throttle('c1')).toBe(false);
  now = 3000; expect(throttle('c1')).toBe(true);
  expect(send).toHaveBeenCalledTimes(2);

  const offline = jest.fn(() => false);
  const retrying = createTypingThrottle(offline, 3000, () => now);
  expect(retrying('c1')).toBe(false);
  offline.mockReturnValue(true);
  expect(retrying('c1')).toBe(true);
});
