import {useCallback, useEffect, useRef, useState} from 'react';
import {registerLocalDataWiper} from '../../core/localData';
import {loadSession} from '../auth';
import {followUser, getViewerFollowingIds, messageOf, unfollowUser} from './usersService';
import type {FollowResult} from './types';

type Listener = (userId: string, following: boolean, followers?: number) => void;

/**
 * Follow state the client has learned this session, so a profile modal, a follow list and a
 * nested profile opened from that list never disagree about the same person.
 */
const known = new Map<string, boolean>();
const listeners = new Set<Listener>();
let viewerFollowing: {viewerId: string; promise: Promise<Set<string>>} | null = null;

export const followStore = {
  get: (userId: string) => known.get(userId),
  publish(userId: string, following: boolean, followers?: number) {
    known.set(userId, following);
    listeners.forEach(listener => listener(userId, following, followers));
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {listeners.delete(listener);};
  },
  /**
   * Records follow state the server reported on list rows. Only booleans are trusted (older servers omit the
   * field). Does not notify: rows read the store when they mount.
   */
  seedFromRows(rows: ReadonlyArray<{id: string; isFollowing?: boolean}>, viewerId?: string | null) {
    rows.forEach(row => {if (typeof row.isFollowing === 'boolean' && row.id !== viewerId) known.set(row.id, row.isFollowing);});
  },
  /** Loads the viewer's following list once per session and marks those users as followed. */
  loadViewerFollowing(viewerId: string) {
    if (viewerFollowing?.viewerId !== viewerId) {
      const promise = getViewerFollowingIds(viewerId).then(ids => {
        ids.forEach(id => {if (!known.has(id)) known.set(id, true);});
        return ids;
      });
      promise.catch(() => {if (viewerFollowing?.promise === promise) viewerFollowing = null;});
      viewerFollowing = {viewerId, promise};
    }
    return viewerFollowing.promise;
  },
  /** Forgets what was learned (another account may be signing in) but keeps live subscribers. */
  clear() {known.clear(); viewerFollowing = null;},
  /** Test-only: forget everything learned so far, subscribers included. */
  reset() {known.clear(); listeners.clear(); viewerFollowing = null;},
};

// Logout, account deletion and account switches must not leak the previous account's follow state.
registerLocalDataWiper(() => followStore.clear());

/** undefined while the keychain is read, null when signed out. */
export function useViewerId() {
  const [viewerId, setViewerId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let mounted = true;
    loadSession().then(session => {if (mounted) setViewerId(session?.user?.id ?? null);}).catch(() => {if (mounted) setViewerId(null);});
    return () => {mounted = false;};
  }, []);
  return viewerId;
}

/** Whether the viewer follows `userId`: null until known. Uses what rows/actions taught the store; falls back to the viewer's following list. */
export function useIsFollowing(userId: string, viewerId: string | null | undefined, enabled = true) {
  const [following, setFollowing] = useState<boolean | null>(() => followStore.get(userId) ?? null);
  useEffect(() => {
    const learned = followStore.get(userId);
    setFollowing(learned ?? null);
    // Already learned (from a list row or an action): no need to download the viewer's following list.
    if (learned !== undefined) return;
    if (!enabled || !viewerId || viewerId === userId) return;
    let mounted = true;
    followStore.loadViewerFollowing(viewerId)
      .then(() => {if (mounted) setFollowing(followStore.get(userId) ?? false);})
      .catch(() => {if (mounted) setFollowing(current => current ?? false);});
    return () => {mounted = false;};
  }, [userId, viewerId, enabled]);
  return following;
}

type FollowState = {following: boolean | null; followers: number | null};

/**
 * Optimistic follow toggle: flips immediately, settles on the server's answer, and rolls back
 * (with an error message) if the request fails.
 */
export function useFollowToggle(userId: string, seed: {following: boolean | null; followers?: number | null}, onFailure?: (error: unknown) => void) {
  const [state, setState] = useState<FollowState>({following: seed.following, followers: seed.followers ?? null});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const busy = useRef(false);
  const failure = useRef(onFailure);
  failure.current = onFailure;
  const seedRef = useRef(seed);
  seedRef.current = seed;

  // Adopt late-arriving seeds (the following lookup or a profile fetch) unless a toggle is in flight.
  useEffect(() => {
    if (busy.current) return;
    setState(current => ({
      following: seed.following ?? current.following,
      followers: seed.followers ?? current.followers,
    }));
  }, [seed.following, seed.followers]);

  // A different person: start over from their seed rather than the previous person's state.
  useEffect(() => {
    setError(null);
    setState({following: seedRef.current.following, followers: seedRef.current.followers ?? null});
    return followStore.subscribe((id, following, followers) => {
      if (id !== userId || busy.current) return;
      setState(current => ({following, followers: followers ?? current.followers}));
    });
  }, [userId]);

  const toggle = useCallback(async (): Promise<FollowResult | null> => {
    if (busy.current) return null;
    busy.current = true;
    const previous = stateRef.current;
    const next = !previous.following;
    setPending(true);
    setError(null);
    setState({following: next, followers: previous.followers === null ? null : Math.max(0, previous.followers + (next ? 1 : -1))});
    try {
      const result = await (next ? followUser(userId) : unfollowUser(userId));
      setState({following: result.isFollowing, followers: result.followers});
      busy.current = false;
      followStore.publish(userId, result.isFollowing, result.followers);
      return result;
    } catch (cause) {
      setState(previous);
      setError(messageOf(cause));
      failure.current?.(cause);
      return null;
    } finally {
      busy.current = false;
      setPending(false);
    }
  }, [userId]);

  return {...state, pending, error, toggle};
}
