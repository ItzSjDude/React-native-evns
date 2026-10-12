import {useCallback, useEffect, useRef, useState} from 'react';
import {AppState} from 'react-native';
import {getRealtimeAccessToken} from '../../core/api/apiClient';
import {subscribeRealtime} from '../../core/realtime/subscribeRealtime';
import {getPartyRoom, type JoinedParty, type PartyChatMessage, type PartySnapshot} from './partyService';

export function mergeRoomMessages(current: PartyChatMessage[], incoming: PartyChatMessage[]) {
  const byId = new Map(current.map(message => [message.id, message]));
  incoming.forEach(message => byId.set(message.id, message));
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).slice(-50);
}

export function usePartyRoomState(session: JoinedParty, onEnded: (reason: string) => void, identity?: string) {
  const [snapshot, setSnapshot] = useState<PartySnapshot>({party: session.party, participants: session.participants, seatRequests: [], lockedSeats: [], chatMessages: [], realtimeUrl: null});
  const [messages, setMessages] = useState<PartyChatMessage[]>([]);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  const mounted = useRef(true);
  const ended = useRef(false);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const inFlight = useRef<Promise<PartySnapshot | undefined> | null>(null);
  const addMessages = useCallback((incoming: PartyChatMessage[]) => setMessages(current => mergeRoomMessages(current, incoming)), []);
  const finish = useCallback((reason: string) => {if (!ended.current) {ended.current = true; onEndedRef.current(reason);}}, []);
  const refresh = useCallback(async (force = false): Promise<PartySnapshot | undefined> => {
    if (inFlight.current) {if (!force) return inFlight.current; await inFlight.current;}
    if (!mounted.current || ended.current) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const promise = (async () => {
      try {
        const next = await getPartyRoom(session.party.id, controller.signal);
        if (!mounted.current || ended.current) return;
        if (next.party.status !== 'ACTIVE') {finish('The host ended this party.'); return;}
        if (identity && !next.participants.find(person => person.userId === identity)?.active) {finish('You are no longer in this party.');return;}
        setSnapshot(next);
        setMessages(mergeRoomMessages([], next.chatMessages || []));
        setSyncError(null);
        return next;
      } catch (error) {
        if (!mounted.current || ended.current) return;
        if ([403, 404].includes((error as {status?: number})?.status || 0)) {finish('You are no longer in this party.'); return;}
        setSyncError('Room updates interrupted. Reconnecting…');
      } finally {clearTimeout(timeout);}
    })();
    inFlight.current = promise;
    try {return await promise;} finally {if (inFlight.current === promise) inFlight.current = null;}
  }, [finish, identity, session.party.id]);
  useEffect(() => {
    mounted.current = true;
    const listener = AppState.addEventListener('change', state => {if (state === 'active') refresh(true);});
    return () => {mounted.current = false; listener.remove();};
  }, [refresh]);
  useEffect(() => {
    refresh();
    const timer = setInterval(() => refresh(), live ? 30000 : 3000);
    return () => clearInterval(timer);
  }, [live, refresh]);
  useEffect(() => {
    if (!snapshot.realtimeUrl) {setLive(false); return;}
    const seen = new Set<string>();
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeRealtime({url: snapshot.realtimeUrl, getToken: getRealtimeAccessToken,
      onStatus: connected => {if (mounted.current) {setLive(connected); if (connected) refresh();}},
      onEvent: event => {
        if (event.partyId !== session.party.id || typeof event.type !== 'string' || !event.type.startsWith('party:')) return;
        if (typeof event.eventId === 'string') {if (seen.has(event.eventId)) return; seen.add(event.eventId); if (seen.size > 500) seen.delete(seen.values().next().value!);}
        if (event.type === 'party:ended') {finish('The host ended this party.'); return;}
        if (event.type === 'party:chat-deleted' && typeof event.messageId === 'string') setMessages(current => current.filter(message => message.id !== event.messageId));
        if (event.type === 'party:chat' && event.message) addMessages([event.message as PartyChatMessage]);
        clearTimeout(debounce);
        debounce = setTimeout(() => refresh(true), 150);
      },
    });
    return () => {clearTimeout(debounce); unsubscribe();};
  }, [addMessages, finish, refresh, session.party.id, snapshot.realtimeUrl]);
  return {snapshot, messages, addMessages, refresh, syncError, live};
}
