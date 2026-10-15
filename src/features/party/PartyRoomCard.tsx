import React, {memo} from 'react';
import {Image, Pressable, Text, View} from 'react-native';
import IconDotsVertical from '@tabler/icons-react-native/IconDotsVertical';
import IconHeadphones from '@tabler/icons-react-native/IconHeadphones';
import IconLanguage from '@tabler/icons-react-native/IconLanguage';
import IconVideoFilled from '@tabler/icons-react-native/IconVideoFilled';
import IconWaveSine from '@tabler/icons-react-native/IconWaveSine';
import RemoteImage from '../../components/RemoteImage';
import {PartyStateChip, ParticipantStack} from './PartyBits';
import {PartyColors, initialsOf, languageLabel, listenerLabel, partyState, roomCover, roomTags, roomTitle, tagClasses} from './partyPresentation';
import type {PartyRoom} from './partyService';

export const HostAvatar = ({room, size = 28}: {room: PartyRoom; size?: number}) => {
  const url = room.host.avatarUrl;
  return url ? (
  <RemoteImage uri={url} style={{height: size, width: size, borderRadius: size / 2}} />
) : (
  <View style={{height: size, width: size, borderRadius: size / 2}} className="items-center justify-center bg-primary-dark">
    <Text className="text-xs font-semibold text-primary">{initialsOf(room.host.name || 'H', 1)}</Text>
  </View>
);
};

const PartyRoomCard = memo(({room, onOpen, onMore}: {room: PartyRoom; onOpen: (room: PartyRoom) => void; onMore: (room: PartyRoom) => void}) => {
  const video = room.kind === 'VIDEO';
  const scheduled = room.status === 'SCHEDULED';
  const live = room.status === 'ACTIVE';
  const MediaIcon = video ? IconVideoFilled : IconHeadphones;
  const tags = roomTags(room);
  const state = partyState(room);
  const language = languageLabel(room.language);
  const hostName = room.host.name || 'Host';
  const title = roomTitle(room);
  const topic = room.topic?.trim();
  const summary = topic && topic !== title ? topic : '';
  const cta = scheduled ? 'Details' : live ? 'Join' : 'View';
  const stackLabel = room.participantCount + (room.participantCount === 1 ? ' participant' : ' participants') + ', hosted by ' + hostName;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={'Open ' + title} accessibilityHint={state.label + ', hosted by ' + hostName + (language ? ', ' + language : '')} onPress={() => onOpen(room)} className="mb-2.5 flex-row rounded-[20px] border border-border/60 bg-card p-2 active:opacity-80 dark:border-[#282433]">
      <View className="w-[104px] shrink-0 self-stretch overflow-hidden rounded-[14px] bg-primary-dark" style={{minHeight: 120}}>
        <Image source={roomCover(room)} resizeMode="cover" className="h-full w-full" />
        <View className={'absolute left-1.5 top-1.5 flex-row items-center gap-1 rounded-full px-2 py-1 ' + (video ? 'bg-coral' : 'bg-primary-dark')}>
          {video ? <IconVideoFilled size={12} color={PartyColors.ink} /> : <IconWaveSine size={13} color={PartyColors.accent} />}
          <Text className={'text-[11px] font-semibold ' + (video ? 'text-text-dark' : 'text-foreground')}>{video ? 'Video' : 'Audio'}</Text>
        </View>
      </View>
      <View className="ml-3 min-w-0 flex-1">
        <View className="flex-row items-start">
          <Text className="mt-0.5 min-w-0 flex-1 text-[16px] font-bold leading-5 text-foreground" numberOfLines={2}>{title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={'More options for ' + title} hitSlop={{top: 6, bottom: 6, left: 6, right: 6}} onPress={event => { event.stopPropagation(); onMore(room); }} className="-mr-1 ml-1 h-11 w-9 items-center justify-center">
            <IconDotsVertical size={18} color={PartyColors.muted} />
          </Pressable>
        </View>
        <View className="-mt-1 flex-row items-center gap-1.5">
          <HostAvatar room={room} size={16} />
          <Text className="min-w-0 flex-1 text-[12px] text-muted" numberOfLines={1}>{hostName}</Text>
        </View>
        {!!summary && <Text className="mt-1 text-[12px] leading-[17px] text-muted" numberOfLines={2}>{summary}</Text>}
        <View className="mt-2 flex-row flex-wrap items-center gap-1.5">
          <PartyStateChip label={state.label} tone={state.tone} />
          {tags.map(tag => <View key={tag} className={'max-w-[96px] rounded-full px-2 py-1 ' + tagClasses(tag).split(' ')[0]}><Text className={'text-[11px] font-medium capitalize ' + tagClasses(tag).split(' ')[1]} numberOfLines={1}>{tag}</Text></View>)}
          {!!language && <View className="flex-row items-center gap-1 rounded-full bg-border/40 px-2 py-1"><IconLanguage size={11} color={PartyColors.muted} /><Text className="text-[11px] font-medium text-muted" numberOfLines={1}>{language}</Text></View>}
        </View>
        <View className="mt-auto flex-row items-center justify-between pt-2.5">
          <View className="min-w-0 flex-1 pr-2">
            <ParticipantStack count={room.participantCount} first={<HostAvatar room={room} size={24} />} label={stackLabel} />
            {live && <Text className="mt-1 text-[11px] text-muted" numberOfLines={1}>{listenerLabel(room.participantCount)}</Text>}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={(scheduled ? 'View ' : live ? 'Join ' : 'View ') + title} onPress={event => { event.stopPropagation(); onOpen(room); }} className={'min-h-11 min-w-[72px] flex-row items-center justify-center gap-1.5 rounded-[14px] px-3.5 active:opacity-70 ' + (live ? 'bg-gold' : 'border border-border bg-card')}>
            <MediaIcon size={15} color={live ? PartyColors.ink : PartyColors.text} />
            <Text className={'text-[13px] font-bold ' + (live ? 'text-text-dark' : 'text-foreground')}>{cta}</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
});

export default PartyRoomCard;
