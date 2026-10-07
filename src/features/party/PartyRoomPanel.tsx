import React, {useEffect, useState} from 'react';
import {Image, Pressable, Switch, Text, TextInput, View} from 'react-native';
import IconHandStop from '@tabler/icons-react-native/IconHandStop';
import IconUsers from '@tabler/icons-react-native/IconUsers';
import IconShare from '@tabler/icons-react-native/IconShare';
import IconPencil from '@tabler/icons-react-native/IconPencil';
import IconMessage from '@tabler/icons-react-native/IconMessage';
import IconClock from '@tabler/icons-react-native/IconClock';
import IconDoorExit from '@tabler/icons-react-native/IconDoorExit';
import IconMicrophone from '@tabler/icons-react-native/IconMicrophone';
import IconMicrophoneOff from '@tabler/icons-react-native/IconMicrophoneOff';
import IconUserDown from '@tabler/icons-react-native/IconUserDown';
import IconUserPlus from '@tabler/icons-react-native/IconUserPlus';
import IconShieldCheck from '@tabler/icons-react-native/IconShieldCheck';
import IconCrown from '@tabler/icons-react-native/IconCrown';
import IconUserMinus from '@tabler/icons-react-native/IconUserMinus';
import IconFlag from '@tabler/icons-react-native/IconFlag';
import IconBan from '@tabler/icons-react-native/IconBan';
import IconLock from '@tabler/icons-react-native/IconLock';
import IconLockOpen from '@tabler/icons-react-native/IconLockOpen';
import IconTrash from '@tabler/icons-react-native/IconTrash';
import IconVolume from '@tabler/icons-react-native/IconVolume';
import IconCheck from '@tabler/icons-react-native/IconCheck';
import IconX from '@tabler/icons-react-native/IconX';
import IconPlugConnectedX from '@tabler/icons-react-native/IconPlugConnectedX';
import IconUser from '@tabler/icons-react-native/IconUser';
import BottomSheet, {SheetButton, SheetRow, SheetSection, SheetTile, SheetTileGrid} from '../../components/BottomSheet';
import {PartyColors, roomCover, roomTags, tagClasses} from './partyPresentation';
import type {PartyChatMessage, PartyParticipant, PartyRoom, PartyRoomSettings, PartySeatRequest} from './partyService';

type ConfirmAction = 'remove' | 'block' | 'transfer';
export type RoomPanel = {
  kind: 'requests' | 'people' | 'person' | 'seat' | 'info' | 'edit' | 'exit' | 'report' | 'message' | 'confirm';
  personId?: string; seatIndex?: number; message?: PartyChatMessage; confirm?: ConfirmAction;
} | null;
export type RoomAction = 'approve' | 'deny' | 'lock' | 'mute' | 'kick' | 'invite' | 'remove' | 'cohost' | 'stepdown' | 'request' | 'cancel' | 'report' | 'block' | 'exit' | 'share' | 'edit' | 'chat-toggle' | 'requests-toggle' | 'slow-mode' | 'accept-invite' | 'decline-invite' | 'disconnect' | 'transfer' | 'delete-message';
export type ReportTarget = {userId: string; reason: string};
export type RoomActionTarget = string | number | PartyRoomSettings | ReportTarget;

const REPORT_REASONS = ['Inappropriate behavior', 'Spam', 'Harassment or hate', 'Impersonation'];
const CONFIRM_COPY: Record<ConfirmAction, {title: string; body: string; cta: string}> = {
  remove: {title: 'Remove from this room?', body: 'They will be disconnected and can rejoin later unless blocked.', cta: 'Remove'},
  block: {title: 'Block this participant?', body: 'They are removed and can’t rejoin your rooms.', cta: 'Block'},
  transfer: {title: 'Make them the host?', body: 'They will control this party. You can then leave without ending it.', cta: 'Make host'},
};

const roleName = (p: PartyParticipant) => p.role === 'HOST' ? 'Host' : p.role === 'CO_HOST' ? 'Co-host' : p.seatIndex === null ? 'Listener' : 'Speaker';
// Role already shows as a chip, so the subtitle only carries where they are.
const placeLabel = (p: PartyParticipant) => p.seatIndex === null ? 'Listening' : `On stage · Seat ${p.seatIndex + 1}`;

