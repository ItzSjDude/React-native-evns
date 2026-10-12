import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {apiRequest} from '../../../core/api/apiClient';
import {subscribeRealtime} from '../../../core/realtime/subscribeRealtime';
import DirectConversation from '../DirectConversation';
import {getDirectMessages, sendDirectMessage} from '../directService';
import {markConversationRead} from '../messagesService';
import type {ApiMessage} from '../types';
import {resetMessagesRealtime} from '../useMessagesRealtime';

jest.mock('../../../core/api/apiClient', () => ({apiRequest: jest.fn(), getRealtimeAccessToken: jest.fn()}));
jest.mock('../../../core/realtime/subscribeRealtime', () => ({subscribeRealtime: jest.fn()}));
jest.mock('../directService', () => ({getDirectMessages: jest.fn(), sendDirectMessage: jest.fn()}));
jest.mock('../messagesService', () => ({markConversationRead: jest.fn()}));
jest.mock('react-native-safe-area-context', () => {
  const {View} = jest.requireActual('react-native');
  return {SafeAreaView: View};
});

type Options = Parameters<typeof subscribeRealtime>[0];
const subscribe = subscribeRealtime as jest.Mock;
const me = apiRequest as jest.Mock;
const fetchPage = getDirectMessages as jest.Mock;
const send = sendDirectMessage as jest.Mock;
const markRead = markConversationRead as jest.Mock;
let sockets: {options: Options; stop: jest.Mock; send: jest.Mock}[];

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const row = (overrides: Partial<ApiMessage> = {}): ApiMessage => ({
  id: 'm1', conversation_id: 'c1', sender_id: 'u2', sender_role: 'ATTENDEE', type: 'TEXT', body: 'hello there',
  created_at: '2026-10-08T10:00:00.000Z', edited_at: null, deleted_at: null, ...overrides,
});
const texts = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));

const render = async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <DirectConversation conversationId="c1" contactId="u2" contactName="Ananya" contactAvatarUrl={null} onClose={jest.fn()} pollIntervalMs={5000} />,
    );
    await flush();
  });
  return renderer!;
};

const socket = () => sockets[sockets.length - 1].options;
const act = (fn: () => void) => ReactTestRenderer.act(async () => { fn(); await flush(); });

beforeEach(() => {
  jest.useFakeTimers();
  resetMessagesRealtime();
  jest.clearAllMocks();
  sockets = [];
  subscribe.mockImplementation((options: Options) => {
    const sendFrame = jest.fn();
    const stop = Object.assign(jest.fn(), {send: sendFrame});
    sockets.push({options, stop, send: sendFrame});
    return stop;
  });
  me.mockResolvedValue({realtimeUrl: 'wss://rt.example/ws', user: {realtimeUrl: 'wss://rt.example/ws'}});
  fetchPage.mockResolvedValue({data: [row()], meta: {limit: 50, offset: 0, hasMore: false}});
  markRead.mockResolvedValue({read: true});
});

afterEach(() => { jest.useRealTimers(); });

