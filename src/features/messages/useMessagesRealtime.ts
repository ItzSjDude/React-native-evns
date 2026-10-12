import {useEffect, useRef, useState} from 'react';
import {AppState, type NativeEventSubscription} from 'react-native';
import {apiRequest, getRealtimeAccessToken} from '../../core/api/apiClient';
import {subscribeRealtime} from '../../core/realtime/subscribeRealtime';
import {parseRealtimeEvent} from './realtimeEvents';
import type {MessagesRealtimeEvent, RealtimeEnvelope} from './types';

/**
 * One shared chat socket for the messages feature. Screens register while they
 * need live updates (Messages tab focused, or a conversation open); the socket
 * runs only while someone is registered and the app is not backgrounded.
 * Without a realtime URL or while the socket is down, `connected` stays false
 * and screens keep their REST polling.
 */

/** A null URL means realtime is switched off; the operator can enable it, so ask again later. */
const NULL_URL_RECHECK_MS = 5 * 60000;
const SEEN_EVENT_LIMIT = 500;

type Listener = {
  onEvent: (event: MessagesRealtimeEvent) => void;
  onResync: () => void;
  onStatus: (connected: boolean) => void;
};

/** `subscribeRealtime` returns a stop function; a `send` on it (shared change requested) enables typing frames. */
type Connection = (() => void) & {send?: (frame: Record<string, unknown>) => unknown};

type AuthMe = {realtimeUrl?: unknown; user?: {realtimeUrl?: unknown} | null} | null | undefined;

/** `GET /auth/me` carries it at `data.realtimeUrl` and `data.user.realtimeUrl`; older servers omit it. */
export const readRealtimeUrl = (me: AuthMe): string | null => {
  const value = me?.realtimeUrl ?? me?.user?.realtimeUrl;
  return typeof value === 'string' && /^wss?:\/\//i.test(value) ? value : null;
};

const hub = {
  listeners: new Set<Listener>(),
  connection: null as Connection | null,
  connecting: false,
  connected: false,
  generation: 0,
  foreground: true,
  appState: null as NativeEventSubscription | null,
  url: null as {value: string | null; at: number} | null,
  urlRequest: null as Promise<string | null> | null,
  seen: new Set<string>(),
  lastSeq: null as number | null,
};

const resolveUrl = (): Promise<string | null> => {
  const cached = hub.url;
  if (cached && (cached.value || Date.now() - cached.at < NULL_URL_RECHECK_MS)) return Promise.resolve(cached.value);
  hub.urlRequest ??= apiRequest<AuthMe>('/auth/me', {auth: 'required'})
    .then(me => {
      const value = readRealtimeUrl(me);
      hub.url = {value, at: Date.now()};
      return value;
    })
    .finally(() => { hub.urlRequest = null; });
  return hub.urlRequest;
};

const forEachListener = (fn: (listener: Listener) => void) => {
  for (const listener of [...hub.listeners]) {
    try { fn(listener); } catch { /* One screen's handler must not break the others. */ }
  }
};

const setStatus = (connected: boolean) => {
  if (hub.connected === connected) return;
  hub.connected = connected;
  forEachListener(listener => listener.onStatus(connected));
  if (connected) {
    // Anything sent while we were offline (or before the first open) is only on REST.
    hub.lastSeq = null;
    forEachListener(listener => listener.onResync());
  }
};

const remember = (eventId: string) => {
  hub.seen.add(eventId);
  if (hub.seen.size > SEEN_EVENT_LIMIT) hub.seen.delete(hub.seen.values().next().value as string);
};

const receive = (raw: Record<string, unknown>) => {
  const {eventId, seq} = raw as RealtimeEnvelope;
  if (typeof eventId === 'string') {
    if (hub.seen.has(eventId)) return;
    remember(eventId);
  }
  let gap = false;
  if (typeof seq === 'number' && Number.isFinite(seq)) {
    gap = hub.lastSeq !== null && seq > hub.lastSeq + 1;
    hub.lastSeq = hub.lastSeq === null ? seq : Math.max(hub.lastSeq, seq);
  }
  const event = parseRealtimeEvent(raw);
  if (event) forEachListener(listener => listener.onEvent(event));
  if (gap) forEachListener(listener => listener.onResync());
};

const disconnect = () => {
  hub.generation++;
  hub.connecting = false;
  const connection = hub.connection;
  hub.connection = null;
  connection?.();
  setStatus(false);
};

const wanted = () => hub.listeners.size > 0 && hub.foreground;

const update = () => {
  if (!wanted()) { disconnect(); return; }
  if (hub.connection || hub.connecting) return;
  const generation = ++hub.generation;
  hub.connecting = true;
  resolveUrl().then(url => {
    if (generation !== hub.generation) return;
    hub.connecting = false;
    if (!url || !wanted()) return;
    const current = () => generation === hub.generation;
    hub.connection = subscribeRealtime({
      url,
      getToken: getRealtimeAccessToken,
      onEvent: event => { if (current()) receive(event); },
      onStatus: connected => { if (current()) setStatus(connected); },
    }) as Connection;
  }, () => {
    // /auth/me failed (offline, auth); stay on polling and try again on the next foreground or screen.
    if (generation === hub.generation) hub.connecting = false;
  });
};

const register = (listener: Listener) => {
  hub.listeners.add(listener);
  if (!hub.appState) {
    hub.foreground = AppState.currentState !== 'background';
    hub.appState = AppState.addEventListener('change', state => {
      hub.foreground = state !== 'background';
      update();
    });
  }
  listener.onStatus(hub.connected);
  update();
  return () => {
    hub.listeners.delete(listener);
    if (hub.listeners.size) return;
    hub.appState?.remove();
    hub.appState = null;
    update();
  };
};

/** Sends a typing frame if the socket is open and can send; returns whether it went out. */
export const sendTyping = (conversationId: string): boolean => {
  const send = hub.connection?.send;
  if (!hub.connected || typeof send !== 'function') return false;
  try {
    send({action: 'typing', conversationId});
    return true;
  } catch {
    return false;
  }
};

export type MessagesRealtimeHandlers = {
  onEvent?: (event: MessagesRealtimeEvent) => void;
  /** Called on every (re)connect and on a `seq` gap: reload over REST. */
  onResync?: () => void;
};

export function useMessagesRealtime(enabled: boolean, handlers: MessagesRealtimeHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const release = register({
      onEvent: event => handlersRef.current.onEvent?.(event),
      onResync: () => handlersRef.current.onResync?.(),
      onStatus: setConnected,
    });
    return () => { release(); setConnected(false); };
  }, [enabled]);

  return {connected, sendTyping};
}

/** Test-only: drop the shared socket, listeners and cached URL. */
export const resetMessagesRealtime = () => {
  hub.listeners.clear();
  hub.appState?.remove();
  hub.appState = null;
  disconnect();
  hub.url = null;
  hub.urlRequest = null;
  hub.seen.clear();
  hub.lastSeq = null;
};
