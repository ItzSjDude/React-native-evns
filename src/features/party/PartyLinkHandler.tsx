import React, {useEffect, useState} from 'react';
import {ActivityIndicator, Linking, Modal, Pressable, Text} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {parsePartyLink} from './partyLinks';
import {getSharedParty, type PartyRoom} from './partyService';
import PartyRoomPreview from './PartyRoomPreview';
import {usePartySession} from './PartySessionProvider';
let pending: string | null = null;
const subscribers = new Set<(token: string) => void>();
export function PartyLinkCapture() {
  useEffect(() => {
    const receive = (url: string | null | undefined) => {
      const token = url && parsePartyLink(url);
      if (token) {pending=token;subscribers.forEach(listener=>listener(token));}
    };
    Linking.getInitialURL().then(receive).catch(()=>{});
    const subscription=Linking.addEventListener('url',event=>receive(event.url));
    return ()=>subscription.remove();
  },[]);
  return null;
}
export function PartyLinkHandler() {
  const {session,open,expand,promptActiveParty}=usePartySession();
  const [token,setToken]=useState(pending);
  const [room,setRoom]=useState<PartyRoom | null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string | null>(null);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{subscribers.add(setToken);return ()=>{subscribers.delete(setToken);};},[]);
  useEffect(()=>{
    if (!token) return;
    let cancelled=false;
    setLoading(true);setError(null);setRoom(null);
    getSharedParty(token).then(next=>{if(!cancelled)setRoom(next);}).catch(cause=>{if(!cancelled)setError(cause.message || 'This party link is unavailable.');}).finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;};
  },[token,attempt]);
  const close=()=>{pending=null;setToken(null);setRoom(null);setError(null);};
  if (room) return <PartyRoomPreview room={room} activePartyId={session?.party.id} onResume={()=>{close();expand();}} onBlocked={()=>promptActiveParty(close)} onClose={close} onJoined={next=>{close();open(next);}} />;
  return <Modal visible={!!token && (loading || !!error)} animationType="slide" onRequestClose={close}>
    <SafeAreaView className="flex-1 items-center justify-center bg-background px-6">
      {loading ? <ActivityIndicator /> : <Text accessibilityRole="alert" className="text-center text-foreground">{error}</Text>}
      {!!error && <Pressable accessibilityRole="button" onPress={()=>setAttempt(value=>value+1)} className="mt-4 h-11 justify-center rounded-full bg-primary px-6"><Text className="font-semibold text-text-dark">Retry</Text></Pressable>}
      <Pressable accessibilityRole="button" onPress={close} className="mt-4 h-11 justify-center px-6"><Text className="text-muted">Close</Text></Pressable>
    </SafeAreaView>
  </Modal>;
}
