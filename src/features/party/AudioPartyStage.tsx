import React, {memo, useCallback, useEffect, useMemo, useState} from 'react';
import {AccessibilityInfo, Pressable, ScrollView, Text, View, useWindowDimensions} from 'react-native';
import Animated, {cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming} from 'react-native-reanimated';
import {useIsSpeaking} from '@livekit/react-native';
import type {Participant} from 'livekit-client';
import IconCrown from '@tabler/icons-react-native/IconCrown';
import IconMicrophoneOff from '@tabler/icons-react-native/IconMicrophoneOff';
import IconPlus from '@tabler/icons-react-native/IconPlus';
import IconStarFilled from '@tabler/icons-react-native/IconStarFilled';
import IconLock from '@tabler/icons-react-native/IconLock';
import RemoteImage from '../../components/RemoteImage';
import {PartyColors, initialsOf, moreSeatsLabel, planStage, seatSlotLabel, speakerGrid, speakerLabel} from './partyPresentation';
import type {PartyParticipant} from './partyService';

/** Pulsing halo behind a speaking avatar. Runs on the UI thread; static when reduce-motion is on. */
const SpeakingRing = memo(({size}: {size: number}) => {
  const pulse = useSharedValue(0);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled?.().then(value => { if (!cancelled) setReduced(value); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (reduced) { cancelAnimation(pulse); pulse.value = 0; return; }
    pulse.value = withRepeat(withSequence(withTiming(1, {duration: 650}), withTiming(0, {duration: 650})), -1);
    return () => cancelAnimation(pulse);
  }, [pulse, reduced]);
  const style = useAnimatedStyle(() => ({opacity: reduced ? 0.6 : 0.35 + pulse.value * 0.55, transform: [{scale: reduced ? 1.12 : 1.04 + pulse.value * 0.14}]}));
  return <Animated.View pointerEvents="none" style={[{width: size + 8, height: size + 8, borderRadius: (size + 8) / 2}, style]} className="absolute border-[3px] border-glow-green" />;
});

type SeatProps = {
  person?: PartyParticipant;
  live?: Participant;
  index: number;
  size: number;
  cell: number;
  speaking?: boolean;
  localIdentity: string;
  onSeatPress: (person: PartyParticipant | undefined, index: number) => void;
};

/** A speaker tile: large avatar, name, role badge, mute indicator and speaking ring. */
const Seat = memo(({person, live, index, size, cell, speaking, localIdentity, onSeatPress}: SeatProps) => {
  const muted = live ? !live.isMicrophoneEnabled : person?.muted;
  const mine = person?.userId === localIdentity;
  const role = person?.role ?? 'MEMBER';
  const badge = Math.max(20, Math.round(size * 0.26));
  return (
    <Pressable onPress={() => onSeatPress(person, index)} accessibilityRole="button"
      accessibilityLabel={speakerLabel(person?.name, {mine, role, speaking, muted})}
      style={{width: cell}} className="items-center py-1 active:opacity-70">
      <View style={{width: size, height: size}} className={`items-center justify-center rounded-full border-2 ${speaking ? 'border-glow-green bg-primary-dark' : 'border-border bg-card'}`}>
        {speaking && <SpeakingRing size={size} />}
        {person?.avatarUrl ? <RemoteImage uri={person.avatarUrl} fadeDuration={0} style={{width: size - 6, height: size - 6}} className="rounded-full" />
          : <Text style={{fontSize: Math.round(size * 0.3)}} className="font-bold text-foreground">{initialsOf(person?.name)}</Text>}
        {muted && <View style={{width: badge, height: badge, borderRadius: badge / 2}} className="absolute -bottom-0.5 -right-0.5 items-center justify-center border-2 border-background bg-card"><IconMicrophoneOff size={Math.round(badge * 0.55)} color={PartyColors.coral} /></View>}
        {role === 'CO_HOST' && <View style={{width: badge, height: badge, borderRadius: badge / 2}} className="absolute -top-2 items-center justify-center border border-primary/50 bg-primary-dark"><IconStarFilled size={Math.round(badge * 0.55)} color={PartyColors.accent} /></View>}
        {role === 'HOST' && <View style={{width: badge, height: badge, borderRadius: badge / 2}} className="absolute -top-2 items-center justify-center bg-gold"><IconCrown size={Math.round(badge * 0.6)} color={PartyColors.ink} /></View>}
      </View>
      <Text style={{width: cell - 4}} className="mt-2 text-center text-[13px] font-semibold text-foreground" numberOfLines={1}>{mine ? 'You' : person?.name || 'Guest'}</Text>
      <Text className={`mt-0.5 text-[11px] ${speaking ? 'font-semibold text-glow-emerald dark:text-glow-green' : 'text-muted'}`} numberOfLines={1}>{speaking ? 'Speaking' : role === 'HOST' ? 'Host' : role === 'CO_HOST' ? 'Co-host' : 'Speaker'}</Text>
    </Pressable>
  );
});

