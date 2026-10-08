import React, {useEffect, useState} from 'react';
import {ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import IconArrowLeft from '@tabler/icons-react-native/IconArrowLeft';
import IconHeadphones from '@tabler/icons-react-native/IconHeadphones';
import IconUsers from '@tabler/icons-react-native/IconUsers';
import IconVideo from '@tabler/icons-react-native/IconVideo';
import {HostAvatar} from './PartyRoomCard';
import {PartyColors, roomCover, roomTags, roomTitle, startsAt, tagClasses} from './partyPresentation';
import {loadSession} from '../auth';
import {cancelScheduledParty, getPartyRoom, setPartyReminder, startScheduledParty, joinParty, type JoinedParty, type PartyRoom} from './partyService';

const PartyRoomPreview = ({room: initialRoom, onClose, onJoined, activePartyId, onResume, onBlocked}: {
  room: PartyRoom; onClose: () => void; onJoined: (session: JoinedParty) => void; activePartyId?: string; onResume?: () => void;
  /** Called instead of joining when the user is already in a different party. */
  onBlocked?: () => void;
}) => {
  const [room,setRoom]=useState(initialRoom);
  const [isHost,setIsHost]=useState(false);
  const [reminded,setReminded]=useState(false);
  useEffect(()=>{let mounted=true;loadSession().then(session=>{if(mounted)setIsHost(initialRoom.host.id===session?.user.id);}).catch(()=>{});return()=>{mounted=false;};},[initialRoom.host.id]);
  const MediaIcon = room.kind === 'VIDEO' ? IconVideo : IconHeadphones;
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const join = async () => {
    if (joining || room.kind !== 'AUDIO') return;
    if(activePartyId===room.id){onResume?.();return;}
    if(activePartyId){setError('You’re already in a party. Leave it before joining another.');onBlocked?.();return;}
    if(room.status!=='ACTIVE')return;
    setJoining(true);
    setError(null);
    try { onJoined(await joinParty(room.id)); }
    catch (cause) { setError((cause as {message?: string})?.message || 'Could not join this party.'); }
    finally { setJoining(false); }
  };
  const scheduleAction=async()=>{
    if(joining)return;setJoining(true);setError(null);
    try {
      if(isHost){await startScheduledParty(room.id);const snapshot=await getPartyRoom(room.id);setRoom({...room,...snapshot.party});}
      else{await setPartyReminder(room.id,!reminded);setReminded(value=>!value);}
    } catch(cause){setError((cause as Error).message || 'Could not update this party.');}
    finally{setJoining(false);}
  };
  const label=room.status==='SCHEDULED' ? isHost ? 'Start party now' : reminded ? 'Reminder on · Cancel' : 'Remind me' : activePartyId===room.id ? 'Return to party' : room.status==='ACTIVE' ? 'Join audio party' : 'Party has ended';
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
        <View className="flex-row items-center px-5 py-3">
          <Pressable accessibilityRole="button" accessibilityLabel="Close room preview" onPress={onClose} className="h-11 w-11 items-center justify-center rounded-full bg-card"><IconArrowLeft size={23} color={PartyColors.text} /></Pressable>
          <Text className="ml-3 text-base font-semibold text-foreground">Room preview</Text>
        </View>
        <ScrollView contentContainerClassName="px-5 pb-28" showsVerticalScrollIndicator={false}>
          <View className="mt-3 overflow-hidden rounded-[24px]">
            <Image source={roomCover(room)} resizeMode="cover" className="h-[220px] w-full" />
            <View className="absolute bottom-4 left-4 flex-row items-center gap-2 rounded-full bg-background/80 px-3 py-2"><MediaIcon size={17} color={PartyColors.accent} /><Text className="text-xs font-semibold text-foreground">{room.kind === 'VIDEO' ? 'Video party' : 'Audio party'}</Text></View>
          </View>
          <Text className="mt-6 text-[28px] font-bold leading-9 text-foreground">{roomTitle(room)}</Text>
          {!!room.topic && <Text className="mt-2 text-[15px] leading-6 text-muted">{room.topic}</Text>}
          <View className="mt-4 flex-row gap-2">{roomTags(room).map(tag => <Text key={tag} className={'rounded-full px-3 py-1.5 text-xs capitalize ' + tagClasses(tag)}>{tag}</Text>)}</View>
          <View className="mt-6 flex-row items-center rounded-[20px] bg-card p-4">
            <HostAvatar room={room} size={44} />
            <View className="ml-3 flex-1"><Text className="text-xs text-muted">Hosted by</Text><Text className="mt-1 text-base font-semibold text-foreground">{room.host.name || 'Host'}</Text></View>
            <IconUsers size={18} color={PartyColors.muted} /><Text className="ml-2 text-sm text-muted">{room.participantCount}</Text>
          </View>
          {room.status === 'SCHEDULED' && <Text className="mt-5 text-sm text-muted">Starts {startsAt(room.scheduledStartAt)}</Text>}
          <Text className="mt-3 text-sm text-muted">{room.seatCount || 8} speaker seats · {room.visibility==='PRIVATE' ? 'Invite-only' : 'Public'}</Text>
          {!!room.language && <Text className="mt-3 text-sm text-muted">Language: {room.language}</Text>}
          {room.status==='SCHEDULED' && isHost && <Pressable accessibilityRole="button" disabled={joining} onPress={()=>{setJoining(true);cancelScheduledParty(room.id).then(onClose).catch(cause=>setError(cause.message || 'Could not cancel party.')).finally(()=>setJoining(false));}} className="mt-4 min-h-11 justify-center"><Text className="text-coral">Cancel scheduled party</Text></Pressable>}
        </ScrollView>
        <View className="absolute bottom-0 left-0 right-0 border-t border-border/60 bg-background px-5 pb-5 pt-3">
          {!!error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" className="mb-2 text-center text-sm leading-5 text-coral">{error}</Text>}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            disabled={joining || !['ACTIVE','SCHEDULED'].includes(room.status) || room.kind!=='AUDIO'}
            onPress={room.status==='SCHEDULED' ? scheduleAction : join}
            className={`h-11 flex-row items-center justify-center rounded-[18px] ${room.kind === 'AUDIO' && room.status === 'ACTIVE' ? 'bg-gold active:opacity-80' : 'bg-card'}`}>
            {joining ? <ActivityIndicator color={PartyColors.ink} /> : <MediaIcon size={19} color={room.kind === 'AUDIO' && room.status === 'ACTIVE' ? PartyColors.ink : PartyColors.muted} />}
            {!joining && <Text className={`ml-2 text-sm font-bold ${room.kind === 'AUDIO' && room.status === 'ACTIVE' ? 'text-text-dark' : 'text-muted'}`}>
              {label}
            </Text>}
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

export default PartyRoomPreview;
