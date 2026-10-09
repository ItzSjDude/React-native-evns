import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Alert, AppState, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, Share, Text, TextInput, View} from 'react-native';
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
import IconHeadphones from '@tabler/icons-react-native/IconHeadphones';
import IconDoorExit from '@tabler/icons-react-native/IconDoorExit';
import IconRefresh from '@tabler/icons-react-native/IconRefresh';
import IconCheck from '@tabler/icons-react-native/IconCheck';
import IconVideo from '@tabler/icons-react-native/IconVideo';
import IconVideoOff from '@tabler/icons-react-native/IconVideoOff';
import VideoPartyStage from './video/VideoPartyStage';
import {usePartyCamera} from './video/usePartyCamera';
import {UserProfileModal, type UserPreview} from '../users';
import AudioPartyStage from './AudioPartyStage';
import RoomChatStream from './RoomChatStream';
import PartyRoomPanel, {type ReportTarget, type RoomAction, type RoomActionTarget, type RoomPanel} from './PartyRoomPanel';
import {usePartyRoomState} from './usePartyRoomState';
import {PartyColors, roomTitle} from './partyPresentation';
import {deletePartyChat, respondPartyInvitation, transferPartyHost, updatePartySettings, approvePartySeat, blockPartyParticipant, cancelPartySeatRequest, denyPartySeat, endParty, inviteToPartySeat, joinParty, leaveParty, movePartySpeakerToAudience, patchPartySeat, releasePartySeat, removePartyParticipant, reportPartyParticipant, requestPartySeat, sendPartyChat, setPartyCoHost, type JoinedParty, type PartyRoomSettings} from './partyService';

