import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {Avatar} from '../users';
import {goalLabel} from './networkingPresentation';
import type {ConnectionState, NetworkingAttendee} from './types';

type Props = {
  attendee: NetworkingAttendee;
  state: ConnectionState;
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  /** Opens the safe profile, whose menu holds Report and Block. Present on every card. */
  onOpenProfile: () => void;
};

const Chip = ({label}: {label: string}) =>
  <View className="rounded-full bg-primary-dark px-2.5 py-1"><Text className="text-[11px] font-semibold text-purple-soft">{label}</Text></View>;

const Action = ({label, onPress, disabled, primary}: {label: string; onPress: () => void; disabled?: boolean; primary?: boolean}) =>
  <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled: !!disabled}} disabled={disabled} onPress={onPress}
    className={`h-9 items-center justify-center rounded-full px-4 active:opacity-70 ${primary ? 'bg-gold' : 'bg-card'} ${disabled ? 'opacity-50' : ''}`}>
    <Text className={`text-[13px] font-bold ${primary ? 'text-text-dark' : 'text-foreground'}`}>{label}</Text>
  </Pressable>;

/** One attendee. Connecting is always an explicit tap; a pending request from them is accepted only by tapping Accept. */
export default function AttendeeCard({attendee, state, busy, onConnect, onDisconnect, onOpenProfile}: Props) {
  const {name} = attendee;
  return <View className="mb-3 rounded-2xl border border-border bg-card/60 p-4">
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${name}'s profile`} onPress={onOpenProfile} className="flex-row items-center gap-3 active:opacity-70">
      <Avatar name={name} url={attendee.avatarUrl} size={44} />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-[15px] font-bold text-foreground">{name}</Text>
        {!!attendee.intro && <Text numberOfLines={3} className="mt-0.5 text-[13px] leading-5 text-text-body">{attendee.intro}</Text>}
      </View>
    </Pressable>
    {(attendee.goals.length > 0 || attendee.interests.length > 0) && <View className="mt-3 flex-row flex-wrap gap-1.5">
      {attendee.goals.map(goal => <Chip key={goal} label={goalLabel(goal)} />)}
      {attendee.interests.map(interest => <Chip key={`i-${interest}`} label={interest} />)}
    </View>}
    <View className="mt-3 flex-row flex-wrap items-center gap-2">
      {state === 'none' && <Action primary label={`Connect with ${name}`} disabled={busy} onPress={onConnect} />}
      {state === 'incoming' && <>
        <Action primary label={`Accept ${name}'s request`} disabled={busy} onPress={onConnect} />
        <Action label={`Decline ${name}'s request`} disabled={busy} onPress={onDisconnect} />
      </>}
      {state === 'requested' && <>
        <Text accessibilityLabel={`Request sent to ${name}`} className="text-[13px] font-semibold text-muted">Request sent</Text>
        <Action label={`Cancel request to ${name}`} disabled={busy} onPress={onDisconnect} />
      </>}
      {state === 'connected' && <>
        <Text accessibilityLabel={`Connected with ${name}`} className="text-[13px] font-bold text-gold">Connected</Text>
        <Action label={`Remove connection with ${name}`} disabled={busy} onPress={onDisconnect} />
      </>}
      <View className="flex-1" />
      <Action label={`Report or block ${name}`} onPress={onOpenProfile} />
    </View>
  </View>;
}
