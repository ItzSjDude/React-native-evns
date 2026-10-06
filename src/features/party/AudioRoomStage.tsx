import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Alert, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, Share, Text, TextInput, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useConnectionState, useLocalParticipant, useParticipants, useRoomContext} from '@livekit/react-native';
import {ConnectionState, RoomEvent} from 'livekit-client';
import IconDots from '@tabler/icons-react-native/IconDots';
import IconChevronDown from '@tabler/icons-react-native/IconChevronDown';
import AudioOutputSheet from './AudioOutputSheet';
import {usePartyMicrophone} from './usePartyMicrophone';
import {partyShareMessage} from './partyLinks';
import IconX from '@tabler/icons-react-native/IconX';
import IconUsers from '@tabler/icons-react-native/IconUsers';
import IconHandStop from '@tabler/icons-react-native/IconHandStop';
import IconMicrophone from '@tabler/icons-react-native/IconMicrophone';
import IconMicrophoneOff from '@tabler/icons-react-native/IconMicrophoneOff';
import IconVolume from '@tabler/icons-react-native/IconVolume';
import IconSend from '@tabler/icons-react-native/IconSend';
import AudioPartyStage from './AudioPartyStage';
import RoomChatStream from './RoomChatStream';
import PartyRoomPanel, {type RoomAction, type RoomActionTarget, type RoomPanel} from './PartyRoomPanel';
import {usePartyRoomState} from './usePartyRoomState';
import {PartyColors, roomTitle} from './partyPresentation';
import {deletePartyChat, respondPartyInvitation, transferPartyHost, updatePartySettings, approvePartySeat, blockPartyParticipant, cancelPartySeatRequest, denyPartySeat, endParty, inviteToPartySeat, joinParty, leaveParty, movePartySpeakerToAudience, patchPartySeat, releasePartySeat, removePartyParticipant, reportPartyParticipant, requestPartySeat, sendPartyChat, setPartyCoHost, type JoinedParty} from './partyService';

