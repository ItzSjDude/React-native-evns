import React, {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {Alert, AppState} from 'react-native';
import {AudioSession} from '@livekit/react-native';
import PartyAudioRoom from './PartyAudioRoom';
import {loadSession} from '../auth';
import {stopPartyAudioService} from '../../core/audio/backgroundAudio';
import {joinParty, type JoinedParty} from './partyService';
import {roomTitle} from './partyPresentation';

type PartySessionContext = {
  session: JoinedParty | null;
  open: (session: JoinedParty) => void;
  expand: () => void;
  /** Explains that the user is already in a party, with options to return to it or leave it. */
  promptActiveParty: (beforeAction?: () => void) => void;
};
const Context = createContext<PartySessionContext | null>(null);

/**
 * The provider lives inside the React surface, which Android tears down whenever MainActivity is
 * destroyed while the JS runtime (and the server-side party membership) stays alive. Keep the
 * active party outside React so a recreated surface can restore it instead of silently dropping it.
 */
type Retained = {session: JoinedParty; userId: string | null};
let retained: Retained | null = null;
let orphanCheckDone = false;
export function resetRetainedPartySession() {retained = null; orphanCheckDone = false;}

const goneStatus = (cause: unknown) => [403, 404, 409, 410].includes((cause as {status?: number})?.status || 0);

export function PartySessionProvider({children}: {children: React.ReactNode}) {
  const restored = useRef(retained);
  const [session, setSession] = useState<JoinedParty | null>(() => restored.current?.session ?? null);
  // A restored party comes back minimized: the user was on the tabs when the surface went away.
  const [expanded, setExpanded] = useState(!restored.current);
  const [restoring, setRestoring] = useState(!!restored.current);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');
  const current = useRef(session); current.current = session;
  const leaveRequest = useRef<(() => void) | null>(null);
  const mounted = useRef(true);
  useEffect(() => {mounted.current = true; return () => {mounted.current = false;};}, []);

  useEffect(() => {
    if (foreground) return;
    const listener = AppState.addEventListener('change', state => {if (state === 'active') setForeground(true);});
    return () => listener.remove();
  }, [foreground]);

  // First mount in this JS runtime with no party: a previous runtime (JS reload) may have left the
  // foreground "Audio room active" service and the native audio session running with no room behind them.
  useEffect(() => {
    if (orphanCheckDone) return;
    orphanCheckDone = true;
    if (restored.current) return;
    stopPartyAudioService().catch(() => {});
    AudioSession.stopAudioSession().catch(() => {});
  }, []);

  // Re-validate a restored party: same account, room still live, and a fresh media token.
  useEffect(() => {
    const previous = restored.current;
    if (!previous) return;
    let cancelled = false;
    const drop = () => {if (!cancelled) {retained = null; setSession(null); setExpanded(true);}};
    (async () => {
      try {
        const user = await loadSession();
        if (cancelled) return;
        if (!user || (previous.userId && user.user.id !== previous.userId)) {drop(); return;}
        const fresh = await joinParty(previous.session.party.id);
        if (cancelled) return;
        if (fresh.party.status !== 'ACTIVE') {drop(); return;}
        retained = {session: fresh, userId: user.user.id};
        setSession(fresh);
      } catch (cause) {
        // Room ended or we were removed: reset cleanly. Network failures keep the old session so the
        // room UI can show its own retry/disconnected state.
        if (goneStatus(cause)) drop();
      } finally {if (!cancelled) setRestoring(false);}
    })();
    return () => {cancelled = true;};
  }, []);

  const close = useCallback(() => {retained = null; setSession(null); setExpanded(true);}, []);
  const expand = useCallback(() => setExpanded(true), []);
  const minimize = useCallback(() => setExpanded(false), []);
  const leaveCurrent = useCallback(() => {
    setExpanded(true);
    leaveRequest.current?.();
  }, []);

  const promptActiveParty = useCallback((beforeAction?: () => void) => {
    const active = current.current;
    if (!active) return;
    Alert.alert('Already in a party', `You're still in "${roomTitle(active.party)}". Leave it before joining another party.`, [
      {text: 'Stay', style: 'cancel'},
      {text: 'Return to party', onPress: () => {beforeAction?.(); expand();}},
      {text: 'Leave current party', style: 'destructive', onPress: () => {beforeAction?.(); leaveCurrent();}},
    ]);
  }, [expand, leaveCurrent]);

  const open = useCallback((next: JoinedParty) => {
    if (current.current && current.current.party.id !== next.party.id) {promptActiveParty(); return;}
    retained = {session: next, userId: null};
    setSession(next); setExpanded(true);
    loadSession().then(user => {
      if (mounted.current && retained?.session === next) retained = {session: next, userId: user?.user.id ?? null};
    }).catch(() => {});
  }, [promptActiveParty]);

  const value = useMemo(() => ({session, open, expand, promptActiveParty}), [session, open, expand, promptActiveParty]);
  return <Context.Provider value={value}>
    {children}
    {session && !restoring && foreground && <PartyAudioRoom key={session.party.id} session={session} onClose={close} expanded={expanded}
      onMinimize={minimize} onExpand={expand} leaveRequest={leaveRequest} />}
  </Context.Provider>;
}
export function usePartySession() {
  const value = useContext(Context);
  if (!value) throw new Error('PartySessionProvider is required');
  return value;
}
