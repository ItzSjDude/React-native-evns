import React from 'react';
import {Image, Pressable, Text, View} from 'react-native';
import IconDotsVertical from '@tabler/icons-react-native/IconDotsVertical';
import IconHeadphones from '@tabler/icons-react-native/IconHeadphones';
import IconUserFilled from '@tabler/icons-react-native/IconUserFilled';
import IconUsers from '@tabler/icons-react-native/IconUsers';
import IconVideoFilled from '@tabler/icons-react-native/IconVideoFilled';
import IconWaveSine from '@tabler/icons-react-native/IconWaveSine';
import {PartyColors, roomCover, roomTags, roomTitle, startsAt, tagClasses} from './partyPresentation';
import type {PartyRoom} from './partyService';

export const HostAvatar = ({room, size = 28}: {room: PartyRoom; size?: number}) => room.host.avatarUrl ? (
  <Image source={{uri: room.host.avatarUrl}} style={{height: size, width: size, borderRadius: size / 2}} />
) : (
  <View style={{height: size, width: size, borderRadius: size / 2}} className="items-center justify-center bg-primary-dark">
    <Text className="text-xs font-semibold text-primary">{(room.host.name || 'H').slice(0, 1).toUpperCase()}</Text>
  </View>
);

const AvatarStack = ({room}: {room: PartyRoom}) => {
  const shown = Math.min(Math.max(room.participantCount - 1, 0), 2);
  return (
    <View className="flex-row items-center" accessibilityLabel={room.participantCount + ' participants, hosted by ' + (room.host.name || 'Host')}>
      <View className="z-20 rounded-full border-2 border-card"><HostAvatar room={room} size={24} /></View>
      {Array.from({length: shown}, (_, index) => <View key={index} className="-ml-2 h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-[#35303F]"><IconUserFilled size={16} color="#B7B1C3" /></View>)}
      {room.participantCount > 3 && <Text className="ml-1.5 text-[11px] text-muted">+{room.participantCount - 3}</Text>}
    </View>
  );
};

const PartyRoomCard = ({room, onOpen, onMore}: {room: PartyRoom; onOpen: () => void; onMore: () => void}) => {
  const video = room.kind === 'VIDEO';
  const scheduled = room.status === 'SCHEDULED';
  const MediaIcon = video ? IconVideoFilled : IconHeadphones;
  const tags = roomTags(room);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={'Open ' + roomTitle(room)} onPress={onOpen} className="mb-2.5 flex-row items-center rounded-[20px] border border-[#282433] bg-card p-2 active:opacity-80">
      <View className="h-[104px] w-[104px] shrink-0 overflow-hidden rounded-[14px] bg-primary-dark">
        <Image source={roomCover(room)} resizeMode="cover" className="h-full w-full" />
        <View className={video ? 'absolute left-1.5 top-1.5 flex-row items-center gap-1 rounded-full bg-coral px-2 py-1' : 'absolute left-1.5 top-1.5 flex-row items-center gap-1 rounded-full bg-primary-dark px-2 py-1'}>
          {video ? <IconVideoFilled size={12} color={PartyColors.ink} /> : <IconWaveSine size={13} color={PartyColors.accent} />}
          <Text className={video ? 'text-[10px] font-semibold text-text-dark' : 'text-[10px] font-semibold text-foreground'}>{video ? 'Video' : 'Audio'}</Text>
        </View>
      </View>
      <View className="ml-3 min-w-0 flex-1 py-0.5">
        <View className="flex-row items-center">
          <Text className="min-w-0 flex-1 text-[16px] font-bold leading-5 text-foreground" numberOfLines={1}>{roomTitle(room)}</Text>
          <View className="ml-1.5 flex-row items-center gap-1"><IconUsers size={12} color={PartyColors.muted} /><Text className="text-[11px] text-muted">{room.participantCount}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel={'More options for ' + roomTitle(room)} hitSlop={8} onPress={event => { event.stopPropagation(); onMore(); }} className="-mr-1 ml-1 h-7 w-6 items-center justify-center">
            <IconDotsVertical size={17} color={PartyColors.muted} />
          </Pressable>
        </View>
        <Text className="mt-1 text-[12px] leading-[17px] text-muted" numberOfLines={2}>{scheduled ? 'Starts ' + startsAt(room.scheduledStartAt) : room.topic?.trim() || 'Hosted by ' + (room.host.name || 'Host')}</Text>
        <View className="mt-2 flex-row gap-1.5">
          {tags.map(tag => <View key={tag} className={'max-w-[90px] rounded-full px-2 py-1 ' + tagClasses(tag).split(' ')[0]}><Text className={'text-[10px] font-medium capitalize ' + tagClasses(tag).split(' ')[1]} numberOfLines={1}>{tag}</Text></View>)}
        </View>
        <View className="mt-auto flex-row items-center justify-between pt-2">
          <AvatarStack room={room} />
          <Pressable accessibilityRole="button" accessibilityLabel={(scheduled ? 'View ' : 'Join ') + roomTitle(room)} onPress={event => { event.stopPropagation(); onOpen(); }} className="min-h-11 flex-row items-center justify-center gap-1.5 rounded-[14px] bg-primary px-3 active:opacity-70">
            <MediaIcon size={15} color={PartyColors.ink} />
            <Text className="text-[12px] font-bold text-text-dark">{scheduled ? 'Details' : 'Join'}</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
};

export default PartyRoomCard;