export default function AudioRoomStage({session, onClose, closeRequest, connectionError, expanded, onMinimize, onExpand}: {
  session: JoinedParty; onClose: () => void; expanded: boolean; onMinimize: () => void; onExpand: () => void; closeRequest: React.MutableRefObject<(() => void) | null>; connectionError: string | null;
}) {
  const room = useRoomContext();
  const connection = useConnectionState();
  const liveParticipants = useParticipants();
  const {localParticipant, isMicrophoneEnabled, isCameraEnabled} = useLocalParticipant();
  const isVideo = session.party.kind === 'VIDEO';
  const noun = isVideo ? 'video' : 'audio';
  const identity = localParticipant.identity;
  const [panel, setPanel] = useState<RoomPanel>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const intentionalExit = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [chatText, setChatText] = useState('');
  const [outputOpen,setOutputOpen]=useState(false);
  const [viewing, setViewing] = useState<{id: string; initial: UserPreview} | null>(null);
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

  const [notice, setNotice] = useState<string | null>(null);
  const camera = usePartyCamera({partyId, participant: localParticipant, enabled: isVideo && !!isCameraEnabled, canPublish: isVideo && canSpeak, visible: expanded,
    refresh: () => refresh(true), onError: setError, onPaused: setNotice});
  const stopCamera = () => isVideo ? localParticipant.setCameraEnabled(false) : Promise.resolve();

  const run = useCallback(async (operation: () => Promise<unknown>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError(null);
    try {await operation(); if (mounted.current) await refresh(true);}
    catch (cause) {if (mounted.current) setError((cause as {message?: string})?.message || 'Could not complete that action. Try again.');}
    finally {busyRef.current = false; if (mounted.current) setBusy(false);}
  }, [refresh]);

  const reconnecting = useRef(false);
  const connectedOnce = useRef(false);
  useEffect(() => {if (connection === ConnectionState.Connected) connectedOnce.current = true;}, [connection]);
  const restoreAudio = useCallback(async () => {
    if (reconnecting.current || !mounted.current) return;
    reconnecting.current = true;
    try {
      const next = await refresh(true);
      if (!mounted.current || room.state !== ConnectionState.Disconnected) return;
      if (!next) {setError('Audio disconnected. Tap Retry audio.'); return;}
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
    // Coming back from the background: the media connection may have dropped while we were away
    // (or a reconnect attempt failed without an activity); try again instead of leaving a dead room.
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active' && connectedOnce.current && !intentionalExit.current && room.state === ConnectionState.Disconnected) restoreAudio();
    });
    return () => {clearTimeout(timer); room.off(RoomEvent.Disconnected, disconnected); appState.remove();};
  }, [restoreAudio, room]);

  useEffect(() => {if (!notice) return; const timer = setTimeout(() => setNotice(null), 2600); return () => clearTimeout(timer);}, [notice]);

  // Destructive person actions (remove/block/transfer) are confirmed inside the sheet before they reach here.
  const act = (action: RoomAction, target?: RoomActionTarget) => run(async () => {
    switch (action) {
      case 'approve': if (freeSeat === undefined) throw new Error('No open speaker seat. Unlock or free one first.'); await approvePartySeat(partyId, String(target), freeSeat); break;
      case 'deny': await denyPartySeat(partyId, String(target)); break;
      case 'cancel': if (ownRequest) await cancelPartySeatRequest(partyId, ownRequest.id); break;
      case 'request': await requestPartySeat(partyId); setPanel(null); setNotice('Hand raised. The host will see your request.'); break;
      case 'lock': await patchPartySeat(partyId, Number(target), {locked: !snapshot.lockedSeats.includes(Number(target))}); break;
      case 'mute': await patchPartySeat(partyId, Number(target), {muted: true}); break;
      case 'kick': await movePartySpeakerToAudience(partyId, Number(target)); break;
      case 'stepdown': await localParticipant.setMicrophoneEnabled(false); await stopCamera(); await releasePartySeat(partyId); setPanel(null); break;
      case 'invite': if (freeSeat === undefined) throw new Error('No open speaker seat.'); await inviteToPartySeat(partyId, String(target), freeSeat); setNotice('Invite sent.'); break;
      case 'cohost': await setPartyCoHost(partyId, String(target), snapshot.participants.find(p => p.userId === target)?.role !== 'CO_HOST'); break;
      case 'remove': await removePartyParticipant(partyId, String(target)); setPanel(null); break;
      case 'block': await blockPartyParticipant(partyId, String(target)); setPanel(null); setNotice('Participant blocked.'); break;
      case 'report': {const {userId, reason} = target as ReportTarget; await reportPartyParticipant(partyId, userId, reason); setPanel(null); setNotice('Report received. Thanks for keeping the room safe.'); break;}
      case 'delete-message': await deletePartyChat(partyId, String(target)); setPanel(null); break;
      case 'share': await Share.share({message:await partyShareMessage(snapshot.party)}); break;
      case 'chat-toggle': await updatePartySettings(partyId,{chatEnabled:snapshot.party.chatEnabled===false}); break;
      case 'requests-toggle': await updatePartySettings(partyId,{requestsEnabled:snapshot.party.requestsEnabled===false}); break;
      case 'slow-mode': await updatePartySettings(partyId,{slowModeSeconds:snapshot.party.slowModeSeconds ? 0 : 10}); break;
      case 'edit': await updatePartySettings(partyId,target as PartyRoomSettings); setPanel({kind:'info'}); break;
      case 'transfer': await transferPartyHost(partyId,String(target)); setPanel(null); setNotice('Host role transferred.'); break;
      case 'accept-invite': await respondPartyInvitation(partyId,String(target),true); break;
      case 'decline-invite': await respondPartyInvitation(partyId,String(target),false); break;
      case 'disconnect': intentionalExit.current=true; await localParticipant.setMicrophoneEnabled(false); await stopCamera(); await room.disconnect(); onClose(); break;
      case 'exit': intentionalExit.current = true; await localParticipant.setMicrophoneEnabled(false); await stopCamera(); try {await (host ? endParty(partyId) : leaveParty(partyId)); await room.disconnect(); onClose();} catch (cause) {intentionalExit.current = false; throw cause;} break;
    }
  });
  const sendChat = async () => {
    const body=chatText.trim();
    if(!body || chatBusyRef.current || snapshot.party.chatEnabled===false)return;
    chatBusyRef.current=true;setChatBusy(true);setError(null);
    try {const sent=await sendPartyChat(partyId,body);if(mounted.current){addMessages([sent.message]);setChatText('');}}
    catch(cause){if(mounted.current)setError((cause as Error).message || 'Message failed. Your draft is saved; try again.');}
    finally{chatBusyRef.current=false;if(mounted.current)setChatBusy(false);}
  };
  const invitation=snapshot.seatInvitations?.find(item=>Date.parse(item.expiresAt)>Date.now());
  const live = connection === ConnectionState.Connected;
  const status = live ? 'Live' : connection === ConnectionState.Reconnecting ? 'Reconnecting…' : connection === ConnectionState.Disconnected ? 'Audio disconnected' : 'Connecting…';
  const micLabel = canSpeak ? micPending ? 'Cancel' : isMicrophoneEnabled ? 'Mute' : 'Unmute' : ownRequest ? 'Hand raised' : snapshot.party.requestsEnabled === false ? 'Paused' : 'Raise hand';
  const micDisabled = canSpeak ? !isMicrophoneEnabled && !micPending && !live : busy || !live || (!ownRequest && snapshot.party.requestsEnabled === false);
  const micActive = canSpeak ? isMicrophoneEnabled : !!ownRequest;
  const chatPaused = snapshot.party.chatEnabled === false;
  return <>
    {!expanded && <View className="absolute bottom-[90px] left-4 right-4 flex-row items-center gap-1 rounded-[22px] border border-border bg-card py-2 pl-2 pr-1">
      <Pressable accessibilityRole="button" accessibilityLabel={`Return to ${noun} party`} onPress={onExpand} className="min-h-11 min-w-0 flex-1 flex-row items-center gap-3 active:opacity-70">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-primary-dark">{isVideo ? <IconVideo size={20} color={PartyColors.accent} /> : <IconHeadphones size={20} color={PartyColors.accent} />}</View>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-sm font-semibold text-foreground">{roomTitle(snapshot.party)}</Text>
          <View className="mt-0.5 flex-row items-center gap-1.5"><View className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-glow-green' : 'bg-coral'}`} /><Text numberOfLines={1} className="text-xs text-muted">{live ? canSpeak ? isMicrophoneEnabled ? 'Mic on' : 'Mic off' : 'Listening' : 'Audio disconnected · Open to retry'}</Text></View>
        </View>
      </Pressable>
      {canSpeak && <Pressable accessibilityRole="button" accessibilityLabel={isMicrophoneEnabled || micPending ? 'Mute microphone' : 'Unmute microphone'} onPress={toggleMic} className={`h-11 w-11 items-center justify-center rounded-full ${isMicrophoneEnabled ? 'bg-gold' : 'bg-background'}`}>{isMicrophoneEnabled ? <IconMicrophone size={20} color={PartyColors.ink} /> : <IconMicrophoneOff size={20} color={PartyColors.coral} />}</Pressable>}
      <Pressable accessibilityRole="button" accessibilityLabel={`Leave ${noun} party`} onPress={()=>{onExpand();setPanel({kind:'exit'});}} className="h-11 w-11 items-center justify-center rounded-full active:bg-background"><IconX size={20} color={PartyColors.muted} /></Pressable>
    </View>}
    <Modal visible={expanded} animationType="slide" presentationStyle="fullScreen" onRequestClose={onMinimize}>
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View className="flex-row items-center gap-2 px-3 pb-1 pt-1">
        <Pressable accessibilityRole="button" accessibilityLabel={`Minimize ${noun} party`} onPress={onMinimize} className="h-11 w-11 items-center justify-center rounded-full active:bg-card"><IconChevronDown size={26} color={PartyColors.text} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Room details" onPress={() => setPanel({kind: 'info'})} className="min-w-0 flex-1 items-center active:opacity-70">
          <Text numberOfLines={1} className="text-[16px] font-bold tracking-[-0.2px] text-foreground">{roomTitle(snapshot.party)}</Text>
          <View className="mt-0.5 flex-row items-center gap-1.5">
            <View className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-glow-green' : 'bg-coral'}`} />
            <Text accessibilityLiveRegion="polite" className="text-xs text-muted">{status} · {speakers.length + audience.length} in room</Text>
          </View>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Room controls" onPress={() => setPanel({kind: 'info'})} className="h-11 w-11 items-center justify-center rounded-full active:bg-card"><IconDots size={24} color={PartyColors.text} /></Pressable>
      </View>
      {!!snapshot.party.topic && !keyboard && <Text numberOfLines={2} className="mx-8 text-center text-[13px] leading-5 text-muted">{snapshot.party.topic}</Text>}
      {!keyboard && isVideo && <VideoPartyStage seatCount={seatCount} speakers={speakers} liveById={liveById} localIdentity={identity} lockedSeats={snapshot.lockedSeats}
        mirrorLocal={camera.mirrored} onSwitchCamera={camera.switchCamera} onSeatPress={(person, index) => setPanel(person ? {kind: 'person', personId: person.userId} : {kind: 'seat', seatIndex: index})} />}
      {!keyboard && !isVideo && <AudioPartyStage seatCount={seatCount} speakers={speakers} liveById={liveById} localIdentity={identity} lockedSeats={snapshot.lockedSeats}
        onSeatPress={(person, index) => setPanel(person ? {kind: 'person', personId: person.userId} : {kind: 'seat', seatIndex: index})} />}
      {invitation && <View className="mx-4 mb-2 flex-row items-center gap-3 rounded-2xl border border-primary/40 bg-primary-dark p-3">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-gold"><IconMicrophone size={20} color={PartyColors.ink} /></View>
        <View className="min-w-0 flex-1"><Text accessibilityLiveRegion="polite" className="text-sm font-semibold text-foreground">You’re invited to speak</Text><Text className="mt-0.5 text-xs text-muted">Seat {invitation.seatIndex+1} · mic stays off until you unmute</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Decline" disabled={busy} onPress={()=>act('decline-invite',invitation.id)} className="h-9 justify-center px-2"><Text className="text-[13px] font-semibold text-muted">Later</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Accept" disabled={busy} onPress={()=>act('accept-invite',invitation.id)} className="h-9 justify-center rounded-full bg-gold px-4"><Text className="text-[13px] font-bold text-text-dark">Join</Text></Pressable>
      </View>}
      <RoomChatStream messages={messages} identity={identity} onMessagePress={message => setPanel({kind: 'message', message})} />
      {!!(error || syncError || connectionError) && <Text accessibilityRole="alert" className="px-5 py-1 text-center text-xs text-coral">{error || syncError || connectionError}</Text>}
      {connection === ConnectionState.Disconnected && <Pressable accessibilityRole="button" onPress={restoreAudio} className="mx-auto mb-1 h-9 flex-row items-center gap-1.5 rounded-full bg-card px-4"><IconRefresh size={15} color={PartyColors.accent} /><Text className="text-[13px] font-semibold text-primary">Retry audio</Text></Pressable>}
      <View className="border-t border-border/60 bg-nav-background px-3 pb-2 pt-2.5">
        <View className="h-11 flex-row items-center rounded-full border border-border bg-card pl-4 pr-1">
          <TextInput accessibilityLabel="Send a room message" value={chatText} onChangeText={setChatText} maxLength={4000} editable={!chatBusy && !chatPaused} onSubmitEditing={sendChat} returnKeyType="send" placeholder={chatPaused ? 'Chat paused by host' : 'Say something…'} placeholderTextColor={PartyColors.muted} className="h-full flex-1 text-sm text-foreground" />
          {!!chatText.trim() && <Pressable accessibilityRole="button" accessibilityLabel="Send room message" onPress={sendChat} disabled={chatBusy || chatPaused} className="h-9 w-9 items-center justify-center rounded-full bg-gold"><IconSend size={16} color={PartyColors.ink} /></Pressable>}
        </View>
        {!keyboard && <View className={`mt-2.5 flex-row items-center ${isVideo && canSpeak ? 'gap-1.5' : 'gap-2'}`}>
          <Pressable accessibilityRole="button" accessibilityLabel={host ? 'End party' : 'Leave party'} onPress={() => setPanel({kind: 'exit'})} className="h-11 flex-row items-center gap-1.5 rounded-full bg-coral/15 px-4 active:opacity-70">
            <IconDoorExit size={18} color={PartyColors.coral} /><Text className="text-[13px] font-bold text-coral">{host ? 'End' : 'Leave'}</Text>
          </Pressable>
          <View className="flex-1" />
          {isVideo && canSpeak && <DockButton label={isCameraEnabled || camera.pending ? 'Turn camera off' : 'Turn camera on'} active={!!isCameraEnabled} disabled={!isCameraEnabled && !camera.pending && !live} onPress={camera.toggle}>
            {isCameraEnabled ? <IconVideo size={21} color={PartyColors.goldInk} /> : <IconVideoOff size={21} color={PartyColors.text} />}
          </DockButton>}
          <DockButton label="Choose audio device" onPress={() => setOutputOpen(true)}><IconVolume size={21} color={PartyColors.text} /></DockButton>
          <DockButton label={`People in room ${speakers.length + audience.length}`} onPress={() => setPanel({kind: 'people'})}><IconUsers size={21} color={PartyColors.text} /></DockButton>
          {manager && <DockButton label={`Requests to speak ${requests.length}`} badge={requests.length} onPress={() => setPanel({kind: 'requests'})}><IconHandStop size={21} color={requests.length ? PartyColors.accent : PartyColors.text} /></DockButton>}
          <Pressable accessibilityRole="button" accessibilityLabel={canSpeak ? isMicrophoneEnabled ? 'Mute microphone' : 'Unmute microphone' : ownRequest ? 'Cancel request to speak' : 'Request to speak'}
            accessibilityState={{disabled: micDisabled}} disabled={micDisabled} onPress={canSpeak ? toggleMic : () => act(ownRequest ? 'cancel' : 'request')}
            className={`h-12 ${isVideo && canSpeak ? 'w-12' : 'min-w-[112px] px-4'} flex-row items-center justify-center gap-2 rounded-full active:opacity-80 ${micActive ? 'bg-gold' : canSpeak ? 'border border-coral/50 bg-coral/15' : 'bg-card'} ${micDisabled ? 'opacity-50' : ''}`}>
            {canSpeak ? isMicrophoneEnabled ? <IconMicrophone size={20} color={PartyColors.ink} /> : <IconMicrophoneOff size={20} color={PartyColors.coral} /> : <IconHandStop size={20} color={micActive ? PartyColors.ink : PartyColors.text} />}
            {!(isVideo && canSpeak) && <Text className={`text-[14px] font-bold ${micActive ? 'text-text-dark' : canSpeak ? 'text-coral' : 'text-foreground'}`}>{micLabel}</Text>}
          </Pressable>
        </View>}
      </View>
    </KeyboardAvoidingView>
    {!!notice && <View pointerEvents="none" className="absolute left-0 right-0 top-16 items-center px-6"><View className="flex-row items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5"><IconCheck size={16} color={PartyColors.accent} /><Text accessibilityLiveRegion="polite" className="text-[13px] font-semibold text-foreground">{notice}</Text></View></View>}
    <PartyRoomPanel panel={panel} onClose={() => setPanel(null)} onSelect={setPanel} participants={snapshot.participants} requests={snapshot.seatRequests} lockedSeats={snapshot.lockedSeats} seatCount={seatCount} identity={identity} busy={busy} error={error}
      onAction={act} onOpenAudio={() => {setPanel(null); setOutputOpen(true);}}
      onViewProfile={person => {setPanel(null); setViewing({id: person.userId, initial: {name: person.name || 'Guest', avatarUrl: person.avatarUrl ?? null}});}} title={roomTitle(snapshot.party)} topic={snapshot.party.topic} ownRequest={ownRequest} settings={snapshot.party} partyId={partyId} />
    <AudioOutputSheet visible={outputOpen} onClose={()=>setOutputOpen(false)} />
    {viewing && <UserProfileModal userId={viewing.id} initial={viewing.initial} visible onClose={() => setViewing(null)} />}
  </SafeAreaView>
  </Modal>
  </>;
}

const DockButton = ({label, onPress, badge, active, disabled, children}: {label: string; onPress: () => void; badge?: number; active?: boolean; disabled?: boolean; children: React.ReactNode}) =>
  <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled: !!disabled}} disabled={disabled} onPress={onPress} className={`h-11 w-11 items-center justify-center rounded-full active:opacity-70 ${active ? 'bg-gold' : 'bg-card'} ${disabled ? 'opacity-50' : ''}`}>
    {children}
    {!!badge && <View className="absolute -right-0.5 -top-0.5 min-w-[18px] items-center rounded-full border-2 border-nav-background bg-gold px-1"><Text className="text-[10px] font-bold text-text-dark">{badge > 9 ? '9+' : badge}</Text></View>}
  </Pressable>;
