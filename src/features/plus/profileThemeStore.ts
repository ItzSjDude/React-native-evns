import {getProfileThemes} from './profileThemeService';
import type {ProfileThemeEntry} from './types';

/**
 * Server state for `GET /me/profile-themes`, cached in memory and shared by every `useProfileThemes()` caller.
 * Never copied into Redux. Kept outside React so the billing layer can refetch after a purchase.
 */
export type ProfileThemesState = {status: 'idle' | 'loading' | 'ready' | 'error'; themes: ProfileThemeEntry[] | null};

const INITIAL: ProfileThemesState = {status: 'idle', themes: null};
let state = INITIAL;
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;
/** A refresh requested while one is running: the running response may predate the change, so fetch once more. */
let dirty = false;
/** Bumped on reset so a response for a signed-out user is dropped. */
let generation = 0;

const emit = (next: ProfileThemesState) => {
  state = next;
  listeners.forEach(listener => listener());
};

export const getProfileThemesState = () => state;
export const subscribeProfileThemes = (listener: () => void) => {
  listeners.add(listener);
  return () => {listeners.delete(listener);};
};

/** Never rejects: on failure the last known catalog stays, so an unknown state never grants a theme. */
export function refreshProfileThemes(): Promise<void> {
  if (inflight) {dirty = true; return inflight;}
  const run = generation;
  if (state.status === 'idle') emit({...state, status: 'loading'});
  inflight = getProfileThemes()
    .then(themes => {if (run === generation) emit({status: 'ready', themes});})
    .catch(() => {if (run === generation) emit({...state, status: state.themes ? 'ready' : 'error'});})
    .finally(() => {
      inflight = null;
      if (dirty && run === generation) {dirty = false; refreshProfileThemes().catch(() => {});}
      dirty = false;
    });
  return inflight;
}

/** Sign-out: forget the previous user's catalog (ownership is per account). */
export function resetProfileThemes() {
  generation += 1;
  inflight = null;
  dirty = false;
  state = INITIAL;
  listeners.forEach(listener => listener());
}