export const Avatar = ({name, url, size = 40}: {name?: string | null; url?: string | null; size?: number}) => url
  ? <Image source={{uri: url}} style={{width: size, height: size}} className="rounded-full bg-background" />
  : <View style={{width: size, height: size}} className="items-center justify-center rounded-full bg-primary-dark">
    <Text style={{fontSize: size * 0.36}} className="font-bold text-primary">{(name || '?').trim().slice(0, 2).toUpperCase()}</Text>
  </View>;

const RoleChip = ({p}: {p: PartyParticipant}) => p.role === 'MEMBER' ? null
  : <View className="flex-row items-center gap-1 rounded-full bg-primary-dark px-2 py-0.5">
    {p.role === 'HOST' ? <IconCrown size={11} color={PartyColors.accent} /> : <IconShieldCheck size={11} color={PartyColors.accent} />}
    <Text className="text-[11px] font-semibold text-primary">{roleName(p)}</Text>
  </View>;

/** Profile-card header shown at the top of the person sheet. */
const ProfileHeader = ({p, me}: {p: PartyParticipant; me: boolean}) =>
  <View className="items-center pb-1 pt-1">
    <View className={`rounded-full p-1 ${p.seatIndex !== null ? 'border-2 border-primary/60' : 'border-2 border-border'}`}>
      <Avatar name={p.name} url={p.avatarUrl} size={84} />
      {p.seatIndex !== null && p.muted && <View className="absolute -bottom-1 right-0 h-7 w-7 items-center justify-center rounded-full border-[3px] border-sheet bg-card">
        <IconMicrophoneOff size={13} color={PartyColors.coral} />
      </View>}
    </View>
    <Text accessibilityRole="header" numberOfLines={1} className="mt-3 text-[20px] font-bold tracking-[-0.3px] text-foreground">{me ? 'You' : p.name || 'Guest'}</Text>
    <View className="mt-1.5 flex-row items-center gap-2">
      <RoleChip p={p} />
      <Text className="text-[13px] text-muted">{p.seatIndex === null ? 'In the audience' : `Seat ${p.seatIndex + 1}${p.muted ? ' · Muted by host' : ''}`}</Text>
    </View>
  </View>;

const PersonRow = ({p, identity, onPress, action}: {p: PartyParticipant; identity: string; onPress: () => void; action?: React.ReactNode}) =>
  <View className="min-h-[60px] flex-row items-center border-b border-sheet pr-3">
    <Pressable accessibilityRole="button" accessibilityLabel={`Manage ${p.name || 'Guest'}`} onPress={onPress} className="min-w-0 flex-1 flex-row items-center gap-3 py-2 pl-4 active:opacity-70">
      <View>
        <Avatar name={p.name} url={p.avatarUrl} />
        {p.seatIndex !== null && p.muted && <View className="absolute -bottom-0.5 -right-0.5 h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-background bg-card">
          <IconMicrophoneOff size={10} color={PartyColors.coral} />
        </View>}
      </View>
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-2"><Text numberOfLines={1} className="shrink text-[15px] font-semibold text-foreground">{p.userId === identity ? 'You' : p.name || 'Guest'}</Text><RoleChip p={p} /></View>
        <Text className="mt-0.5 text-xs text-muted">{placeLabel(p)}</Text>
      </View>
    </Pressable>
    {action}
  </View>;

const RoundAction = ({label, icon: Icon, onPress, primary, disabled}: {label: string; icon: typeof IconCheck; onPress: () => void; primary?: boolean; disabled?: boolean}) =>
  <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled: !!disabled}} disabled={disabled} onPress={onPress} hitSlop={4}
    className={`h-10 w-10 items-center justify-center rounded-full active:opacity-70 ${primary ? 'bg-primary' : 'bg-background'} ${disabled ? 'opacity-40' : ''}`}>
    <Icon size={19} color={primary ? PartyColors.ink : PartyColors.muted} />
  </Pressable>;