export default function AudioRoomStage({session, onClose, closeRequest, connectionError, expanded, onMinimize, onExpand}: {
  session: JoinedParty; onClose: () => void; expanded: boolean; onMinimize: () => void; onExpand: () => void; closeRequest: React.MutableRefObject<(() => void) | null>; connectionError: string | null;
}) {
  const room = useRoomContext();
  const connection = useConnectionState();
  const liveParticipants = useParticipants();
  const {localParticipant, isMicrophoneEnabled} = useLocalParticipant();
  const identity = localParticipant.identity;
  const [panel, setPanel] = useState<RoomPanel>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const intentionalExit = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [chatText, setChatText] = useState('');
  const [outputOpen,setOutputOpen]=useState(false);
  const [chatBusy,setChatBusy]=useState(false);
  const chatBusyRef=useRef(false);
  const [keyboard, setKeyboard] = useState(false);
  const onEnded = useCallback((reason: string) => {onClose(); if (!intentionalExit.current) Alert.alert('Party closed', reason);}, [onClose]);
  const {snapshot, messages, addMessages, refresh, syncError} = usePartyRoomState(session, onEnded, identity);
  const me = snapshot.participants.find(p => p.userId === identity);
  const host = me?.role === 'HOST';
  const manager = host || me?.role === 'CO_HOST';
  const canSpeak = !!me?.active && me.seatIndex !== null;
  const ownRequest = snapshot.seatRequests.find(r => r.userId === identity && r.status === 'PENDING');
  const requests = snapshot.seatRequests.filter(r => r.status === 'PENDING');
  const speakers = snapshot.participants.filter(p => p.active && p.seatIndex !== null);
  const audience = snapshot.participants.filter(p => p.active && p.seatIndex === null);
  const liveById = useMemo(() => new Map(liveParticipants.map(p => [p.identity, p])), [liveParticipants]);
  const seatCount = snapshot.party.seatCount || 8;
  const freeSeat = Array.from({length: seatCount}, (_, i) => i).find(i => i > 0 && !snapshot.lockedSeats.includes(i) && !speakers.some(p => p.seatIndex === i));
  const partyId = session.party.id;

  useEffect(() => {
    mounted.current = true;
    closeRequest.current = () => setPanel({kind: 'exit'});
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboard(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboard(false));
    return () => {mounted.current = false; closeRequest.current = null; show.remove(); hide.remove();};
  }, [closeRequest]);
  const {toggle: toggleMic,pending: micPending}=usePartyMicrophone(partyId,localParticipant,isMicrophoneEnabled,canSpeak,me?.muted,() => refresh(true),setError);

  const run = useCallback(async (operation: () => Promise<unknown>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError(null);
    try {await operation(); if (mounted.current) await refresh(true);}
    catch (cause) {if (mounted.current) setError((cause as {message?: string})?.message || 'Could not complete that action. Try again.');}
    finally {busyRef.current = false; if (mounted.current) setBusy(false);}
  }, [refresh]);

  const reconnecting = useRef(false);
  const restoreAudio = useCallback(async () => {
    if (reconnecting.current || !mounted.current) return;
    reconnecting.current = true;
    try {
      const next = await refresh(true);
      if (!next || !mounted.current || room.state !== ConnectionState.Disconnected) return;
      const current = next.participants.find(p => p.userId === identity);
      if (!current?.active || intentionalExit.current) return;
      const rejoined = await joinParty(partyId);
      if (mounted.current) await room.connect(rejoined.media.url, rejoined.media.token);
    } catch {if (mounted.current) setError('Audio disconnected. Tap Retry audio.');}
    finally {reconnecting.current = false;}
  }, [identity, partyId, refresh, room]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const disconnected = () => {if (!intentionalExit.current) timer = setTimeout(() => restoreAudio(), 500);};
    room.on(RoomEvent.Disconnected, disconnected);
    return () => {clearTimeout(timer); room.off(RoomEvent.Disconnected, disconnected);};
  }, [restoreAudio, room]);

  const act = (action: RoomAction, target?: RoomActionTarget) => {
    if (action === 'report') {
      Alert.alert('Report participant', 'Choose a reason for the report.', [...['Inappropriate behavior', 'Spam'].map(reason => ({text: reason, onPress: () => {run(async () => {await reportPartyParticipant(partyId, String(target), reason); setPanel(null); Alert.alert('Report received', 'Thanks for helping keep this room safe.');});}})), {text: 'Cancel', style: 'cancel'}]);
      return;
    }
    const perform = () => run(async () => {
      switch (action) {
        case 'approve': if (freeSeat === undefined) throw new Error('No open speaker seat. Unlock or free one first.'); await approvePartySeat(partyId, String(target), freeSeat); break;
        case 'deny': await denyPartySeat(partyId, String(target)); break;
        case 'cancel': if (ownRequest) await cancelPartySeatRequest(partyId, ownRequest.id); break;
        case 'request': await requestPartySeat(partyId); break;
        case 'lock': await patchPartySeat(partyId, Number(target), {locked: !snapshot.lockedSeats.includes(Number(target))}); break;
        case 'mute': await patchPartySeat(partyId, Number(target), {muted: true}); break;
        case 'kick': await movePartySpeakerToAudience(partyId, Number(target)); break;
        case 'stepdown': await localParticipant.setMicrophoneEnabled(false); await releasePartySeat(partyId); break;
        case 'invite': if (freeSeat === undefined) throw new Error('No open speaker seat.'); await inviteToPartySeat(partyId, String(target), freeSeat); break;
        case 'cohost': await setPartyCoHost(partyId, String(target), snapshot.participants.find(p => p.userId === target)?.role !== 'CO_HOST'); break;
        case 'remove': await removePartyParticipant(partyId, String(target)); setPanel(null); break;
        case 'block': await blockPartyParticipant(partyId, String(target)); setPanel(null); Alert.alert('Participant blocked'); break;
        case 'share': await Share.share({message:await partyShareMessage(snapshot.party)}); break;
        case 'chat-toggle': await updatePartySettings(partyId,{chatEnabled:snapshot.party.chatEnabled===false}); break;
        case 'requests-toggle': await updatePartySettings(partyId,{requestsEnabled:snapshot.party.requestsEnabled===false}); break;
        case 'slow-mode': await updatePartySettings(partyId,{slowModeSeconds:snapshot.party.slowModeSeconds ? 0 : 10}); break;
        case 'edit': await updatePartySettings(partyId,target as import('./partyService').PartyRoomSettings); setPanel({kind:'info'}); break;
        case 'transfer': await transferPartyHost(partyId,String(target)); setPanel(null); break;
        case 'accept-invite': await respondPartyInvitation(partyId,String(target),true); break;
        case 'decline-invite': await respondPartyInvitation(partyId,String(target),false); break;
        case 'disconnect': intentionalExit.current=true; await localParticipant.setMicrophoneEnabled(false); await room.disconnect(); onClose(); break;
        case 'exit': intentionalExit.current = true; await localParticipant.setMicrophoneEnabled(false); try {await (host ? endParty(partyId) : leaveParty(partyId)); await room.disconnect(); onClose();} catch (cause) {intentionalExit.current = false; throw cause;} break;
      }
    });
    if (action === 'transfer') Alert.alert('Transfer host role?', 'The selected co-host will control this party. You can leave without ending it.', [{text:'Cancel',style:'cancel'},{text:'Make host',onPress:perform}]);
    else if (action === 'remove' || action === 'block') Alert.alert(action === 'remove' ? 'Remove from this room?' : 'Block this participant?', 'Confirm this action for the selected participant.', [{text: 'Cancel', style: 'cancel'}, {text: action === 'remove' ? 'Remove' : 'Block', style: 'destructive', onPress: perform}]);
    else perform();
  };
  const sendChat = async () => {
    const body=chatText.trim();
    if(!body || chatBusyRef.current || snapshot.party.chatEnabled===false)return;
    chatBusyRef.current=true;setChatBusy(true);setError(null);
    try {const sent=await sendPartyChat(partyId,body);if(mounted.current){addMessages([sent.message]);setChatText('');}}
    catch(cause){if(mounted.current)setError((cause as Error).message || 'Message failed. Your draft is saved; try again.');}
    finally{chatBusyRef.current=false;if(mounted.current)setChatBusy(false);}
  };
  const messageActions = (message: import('./partyService').PartyChatMessage) => {
    const buttons: import('react-native').AlertButton[]=[];
    if(manager || message.userId===identity)buttons.push({text:'Delete message',style:'destructive',onPress:()=>run(async()=>{await deletePartyChat(partyId,message.id);})});
    if(message.userId!==identity)buttons.push({text:'Report message',onPress:()=>run(async()=>{await reportPartyParticipant(partyId,message.userId,`Inappropriate room message: ${message.body.slice(0,200)}`);Alert.alert('Report received');})});
    buttons.push({text:'Cancel',style:'cancel'});Alert.alert('Message options',message.name,buttons);
  };
  const invitation=snapshot.seatInvitations?.find(item=>Date.parse(item.expiresAt)>Date.now());
  return <>
    {!expanded && <View className="absolute bottom-[90px] left-4 right-4 flex-row items-center rounded-[20px] border border-border bg-card p-2">
      <Pressable accessibilityRole="button" accessibilityLabel="Return to audio party" onPress={onExpand} className="min-h-11 min-w-0 flex-1 justify-center px-2"><Text numberOfLines={1} className="text-sm font-semibold text-foreground">{roomTitle(snapshot.party)}</Text><Text className="mt-1 text-xs text-muted">{connection===ConnectionState.Connected ? canSpeak ? isMicrophoneEnabled ? 'Mic on' : 'Mic off' : 'Listening' : 'Audio disconnected · Open to retry'}</Text></Pressable>
      {canSpeak && <Pressable accessibilityRole="button" accessibilityLabel={isMicrophoneEnabled || micPending ? 'Mute microphone' : 'Unmute microphone'} onPress={toggleMic} className="h-11 w-11 items-center justify-center">{isMicrophoneEnabled ? <IconMicrophone size={22} color={PartyColors.accent} /> : <IconMicrophoneOff size={22} color={PartyColors.coral} />}</Pressable>}
      <Pressable accessibilityRole="button" accessibilityLabel="Leave audio party" onPress={()=>{onExpand();setPanel({kind:'exit'});}} className="h-11 w-11 items-center justify-center"><IconX size={22} color={PartyColors.coral} /></Pressable>
    </View>}
    <Modal visible={expanded} animationType="slide" presentationStyle="fullScreen" onRequestClose={()=>setPanel({kind:'exit'})}>
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View className="flex-row items-center px-4 py-2">
        <View className="min-w-0 flex-1"><Text numberOfLines={1} className="text-[17px] font-semibold text-foreground">{roomTitle(snapshot.party)}</Text><Text className="mt-1 text-[11px] text-muted">{connection === ConnectionState.Connected ? 'Live audio' : connection === ConnectionState.Reconnecting ? 'Reconnecting audio…' : 'Connecting audio…'}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Minimize audio party" onPress={onMinimize} className="mr-2 h-11 w-11 items-center justify-center rounded-full bg-card"><IconChevronDown size={23} color={PartyColors.text} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Room controls" onPress={() => setPanel({kind: 'info'})} className="h-11 w-11 items-center justify-center rounded-full bg-card"><IconDots size={23} color={PartyColors.text} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={host ? 'End party' : 'Leave party'} onPress={() => setPanel({kind: 'exit'})} className="ml-2 h-11 w-11 items-center justify-center rounded-full bg-card"><IconX size={21} color={PartyColors.coral} /></Pressable>
      </View>
      <View className="mx-5 mt-2 flex-row items-center justify-between gap-2">
        <Text className="flex-1 text-xs text-muted">{speakers.length} speakers · {seatCount} seats</Text>
        {manager && <Pressable accessibilityRole="button" accessibilityLabel={`Requests to speak ${requests.length}`} onPress={() => setPanel({kind: 'requests'})} className="h-11 flex-row items-center gap-1.5 rounded-full bg-primary-dark px-3"><IconHandStop size={16} color={PartyColors.accent} /><Text className="text-xs font-semibold text-primary">Requests {requests.length || ''}</Text></Pressable>}
        <Pressable accessibilityRole="button" accessibilityLabel="People in room" onPress={() => setPanel({kind: 'people'})} className="h-11 flex-row items-center gap-1.5 rounded-full bg-card px-3"><IconUsers size={16} color={PartyColors.text} /><Text className="text-xs text-foreground">{audience.length}</Text></Pressable>
      </View>
      {!keyboard && <AudioPartyStage seatCount={seatCount} speakers={speakers} liveById={liveById} localIdentity={identity} lockedSeats={snapshot.lockedSeats}
        onSeatPress={(person, index) => setPanel(person ? {kind: 'person', personId: person.userId} : {kind: 'seat', seatIndex: index})} />}
      {invitation && <View className="mx-4 mb-2 rounded-2xl bg-card p-3"><Text accessibilityLiveRegion="polite" className="text-sm text-foreground">You’re invited to speak · Seat {invitation.seatIndex+1}</Text><View className="mt-2 flex-row gap-3"><Pressable accessibilityRole="button" disabled={busy} onPress={()=>act('accept-invite',invitation.id)} className="min-h-11 flex-1 items-center justify-center rounded-full bg-primary"><Text className="font-semibold text-text-dark">Accept</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} onPress={()=>act('decline-invite',invitation.id)} className="min-h-11 flex-1 items-center justify-center"><Text className="text-muted">Decline</Text></Pressable></View><Text className="mt-2 text-xs text-muted">Your microphone stays off until you unmute.</Text></View>}
      <RoomChatStream messages={messages} identity={identity} onMessagePress={messageActions} />
      {!!(error || syncError || connectionError) && <Text accessibilityRole="alert" className="px-5 py-1 text-center text-xs text-coral">{error || syncError || connectionError}</Text>}
      {connection === ConnectionState.Disconnected && <Pressable accessibilityRole="button" onPress={restoreAudio} className="h-11 items-center justify-center"><Text className="text-sm font-semibold text-primary">Retry audio</Text></Pressable>}
      <View className="border-t border-border/50 bg-nav-background px-4 pb-2 pt-3">
        <View className="h-11 flex-row items-center rounded-full border border-border bg-card pl-4 pr-1">
          <TextInput accessibilityLabel="Send a room message" value={chatText} onChangeText={setChatText} maxLength={4000} editable={!chatBusy && snapshot.party.chatEnabled!==false} onSubmitEditing={sendChat} returnKeyType="send" placeholder={snapshot.party.chatEnabled===false ? 'Chat paused by host' : 'Say something…'} placeholderTextColor={PartyColors.muted} className="h-full flex-1 text-sm text-foreground" />
          <Pressable accessibilityRole="button" accessibilityLabel="Send room message" onPress={sendChat} disabled={chatBusy || !chatText.trim() || snapshot.party.chatEnabled===false} className="h-11 w-11 items-center justify-center rounded-full bg-primary"><IconSend size={17} color={PartyColors.ink} /></Pressable>
        </View>
        <View className="mt-2 flex-row items-center justify-center gap-6">
          <Pressable accessibilityRole="button" accessibilityLabel="Choose audio device" onPress={()=>setOutputOpen(true)} className="min-h-12 min-w-12 items-center justify-center gap-1"><IconVolume size={21} color={PartyColors.accent} /><Text className="text-xs text-muted">Audio</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={canSpeak ? isMicrophoneEnabled ? 'Mute microphone' : 'Unmute microphone' : ownRequest ? 'Cancel request to speak' : 'Request to speak'} disabled={canSpeak ? !isMicrophoneEnabled && !micPending && connection!==ConnectionState.Connected : busy || connection!==ConnectionState.Connected || (!ownRequest && snapshot.party.requestsEnabled===false)} onPress={canSpeak ? toggleMic : () => act(ownRequest ? 'cancel' : 'request')} className="min-h-12 min-w-24 items-center justify-center gap-1">
            {canSpeak ? isMicrophoneEnabled ? <IconMicrophone size={24} color={PartyColors.accent} /> : <IconMicrophoneOff size={24} color={PartyColors.coral} /> : <IconHandStop size={24} color={ownRequest ? PartyColors.accent : PartyColors.text} />}
            <Text className="text-xs text-foreground">{canSpeak ? micPending ? 'Cancel unmute' : isMicrophoneEnabled ? 'Mute' : 'Unmute' : ownRequest ? 'Hand raised · Cancel' : snapshot.party.requestsEnabled===false ? 'Requests paused' : 'Raise hand'}</Text>
          </Pressable>
          {canSpeak && !host && <Pressable accessibilityRole="button" accessibilityLabel="Move to audience" disabled={busy} onPress={() => act('stepdown')} className="min-h-12 items-center justify-center gap-1"><IconUsers size={22} color={PartyColors.muted} /><Text className="text-xs text-muted">Step down</Text></Pressable>}
        </View>
      </View>
    </KeyboardAvoidingView>
    <PartyRoomPanel panel={panel} onClose={() => setPanel(null)} onSelect={setPanel} participants={snapshot.participants} requests={snapshot.seatRequests} lockedSeats={snapshot.lockedSeats} seatCount={seatCount} identity={identity} busy={busy} error={error}
      onAction={act} title={roomTitle(snapshot.party)} topic={snapshot.party.topic} ownRequest={ownRequest} settings={snapshot.party} />
    <AudioOutputSheet visible={outputOpen} onClose={()=>setOutputOpen(false)} />
  </SafeAreaView>
  </Modal>
  </>;
}
