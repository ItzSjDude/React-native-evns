import {useCallback, useEffect, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getWipeEpoch, registerLocalDataWiper, setItemUnlessWiped} from '../../core/localData';

const KEY = 'hiva.savedPosts.v1';
const listeners = new Set<(ids: Set<string>) => void>();
let cache: Set<string> | null = null;
let loading: Promise<Set<string>> | null = null;

async function load(): Promise<Set<string>> {
  if (cache) return cache;
  const startedAt = getWipeEpoch();
  loading ??= AsyncStorage.getItem(KEY)
    .then(raw => new Set<string>(raw ? (JSON.parse(raw) as string[]) : []))
    .catch(() => new Set<string>())
    .then(ids => {
      // A wipe while reading means these ids belong to the previous user.
      if (startedAt !== getWipeEpoch()) return new Set<string>();
      cache = ids;
      return ids;
    });
  return loading;
}

// Saved posts are not user-scoped in storage; logout, account deletion and account switch wipe them instead.
registerLocalDataWiper(() => {
  cache = null;
  loading = null;
  listeners.forEach(listener => listener(new Set()));
});

/**
 * Posts bookmarked on this device. Stored locally only (there is no saved-posts endpoint yet), so
 * they don't follow the user to another phone and there is no "Saved" list screen.
 */
export function useSavedPosts() {
  const [saved, setSaved] = useState<Set<string>>(() => cache ?? new Set());
  useEffect(() => {
    let mounted = true;
    const listener = (ids: Set<string>) => { if (mounted) setSaved(new Set(ids)); };
    listeners.add(listener);
    load().then(listener);
    return () => { mounted = false; listeners.delete(listener); };
  }, []);

  const toggle = useCallback(async (postId: string) => {
    const startedAt = getWipeEpoch();
    const ids = new Set(await load());
    if (startedAt !== getWipeEpoch()) return;
    if (ids.has(postId)) ids.delete(postId); else ids.add(postId);
    cache = ids;
    listeners.forEach(listener => listener(ids));
    try { await setItemUnlessWiped(startedAt, KEY, JSON.stringify([...ids])); } catch {/* the in-memory state still reflects the tap */}
  }, []);

  return {saved, toggle};
}
