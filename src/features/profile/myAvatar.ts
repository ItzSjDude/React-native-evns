import {useEffect, useState} from 'react';
import {getMyProfile} from './profileService';

const listeners = new Set<(url: string | null) => void>();

/** Called by the profile screen after it loads or edits the profile so other surfaces (tab bar) stay in sync. */
export const publishMyAvatarUrl = (url: string | null) => listeners.forEach(listener => listener(url));

/** The signed-in user's avatar URL; null until loaded or when they have none. */
export function useMyAvatarUrl(): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    listeners.add(setUrl);
    getMyProfile().then(profile => active && setUrl(profile.avatar_url ?? null)).catch(() => {});
    return () => {active = false; listeners.delete(setUrl);};
  }, []);
  return url;
}
