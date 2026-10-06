import React, {useEffect, useState} from 'react';
import {ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, TextInput, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import IconX from '@tabler/icons-react-native/IconX';
import {PartyColors} from './partyPresentation';
import type {PartyParticipant, PartyRoom, PartyRoomSettings, PartySeatRequest} from './partyService';

export type RoomPanel = {kind: 'requests' | 'people' | 'person' | 'seat' | 'info' | 'edit' | 'exit'; personId?: string; seatIndex?: number} | null;
export type RoomAction = 'approve' | 'deny' | 'lock' | 'mute' | 'kick' | 'invite' | 'remove' | 'cohost' | 'stepdown' | 'request' | 'cancel' | 'report' | 'block' | 'exit' | 'share' | 'edit' | 'chat-toggle' | 'requests-toggle' | 'slow-mode' | 'accept-invite' | 'decline-invite' | 'disconnect' | 'transfer';
export type RoomActionTarget = string | number | PartyRoomSettings;
const Button = ({label, onPress, busy, disabled, destructive}: {label: string; onPress: () => void; busy?: boolean; disabled?: boolean; destructive?: boolean}) =>
  <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled: busy || disabled}} disabled={busy || disabled} onPress={onPress}
    className={`my-1 min-h-11 justify-center rounded-xl px-4 ${disabled ? 'bg-background/40' : 'bg-background active:opacity-70'}`}>
    <Text className={`text-[14px] font-semibold ${destructive ? 'text-coral' : disabled ? 'text-muted' : 'text-foreground'}`}>{label}</Text>
  </Pressable>;

