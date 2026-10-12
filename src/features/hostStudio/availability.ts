import {useEffect, useSyncExternalStore} from 'react';
import {getRunOfShow, isUnavailable} from './hostStudioService';

type Status = 'yes' | 'no';
const parties = new Map<string, Status>();
let templates: Status | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => {listeners.add(listener); return () => {listeners.delete(listener);};};

/** Called by any Host Studio view that gets a 403/404, so entry points disappear everywhere at once. */
export const markPartyUnavailable = (partyId: string) => {parties.set(partyId, 'no'); emit();};
export const markTemplatesUnavailable = () => {templates = 'no'; emit();};
export const useTemplatesAvailable = () => useSyncExternalStore(subscribe, () => templates !== 'no');
/** Tests only. */
export const resetAvailability = () => {parties.clear(); templates = undefined; emit();};

/**
 * Whether to show the Host Studio room entry.
 * Managers probe `GET run-of-show` (403/404 hides it). The server gives audience members no way to ask, so they see
 * "Ask a question" until a submit returns 403/404, which hides it for that room.
 */
export function useStudioAvailable(partyId: string | undefined, manager: boolean, active: boolean): boolean {
  const status = useSyncExternalStore(subscribe, () => (partyId ? parties.get(partyId) : 'no'));
  useEffect(() => {
    if (!partyId || !manager || !active || status) return;
    let live = true;
    getRunOfShow(partyId).then(() => {if (live) {parties.set(partyId, 'yes'); emit();}})
      .catch(error => {if (live && isUnavailable(error)) markPartyUnavailable(partyId);});
    return () => {live = false;};
  }, [partyId, manager, active, status]);
  return !!partyId && (manager ? status === 'yes' : status !== 'no');
}
