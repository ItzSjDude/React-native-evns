import {useCallback, useEffect, useRef, useState} from 'react';
import {Alert, Linking, PermissionsAndroid, Platform} from 'react-native';
import type {LocalParticipant} from 'livekit-client';
import {startPartyAudioService} from '../../core/audio/backgroundAudio';
import {setPartyState} from './partyService';
export function usePartyMicrophone(partyId: string, participant: LocalParticipant, enabled: boolean, canSpeak: boolean, mutedBySnapshot: boolean | undefined, refresh: () => Promise<unknown>, onError: (message: string) => void) {
  const [pending,setPending]=useState(false);
  const generation=useRef(0);
  const mounted=useRef(true);
  useEffect(()=>()=>{mounted.current=false;generation.current++;},[]);
  useEffect(()=>{
    if (!canSpeak || mutedBySnapshot) {
      generation.current++;
      participant.setMicrophoneEnabled(false).catch(()=>onError('Could not stop the microphone. Disconnect the room.'));
    }
  },[canSpeak,mutedBySnapshot,participant,onError]);
  const toggle=useCallback(async()=>{
    const turn=++generation.current;
    // Muting stays available during every server action and a pending unmute.
    if(enabled || pending) {
      setPending(false);
      try {await participant.setMicrophoneEnabled(false);} catch {onError('Could not mute. Disconnect the room.');return;}
      setPartyState(partyId,{muted:true}).then(refresh).catch(()=>onError('Microphone muted on this device. Room status will sync when the connection returns.'));
      return;
    }
    if(!canSpeak)return;
    setPending(true);
    try {
      if(Platform.OS==='android' && !await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO)) {
        const permission=await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        if(permission!==PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('Microphone access needed','Allow microphone access in Settings to speak.',[{text:'Cancel',style:'cancel'},{text:'Open Settings',onPress:()=>{Linking.openSettings().catch(()=>{});}}]);
          return;
        }
      }
      await startPartyAudioService(true);
      await setPartyState(partyId,{muted:false});
      if(turn!==generation.current || !mounted.current)return;
      await refresh();
      if(turn!==generation.current || !mounted.current)return;
      await participant.setMicrophoneEnabled(true);
      if(turn!==generation.current || !mounted.current)await participant.setMicrophoneEnabled(false);
    } catch(cause) {
      await participant.setMicrophoneEnabled(false).catch(()=>{});
      if(mounted.current)onError((cause as Error).message || 'Could not enable microphone.');
      setPartyState(partyId,{muted:true}).catch(()=>{});
    } finally {if(mounted.current && turn===generation.current)setPending(false);}
  },[canSpeak,enabled,onError,participant,partyId,pending,refresh]);
  return {toggle,pending};
}
