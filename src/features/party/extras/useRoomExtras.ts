import {useCallback, useEffect, useRef, useState} from 'react';
import {
  getActivePartyGame, getPartyMonetization, isUnavailable, listPartyGifts, listPartyPolls,
  type PartyGame, type PartyGift, type PartyPoll,
} from './extrasService';

export const EXTRAS_POLL_MS = 4000;

type Feature<T> = {available: boolean; data: T};
export type RoomExtras = {
  polls: Feature<PartyPoll[]>;
  game: Feature<PartyGame | null>;
  gifts: Feature<PartyGift[]> & {enabled: boolean};
  error: string | null;
  refresh: () => Promise<void>;
  setPoll: (poll: PartyPoll) => void;
  setGame: (game: PartyGame | null) => void;
};

/**
 * Polls, games and gifts have no usable realtime events for polls/gifts (the backend only
 * broadcasts party:game-* and the room hook merely refetches the snapshot for those), so this
 * refetches every few seconds, and only while `active` (a sheet showing them is open).
 * A 403/404 from any endpoint marks that feature unavailable so its entry point is hidden.
 */
export function useRoomExtras(partyId: string | undefined, active: boolean, watchGifts: boolean): RoomExtras {
  const [polls, setPolls] = useState<Feature<PartyPoll[]>>({available: false, data: []});
  const [game, setGameState] = useState<Feature<PartyGame | null>>({available: false, data: null});
  const [gifts, setGifts] = useState<Feature<PartyGift[]> & {enabled: boolean}>({available: false, enabled: false, data: []});
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const giftsEnabled = useRef(false);
  const watch = useRef(watchGifts); watch.current = watchGifts;
  const dead = useRef({polls: false, game: false, gifts: false});

  useEffect(() => {mounted.current = true; return () => {mounted.current = false;};}, []);
  useEffect(() => {dead.current = {polls: false, game: false, gifts: false}; giftsEnabled.current = false;}, [partyId]);

  const refresh = useCallback(async () => {
    if (!partyId) return;
    const controller = new AbortController();
    const {signal} = controller;
    let failed = false;
    const guard = async <T,>(key: 'polls' | 'game' | 'gifts', load: () => Promise<T>, apply: (value: T) => void) => {
      if (dead.current[key]) return;
      try {
        const value = await load();
        if (mounted.current) apply(value);
      } catch (e) {
        if (!mounted.current) return;
        if (isUnavailable(e)) {dead.current[key] = true; return;}
        failed = true;
      }
    };
    const settle = {
      polls: guard('polls', () => listPartyPolls(partyId, signal), data => setPolls({available: true, data: Array.isArray(data) ? data : []})),
      game: guard('game', () => getActivePartyGame(partyId, signal), data => setGameState({available: true, data: data ?? null})),
      gifts: dead.current.gifts ? Promise.resolve() : (async () => {
        if (!giftsEnabled.current) {
          await guard('gifts', () => getPartyMonetization(partyId, signal), m => {giftsEnabled.current = !!m.giftsEnabled;});
          if (!giftsEnabled.current && mounted.current) setGifts({available: false, enabled: false, data: []});
        }
        if (giftsEnabled.current && watch.current) {
          await guard('gifts', () => listPartyGifts(partyId, signal), data => setGifts({available: true, enabled: true, data: Array.isArray(data) ? data : []}));
        } else if (giftsEnabled.current && mounted.current) {
          setGifts(current => ({...current, available: true, enabled: true}));
        }
      })(),
    };
    await Promise.all(Object.values(settle));
    if (!mounted.current) return;
    if (dead.current.polls) setPolls({available: false, data: []});
    if (dead.current.game) setGameState({available: false, data: null});
    if (dead.current.gifts) setGifts({available: false, enabled: false, data: []});
    setError(failed ? 'Couldn’t refresh. Retrying…' : null);
  }, [partyId]);

  useEffect(() => {
    if (!partyId || !active) return;
    refresh();
    const timer = setInterval(refresh, EXTRAS_POLL_MS);
    return () => clearInterval(timer);
  }, [active, partyId, refresh, watchGifts]);

  const setPoll = useCallback((poll: PartyPoll) => setPolls(current => ({
    available: true,
    data: current.data.some(item => item.id === poll.id) ? current.data.map(item => item.id === poll.id ? poll : item) : [poll, ...current.data],
  })), []);
  const setGame = useCallback((next: PartyGame | null) => setGameState({available: true, data: next}), []);
  return {polls, game, gifts, error, refresh, setPoll, setGame};
}
