import React from 'react';
import {AppState} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {apiRequest, getRealtimeAccessToken} from '../../../core/api/apiClient';
import {subscribeRealtime} from '../../../core/realtime/subscribeRealtime';
import {readRealtimeUrl, resetMessagesRealtime, useMessagesRealtime, type MessagesRealtimeHandlers} from '../useMessagesRealtime';

jest.mock('../../../core/api/apiClient', () => ({apiRequest: jest.fn(), getRealtimeAccessToken: jest.fn()}));
jest.mock('../../../core/realtime/subscribeRealtime', () => ({subscribeRealtime: jest.fn()}));

type Options = Parameters<typeof subscribeRealtime>[0];
const subscribe = subscribeRealtime as jest.Mock;
const request = apiRequest as jest.Mock;
let sockets: {options: Options; stop: jest.Mock; send: jest.Mock}[];
let appStateListeners: ((state: string) => void)[];

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

let latest: ReturnType<typeof useMessagesRealtime>;
const Probe = ({enabled, handlers}: {enabled: boolean; handlers: MessagesRealtimeHandlers}) => {
  latest = useMessagesRealtime(enabled, handlers);
  return null;
};

const mount = async (handlers: MessagesRealtimeHandlers, enabled = true) => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<Probe enabled={enabled} handlers={handlers} />); await flush(); });
  return renderer!;
};

const push = async (frame: Record<string, unknown>) => {
  await ReactTestRenderer.act(async () => { sockets[sockets.length - 1].options.onEvent(frame); });
};
const status = async (connected: boolean) => {
  await ReactTestRenderer.act(async () => { sockets[sockets.length - 1].options.onStatus(connected); });
};

const row = {id: 'm1', conversation_id: 'c1', sender_id: 'u2', type: 'TEXT', body: 'hey', created_at: '2026-10-08T10:00:00.000Z'};

beforeEach(() => {
  resetMessagesRealtime();
  jest.clearAllMocks();
  sockets = [];
  subscribe.mockImplementation((options: Options) => {
    const send = jest.fn();
    const stop = Object.assign(jest.fn(), {send});
    sockets.push({options, stop, send});
    return stop;
  });
  request.mockResolvedValue({user: {id: 'me', realtimeUrl: 'wss://rt.example/ws'}, realtimeUrl: 'wss://rt.example/ws'});
  appStateListeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, fn: (state: string) => void) => {
    appStateListeners.push(fn);
    return {remove: jest.fn()};
  }) as never);
});

afterEach(() => { jest.restoreAllMocks(); });

test('reads realtimeUrl from either place on /auth/me and treats missing or null as off', () => {
  expect(readRealtimeUrl({realtimeUrl: 'wss://a/ws'})).toBe('wss://a/ws');
  expect(readRealtimeUrl({user: {realtimeUrl: 'wss://b/ws'}})).toBe('wss://b/ws');
  expect(readRealtimeUrl({realtimeUrl: null, user: {realtimeUrl: null}})).toBeNull();
  expect(readRealtimeUrl({user: {}})).toBeNull();
  expect(readRealtimeUrl({realtimeUrl: 'https://not-a-socket'})).toBeNull();
});

test('stays disconnected (polling) when realtimeUrl is missing, and does not ask again right away', async () => {
  request.mockResolvedValue({user: {id: 'me'}});
  let renderer = await mount({});
  expect(request).toHaveBeenCalledWith('/auth/me', {auth: 'required'});
  expect(subscribe).not.toHaveBeenCalled();
  expect(latest.connected).toBe(false);
  expect(latest.sendTyping('c1')).toBe(false);
  await ReactTestRenderer.act(async () => { renderer.unmount(); });

  renderer = await mount({});
  expect(request).toHaveBeenCalledTimes(1);
  expect(subscribe).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('connects with a fresh-token getter, resyncs on every open and dedupes by eventId', async () => {
  const onEvent = jest.fn();
  const onResync = jest.fn();
  const renderer = await mount({onEvent, onResync});
  expect(subscribe).toHaveBeenCalledTimes(1);
  expect(sockets[0].options.url).toBe('wss://rt.example/ws');
  expect(sockets[0].options.getToken).toBe(getRealtimeAccessToken);
  expect(latest.connected).toBe(false);

  await status(true);
  expect(latest.connected).toBe(true);
  expect(onResync).toHaveBeenCalledTimes(1);

  const frame = {type: 'message.created', conversationId: 'c1', message: row, eventId: 'e1', seq: 1, v: 1};
  await push(frame);
  await push(frame);
  expect(onEvent).toHaveBeenCalledTimes(1);
  expect(onEvent).toHaveBeenCalledWith({type: 'message.created', conversationId: 'c1', message: row});

  await push({type: 'typing', conversationId: 'c1', userId: 'u2'});
  await push({type: 'typing', conversationId: 'c1', userId: 'u2'});
  expect(onEvent).toHaveBeenCalledTimes(3);

  // Drop and come back: polling resumes in between, then a REST catch-up.
  await status(false);
  expect(latest.connected).toBe(false);
  await status(true);
  expect(onResync).toHaveBeenCalledTimes(2);

  expect(latest.sendTyping('c1')).toBe(true);
  expect(sockets[0].send).toHaveBeenCalledWith({action: 'typing', conversationId: 'c1'});

  await ReactTestRenderer.act(async () => { renderer.unmount(); });
  expect(sockets[0].stop).toHaveBeenCalled();
});

test('a seq gap triggers a REST resync', async () => {
  const onResync = jest.fn();
  const renderer = await mount({onResync});
  await status(true);
  onResync.mockClear();
  await push({type: 'message.created', conversationId: 'c1', message: row, eventId: 'e1', seq: 4});
  await push({type: 'message.created', conversationId: 'c1', message: {...row, id: 'm2'}, eventId: 'e2', seq: 5});
  expect(onResync).not.toHaveBeenCalled();
  await push({type: 'message.deleted', conversationId: 'c1', message: row, eventId: 'e4', seq: 7});
  expect(onResync).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => { renderer.unmount(); });
});

test('shares one socket between screens, only while enabled and foregrounded', async () => {
  const idle = await mount({}, false);
  expect(request).not.toHaveBeenCalled();
  expect(subscribe).not.toHaveBeenCalled();

  const a = await mount({});
  const b = await mount({});
  expect(subscribe).toHaveBeenCalledTimes(1);
  await status(true);

  await ReactTestRenderer.act(async () => { appStateListeners.forEach(fn => fn('background')); await flush(); });
  expect(sockets[0].stop).toHaveBeenCalled();
  expect(latest.connected).toBe(false);

  await ReactTestRenderer.act(async () => { appStateListeners.forEach(fn => fn('active')); await flush(); });
  expect(subscribe).toHaveBeenCalledTimes(2);

  await ReactTestRenderer.act(async () => { a.unmount(); });
  expect(sockets[1].stop).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => { b.unmount(); idle.unmount(); });
  expect(sockets[1].stop).toHaveBeenCalled();
});
