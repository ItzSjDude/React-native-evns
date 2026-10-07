import React, {useEffect, useRef, useState} from 'react';
import {Alert, Modal, Platform, Pressable, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {AudioSession, AndroidAudioTypePresets, LiveKitRoom} from '@livekit/react-native';
import {loadSession} from '../auth';
import AudioRoomStage from './AudioRoomStage';
import {PARTY_AUDIO_ROOM_OPTIONS} from './audioConfig';
import {roomTitle} from './partyPresentation';
import {endParty, leaveParty, type JoinedParty} from './partyService';
import {startPartyAudioService, stopPartyAudioService} from '../../core/audio/backgroundAudio';
export default function PartyAudioRoom({session, onClose, expanded, onMinimize, onExpand, leaveRequest}: {
  session: JoinedParty; onClose: () => void; expanded: boolean; onMinimize: () => void; onExpand: () => void;
  leaveRequest?: React.MutableRefObject<(() => void) | null>;
}) {
  const [audioReady,setAudioReady] = useState(false);
  const [error,setError] = useState<string | null>(null);
  const [host,setHost] = useState(false);
  const [attempt,setAttempt] = useState(0);
  const [closing,setClosing]=useState(false);
  const closeRequest=useRef<(() => void) | null>(null);
  const onCloseRef=useRef(onClose); onCloseRef.current=onClose;
  useEffect(()=>{
    let mounted=true;
    loadSession().then(stored=>{if(mounted)setHost((session.party.hostId || session.party.host?.id)===stored?.user.id);}).catch(()=>{});
    const timer=setTimeout(()=>{if(mounted)setError('Audio setup took too long. Retry or close the room.');},15000);
    (async()=>{
      try {
        if(Platform.OS==='android') await AudioSession.configureAudio({android:{audioTypeOptions:AndroidAudioTypePresets.communication}});
        await AudioSession.startAudioSession();
        if (!mounted) {await AudioSession.stopAudioSession();return;}
        await startPartyAudioService(false);
        if(mounted){clearTimeout(timer);setError(null);setAudioReady(true);}
      } catch {if(mounted){clearTimeout(timer);setError('Could not start device audio. Retry or close the room.');}}
    })();
    return ()=>{mounted=false;clearTimeout(timer);stopPartyAudioService().catch(()=>{});AudioSession.stopAudioSession().catch(()=>{});};
  },[attempt,session.party.hostId,session.party.host?.id]);
  const requestClose=()=>{
    if(closeRequest.current){closeRequest.current();return;}
    Alert.alert(host?'End party for everyone?':'Leave party?',host?'This closes the room for everyone.':'You can join again later.',[
      {text:'Stay',style:'cancel'},
      {text:host?'End party':'Leave',style:'destructive',onPress:async()=>{
        setClosing(true);
        try {await(host?endParty(session.party.id):leaveParty(session.party.id));onCloseRef.current();}
        catch {setError('Could not update the room. Retry, or disconnect from this device.');}
        finally {setClosing(false);}
      }},
      {text:'Disconnect this device',onPress:()=>onCloseRef.current()},
    ]);
  };
  const requestCloseRef=useRef(requestClose); requestCloseRef.current=requestClose;
  useEffect(()=>{
    if(!leaveRequest)return;
    leaveRequest.current=()=>requestCloseRef.current();
    return ()=>{leaveRequest.current=null;};
  },[leaveRequest]);
  if(!audioReady && !expanded) return <View className="absolute bottom-[90px] left-4 right-4 flex-row items-center gap-2 rounded-[22px] border border-border bg-card py-2 pl-4 pr-1">
    <Pressable accessibilityRole="button" accessibilityLabel="Return to audio party" onPress={onExpand} className="min-h-11 min-w-0 flex-1 justify-center active:opacity-70">
      <Text numberOfLines={1} className="text-sm font-semibold text-foreground">{roomTitle(session.party)}</Text>
      <Text accessibilityRole={error?'alert':undefined} numberOfLines={1} className="mt-0.5 text-xs text-muted">{error ? 'Audio problem · Open to retry' : 'Preparing audio…'}</Text>
    </Pressable>
  </View>;
  if(!audioReady) return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={requestClose}>
    <SafeAreaView className="flex-1 items-center justify-center bg-background px-8">
      <Text accessibilityRole={error?'alert':undefined} className="text-center text-sm text-foreground">{error || 'Preparing audio…'}</Text>
      {!!error && <Pressable accessibilityRole="button" disabled={closing} onPress={()=>{setError(null);setAttempt(value=>value+1);}} className="mt-6 h-11 justify-center rounded-full bg-primary px-6"><Text className="font-semibold text-text-dark">Retry audio</Text></Pressable>}
      <Pressable accessibilityRole="button" disabled={closing} onPress={requestClose} className="mt-4 h-11 justify-center rounded-full bg-card px-6"><Text className="text-foreground">Close room</Text></Pressable>
    </SafeAreaView>
  </Modal>;
  return <LiveKitRoom serverUrl={session.media.url} token={session.media.token} connect audio={false} video={false}
    options={PARTY_AUDIO_ROOM_OPTIONS} onConnected={()=>setError(null)} onError={cause=>setError(cause.message || 'Audio connection failed.')}>
    <AudioRoomStage session={session} onClose={onClose} closeRequest={closeRequest} connectionError={error} expanded={expanded} onMinimize={onMinimize} onExpand={onExpand} />
  </LiveKitRoom>;
}