const LiveSeat = memo((props: SeatProps & {live: Participant}) => {
  const speaking = useIsSpeaking(props.live);
  return <Seat {...props} speaking={speaking} />;
});

/** Quiet empty/locked seat: a small slot with no printed text; the label carries the meaning. */
const SeatSlot = memo(({index, locked, onSeatPress}: {index: number; locked: boolean; onSeatPress: SeatProps['onSeatPress']}) => (
  <Pressable onPress={() => onSeatPress(undefined, index)} accessibilityRole="button" accessibilityLabel={seatSlotLabel(index, locked)}
    hitSlop={2} className="h-12 w-12 items-center justify-center rounded-full border border-dashed border-border bg-card/50 active:opacity-70">
    {locked ? <IconLock size={18} color={PartyColors.muted} /> : <IconPlus size={20} color={PartyColors.muted} />}
  </Pressable>
));

export default function AudioPartyStage({seatCount, speakers, liveById, localIdentity, onSeatPress, lockedSeats = [], scrollEnabled = false}: {
  seatCount: number;
  speakers: PartyParticipant[];
  liveById: Map<string, Participant>;
  localIdentity: string;
  onSeatPress: (person: PartyParticipant | undefined, index: number) => void;
  lockedSeats?: number[];
  scrollEnabled?: boolean;
}) {
  const {width, height} = useWindowDimensions();
  const [showAll, setShowAll] = useState(false);
  const toggleAll = useCallback(() => setShowAll(value => !value), []);
  const plan = useMemo(() => planStage(seatCount, speakers, lockedSeats, showAll), [seatCount, speakers, lockedSeats, showAll]);
  const byId = useMemo(() => new Map(speakers.map(person => [person.userId, person])), [speakers]);
  const grid = speakerGrid(plan.speakers.length, width - 32);
  return (
    <ScrollView
      scrollEnabled={scrollEnabled}
      bounces={false}
      overScrollMode="never"
      showsVerticalScrollIndicator={false}
      style={{flexGrow: 0, ...(scrollEnabled ? {maxHeight: Math.max(160, height - 420)} : null)}}
      contentContainerClassName="items-center px-4 pb-2 pt-5"
    >
      <View className="w-full flex-row flex-wrap justify-center gap-y-3">
        {plan.speakers.map(({userId, seatIndex}) => {
          const person = byId.get(userId) as PartyParticipant;
          const live = liveById.get(userId);
          const props: SeatProps = {person, live, index: seatIndex, size: grid.size, cell: grid.cell, localIdentity, onSeatPress};
          return live ? <LiveSeat key={userId} {...props} live={live} /> : <Seat key={userId} {...props} />;
        })}
      </View>
      {(plan.slots.length > 0 || plan.hidden > 0 || showAll) && <View className="mt-3 w-full flex-row flex-wrap items-center justify-center gap-3">
        {plan.slots.map(index => <SeatSlot key={index} index={index} locked={lockedSeats.includes(index)} onSeatPress={onSeatPress} />)}
        {plan.hidden > 0 && <Pressable accessibilityRole="button" accessibilityLabel={`${moreSeatsLabel(plan.hidden)}, show all seats`} onPress={toggleAll} className="min-h-12 justify-center rounded-full border border-border bg-card/60 px-4 active:opacity-70">
          <Text className="text-[13px] font-semibold text-muted">{moreSeatsLabel(plan.hidden)}</Text>
        </Pressable>}
        {showAll && plan.hidden === 0 && seatCount - plan.speakers.length > 4 && <Pressable accessibilityRole="button" accessibilityLabel="Show fewer seats" onPress={toggleAll} className="min-h-12 justify-center rounded-full px-3 active:opacity-70">
          <Text className="text-[13px] font-semibold text-primary">Show fewer</Text>
        </Pressable>}
      </View>}
    </ScrollView>
  );
}
