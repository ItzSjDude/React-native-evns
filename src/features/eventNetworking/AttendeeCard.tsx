import React, {memo} from 'react';
import {Pressable, Text, View} from 'react-native';
import PersonRow from '../../components/PersonRow';
import {goalLabel} from './networkingPresentation';
import type {ConnectionState, NetworkingAttendee} from './types';

type Props = {
  attendee: NetworkingAttendee;
  state: ConnectionState;
  busy: boolean;
  onConnect: (attendee: NetworkingAttendee) => void;
  onDisconnect: (attendee: NetworkingAttendee) => void;
  /** Opens the safe profile, whose menu holds Report and Block. Present on every card. */
  onOpenProfile: (attendee: NetworkingAttendee) => void;
};

const Action = ({label, onPress, disabled, primary}: {label: string; onPress: () => void; disabled?: boolean; primary?: boolean}) =>
  <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled: !!disabled}} disabled={disabled} onPress={onPress}
    className={`min-h-11 items-center justify-center rounded-full px-4 active:opacity-70 ${primary ? 'bg-gold' : 'border border-border bg-card'} ${disabled ? 'opacity-50' : ''}`}>
    <Text className={`text-[13px] font-bold ${primary ? 'text-text-dark' : 'text-foreground'}`}>{label}</Text>
  </Pressable>;

/** One attendee. Connecting is always an explicit tap; a pending request from them is accepted only by tapping Accept. */
const AttendeeCard = memo(function AttendeeCard({attendee, state, busy, onConnect, onDisconnect, onOpenProfile}: Props) {
  const {name} = attendee;
  const connect = () => onConnect(attendee);
  const disconnect = () => onDisconnect(attendee);
  const openProfile = () => onOpenProfile(attendee);
  const chipLabels = [...attendee.goals.map(goalLabel), ...attendee.interests];
  return <PersonRow variant="card" name={name} avatarUrl={attendee.avatarUrl} bio={attendee.intro} bioLines={3} interests={chipLabels} maxChips={8}
    accessibilityLabel={`Open ${name}'s profile`} onPress={openProfile} footer={
    <View className="mt-3 flex-row flex-wrap items-center gap-2">
      {state === 'none' && <Action primary label={`Connect with ${name}`} disabled={busy} onPress={connect} />}
      {state === 'incoming' && <>
        <Action primary label={`Accept ${name}'s request`} disabled={busy} onPress={connect} />
        <Action label={`Decline ${name}'s request`} disabled={busy} onPress={disconnect} />
      </>}
      {state === 'requested' && <>
        <Text accessibilityLabel={`Request sent to ${name}`} className="text-[13px] font-semibold text-muted">Request sent</Text>
        <Action label={`Cancel request to ${name}`} disabled={busy} onPress={disconnect} />
      </>}
      {state === 'connected' && <>
        <Text accessibilityLabel={`Connected with ${name}`} className="text-[13px] font-bold text-gold">Connected</Text>
        <Action label={`Remove connection with ${name}`} disabled={busy} onPress={disconnect} />
      </>}
      <View className="flex-1" />
      <Action label={`Report or block ${name}`} onPress={openProfile} />
    </View>} />;
});

export default AttendeeCard;
