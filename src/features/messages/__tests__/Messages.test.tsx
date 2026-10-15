import React from 'react';
import {Text} from 'react-native';
import {FlashList} from '@shopify/flash-list';
import ReactTestRenderer from 'react-test-renderer';
import {apiRequest} from '../../../core/api/apiClient';
import {subscribeRealtime} from '../../../core/realtime/subscribeRealtime';
import Messages from '../Messages';
import * as inbox from '../inboxService';
import {getInbox} from '../inboxService';
import {cancelFollowUp, getFollowUps, scheduleFollowUp} from '../followUpReminders';
import {markConversationRead} from '../messagesService';
import {openPaywall, refreshSubscription} from '../../plus';
import {showDialog} from '../../../components/Dialog';
import type {ApiMessage, Conversation, PartyChat, PartyRequest} from '../types';
import {resetMessagesRealtime} from '../useMessagesRealtime';

jest.mock('@react-navigation/native', () => ({useIsFocused: () => true}));
jest.mock('../messagesService', () => ({...jest.requireActual('../messagesService'), markConversationRead: jest.fn()}));
jest.mock('../inboxService', () => ({
  ...jest.requireActual('../inboxService'),
  getInbox: jest.fn(), getFolders: jest.fn(), updateConversationState: jest.fn(), updatePartyState: jest.fn(),
}));
jest.mock('../followUpReminders', () => ({
  ...jest.requireActual('../followUpReminders'),
  getFollowUps: jest.fn(), scheduleFollowUp: jest.fn(), cancelFollowUp: jest.fn(),
}));
jest.mock('../../../core/api/apiClient', () => ({apiRequest: jest.fn(), getRealtimeAccessToken: jest.fn()}));
jest.mock('../../../core/realtime/subscribeRealtime', () => ({subscribeRealtime: jest.fn()}));
const openParty = jest.fn(() => true);
const mockPlus = {isPlus: false, status: 'ready'};
jest.mock('../../plus', () => ({
  usePlus: () => mockPlus,
  openPaywall: jest.fn(),
  refreshSubscription: jest.fn(() => Promise.resolve(null)),
  isPlusRequired: (error: {status?: number; code?: string} | null) => error?.status === 403 && error?.code === 'PLUS_REQUIRED',
}));
jest.mock('../../../components/Dialog', () => ({showDialog: jest.fn()}));
jest.mock('../DirectConversation', () => ({__esModule: true, default: jest.fn(() => null)}));

const DirectConversation = jest.requireMock('../DirectConversation').default as jest.Mock;
const list = getInbox as jest.Mock;
const markRead = markConversationRead as jest.Mock;
const me = apiRequest as jest.Mock;
const subscribe = subscribeRealtime as jest.Mock;
const getFolders = inbox.getFolders as jest.Mock;
type SocketOptions = Parameters<typeof subscribeRealtime>[0];
let sockets: SocketOptions[];

const conversation = (overrides: Partial<Conversation> = {}): Conversation => ({
  id: 'c1', kind: 'DIRECT', status: 'OPEN', title: 'Ananya Sharma', avatarUrl: null, contactId: 'u2',
  unreadCount: 2, lastActivityAt: new Date().toISOString(), lastMessageAt: new Date().toISOString(), lastMessage: null, ...overrides,
});

const texts = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));

const render = async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<Messages onOpenParty={openParty} />); });
  return renderer!;
};

beforeEach(() => {
  resetMessagesRealtime();
  jest.clearAllMocks();
  sockets = [];
  subscribe.mockImplementation((options: SocketOptions) => { sockets.push(options); return jest.fn(); });
  // Production today: /auth/me has no realtimeUrl, so the list behaves exactly as before.
  me.mockResolvedValue({user: {id: 'me'}});
  markRead.mockResolvedValue({read: true});
  list.mockResolvedValue({items: [], hasMore: false, nextOffset: 0});
  mockPlus.isPlus = false;
  mockPlus.status = 'ready';
  getFolders.mockResolvedValue([]);
  (getFollowUps as jest.Mock).mockResolvedValue({});
  (cancelFollowUp as jest.Mock).mockResolvedValue(undefined);
});

