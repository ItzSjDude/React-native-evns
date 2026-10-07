import React from 'react';
import {ActivityIndicator, Image, Pressable, Text, View} from 'react-native';
import IconChevronRight from '@tabler/icons-react-native/IconChevronRight';
import IconHeadphones from '@tabler/icons-react-native/IconHeadphones';
import IconUsers from '@tabler/icons-react-native/IconUsers';
import IconVideo from '@tabler/icons-react-native/IconVideo';
import {Colors} from '../../Constants/Colors';
import type {PersonResult, RoomResult} from './types';

const initialsOf = (name: string) => name.trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || '?';
const isRemote = (url: string | null | undefined): url is string => !!url && /^https?:\/\//.test(url);

export const roomTitleOf = (room: RoomResult) =>
  room.title?.trim() || room.topic?.trim() || `${room.host.name || 'Community'}'s room`;

export const startsLabel = (value: string | null) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Scheduled';
  return date.toLocaleString(undefined, {weekday: 'short', hour: 'numeric', minute: '2-digit'});
};

export function SearchAvatar({name, url, size = 44}: {name: string; url: string | null | undefined; size?: number}) {
  return <View style={{width: size, height: size}} className="items-center justify-center overflow-hidden rounded-full bg-purple-tint">
    {isRemote(url)
      ? <Image source={{uri: url}} className="h-full w-full" accessibilityIgnoresInvertColors />
      : <Text style={{fontSize: size * 0.36}} className="font-bold text-purple-soft">{initialsOf(name)}</Text>}
  </View>;
}

export function PersonRow({person, onPress}: {person: PersonResult; onPress: (person: PersonResult) => void}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${person.name}'s profile`} onPress={() => onPress(person)}
    className="flex-row items-center gap-3 px-5 py-2.5 active:bg-white/5">
    <SearchAvatar name={person.name} url={person.avatarUrl} />
    <View className="min-w-0 flex-1">
      <Text numberOfLines={1} className="text-[15px] font-semibold text-foreground">{person.name}</Text>
      {person.handle ? <Text numberOfLines={1} className="mt-0.5 text-[13px] text-muted">@{person.handle}</Text> : null}
    </View>
    {person.isFollowing
      ? <View className="rounded-full border border-gold-line bg-gold-bg px-2.5 py-1"><Text className="text-[11px] font-bold text-gold">Following</Text></View>
      : <IconChevronRight size={18} color={Colors.mutedLight} />}
  </Pressable>;
}

export function RoomStatusBadge({room}: {room: RoomResult}) {
  if (room.status === 'ACTIVE') {
    return <View accessibilityLabel="Live now" className="flex-row items-center gap-1.5 rounded-full bg-coral/15 px-2.5 py-1">
      <View className="h-1.5 w-1.5 rounded-full bg-coral" />
      <Text className="text-[11px] font-extrabold tracking-[0.8px] text-coral">LIVE</Text>
    </View>;
  }
  const label = startsLabel(room.scheduledStartAt);
  return <View accessibilityLabel={`Scheduled ${label}`} className="rounded-full border border-purple-line bg-purple-tint px-2.5 py-1">
    <Text className="text-[11px] font-bold text-purple-soft">{label}</Text>
  </View>;
}

export function RoomRow({room, onPress}: {room: RoomResult; onPress: (room: RoomResult) => void}) {
  const title = roomTitleOf(room);
  const KindIcon = room.kind === 'VIDEO' ? IconVideo : IconHeadphones;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open room ${title}`} onPress={() => onPress(room)}
    className="mx-5 mb-2.5 flex-row items-center gap-3 rounded-[18px] border border-border bg-card p-3 active:opacity-80">
    <View className="h-12 w-12 items-center justify-center rounded-[14px] bg-primary-dark">
      <KindIcon size={22} color={Colors.primary} />
    </View>
    <View className="min-w-0 flex-1">
      <Text numberOfLines={1} className="text-[15px] font-semibold text-foreground">{title}</Text>
      <View className="mt-1 flex-row items-center gap-1.5">
        <Text numberOfLines={1} className="shrink text-[12px] text-muted">{room.host.name || 'Host'}</Text>
        {room.status === 'ACTIVE' ? <>
          <Text className="text-[12px] text-muted-light">·</Text>
          <IconUsers size={12} color={Colors.muted} />
          <Text className="text-[12px] text-muted">{room.participantCount}</Text>
        </> : null}
      </View>
    </View>
    <RoomStatusBadge room={room} />
  </Pressable>;
}

export function SectionHeader({title, onSeeAll}: {title: string; onSeeAll?: () => void}) {
  return <View className="flex-row items-center justify-between px-5 pb-2 pt-5">
    <Text accessibilityRole="header" className="text-[13px] font-bold uppercase tracking-[1.6px] text-muted">{title}</Text>
    {onSeeAll ? <Pressable accessibilityRole="button" accessibilityLabel={`See all ${title.toLowerCase()}`} onPress={onSeeAll} hitSlop={8} className="active:opacity-60">
      <Text className="text-[13px] font-semibold text-primary">See all</Text>
    </Pressable> : null}
  </View>;
}

export function SectionMessage({title, body, action, onAction, busy}: {title: string; body?: string | null; action?: string; onAction?: () => void; busy?: boolean}) {
  return <View className="items-center px-8 py-8">
    {busy ? <ActivityIndicator accessibilityLabel={title} color={Colors.primary} /> : <>
      <Text className="text-center text-[15px] font-semibold text-foreground">{title}</Text>
      {body ? <Text className="mt-1.5 text-center text-[13px] leading-[19px] text-muted">{body}</Text> : null}
      {action && onAction ? <Pressable accessibilityRole="button" accessibilityLabel={action} onPress={onAction}
        className="mt-4 rounded-full bg-primary px-5 py-2.5 active:opacity-70">
        <Text className="text-[14px] font-bold text-text-dark">{action}</Text>
      </Pressable> : null}
    </>}
  </View>;
}