export default function PartyRoomPanel({panel, onClose, onSelect, participants, requests, lockedSeats, seatCount, identity, busy, error, onAction, title, topic, ownRequest, settings}: {
  panel: RoomPanel; onClose: () => void; onSelect: (panel: RoomPanel) => void;
  participants: PartyParticipant[]; requests: PartySeatRequest[]; lockedSeats: number[]; seatCount: number; identity: string;
  busy: boolean; error: string | null; onAction: (action: RoomAction, target?: RoomActionTarget) => void;
  title: string; topic?: string | null; ownRequest?: PartySeatRequest; settings?: PartyRoom;
}) {
  const [draftTitle,setDraftTitle]=useState(title);
  const [draftTopic,setDraftTopic]=useState(topic || '');
  useEffect(()=>{if(panel?.kind==='edit'){setDraftTitle(title);setDraftTopic(topic || '');}},[panel?.kind,title,topic]);
  const me = participants.find(p => p.userId === identity);
  const host = me?.role === 'HOST';
  const manager = host || me?.role === 'CO_HOST';
  const person = participants.find(p => p.userId === panel?.personId && p.active);
  const seatIndex = panel?.seatIndex;
  const freeSeat = Array.from({length: seatCount}, (_, i) => i).find(i => i > 0 && !lockedSeats.includes(i) && !participants.some(p => p.active && p.seatIndex === i));
  const pending = requests.filter(r => r.status === 'PENDING');
  const active = participants.filter(p => p.active);
  const headings = {requests: 'Requests to speak', people: `People · ${active.length}`, person: person?.name || 'Participant', seat: `Seat ${(seatIndex ?? 0) + 1}`, info: 'Room controls', edit: 'Edit room', exit: host ? 'End this party?' : 'Leave this party?'};
  return <Modal visible={!!panel} transparent animationType="slide" onRequestClose={onClose}>
    <View className="flex-1 justify-end bg-black/65">
      <Pressable accessibilityLabel="Dismiss room controls" onPress={onClose} className="flex-1" />
      <SafeAreaView edges={['bottom']} className="max-h-[75%] rounded-t-[28px] bg-card px-5 pb-3 pt-3">
        <View className="mb-3 h-1 w-9 self-center rounded-full bg-border" />
        <View className="mb-4 flex-row items-center justify-between"><Text className="flex-1 text-[19px] font-bold text-foreground">{panel ? headings[panel.kind] : ''}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close room controls" onPress={onClose} className="h-11 w-11 items-center justify-center rounded-full bg-background"><IconX size={20} color={PartyColors.text} /></Pressable></View>
        {!!error && <Text accessibilityRole="alert" className="mb-3 text-sm text-coral">{error}</Text>}
        {busy && <ActivityIndicator className="mb-2" color={PartyColors.accent} />}
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {panel?.kind === 'requests' && <>
            <Text className="mb-3 text-[13px] text-muted">Approve adds the listener to the next open seat.</Text>
            {!pending.length && <Text className="py-6 text-sm text-muted">No pending requests. New hands appear here.</Text>}
            {pending.map(request => <View key={request.id} className="mb-4">
              <View className="mb-2 flex-row items-center gap-3"><View className="h-10 w-10 items-center justify-center rounded-full bg-primary-dark"><Text className="font-bold text-primary">{(request.name || '?').slice(0, 2)}</Text></View><View className="flex-1"><Text className="text-sm font-semibold text-foreground">{request.name || 'Guest'}</Text><Text className="text-xs text-muted">Wants to speak</Text></View></View>
              <View className="flex-row gap-2"><View className="flex-1"><Button label={freeSeat === undefined ? 'Stage full or locked' : 'Approve'} disabled={freeSeat === undefined} busy={busy} onPress={() => onAction('approve', request.id)} /></View><View className="flex-1"><Button label="Decline" busy={busy} onPress={() => onAction('deny', request.id)} /></View></View>
            </View>)}
          </>}
          {panel?.kind === 'people' && active.map(p => <Pressable key={p.userId} accessibilityRole="button" accessibilityLabel={`Manage ${p.name || 'Guest'}`} onPress={() => onSelect({kind: 'person', personId: p.userId})} className="min-h-16 flex-row items-center gap-3 py-2">
            {p.avatarUrl ? <Image source={{uri: p.avatarUrl}} className="h-10 w-10 rounded-full" /> : <View className="h-10 w-10 items-center justify-center rounded-full bg-background"><Text className="font-semibold text-primary">{(p.name || '?').slice(0, 2)}</Text></View>}
            <View className="flex-1"><Text className="text-sm font-semibold text-foreground">{p.userId === identity ? 'You' : p.name || 'Guest'}</Text><Text className="mt-1 text-xs text-muted">{p.role === 'HOST' ? 'Host' : p.role === 'CO_HOST' ? 'Co-host' : p.seatIndex === null ? 'Listening' : `Speaker · Seat ${p.seatIndex + 1}`}</Text></View><Text className="text-lg text-muted">›</Text>
          </Pressable>)}
          {panel?.kind === 'person' && (person ? <>
            <Text className="mb-3 text-sm text-muted">{person.seatIndex === null ? 'In the audience' : `On seat ${person.seatIndex + 1}`}</Text>
            {person.userId === identity ? <>{person.seatIndex !== null && !host && <Button label="Move to audience" busy={busy} onPress={() => onAction('stepdown')} />}{person.seatIndex === null && <Button label={ownRequest ? 'Cancel request to speak' : 'Request to speak'} busy={busy} onPress={() => onAction(ownRequest ? 'cancel' : 'request')} />}</> : <>
              {manager && (host || person.role === 'MEMBER') && <>
                {person.seatIndex !== null ? <><Button label="Mute microphone" busy={busy} onPress={() => onAction('mute', person.seatIndex!)} /><Button label="Move to audience" busy={busy} onPress={() => onAction('kick', person.seatIndex!)} /></> : <Button label="Invite to stage" disabled={freeSeat === undefined} busy={busy} onPress={() => onAction('invite', person.userId)} />}
                {host && <Button label={person.role === 'CO_HOST' ? 'Remove co-host role' : 'Make co-host'} busy={busy} onPress={() => onAction('cohost', person.userId)} />}
                {host && person.role==='CO_HOST' && person.seatIndex!==null && <Button label="Make host" busy={busy} onPress={()=>onAction('transfer',person.userId)} />}
                <Button label="Remove from room" destructive busy={busy} onPress={() => onAction('remove', person.userId)} />
              </>}
              <Button label="Report participant" busy={busy} onPress={() => onAction('report', person.userId)} />
              <Button label="Block participant" destructive busy={busy} onPress={() => onAction('block', person.userId)} />
            </>}
          </> : <Text className="py-4 text-sm text-muted">This person left the room.</Text>)}
          {panel?.kind === 'seat' && seatIndex !== undefined && <>
            <Text className="mb-3 text-sm text-muted">{lockedSeats.includes(seatIndex) ? 'Locked — listeners cannot take this seat.' : 'Open for a speaker.'}</Text>
            {manager && seatIndex > 0 ? <><Button label={lockedSeats.includes(seatIndex) ? 'Unlock seat' : 'Lock seat'} busy={busy} onPress={() => onAction('lock', seatIndex)} /><Button label="View listeners to invite" onPress={() => onSelect({kind: 'people'})} /></> : <Button label={ownRequest ? 'Cancel request to speak' : 'Request to speak'} busy={busy} disabled={me?.seatIndex !== null || settings?.requestsEnabled===false} onPress={() => onAction(ownRequest ? 'cancel' : 'request')} />}
          </>}
          {panel?.kind === 'info' && <>
            <Text className="text-base font-semibold text-foreground">{title}</Text>{!!topic && <Text className="mb-3 mt-1 text-sm leading-5 text-muted">{topic}</Text>}
            {manager && <>
              <Button label="Edit room details" onPress={()=>onSelect({kind:'edit'})} />
              <Button label={settings?.chatEnabled===false ? 'Resume room chat' : 'Pause room chat'} busy={busy} onPress={()=>onAction('chat-toggle')} />
              <Button label={settings?.requestsEnabled===false ? 'Allow requests to speak' : 'Pause requests to speak'} busy={busy} onPress={()=>onAction('requests-toggle')} />
              <Button label={settings?.slowModeSeconds ? 'Turn off slow mode' : 'Slow mode · 10 seconds'} busy={busy} onPress={()=>onAction('slow-mode')} />
            </>}
            {manager && <Button label={`Requests to speak · ${pending.length}`} onPress={() => onSelect({kind: 'requests'})} />}
            <Button label="People in room" onPress={() => onSelect({kind: 'people'})} />
            <Button label="Share party" busy={busy} onPress={() => onAction('share')} />
            <Button label={host ? 'End party for everyone' : 'Leave party'} destructive onPress={() => onSelect({kind: 'exit'})} />
          </>}
          {panel?.kind==='edit' && manager && <>
            <Text className="mb-2 text-sm text-muted">Room name</Text>
            <TextInput accessibilityLabel="Edit room name" value={draftTitle} onChangeText={setDraftTitle} maxLength={120} className="mb-4 min-h-12 rounded-xl bg-background px-4 text-base text-foreground" />
            <Text className="mb-2 text-sm text-muted">Topic</Text>
            <TextInput accessibilityLabel="Edit room topic" value={draftTopic} onChangeText={setDraftTopic} maxLength={120} className="mb-4 min-h-12 rounded-xl bg-background px-4 text-base text-foreground" />
            <Button label="Save changes" busy={busy} disabled={!draftTitle.trim()} onPress={()=>onAction('edit',{title:draftTitle.trim(),topic:draftTopic.trim()})} />
          </>}
          {panel?.kind === 'exit'  && <>
            <Text className="mb-5 text-sm leading-6 text-muted">{host ? 'Your audio room will close for everyone. All microphones disconnect and the room chat is cleared.' : 'Your microphone will disconnect. The party will continue for everyone else.'}</Text>
            <Button label={host ? 'End for everyone' : 'Leave room'} destructive busy={busy} onPress={() => onAction('exit')} />
            {!!error && <Button label="Disconnect this device" destructive onPress={()=>onAction('disconnect')} />}
            {host && <Text className="my-2 text-xs leading-5 text-muted">To keep the party going, make a seated co-host the host before you leave.</Text>}
            <Button label="Keep hanging out" onPress={onClose} />
          </>}
        </ScrollView>
      </SafeAreaView>
    </View>
  </Modal>;
}