test('renders conversations from the API with previews and unread badges', async () => {
  list.mockResolvedValue({hasMore: false, nextOffset: 2, items: [
    conversation(),
    conversation({id: 'c2', title: 'Rohan Mehta', contactId: 'u3', unreadCount: 0, lastMessage: {
      id: 'm1', sender_id: 'me', sender_role: 'ATTENDEE', type: 'TEXT', body: 'See you there', created_at: new Date().toISOString(),
    }}),
  ]});
  const renderer = await render();

  expect(list).toHaveBeenCalledWith({view: 'all'}, 0, 20);
  const shown = texts(renderer);
  expect(shown).toEqual(expect.arrayContaining(['Ananya Sharma', 'AS', '2 new messages', 'Rohan Mehta', 'You: See you there']));
  expect(shown).not.toContain('Demo conversation');
  expect(renderer.root.findAllByProps({testID: 'unread-c1'}).length).toBeGreaterThan(0);
  expect(renderer.root.findAllByProps({testID: 'unread-c2'})).toHaveLength(0);

  const search = renderer.root.findByProps({accessibilityLabel: 'Search conversations'});
  await ReactTestRenderer.act(async () => { search.props.onChangeText('rohan'); });
  expect(texts(renderer)).not.toContain('Ananya Sharma');

  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('opens the conversation, marks it read, clears the badge and refreshes on return', async () => {
  list.mockResolvedValue({items: [conversation()], hasMore: false, nextOffset: 1});
  const renderer = await render();

  const row = renderer.root.findByProps({accessibilityLabel: 'Open conversation with Ananya Sharma, 2 unread'});
  await ReactTestRenderer.act(async () => { row.props.onPress(); });

  expect(markRead).toHaveBeenCalledWith('c1');
  expect(renderer.root.findAllByProps({testID: 'unread-c1'})).toHaveLength(0);
  const props = DirectConversation.mock.calls[DirectConversation.mock.calls.length - 1][0];
  expect(props).toMatchObject({conversationId: 'c1', contactId: 'u2', contactName: 'Ananya Sharma', kind: 'DIRECT', backLabel: 'Back to messages'});

  list.mockClear();
  list.mockResolvedValue({items: [conversation({unreadCount: 0})], hasMore: false, nextOffset: 1});
  await ReactTestRenderer.act(async () => {
    props.onLatestMessage({id: 'm9', sender_id: 'me', type: 'TEXT', body: 'On my way', created_at: new Date().toISOString()});
    props.onClose();
  });
  expect(list).toHaveBeenCalledWith({view: 'all'}, 0, 20);
  expect(texts(renderer)).toContain('You: On my way');

  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('shows the empty state, and an error with retry', async () => {
  let renderer = await render();
  expect(texts(renderer)).toEqual(expect.arrayContaining(['No conversations yet', 'Say hi to someone from Nearby.']));
  await ReactTestRenderer.act(async () => { renderer.unmount(); });

  list.mockRejectedValueOnce({status: 500, message: 'Server down'});
  renderer = await render();
  expect(texts(renderer)).toContain('Server down');
  list.mockResolvedValue({items: [conversation()], hasMore: false, nextOffset: 1});
  const retry = renderer.root.findByProps({accessibilityLabel: 'Retry loading conversations'});
  await ReactTestRenderer.act(async () => { retry.props.onPress(); });
  expect(texts(renderer)).toContain('Ananya Sharma');
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

const live = (overrides: Partial<ApiMessage> = {}): ApiMessage => ({
  id: 'live1', conversation_id: 'c1', sender_id: 'u2', sender_role: 'ATTENDEE', type: 'TEXT', body: 'Just landed',
  created_at: new Date().toISOString(), edited_at: null, deleted_at: null, ...overrides,
});
// FlashList keeps cells in a stable React order and positions them by index, so read rows in list order via each cell's `index`.
const rowLabels = (renderer: ReactTestRenderer.ReactTestRenderer) => {
  const labelOf = (cell: ReactTestRenderer.ReactTestInstance) => cell
    .findAll(node => String(node.props.accessibilityLabel).startsWith('Open conversation with'))[0]?.props.accessibilityLabel as string | undefined;
  const cells = renderer.root.findAll(node => typeof node.type === 'string' && typeof node.props.index === 'number');
  return cells.sort((a, b) => a.props.index - b.props.index).map(labelOf).filter((label): label is string => !!label);
};

test('live messages update the preview, bump unread, move the thread up, and refetch for unknown threads', async () => {
  me.mockResolvedValue({realtimeUrl: 'wss://rt.example/ws'});
  list.mockResolvedValue({hasMore: false, nextOffset: 2, items: [
    conversation({id: 'c2', title: 'Rohan Mehta', contactId: 'u3', unreadCount: 0}),
    conversation({unreadCount: 0}),
  ]});
  const renderer = await render();
  expect(subscribe).toHaveBeenCalledTimes(1);
  const socket = sockets[0];
  await ReactTestRenderer.act(async () => { socket.onStatus(true); });
  list.mockClear();

  await ReactTestRenderer.act(async () => {
    socket.onEvent({type: 'message.created', conversationId: 'c1', message: live(), eventId: 'e1', seq: 1, v: 1});
    socket.onEvent({type: 'message.created', conversationId: 'c1', message: live(), eventId: 'e1', seq: 1, v: 1});
  });
  expect(rowLabels(renderer)).toEqual(['Open conversation with Ananya Sharma, 1 unread', 'Open conversation with Rohan Mehta']);
  expect(texts(renderer)).toContain('Just landed');
  expect(list).not.toHaveBeenCalled();

  await ReactTestRenderer.act(async () => {
    socket.onEvent({type: 'message.deleted', conversationId: 'c1', message: live({body: null, deleted_at: new Date().toISOString()}), eventId: 'e2', seq: 2, v: 1});
  });
  expect(texts(renderer)).toContain('Message deleted');

  await ReactTestRenderer.act(async () => {
    socket.onEvent({type: 'message.created', conversationId: 'c-new', message: live({id: 'live2', conversation_id: 'c-new'}), eventId: 'e3', seq: 3, v: 1});
  });
  expect(list).toHaveBeenCalledWith({view: 'all'}, 0, 20);
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('does not bump unread for the conversation that is open', async () => {
  me.mockResolvedValue({realtimeUrl: 'wss://rt.example/ws'});
  list.mockResolvedValue({items: [conversation()], hasMore: false, nextOffset: 1});
  const renderer = await render();
  await ReactTestRenderer.act(async () => { sockets[0].onStatus(true); });
  await ReactTestRenderer.act(async () => { renderer.root.findByProps({accessibilityLabel: 'Open conversation with Ananya Sharma, 2 unread'}).props.onPress(); });
  await ReactTestRenderer.act(async () => {
    sockets[0].onEvent({type: 'message.created', conversationId: 'c1', message: live(), eventId: 'e1', seq: 1, v: 1});
  });
  expect(renderer.root.findAllByProps({testID: 'unread-c1'})).toHaveLength(0);
  expect(texts(renderer)).toContain('Just landed');
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('without a realtimeUrl the list never opens a socket', async () => {
  list.mockResolvedValue({items: [conversation()], hasMore: false, nextOffset: 1});
  const renderer = await render();
  expect(me).toHaveBeenCalledWith('/auth/me', {auth: 'required'});
  expect(subscribe).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

const party = (overrides: Partial<PartyChat> = {}): PartyChat => ({
  type: 'PARTY', id: 'p1', title: 'Friday Jam', hostName: 'Dev', avatarUrl: null, participantCount: 4, unreadCount: 3,
  lastActivityAt: new Date().toISOString(), preview: 'Who is on mic?', archived: false, ended: false, ...overrides,
});
const seatRequest: PartyRequest = {
  type: 'PARTY_REQUEST', id: 'r1', partyId: 'p9', requesterName: 'Meera', avatarUrl: null, partyTitle: 'Late Night Talks', requestedAt: new Date().toISOString(),
};
const page = (items: unknown[], hasMore = false) => ({items, hasMore, nextOffset: items.length});

/** Presses the first node with this accessibility label that has a handler. */
const press = async (renderer: ReactTestRenderer.ReactTestRenderer, label: string, event: 'onPress' | 'onLongPress' = 'onPress') => {
  const node = renderer.root.findAll(item => item.props.accessibilityLabel === label && typeof item.props[event] === 'function')[0];
  if (!node) throw new Error(`No pressable labelled "${label}"`);
  await ReactTestRenderer.act(async () => { node.props[event](); });
};
const has = (renderer: ReactTestRenderer.ReactTestRenderer, label: string) =>
  renderer.root.findAll(item => item.props.accessibilityLabel === label).length > 0;
const patchConversation = inbox.updateConversationState as jest.Mock;
const patchParty = inbox.updatePartyState as jest.Mock;
const unmount = (renderer: ReactTestRenderer.ReactTestRenderer) => ReactTestRenderer.act(async () => { renderer.unmount(); });

test('view chips reload from the inbox endpoint with that view, and requests are seat requests', async () => {
  list.mockResolvedValue(page([conversation()]));
  const renderer = await render();
  expect(list).toHaveBeenLastCalledWith({view: 'all'}, 0, 20);

  list.mockResolvedValue(page([seatRequest]));
  await press(renderer, 'Requests');
  expect(list).toHaveBeenLastCalledWith({view: 'requests'}, 0, 20);
  expect(texts(renderer)).toEqual(expect.arrayContaining(['Meera', 'Wants a seat in Late Night Talks']));
  expect(texts(renderer)).not.toContain('Ananya Sharma');

  list.mockResolvedValue(page([]));
  await press(renderer, 'Archived');
  expect(list).toHaveBeenLastCalledWith({view: 'archived'}, 0, 20);
  expect(texts(renderer)).toContain('Nothing archived');
  await press(renderer, 'Events');
  expect(list).toHaveBeenLastCalledWith({view: 'events'}, 0, 20);
  await unmount(renderer);
});

test('folder chips appear for Plus members only and load the folder view', async () => {
  list.mockResolvedValue(page([conversation()]));
  let renderer = await render();
  expect(getFolders).not.toHaveBeenCalled();
  expect(has(renderer, 'Work')).toBe(false);
  // Free members see the manager chip locked: it opens the paywall instead.
  await press(renderer, 'Folders');
  expect(openPaywall).toHaveBeenCalledWith('inbox');
  await unmount(renderer);

  mockPlus.isPlus = true;
  getFolders.mockResolvedValue([{id: 'f1', name: 'Work', createdAt: '', updatedAt: ''}]);
  renderer = await render();
  await press(renderer, 'Work');
  expect(list).toHaveBeenLastCalledWith({view: 'folder', folderId: 'f1'}, 0, 20);
  await unmount(renderer);
});

test('a free member tapping Pin or Move to folder gets the paywall and no request', async () => {
  list.mockResolvedValue(page([conversation()]));
  const renderer = await render();
  await press(renderer, 'More actions for Ananya Sharma');
  await press(renderer, 'Pin to top');
  expect(openPaywall).toHaveBeenCalledWith('inbox');
  expect(patchConversation).not.toHaveBeenCalled();

  (openPaywall as jest.Mock).mockClear();
  await press(renderer, 'Open conversation with Ananya Sharma, 2 unread', 'onLongPress');
  await press(renderer, 'Move to folder');
  expect(openPaywall).toHaveBeenCalledWith('inbox');
  expect(patchConversation).not.toHaveBeenCalled();
  await unmount(renderer);
});

test('a Plus member pins optimistically, and a 409 rolls back with the pin limit message', async () => {
  mockPlus.isPlus = true;
  list.mockResolvedValue(page([conversation(), conversation({id: 'c2', title: 'Rohan Mehta', unreadCount: 0})]));
  patchConversation.mockResolvedValueOnce({folderId: null, pinnedAt: 'now', archivedAt: null});
  const renderer = await render();
  // The post-pin refresh reports the server's order.
  list.mockResolvedValue(page([conversation({id: 'c2', title: 'Rohan Mehta', unreadCount: 0, pinned: true}), conversation()]));
  await press(renderer, 'More actions for Rohan Mehta');
  await press(renderer, 'Pin to top');
  expect(patchConversation).toHaveBeenCalledWith('c2', {pinned: true});
  expect(renderer.root.findAllByProps({testID: 'pin-c2'}).length).toBeGreaterThan(0);

  patchConversation.mockRejectedValueOnce({status: 409, code: 'CONFLICT', message: 'Pin limit reached'});
  await press(renderer, 'More actions for Ananya Sharma');
  await press(renderer, 'Pin to top');
  expect(renderer.root.findAllByProps({testID: 'pin-c1'})).toHaveLength(0);
  expect(showDialog).toHaveBeenCalledWith('Could not pin', 'You can pin up to 5 chats. Unpin one to pin another.');
  await unmount(renderer);
});

test('a stale subscription (403 PLUS_REQUIRED) rolls back, refreshes the plan and opens the paywall', async () => {
  mockPlus.isPlus = true;
  list.mockResolvedValue(page([conversation()]));
  patchConversation.mockRejectedValueOnce({status: 403, code: 'PLUS_REQUIRED', message: 'Hiva Plus is required'});
  const renderer = await render();
  await press(renderer, 'More actions for Ananya Sharma');
  await press(renderer, 'Pin to top');
  expect(refreshSubscription).toHaveBeenCalled();
  expect(openPaywall).toHaveBeenCalledWith('inbox');
  expect(renderer.root.findAllByProps({testID: 'pin-c1'})).toHaveLength(0);
  expect(showDialog).not.toHaveBeenCalled();
  await unmount(renderer);
});

test('archiving is free: the row leaves at once and returns if the request fails', async () => {
  list.mockResolvedValue(page([conversation()]));
  patchConversation.mockResolvedValueOnce({folderId: null, pinnedAt: null, archivedAt: 'now'});
  let renderer = await render();
  await press(renderer, 'More actions for Ananya Sharma');
  await press(renderer, 'Archive');
  expect(patchConversation).toHaveBeenCalledWith('c1', {archived: true});
  expect(openPaywall).not.toHaveBeenCalled();
  expect(has(renderer, 'Open conversation with Ananya Sharma, 2 unread')).toBe(false);
  await unmount(renderer);

  patchConversation.mockRejectedValueOnce({status: 500, message: 'Server down'});
  renderer = await render();
  await press(renderer, 'More actions for Ananya Sharma');
  await press(renderer, 'Archive');
  expect(has(renderer, 'Open conversation with Ananya Sharma, 2 unread')).toBe(true);
  expect(showDialog).toHaveBeenCalledWith('Could not archive', 'Server down');
  await unmount(renderer);
});

test('a Plus member moves a chat into a folder and sees the folder chip on the row', async () => {
  mockPlus.isPlus = true;
  getFolders.mockResolvedValue([{id: 'f1', name: 'Work', createdAt: '', updatedAt: ''}]);
  list.mockResolvedValue(page([conversation()]));
  patchConversation.mockResolvedValue({folderId: 'f1', pinnedAt: null, archivedAt: null});
  const renderer = await render();
  await press(renderer, 'More actions for Ananya Sharma');
  await press(renderer, 'Move to folder');
  await press(renderer, 'Move to Work');
  expect(patchConversation).toHaveBeenCalledWith('c1', {folderId: 'f1'});
  expect(texts(renderer)).toContain('Work');
  await unmount(renderer);
});

test('party rows open the room, show unread and support read, unread and archive', async () => {
  list.mockResolvedValue(page([party()]));
  patchParty.mockResolvedValue({lastReadAt: null, archivedAt: null});
  const renderer = await render();
  expect(texts(renderer)).toEqual(expect.arrayContaining(['Friday Jam', 'Party', 'Who is on mic?']));
  expect(renderer.root.findAllByProps({testID: 'unread-p1'}).length).toBeGreaterThan(0);

  await press(renderer, 'More actions for Friday Jam');
  await press(renderer, 'Mark as read');
  expect(patchParty).toHaveBeenCalledWith('p1', {read: true});
  expect(renderer.root.findAllByProps({testID: 'unread-p1'})).toHaveLength(0);

  await press(renderer, 'More actions for Friday Jam');
  await press(renderer, 'Mark as unread');
  expect(patchParty).toHaveBeenLastCalledWith('p1', {read: false});

  await press(renderer, 'Open party room Friday Jam, 3 unread');
  expect(openParty).toHaveBeenCalledWith('p1');

  await press(renderer, 'More actions for Friday Jam');
  await press(renderer, 'Archive');
  expect(patchParty).toHaveBeenLastCalledWith('p1', {archived: true});
  expect(has(renderer, 'Open party room Friday Jam, 3 unread')).toBe(false);
  await unmount(renderer);
});

test('a seat request row opens its party room', async () => {
  list.mockResolvedValue(page([seatRequest]));
  const renderer = await render();
  await press(renderer, 'Open party room Late Night Talks, seat request from Meera');
  expect(openParty).toHaveBeenCalledWith('p9');
  await unmount(renderer);
});

test('Remind me schedules a local reminder, shows it on the row and can cancel it', async () => {
  list.mockResolvedValue(page([conversation({unreadCount: 0})]));
  (scheduleFollowUp as jest.Mock).mockResolvedValue({notificationId: 'follow-up-c1', at: new Date(Date.now() + 3600000).toISOString()});
  const renderer = await render();
  await press(renderer, 'More actions for Ananya Sharma');
  await press(renderer, 'Remind me');
  await press(renderer, 'In 1 hour');
  expect(scheduleFollowUp).toHaveBeenCalledWith('c1', 'Ananya Sharma', '1h');
  expect(renderer.root.findAllByProps({testID: 'reminder-c1'}).length).toBeGreaterThan(0);

  await press(renderer, 'More actions for Ananya Sharma');
  await press(renderer, 'Reminder set');
  await press(renderer, 'Cancel reminder');
  expect(cancelFollowUp).toHaveBeenCalledWith('c1');
  expect(renderer.root.findAllByProps({testID: 'reminder-c1'})).toHaveLength(0);
  await unmount(renderer);
});

test('a denied notification permission explains itself instead of failing silently', async () => {
  list.mockResolvedValue(page([conversation()]));
  (scheduleFollowUp as jest.Mock).mockResolvedValue(null);
  const renderer = await render();
  await press(renderer, 'More actions for Ananya Sharma');
  await press(renderer, 'Remind me');
  await press(renderer, 'In 3 days at 9:00');
  expect(showDialog).toHaveBeenCalledWith('Notifications are off', expect.any(String));
  expect(renderer.root.findAllByProps({testID: 'reminder-c1'})).toHaveLength(0);
  await unmount(renderer);
});

test('loads the next page with the current offset while the view stays the same', async () => {
  // FlashList asks for the next page by itself when the first page doesn't fill the (mocked) viewport, so later pages must end the list.
  list.mockResolvedValueOnce({items: [conversation()], hasMore: true, nextOffset: 1});
  list.mockResolvedValue({items: [conversation({id: 'c2', title: 'Rohan Mehta'})], hasMore: false, nextOffset: 2});
  const renderer = await render();
  await ReactTestRenderer.act(async () => { renderer.root.findByType(FlashList).props.onEndReached(); });
  expect(list).toHaveBeenLastCalledWith({view: 'all'}, 1);
  expect(texts(renderer)).toEqual(expect.arrayContaining(['Ananya Sharma', 'Rohan Mehta']));
  await unmount(renderer);
});

test('reading and replying never open the paywall for a free member', async () => {
  list.mockResolvedValue(page([conversation()]));
  const renderer = await render();
  await press(renderer, 'Open conversation with Ananya Sharma, 2 unread');
  expect(DirectConversation).toHaveBeenCalled();
  expect(openPaywall).not.toHaveBeenCalled();
  await unmount(renderer);
});
