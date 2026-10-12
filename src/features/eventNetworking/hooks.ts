import {useCallback, useEffect, useRef, useState} from 'react';
import {getMyNetworkingProfile} from './eventNetworkingService';
import type {EventNetworkingProfile, NetworkingPage} from './types';

/** Server state for the viewer's own profile. `profile: null` + `loaded` means "not opted in". */
export function useMyNetworkingProfile(eventId: string, enabled: boolean) {
  const [state, setState] = useState<{profile: EventNetworkingProfile | null; loading: boolean; loaded: boolean; error: unknown}>(
    {profile: null, loading: false, loaded: false, error: null});
  const generation = useRef(0);

  const reload = useCallback(async () => {
    const request = ++generation.current;
    setState(current => ({...current, loading: true, error: null}));
    try {
      const profile = await getMyNetworkingProfile(eventId);
      if (request === generation.current) setState({profile, loading: false, loaded: true, error: null});
    } catch (error) {
      if (request === generation.current) setState(current => ({...current, loading: false, loaded: true, error}));
    }
  }, [eventId]);

  useEffect(() => {
    generation.current++;
    setState({profile: null, loading: false, loaded: false, error: null});
    if (enabled) reload();
    const counter = generation;
    return () => {counter.current++;};
  }, [enabled, eventId, reload]);

  return {...state, reload, setProfile: (profile: EventNetworkingProfile | null) => setState(current => ({...current, profile, error: null}))};
}

/** Offset-paged list that resets whenever `resetKey` (filters, event) changes. The list is server state and is never copied elsewhere. */
export function usePagedList<T>(
  fetchPage: (offset: number) => Promise<NetworkingPage<T>>,
  keyOf: (item: T) => string,
  enabled: boolean,
  resetKey: string,
) {
  const [list, setList] = useState<{items: T[]; loading: boolean; loaded: boolean; hasMore: boolean; error: unknown}>(
    {items: [], loading: false, loaded: false, hasMore: false, error: null});
  const listRef = useRef(list); listRef.current = list;
  const fetchRef = useRef(fetchPage); fetchRef.current = fetchPage;
  const keyRef = useRef(keyOf); keyRef.current = keyOf;
  const generation = useRef(0);

  const load = useCallback(async (append: boolean) => {
    const current = listRef.current;
    if (current.loading && append) return;
    const request = ++generation.current;
    setList(state => ({...state, loading: true, error: null}));
    try {
      const page = await fetchRef.current(append ? current.items.length : 0);
      if (request !== generation.current) return;
      setList(state => {
        const known = new Set(append ? state.items.map(keyRef.current) : []);
        const fresh = page.items.filter(item => !known.has(keyRef.current(item)));
        return {items: append ? [...state.items, ...fresh] : page.items, loading: false, loaded: true, hasMore: page.hasMore, error: null};
      });
    } catch (error) {
      if (request === generation.current) setList(state => ({...state, loading: false, loaded: true, error}));
    }
  }, []);

  useEffect(() => {
    generation.current++;
    const empty = {items: [], loading: false, loaded: false, hasMore: false, error: null};
    listRef.current = empty;
    setList(empty);
    if (enabled) load(false);
    const counter = generation;
    return () => {counter.current++;};
  }, [enabled, resetKey, load]);

  return {...list, loadMore: () => load(true), reload: () => load(false)};
}