test('falls back to polling when the server has no realtimeUrl', async () => {
  me.mockResolvedValue({user: {id: 'me'}});
  const renderer = await render();
  expect(subscribe).not.toHaveBeenCalled();
  expect(fetchPage).toHaveBeenCalledTimes(1);

  fetchPage.mockResolvedValue({data: [row({id: 'm2', body: 'polled in', created_at: '2026-10-08T10:01:00.000Z'}), row()], meta: {limit: 50, offset: 0, hasMore: false}});
  await act(() => { jest.advanceTimersByTime(5000); });
  expect(fetchPage).toHaveBeenCalledTimes(2);
  expect(texts(renderer)).toEqual(expect.arrayContaining(['hello there', 'polled in']));
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('while connected: no polling, live append, deletes, read marking, and polling again if the socket drops', async () => {
  const renderer = await render();
  expect(subscribe).toHaveBeenCalledTimes(1);
  await act(() => socket().onStatus(true));
  const afterConnect = fetchPage.mock.calls.length; // initial load + reconnect catch-up
  expect(afterConnect).toBe(2);

  await act(() => { jest.advanceTimersByTime(20000); });
  expect(fetchPage).toHaveBeenCalledTimes(afterConnect);

  await act(() => socket().onEvent({type: 'message.created', conversationId: 'c1', eventId: 'e1', seq: 1, v: 1,
    message: row({id: 'm2', body: 'live one', created_at: '2026-10-08T10:02:00.000Z'})}));
  await act(() => socket().onEvent({type: 'message.created', conversationId: 'other', eventId: 'e2', seq: 2, v: 1,
    message: row({id: 'm3', conversation_id: 'other', body: 'elsewhere'})}));
  expect(texts(renderer)).toContain('live one');
  expect(texts(renderer)).not.toContain('elsewhere');

  await act(() => { jest.advanceTimersByTime(1500); });
  expect(markRead).toHaveBeenCalledWith('c1');

  await act(() => socket().onEvent({type: 'message.deleted', conversationId: 'c1', eventId: 'e3', seq: 3, v: 1,
    message: row({body: null, deleted_at: '2026-10-08T10:03:00.000Z'})}));
  expect(texts(renderer)).toContain('Message deleted');
  expect(texts(renderer)).not.toContain('hello there');

  await act(() => socket().onStatus(false));
  await act(() => { jest.advanceTimersByTime(5000); });
  expect(fetchPage).toHaveBeenCalledTimes(afterConnect + 1);
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('my sent message echoed by the socket is not duplicated', async () => {
  const renderer = await render();
  await act(() => socket().onStatus(true));
  const mine = row({id: 'm9', sender_id: 'me', body: 'on my way', created_at: '2026-10-08T10:05:00.000Z'});
  send.mockResolvedValue(mine);
  const input = renderer.root.findByProps({accessibilityLabel: 'Message Ananya'});
  await act(() => input.props.onChangeText('on my way'));
  await act(() => socket().onEvent({type: 'message.created', conversationId: 'c1', eventId: 'e9', seq: 1, message: mine}));
  await act(() => renderer.root.findByProps({accessibilityLabel: 'Send message'}).props.onPress());
  expect(texts(renderer).filter(text => text === 'on my way')).toHaveLength(1);
  expect(markRead).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('shows typing for about 4s and sends throttled typing frames while composing', async () => {
  const renderer = await render();
  await act(() => socket().onStatus(true));

  await act(() => socket().onEvent({type: 'typing', conversationId: 'c1', userId: 'u2'}));
  expect(renderer.root.findAllByProps({testID: 'typing-indicator'}).length).toBeGreaterThan(0);
  await act(() => { jest.advanceTimersByTime(3000); });
  expect(texts(renderer)).toContain('typing…');
  await act(() => { jest.advanceTimersByTime(1000); });
  expect(texts(renderer)).not.toContain('typing…');

  const input = renderer.root.findByProps({accessibilityLabel: 'Message Ananya'});
  const frames = sockets[0].send;
  await act(() => input.props.onChangeText('h'));
  await act(() => input.props.onChangeText('he'));
  await act(() => { jest.advanceTimersByTime(2000); });
  await act(() => input.props.onChangeText('hel'));
  expect(frames).toHaveBeenCalledTimes(1);
  expect(frames).toHaveBeenCalledWith({action: 'typing', conversationId: 'c1'});
  await act(() => { jest.advanceTimersByTime(1000); });
  await act(() => input.props.onChangeText('hell'));
  expect(frames).toHaveBeenCalledTimes(2);
  await act(() => { jest.advanceTimersByTime(5000); });
  await act(() => input.props.onChangeText('   '));
  expect(frames).toHaveBeenCalledTimes(2);
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});
