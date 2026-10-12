import {useCallback, useEffect, useRef, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const RECENT_SEARCHES_KEY = 'hiva.search.recent.v1';
export const MAX_RECENT_SEARCHES = 8;

/** Most recent first, case-insensitively de-duplicated, capped. */
export const pushRecent = (list: string[], term: string) => {
  const clean = term.trim();
  if (!clean) return list;
  return [clean, ...list.filter(item => item.toLowerCase() !== clean.toLowerCase())].slice(0, MAX_RECENT_SEARCHES);
};

export async function loadRecentSearches(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string').slice(0, MAX_RECENT_SEARCHES) : [];
  } catch {
    return [];
  }
}

export async function saveRecentSearches(list: string[]): Promise<void> {
  try {
    if (list.length) await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list));
    else await AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch {
    // Recents are a convenience; a storage failure must never break searching.
  }
}

/** Local-only recent search terms (never sent to the server). */
export function useRecentSearches() {
  const [recent, setRecent] = useState<string[]>([]);
  const current = useRef<string[]>([]);
  const touched = useRef(false);

  useEffect(() => {
    let alive = true;
    loadRecentSearches().then(list => {
      if (!alive) return;
      // Terms remembered before storage finished loading stay on top of the stored ones.
      const merged = touched.current ? current.current.reduceRight((acc, term) => pushRecent(acc, term), list) : list;
      current.current = merged;
      setRecent(merged);
      if (touched.current) saveRecentSearches(merged);
    });
    return () => {alive = false;};
  }, []);

  const update = useCallback((next: (list: string[]) => string[]) => {
    touched.current = true;
    const updated = next(current.current);
    if (updated === current.current) return;
    current.current = updated;
    setRecent(updated);
    saveRecentSearches(updated);
  }, []);

  return {
    recent,
    remember: useCallback((term: string) => update(list => pushRecent(list, term)), [update]),
    remove: useCallback((term: string) => update(list => list.filter(item => item !== term)), [update]),
    clear: useCallback(() => update(() => []), [update]),
  };
}
