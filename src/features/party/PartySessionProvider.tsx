import React, {createContext, useCallback, useContext, useRef, useState} from 'react';
import {Alert} from 'react-native';
import PartyAudioRoom from './PartyAudioRoom';
import {type JoinedParty} from './partyService';
type PartySessionContext = {session: JoinedParty | null; open: (session: JoinedParty) => void; expand: () => void};
const Context = createContext<PartySessionContext | null>(null);
export function PartySessionProvider({children}: {children: React.ReactNode}) {
  const [session,setSession] = useState<JoinedParty | null>(null);
  const [expanded,setExpanded] = useState(true);
  const current = useRef(session); current.current = session;
  const close = useCallback(() => {setSession(null);setExpanded(true);},[]);
  const open = useCallback((next: JoinedParty) => {
    if (current.current && current.current.party.id !== next.party.id) {Alert.alert('Already in a party','Leave your current room before joining another.'); return;}
    setSession(next);setExpanded(true);
  },[]);
  const expand = useCallback(() => setExpanded(true),[]);
  return <Context.Provider value={{session,open,expand}}>
    {children}
    {session && <PartyAudioRoom key={session.party.id} session={session} onClose={close} expanded={expanded} onMinimize={() => setExpanded(false)} onExpand={expand} />}
  </Context.Provider>;
}
export function usePartySession() {
  const value = useContext(Context);
  if (!value) throw new Error('PartySessionProvider is required');
  return value;
}
