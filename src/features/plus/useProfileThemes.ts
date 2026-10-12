import {useEffect, useSyncExternalStore} from 'react';
import {getProfileThemesState, refreshProfileThemes, subscribeProfileThemes} from './profileThemeStore';
import {useProfileTheme, usableThemeId} from './profileTheme';
import type {ProfileThemeId} from './types';
import {usePlus} from './usePlus';

/** The server's theme catalog for the signed-in user. Refetches on mount and whenever the subscription plan changes. */
export function useProfileThemes() {
  const state = useSyncExternalStore(subscribeProfileThemes, getProfileThemesState, getProfileThemesState);
  const {subscription} = usePlus();
  const plan = subscription?.plan;
  useEffect(() => {refreshProfileThemes().catch(() => {});}, [plan]);
  return {...state, refresh: refreshProfileThemes};
}

/**
 * Colors for the signed-in user's own profile: the stored selection only while the catalog says it is usable.
 * While the catalog is loading or unavailable this is the default look, the safe side: a Plus theme must never
 * show for an expired subscription (the selection itself is retained and re-applies once it loads).
 */
export function useOwnProfileTheme(selected: ProfileThemeId | null | undefined) {
  const {themes} = useProfileThemes();
  return useProfileTheme(usableThemeId(selected, themes));
}
