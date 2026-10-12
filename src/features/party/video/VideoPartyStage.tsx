import React from 'react';
import {Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions} from 'react-native';
import {VideoTrack, useIsSpeaking, useTracks} from '@livekit/react-native';
import {Track, type Participant} from 'livekit-client';
import IconCrown from '@tabler/icons-react-native/IconCrown';
import IconMicrophoneOff from '@tabler/icons-react-native/IconMicrophoneOff';
import IconPlus from '@tabler/icons-react-native/IconPlus';
import IconLock from '@tabler/icons-react-native/IconLock';
import IconCameraRotate from '@tabler/icons-react-native/IconCameraRotate';
import {PartyColors} from '../partyPresentation';
import type {PartyParticipant} from '../partyService';

const styles = StyleSheet.create({fill: {flex: 1}, scroll: {flexGrow: 0}, grid: {padding: 12, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center'}});

type TrackRef = React.ComponentProps<typeof VideoTrack>['trackRef'];
type TileProps = {
  person?: PartyParticipant; live?: Participant; trackRef?: TrackRef; index: number; width: number; speaking?: boolean;
  locked: boolean; localIdentity: string; mirror: boolean; onPress: () => void; onSwitchCamera?: () => void;
};

const hasVideo = (trackRef: TrackRef) => !!trackRef && !!trackRef.publication?.track && !trackRef.publication.isMuted;

const Tile = ({person, live, trackRef, index, width, speaking, locked, localIdentity, mirror, onPress, onSwitchCamera}: TileProps) => {
  const muted = live ? !live.isMicrophoneEnabled : person?.muted;
  const mine = person?.userId === localIdentity;
  const showVideo = hasVideo(trackRef);
  const name = person ? mine ? 'You' : person.name || 'Guest' : `Seat ${index + 1}`;
  return <Pressable onPress={onPress} accessibilityRole="button"
    accessibilityLabel={person ? `${person.name || 'Guest'}, ${mine ? 'you, ' : ''}${speaking ? 'speaking' : muted ? 'muted' : 'on stage'}, camera ${showVideo ? 'on' : 'off'}` : locked ? `Locked seat ${index + 1}` : `Request speaker seat ${index + 1}`}
    style={{width, height: width}} className="active:opacity-80">
    <View className={`flex-1 overflow-hidden rounded-2xl border-2 ${speaking ? 'border-gold' : person ? 'border-border bg-card' : 'border-dashed border-border bg-card/50'}`}>
      {showVideo ? <VideoTrack trackRef={trackRef} mirror={mirror} objectFit="cover" style={styles.fill} />
        : <View className="flex-1 items-center justify-center">
          {person?.avatarUrl ? <Image source={{uri: person.avatarUrl}} style={{width: width * 0.4, height: width * 0.4}} className="rounded-full" />
            : person ? <Text className="text-2xl font-bold text-foreground">{(person.name || '?').trim().slice(0, 2).toUpperCase()}</Text>
              : locked ? <IconLock size={26} color={PartyColors.muted} /> : <IconPlus size={26} color={PartyColors.muted} />}
          {!person && <Text className="mt-1.5 text-xs text-muted">{locked ? 'Locked' : 'Tap to request'}</Text>}
        </View>}
      {!!person && <View className="absolute bottom-0 left-0 right-0 flex-row items-center gap-1.5 bg-black/55 px-2 py-1.5">
        {person.role === 'HOST' && <IconCrown size={12} color={PartyColors.accent} />}
        <Text numberOfLines={1} className="min-w-0 flex-1 text-xs font-semibold text-foreground">{name}</Text>
        {!!muted && <IconMicrophoneOff size={13} color={PartyColors.coral} />}
      </View>}
      {!person && <Text numberOfLines={1} className="absolute left-2 top-1.5 text-[11px] text-muted">{name}</Text>}
    </View>
    {mine && showVideo && !!onSwitchCamera && <Pressable accessibilityRole="button" accessibilityLabel="Switch camera" onPress={onSwitchCamera} hitSlop={6}
      className="absolute right-2 top-2 h-9 w-9 items-center justify-center rounded-full bg-black/55 active:opacity-70"><IconCameraRotate size={18} color={PartyColors.text} /></Pressable>}
  </Pressable>;
};

const LiveTile = (props: TileProps & {live: Participant}) => {
  const speaking = useIsSpeaking(props.live);
  return <Tile {...props} speaking={speaking} />;
};

export default function VideoPartyStage({seatCount, speakers, liveById, localIdentity, onSeatPress, lockedSeats = [], mirrorLocal = true, onSwitchCamera}: {
  seatCount: number; speakers: PartyParticipant[]; liveById: Map<string, Participant>; localIdentity: string;
  onSeatPress: (person: PartyParticipant | undefined, index: number) => void; lockedSeats?: number[];
  mirrorLocal?: boolean; onSwitchCamera?: () => void;
}) {
  const {width, height} = useWindowDimensions();
  const tracks = useTracks([Track.Source.Camera]);
  const trackById = new Map<string, TrackRef>(tracks.map(item => [item.participant.identity, item as unknown as TrackRef]));
  const columns = seatCount > 6 ? 3 : 2;
  const gap = 8;
  const tile = Math.floor((width - 24 - gap * (columns - 1)) / columns);
  const bySeat = new Map(speakers.map(person => [person.seatIndex, person]));
  return <ScrollView style={[styles.scroll, {maxHeight: Math.max(240, height * 0.52)}]} contentContainerStyle={[styles.grid, {gap}]} showsVerticalScrollIndicator={false}>
    {Array.from({length: seatCount}, (_, index) => {
      const person = bySeat.get(index);
      const live = person ? liveById.get(person.userId) : undefined;
      const props: TileProps = {person, live, trackRef: person ? trackById.get(person.userId) : undefined, index, width: tile, locked: lockedSeats.includes(index), localIdentity,
        mirror: person?.userId === localIdentity && mirrorLocal, onPress: () => onSeatPress(person, index), onSwitchCamera};
      return live ? <LiveTile key={index} {...props} live={live} /> : <Tile key={index} {...props} />;
    })}
  </ScrollView>;
}
