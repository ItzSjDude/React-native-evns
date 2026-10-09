import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {apiRequest} from '../../../core/api/apiClient';
import {subscribeRealtime} from '../../../core/realtime/subscribeRealtime';
import Messages from '../Messages';
import {getConversations, markConversationRead} from '../messagesService';
import type {ApiMessage, Conversation} from '../types';
import {resetMessagesRealtime} from '../useMessagesRealtime';

jest.mock('@react-navigation/native', () => ({useIsFocused: () => true}));
jest.mock('../messagesService', () => ({CONVERSATIONS_PAGE_SIZE: 20, getConversations: jest.fn(), markConversationRead: jest.fn()}));
jest.mock('../../../core/api/apiClient', () => ({apiRequest: jest.fn(), getRealtimeAccessToken: jest.fn()}));
jest.mock('../../../core/realtime/subscribeRealtime', () => ({subscribeRealtime: jest.fn()}));
jest.mock('../DirectConversation', () => ({__esModule: true, default: jest.fn(() => null)}));

const DirectConversation = jest.requireMock('../DirectConversation').default as jest.Mock;
const list = getConversations as jest.Mock;
const markRead = markConversationRead as jest.Mock;
const me = apiRequest as jest.Mock;
const subscribe = subscribeRealtime as jest.Mock;
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
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<Messages />); });
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
  list.mockResolvedValue({conversations: [], hasMore: false, nextOffset: 0});
});

test('renders conversations from the API with previews and unread badges', async () => {
  list.mockResolvedValue({hasMore: false, nextOffset: 2, conversations: [
    conversation(),
    conversation({id: 'c2', title: 'Rohan Mehta', contactId: 'u3', unreadCount: 0, lastMessage: {
      id: 'm1', sender_id: 'me', sender_role: 'ATTENDEE', type: 'TEXT', body: 'See you there', created_at: new Date().toISOString(),
    }}),
  ]});
  const renderer = await render();

  expect(list).toHaveBeenCalledWith(0, 20);
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
  list.mockResolvedValue({conversations: [conversation()], hasMore: false, nextOffset: 1});
  const renderer = await render();

  const row = renderer.root.findByProps({accessibilityLabel: 'Open conversation with Ananya Sharma, 2 unread'});
  await ReactTestRenderer.act(async () => { row.props.onPress(); });

  expect(markRead).toHaveBeenCalledWith('c1');
  expect(renderer.root.findAllByProps({testID: 'unread-c1'})).toHaveLength(0);
  const props = DirectConversation.mock.calls[DirectConversation.mock.calls.length - 1][0];
  expect(props).toMatchObject({conversationId: 'c1', contactId: 'u2', contactName: 'Ananya Sharma', kind: 'DIRECT', backLabel: 'Back to messages'});

  list.mockClear();
  list.mockResolvedValue({conversations: [conversation({unreadCount: 0})], hasMore: false, nextOffset: 1});
  await ReactTestRenderer.act(async () => {
    props.onLatestMessage({id: 'm9', sender_id: 'me', type: 'TEXT', body: 'On my way', created_at: new Date().toISOString()});
    props.onClose();
  });
  expect(list).toHaveBeenCalledWith(0, 20);
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
  list.mockResolvedValue({conversations: [conversation()], hasMore: false, nextOffset: 1});
  const retry = renderer.root.findByProps({accessibilityLabel: 'Retry loading conversations'});
  await ReactTestRenderer.act(async () => { retry.props.onPress(); });
  expect(texts(renderer)).toContain('Ananya Sharma');
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

const live = (overrides: Partial<ApiMessage> = {}): ApiMessage => ({
  id: 'live1', conversation_id: 'c1', sender_id: 'u2', sender_role: 'ATTENDEE', type: 'TEXT', body: 'Just landed',
  created_at: new Date().toISOString(), edited_at: null, deleted_at: null, ...overrides,
});
const rowLabels = (renderer: ReactTestRenderer.ReactTestRenderer) => [...new Set(renderer.root
  .findAll(node => String(node.props.accessibilityLabel).startsWith('Open conversation with'))
  .map(node => node.props.accessibilityLabel as string))];

test('live messages update the preview, bump unread, move the thread up, and refetch for unknown threads', async () => {
  me.mockResolvedValue({realtimeUrl: 'wss://rt.example/ws'});
  list.mockResolvedValue({hasMore: false, nextOffset: 2, conversations: [
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
  expect(list).toHaveBeenCalledWith(0, 20);
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('does not bump unread for the conversation that is open', async () => {
  me.mockResolvedValue({realtimeUrl: 'wss://rt.example/ws'});
  list.mockResolvedValue({conversations: [conversation()], hasMore: false, nextOffset: 1});
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
  list.mockResolvedValue({conversations: [conversation()], hasMore: false, nextOffset: 1});
  const renderer = await render();
  expect(me).toHaveBeenCalledWith('/auth/me', {auth: 'required'});
  expect(subscribe).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});