const SettingSwitch = ({value, disabled, onChange}: {value: boolean; disabled: boolean; onChange: () => void}) =>
  <Switch value={value} disabled={disabled} onValueChange={onChange} trackColor={{true: PartyColors.accent, false: PartyColors.border}} thumbColor={PartyColors.text} />;

export default function PartyRoomPanel({panel, onClose, onSelect, participants, requests, lockedSeats, seatCount, identity, busy, error, onAction, onOpenAudio, onViewProfile, title, topic, ownRequest, settings}: {
  panel: RoomPanel; onClose: () => void; onSelect: (panel: RoomPanel) => void;
  participants: PartyParticipant[]; requests: PartySeatRequest[]; lockedSeats: number[]; seatCount: number; identity: string;
  busy: boolean; error: string | null; onAction: (action: RoomAction, target?: RoomActionTarget) => void; onOpenAudio?: () => void;
  onViewProfile?: (person: PartyParticipant) => void;
  title: string; topic?: string | null; ownRequest?: PartySeatRequest; settings?: PartyRoom;
}) {
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftTopic, setDraftTopic] = useState(topic || '');
  // Keep the last panel around so content doesn't blank out while the sheet animates away.
  const [shown, setShown] = useState(panel);
  useEffect(() => {if (panel) setShown(panel);}, [panel]);
  useEffect(() => {if (panel?.kind === 'edit') {setDraftTitle(title); setDraftTopic(topic || '');}}, [panel?.kind, title, topic]);
  const me = participants.find(p => p.userId === identity);
  const host = me?.role === 'HOST';
  const manager = host || me?.role === 'CO_HOST';
  const person = participants.find(p => p.userId === shown?.personId && p.active);
  const canModerate = !!person && manager && person.userId !== identity && (host || person.role === 'MEMBER');
  const seatIndex = shown?.seatIndex;
  const seatLocked = seatIndex !== undefined && lockedSeats.includes(seatIndex);
  const freeSeat = Array.from({length: seatCount}, (_, i) => i).find(i => i > 0 && !lockedSeats.includes(i) && !participants.some(p => p.active && p.seatIndex === i));
  const pending = requests.filter(r => r.status === 'PENDING');
  const active = participants.filter(p => p.active);
  const onStage = active.filter(p => p.seatIndex !== null).sort((a, b) => (a.seatIndex ?? 0) - (b.seatIndex ?? 0));
  const listening = active.filter(p => p.seatIndex === null);
  const message = shown?.message;
  const confirm = shown?.confirm ? CONFIRM_COPY[shown.confirm] : null;
  const go = (next: RoomPanel) => () => onSelect(next);

  const heading = (() => {
    switch (shown?.kind) {
      case 'requests': return {title: pending.length ? `Requests · ${pending.length}` : 'Requests to speak', subtitle: pending.length ? freeSeat === undefined ? 'Stage is full — free or unlock a seat to approve.' : 'Approve moves them to the next open seat.' : null};
      case 'people': return {title: 'People in room', subtitle: `${onStage.length} on stage · ${listening.length} listening`};
      case 'seat': return {title: `Seat ${(seatIndex ?? 0) + 1}`, subtitle: seatLocked ? 'Locked — listeners can’t take this seat.' : 'Open for a speaker.'};
      case 'edit': return {title: 'Edit room', subtitle: 'Everyone in the room sees changes right away.'};
      case 'report': return {title: `Report ${person?.name || 'participant'}`, subtitle: 'Reports are private. Pick what fits best.'};
      case 'message': return {title: message?.userId === identity ? 'Your message' : message?.name || 'Message', subtitle: null};
      default: return {title: undefined, subtitle: null};
    }
  })();

  const footer = (() => {
    switch (shown?.kind) {
      case 'exit': return <>
        <SheetButton label={host ? 'End for everyone' : 'Leave room'} variant="destructive" busy={busy} onPress={() => onAction('exit')} />
        {!!error && <SheetButton label="Disconnect this device" variant="ghost" onPress={() => onAction('disconnect')} />}
        <SheetButton label="Keep hanging out" variant="ghost" onPress={onClose} />
      </>;
      case 'edit': return <SheetButton label="Save changes" busy={busy} disabled={!draftTitle.trim()} onPress={() => onAction('edit', {title: draftTitle.trim(), topic: draftTopic.trim()})} />;
      case 'confirm': return confirm && shown.personId ? <>
        <SheetButton label={confirm.cta} variant={shown.confirm === 'transfer' ? 'primary' : 'destructive'} busy={busy} onPress={() => onAction(shown.confirm!, shown.personId)} />
        <SheetButton label="Cancel" variant="ghost" onPress={go({kind: 'person', personId: shown.personId})} />
      </> : null;
      case 'seat': return seatIndex !== undefined && !(manager && seatIndex > 0) && me?.seatIndex === null
        ? <SheetButton label={ownRequest ? 'Cancel request to speak' : 'Request to speak'} variant={ownRequest ? 'ghost' : 'primary'} busy={busy}
          disabled={seatLocked || (!ownRequest && settings?.requestsEnabled === false)} onPress={() => onAction(ownRequest ? 'cancel' : 'request')} /> : null;
      default: return null;
    }
  })();

  // Centered icon + title layout for decision sheets (exit / confirm), like system action sheets.
  const decision = shown?.kind === 'exit' ? {icon: IconDoorExit, title: host ? 'End this party?' : 'Leave this party?', body: host ? 'The room closes for everyone. All mics disconnect and chat is cleared.' : 'Your mic disconnects. The party keeps going for everyone else.'}
    : shown?.kind === 'confirm' && confirm ? {icon: shown.confirm === 'transfer' ? IconCrown : shown.confirm === 'block' ? IconBan : IconUserMinus, title: confirm.title, body: confirm.body} : null;

  return <BottomSheet visible={!!panel} onClose={onClose} dismissible={!busy} title={heading.title} subtitle={heading.subtitle} footer={footer}>
    {!!error && <View className="mb-3 rounded-xl bg-coral/10 px-3 py-2"><Text accessibilityRole="alert" className="text-[13px] text-coral">{error}</Text></View>}

    {decision && <View className="items-center px-2 pb-2 pt-1">
      <View className={`mb-3 h-14 w-14 items-center justify-center rounded-full ${shown?.confirm === 'transfer' ? 'bg-primary-dark' : 'bg-coral/15'}`}><decision.icon size={26} color={shown?.confirm === 'transfer' ? PartyColors.accent : PartyColors.coral} /></View>
      <Text accessibilityRole="header" className="text-center text-[19px] font-bold text-foreground">{decision.title}</Text>
      <Text className="mt-1.5 text-center text-[14px] leading-5 text-muted">{decision.body}</Text>
      {shown?.kind === 'exit' && host && <View className="mt-4 flex-row gap-2 rounded-xl bg-card px-3 py-2.5">
        <IconCrown size={16} color={PartyColors.accent} />
        <Text className="flex-1 text-xs leading-5 text-muted">To keep the party going, make a seated co-host the host before you leave.</Text>
      </View>}
      {shown?.kind === 'exit' && !!error && <View className="mt-3 flex-row items-center gap-2"><IconPlugConnectedX size={14} color={PartyColors.muted} /><Text className="text-xs text-muted">Can’t reach the room? Disconnect just this device.</Text></View>}
    </View>}

    {shown?.kind === 'person' && (person ? <>
      <ProfileHeader p={person} me={person.userId === identity} />
      <View className="mt-5">
        {person.userId === identity ? <SheetTileGrid columns={3}>
          {person.seatIndex === null && <SheetTile icon={IconHandStop} label={ownRequest ? 'Cancel request' : 'Raise hand'} active={!!ownRequest} disabled={busy || (!ownRequest && settings?.requestsEnabled === false)} onPress={() => onAction(ownRequest ? 'cancel' : 'request')}
            accessibilityLabel={ownRequest ? 'Cancel request to speak' : 'Request to speak'} />}
          {person.seatIndex !== null && !host && <SheetTile icon={IconUserDown} label="Move to audience" disabled={busy} onPress={() => onAction('stepdown')} />}
          {onOpenAudio && <SheetTile icon={IconVolume} label="Audio output" onPress={onOpenAudio} />}
        </SheetTileGrid> : canModerate && <SheetTileGrid columns={5}>
          {person.seatIndex !== null
            ? <SheetTile icon={IconMicrophoneOff} label={person.muted ? 'Muted' : 'Mute'} accessibilityLabel="Mute microphone" active={person.muted} disabled={busy || person.muted} onPress={() => onAction('mute', person.seatIndex!)} />
            : <SheetTile icon={IconUserPlus} label="Invite to stage" disabled={busy || freeSeat === undefined} onPress={() => onAction('invite', person.userId)} />}
          {person.seatIndex !== null && <SheetTile icon={IconUserDown} label="To audience" accessibilityLabel="Move to audience" disabled={busy} onPress={() => onAction('kick', person.seatIndex!)} />}
          {host && <SheetTile icon={IconShieldCheck} label={person.role === 'CO_HOST' ? 'Remove co-host' : 'Make co-host'} active={person.role === 'CO_HOST'} disabled={busy} onPress={() => onAction('cohost', person.userId)}
            accessibilityLabel={person.role === 'CO_HOST' ? 'Remove co-host role' : 'Make co-host'} />}
          {host && person.role === 'CO_HOST' && person.seatIndex !== null && <SheetTile icon={IconCrown} label="Make host" disabled={busy} onPress={go({kind: 'confirm', confirm: 'transfer', personId: person.userId})} />}
          <SheetTile icon={IconUserMinus} label="Remove" accessibilityLabel="Remove from room" destructive disabled={busy} onPress={go({kind: 'confirm', confirm: 'remove', personId: person.userId})} />
        </SheetTileGrid>}
        {host && person.userId === identity && <Text className="mb-3 text-center text-xs leading-5 text-muted">Make a seated co-host the host before leaving to keep the party going.</Text>}
        {person.userId !== identity && <View className="flex-row justify-center gap-6 pb-1 pt-1">
          {onViewProfile && <Pressable accessibilityRole="button" accessibilityLabel="View profile" onPress={() => onViewProfile(person)} className="min-h-11 flex-row items-center gap-1.5 px-2 active:opacity-70">
            <IconUser size={15} color={PartyColors.accent} /><Text className="text-[13px] font-semibold text-primary">Profile</Text>
          </Pressable>}
          <Pressable accessibilityRole="button" accessibilityLabel="Report participant" disabled={busy} onPress={go({kind: 'report', personId: person.userId})} className="min-h-11 flex-row items-center gap-1.5 px-2 active:opacity-70">
            <IconFlag size={15} color={PartyColors.muted} /><Text className="text-[13px] font-semibold text-muted">Report</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Block participant" disabled={busy} onPress={go({kind: 'confirm', confirm: 'block', personId: person.userId})} className="min-h-11 flex-row items-center gap-1.5 px-2 active:opacity-70">
            <IconBan size={15} color={PartyColors.coral} /><Text className="text-[13px] font-semibold text-coral">Block</Text>
          </Pressable>
        </View>}
      </View>
    </> : <Text className="py-8 text-center text-sm text-muted">This person left the room.</Text>)}

    {shown?.kind === 'requests' && (pending.length ? <SheetSection>
      {pending.map(request => <View key={request.id} className="min-h-[64px] flex-row items-center gap-3 border-b border-sheet px-4 py-2.5">
        <Avatar name={request.name} url={request.avatarUrl} />
        <View className="min-w-0 flex-1"><Text numberOfLines={1} className="text-[15px] font-semibold text-foreground">{request.name || 'Guest'}</Text>
          <View className="mt-0.5 flex-row items-center gap-1"><IconHandStop size={12} color={PartyColors.accent} /><Text className="text-xs text-muted">Wants to speak</Text></View></View>
        <RoundAction label="Decline" icon={IconX} disabled={busy} onPress={() => onAction('deny', request.id)} />
        <RoundAction label="Approve" icon={IconCheck} primary disabled={busy || freeSeat === undefined} onPress={() => onAction('approve', request.id)} />
      </View>)}
    </SheetSection> : <View className="items-center py-8">
      <View className="mb-3 h-16 w-16 items-center justify-center rounded-full bg-primary-dark"><IconHandStop size={28} color={PartyColors.accent} /></View>
      <Text className="text-[16px] font-semibold text-foreground">No raised hands</Text>
      <Text className="mt-1 text-center text-[13px] leading-5 text-muted">{settings?.requestsEnabled === false ? 'Requests are paused. Turn them on from room tools.' : 'When listeners raise a hand, they show up here.'}</Text>
    </View>)}

    {shown?.kind === 'people' && <>
      {!!onStage.length && <SheetSection label={`On stage · ${onStage.length}`}>{onStage.map(p => <PersonRow key={p.userId} p={p} identity={identity} onPress={go({kind: 'person', personId: p.userId})} />)}</SheetSection>}
      {!!listening.length && <SheetSection label={`Listening · ${listening.length}`}>{listening.map(p => <PersonRow key={p.userId} p={p} identity={identity} onPress={go({kind: 'person', personId: p.userId})}
        action={manager && p.userId !== identity ? <Pressable accessibilityRole="button" accessibilityLabel={`Invite ${p.name || 'Guest'} to stage`} disabled={busy || freeSeat === undefined} onPress={() => onAction('invite', p.userId)}
          className={`h-8 justify-center rounded-full bg-primary-dark px-3 active:opacity-70 ${freeSeat === undefined ? 'opacity-40' : ''}`}><Text className="text-xs font-bold text-primary">Invite</Text></Pressable> : undefined} />)}</SheetSection>}
      {!listening.length && <Text className="pb-2 pt-1 text-center text-[13px] text-muted">No listeners yet — share the room to bring people in.</Text>}
    </>}

    {shown?.kind === 'seat' && seatIndex !== undefined && (manager && seatIndex > 0 ? <SheetTileGrid columns={2}>
      <SheetTile icon={seatLocked ? IconLockOpen : IconLock} label={seatLocked ? 'Unlock seat' : 'Lock seat'} active={seatLocked} disabled={busy} onPress={() => onAction('lock', seatIndex)} />
      <SheetTile icon={IconUserPlus} label="Invite a listener" disabled={seatLocked} onPress={go({kind: 'people'})} />
    </SheetTileGrid> : <View className="items-center pb-2">
      <View className="mb-2 h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-border-muted">{seatLocked ? <IconLock size={24} color={PartyColors.muted} /> : <IconMicrophone size={24} color={PartyColors.accent} />}</View>
      <Text className="text-center text-[13px] leading-5 text-muted">{me?.seatIndex !== null ? 'You’re already on stage.' : seatLocked ? 'The host locked this seat.' : settings?.requestsEnabled === false ? 'The host paused requests for now.' : ownRequest ? 'Your hand is up. The host will bring you on stage.' : 'Raise your hand and the host can bring you on stage.'}</Text>
    </View>)}

    {shown?.kind === 'info' && settings && <>
      <View className="mb-4 flex-row items-center gap-3">
        <Image source={roomCover(settings)} className="h-14 w-14 rounded-2xl" />
        <View className="min-w-0 flex-1">
          <Text accessibilityRole="header" numberOfLines={1} className="text-[18px] font-bold tracking-[-0.3px] text-foreground">{title}</Text>
          {!!topic && <Text numberOfLines={2} className="mt-0.5 text-[13px] leading-5 text-muted">{topic}</Text>}
          <View className="mt-1.5 flex-row flex-wrap gap-1.5">
            {roomTags(settings).map(tag => <Text key={tag} className={`overflow-hidden rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${tagClasses(tag)}`}>{tag}</Text>)}
            {settings.visibility === 'PRIVATE' && <Text className="overflow-hidden rounded-full bg-card px-2 py-0.5 text-[11px] font-semibold text-muted">Private</Text>}
          </View>
        </View>
      </View>
      <SheetTileGrid columns={manager ? 5 : 3}>
        <SheetTile icon={IconShare} label="Share" accessibilityLabel="Share party" disabled={busy} onPress={() => onAction('share')} />
        <SheetTile icon={IconUsers} label={`People · ${active.length}`} accessibilityLabel="People in room" onPress={go({kind: 'people'})} />
        {manager && <SheetTile icon={IconHandStop} label="Requests" accessibilityLabel="Requests to speak" badge={pending.length} onPress={go({kind: 'requests'})} />}
        {onOpenAudio && <SheetTile icon={IconVolume} label="Audio" accessibilityLabel="Audio output" onPress={onOpenAudio} />}
        {manager && <SheetTile icon={IconPencil} label="Edit room" accessibilityLabel="Edit room details" onPress={go({kind: 'edit'})} />}
      </SheetTileGrid>
      {manager && <SheetSection label="Room settings">
        <SheetRow icon={IconMessage} label="Room chat" description={settings.chatEnabled === false ? 'Paused' : 'Everyone can chat'} disabled={busy} onPress={() => onAction('chat-toggle')}
          accessory={<SettingSwitch value={settings.chatEnabled !== false} disabled={busy} onChange={() => onAction('chat-toggle')} />} />
        <SheetRow icon={IconHandStop} label="Requests to speak" description={settings.requestsEnabled === false ? 'Paused' : 'Listeners can raise hands'} disabled={busy} onPress={() => onAction('requests-toggle')}
          accessibilityLabel="Allow requests to speak" accessory={<SettingSwitch value={settings.requestsEnabled !== false} disabled={busy} onChange={() => onAction('requests-toggle')} />} />
        <SheetRow icon={IconClock} label="Slow mode" description="One message every 10 seconds" disabled={busy} onPress={() => onAction('slow-mode')}
          accessory={<SettingSwitch value={!!settings.slowModeSeconds} disabled={busy} onChange={() => onAction('slow-mode')} />} />
      </SheetSection>}
      <SheetButton label={host ? 'End party for everyone' : 'Leave party'} variant="danger" onPress={go({kind: 'exit'})} />
    </>}

    {shown?.kind === 'edit' && manager && <>
      <Text className="mb-2 ml-1 text-[13px] font-semibold text-muted">Room name</Text>
      <TextInput accessibilityLabel="Edit room name" value={draftTitle} onChangeText={setDraftTitle} maxLength={120} placeholderTextColor={PartyColors.muted} className="mb-4 min-h-12 rounded-xl border border-border bg-card px-4 text-base text-foreground" />
      <Text className="mb-2 ml-1 text-[13px] font-semibold text-muted">Topic</Text>
      <TextInput accessibilityLabel="Edit room topic" value={draftTopic} onChangeText={setDraftTopic} maxLength={120} placeholder="What’s the vibe?" placeholderTextColor={PartyColors.muted} className="mb-2 min-h-12 rounded-xl border border-border bg-card px-4 text-base text-foreground" />
    </>}

    {shown?.kind === 'report' && person && <SheetSection>
      {REPORT_REASONS.map(reason => <SheetRow key={reason} label={reason} disabled={busy} chevron onPress={() => onAction('report', {userId: person.userId, reason})} />)}
    </SheetSection>}

    {shown?.kind === 'message' && message && <>
      <View className="mb-3 flex-row gap-3 rounded-2xl bg-card px-4 py-3">
        <Avatar name={message.name} size={32} />
        <Text className="flex-1 text-[15px] leading-6 text-foreground">{message.body}</Text>
      </View>
      <SheetSection>
        {message.userId !== identity && <SheetRow icon={IconUsers} label={`View ${message.name}`} chevron onPress={go({kind: 'person', personId: message.userId})} />}
        {message.userId !== identity && <SheetRow icon={IconFlag} label="Report message" disabled={busy} onPress={() => onAction('report', {userId: message.userId, reason: `Inappropriate room message: ${message.body.slice(0, 200)}`})} />}
        {(manager || message.userId === identity) && <SheetRow icon={IconTrash} label="Delete message" destructive disabled={busy} onPress={() => onAction('delete-message', message.id)} />}
      </SheetSection>
    </>}
  </BottomSheet>;
}
