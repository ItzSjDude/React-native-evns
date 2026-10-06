import React from 'react';
import {Image, Pressable, ScrollView, Text, View, useWindowDimensions} from 'react-native';
import {useIsSpeaking} from '@livekit/react-native';
import type {Participant} from 'livekit-client';
import IconCrown from '@tabler/icons-react-native/IconCrown';
import IconMicrophoneOff from '@tabler/icons-react-native/IconMicrophoneOff';
import IconPlus from '@tabler/icons-react-native/IconPlus';
import IconLock from '@tabler/icons-react-native/IconLock';
import IconHeadphones from '@tabler/icons-react-native/IconHeadphones';
import {PartyColors} from './partyPresentation';
import type {PartyParticipant} from './partyService';

type SeatProps = {
  person?: PartyParticipant;
  live?: Participant;
  index: number;
  size: number;
  speaking?: boolean;
  locked: boolean;
  localIdentity: string;
  onPress: () => void;
};

const Seat = ({person, live, index, size, speaking, locked, localIdentity, onPress}: SeatProps) => {
  const muted = live ? !live.isMicrophoneEnabled : person?.muted;
  const mine = person?.userId === localIdentity;
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      accessibilityLabel={person ? `${person.name || 'Guest'}, ${mine ? 'you, ' : ''}${speaking ? 'speaking' : muted ? 'muted' : 'on stage'}` : locked ? `Locked seat ${index + 1}` : `Request speaker seat ${index + 1}`}
      className="items-center active:opacity-70">
      <View style={{width: size, height: size}} className={`items-center justify-center rounded-full border-2 ${speaking ? 'border-solid border-primary bg-primary-dark' : person ? 'border-solid border-border bg-card' : 'border-dashed border-border bg-card/50'}`}>
        {speaking && <View pointerEvents="none" className="absolute -inset-1.5 rounded-full border border-primary/40" />}
        {person?.avatarUrl ? <Image source={{uri: person.avatarUrl}} style={{width: size - 6, height: size - 6}} className="rounded-full" />
          : person ? <Text className="text-lg font-bold text-foreground">{(person.name || '?').trim().slice(0, 2).toUpperCase()}</Text>
            : locked ? <IconLock size={22} color={PartyColors.muted} /> : <IconPlus size={22} color={PartyColors.muted} />}
        {person && muted && <View className="absolute -bottom-0.5 -right-0.5 h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-card"><IconMicrophoneOff size={11} color={PartyColors.coral} /></View>}
        {person?.role === 'HOST' && <View className="absolute -top-2.5 h-5 w-5 items-center justify-center rounded-full bg-primary"><IconCrown size={12} color={PartyColors.ink} /></View>}
      </View>
      <Text className="mt-1.5 w-[78px] text-center text-xs font-semibold text-foreground" numberOfLines={1}>{person ? mine ? 'You' : person.name || 'Guest' : `Seat ${index + 1}`}</Text>
      <Text className={`mt-0.5 text-xs ${speaking ? 'text-primary' : 'text-muted'}`}>{person ? speaking ? 'Speaking' : person.role === 'HOST' ? 'Host' : person.role === 'CO_HOST' ? 'Co-host' : 'Speaker' : locked ? 'Locked' : 'Open'}</Text>
    </Pressable>
  );
};

const LiveSeat = (props: SeatProps & {live: Participant}) => {
  const speaking = useIsSpeaking(props.live);
  return <Seat {...props} speaking={speaking} />;
};

export default function AudioPartyStage({seatCount, speakers, liveById, localIdentity, onSeatPress, lockedSeats = []}: {
  seatCount: number;
  speakers: PartyParticipant[];
  liveById: Map<string, Participant>;
  localIdentity: string;
  onSeatPress: (person: PartyParticipant | undefined, index: number) => void;
  lockedSeats?: number[];
}) {
  const {width,height,fontScale} = useWindowDimensions();
  const diameter = Math.min(width - 48, 350);
  const size = seatCount > 6 ? 48 : 64;
  const radius = diameter / 2 - 37;
  const bySeat = new Map(speakers.map(person => [person.seatIndex, person]));
  return (
    <ScrollView style={{maxHeight: Math.min(diameter + 64, Math.max(200,height-420))}} contentContainerClassName="items-center pb-3 pt-6" showsVerticalScrollIndicator={false}>
      <View style={{width: diameter, height: diameter + Math.max(48,36 * fontScale)}}>
        <View pointerEvents="none" style={{width: diameter - 74, height: diameter - 74}} className="absolute left-[37px] top-[37px] rounded-full border border-dashed border-primary/25 bg-primary-dark/40" />
        <View pointerEvents="none" style={{left: diameter / 2 - 48, top: diameter / 2 - 42}} className="absolute w-24 items-center">
          <View className="h-14 w-14 items-center justify-center rounded-[20px] border border-primary/30 bg-primary-dark"><IconHeadphones size={28} color={PartyColors.accent} /></View>
          <Text className="mt-2 text-[16px] font-bold tracking-[-0.4px] text-foreground">Hiva Chat</Text>
          <Text className="mt-0.5 text-xs text-muted">Awaaz ki party</Text>
        </View>
        {Array.from({length: seatCount}, (_, index) => {
          const angle = -Math.PI / 2 + index * Math.PI * 2 / seatCount;
          const person = bySeat.get(index);
          const live = person ? liveById.get(person.userId) : undefined;
          const props: SeatProps = {person, live, index, size, locked: lockedSeats.includes(index), localIdentity, onPress: () => onSeatPress(person, index)};
          return <View key={index} className="absolute w-[78px]" style={{left: diameter / 2 + radius * Math.cos(angle) - 39, top: diameter / 2 + radius * Math.sin(angle) - size / 2}}>
            {live ? <LiveSeat {...props} live={live} /> : <Seat {...props} />}
          </View>;
        })}
      </View>
    </ScrollView>
  );
}
