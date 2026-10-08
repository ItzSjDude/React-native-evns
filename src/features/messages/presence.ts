import React, {useEffect, useMemo, useState} from 'react';
import {View} from 'react-native';
import {apiRequest} from '../../core/api/apiClient';

export type UserPresence = {online: boolean; lastSeenAt: string | null};
type PresenceResponse = {presence: Record<string, UserPresence>};

export const PRESENCE_TTL_MS = 30_000;
const BATCH_DELAY_MS = 25;
const MAX_IDS = 100;

// `state: null` means the backend omitted the user (not allowed to see them) - still cached so we don't re-ask.
const cache = new Map<string, {state: UserPresence | null; at: number}>();
const inflight = new Map<string, Promise<void>>();
const pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;
let flushed: Promise<void> | null = null;
const listeners = new Set<() => void>();

export const clearPresenceCache = () => { cache.clear(); inflight.clear(); pending.clear(); if (timer) clearTimeout(timer); timer = null; flushed = null; };

const fresh = (id: string) => {
  const hit = cache.get(id);
  return !!hit && Date.now() - hit.at < PRESENCE_TTL_MS;
};

async function fetchChunk(ids: string[]) {
  try {
    const {presence} = await apiRequest<PresenceResponse>(`/presence?userIds=${ids.join(',')}`, {auth: 'required'});
    const at = Date.now();
    ids.forEach(id => {
      const entry = presence?.[id];
      cache.set(id, {state: entry ? {online: !!entry.online, lastSeenAt: entry.online ? null : entry.lastSeenAt ?? null} : null, at});
    });
  } catch {
    // Leave the cache untouched; a later render retries once the TTL has lapsed.
  }
}

/** Batched: ids requested within a few ms of each other share one GET /presence (max 100 per call). */
export function requestPresence(userIds: string[]): Promise<void> {
  const wanted = Array.from(new Set(userIds.filter(Boolean)));
  const waits: Promise<void>[] = [];
  let needsFlush = false;
  wanted.forEach(id => {
    if (fresh(id)) return;
    const running = inflight.get(id);
    if (running) { waits.push(running); return; }
    pending.add(id); needsFlush = true;
  });
  if (needsFlush) {
    if (!flushed) {
      flushed = new Promise<void>(resolve => {
        timer = setTimeout(async () => {
          const ids = Array.from(pending); pending.clear(); timer = null; flushed = null;
          const chunks: string[][] = [];
          for (let i = 0; i < ids.length; i += MAX_IDS) chunks.push(ids.slice(i, i + MAX_IDS));
          const run = Promise.all(chunks.map(fetchChunk)).then(() => undefined);
          ids.forEach(id => inflight.set(id, run));
          await run;
          ids.forEach(id => inflight.delete(id));
          listeners.forEach(l => l());
          resolve();
        }, BATCH_DELAY_MS);
      });
    }
    waits.push(flushed);
  }
  return Promise.all(waits).then(() => undefined);
}

/**
 * Presence for the given users. Users missing from the result are unknown (not visible to you), and
 * `{online:false, lastSeenAt:null}` is how hidden users appear - so only show "last seen" when lastSeenAt is set,
 * never "never online".
 */
export function usePresence(userIds: string[]): Record<string, UserPresence> {
  const key = Array.from(new Set(userIds.filter(Boolean))).sort().join(',');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!key) return;
    const bump = () => setVersion(v => v + 1);
    listeners.add(bump);
    requestPresence(key.split(','));
    const interval = setInterval(() => requestPresence(key.split(',')), PRESENCE_TTL_MS);
    return () => { listeners.delete(bump); clearInterval(interval); };
  }, [key]);

  return useMemo(() => {
    const result: Record<string, UserPresence> = {};
    if (key) key.split(',').forEach(id => { const hit = cache.get(id); if (hit?.state) result[id] = hit.state; });
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);
}

export const OnlineDot = ({online, size = 10}: {online: boolean; size?: number}) =>
  React.createElement(View, {
    accessible: true,
    accessibilityLabel: online ? 'Online' : 'Offline',
    style: {width: size, height: size, borderRadius: size / 2, backgroundColor: online ? '#34D399' : '#4A4659'},
  });
