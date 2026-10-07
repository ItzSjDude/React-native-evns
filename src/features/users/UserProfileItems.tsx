import React from 'react';
import {Image, Text, View} from 'react-native';
import IconHeartFilled from '@tabler/icons-react-native/IconHeartFilled';
import IconUsers from '@tabler/icons-react-native/IconUsers';
import IconCalendarEvent from '@tabler/icons-react-native/IconCalendarEvent';
import IconMapPin from '@tabler/icons-react-native/IconMapPin';
import IconHeadphones from '@tabler/icons-react-native/IconHeadphones';
import IconVideo from '@tabler/icons-react-native/IconVideo';
import IconPhoto from '@tabler/icons-react-native/IconPhoto';
import {Colors} from '../../Constants/Colors';
import type {UserEvent, UserGiftSummary, UserParty, UserPost} from './types';

// Presentational copies of the own-profile pieces (features/profile/ProfileItems) so another
// user's profile reads as the same product without reaching into profile internals.

export const initialsOf = (name?: string | null) => (name || '?').trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
export const compact = (value: number) => value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1).replace(/\.0$/, '')}k` : String(value);

export const dateLabel = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
};

const isRemote = (url?: string | null): url is string => !!url && /^https?:\/\//i.test(url);

export const Avatar = ({name, url, size = 44}: {name: string; url: string | null | undefined; size?: number}) =>
  <View style={{width: size, height: size}} className="items-center justify-center overflow-hidden rounded-full bg-[#4A3A8C]">
    {isRemote(url) ? <Image source={{uri: url}} accessibilityLabel={`${name}'s avatar`} className="h-full w-full" />
      : <Text style={{fontSize: Math.round(size * 0.32)}} className="font-extrabold text-[#F0ECFF]">{initialsOf(name)}</Text>}
  </View>;

const TILE_SWATCHES = [
  {bg: '#F5B544', fg: '#1A1206'}, {bg: '#5B3FD0', fg: '#FFFFFF'}, {bg: '#FF5D8F', fg: '#1A0610'},
  {bg: '#1E4F5E', fg: '#BFE6F2'}, {bg: '#2F2A55', fg: '#D9D2FF'}, {bg: '#1F6B45', fg: '#FFFFFF'},
];
const ROOM_SWATCHES = ['#5B3FD0', '#C2552F', '#1E6E85', '#1F6B45', '#8A2E5C'];

const PostTile = ({post, index}: {post: UserPost; index: number}) => {
  const image = (post.media ?? []).find(item => item.type === 'IMAGE' && isRemote(item.url))?.url;
  const swatch = TILE_SWATCHES[index % TILE_SWATCHES.length];
  const likes = post.reactions?.likeCount ?? 0;
  const ink = image ? '#FFFFFF' : swatch.fg;
  const surface = {backgroundColor: image ? '#15121E' : swatch.bg};
  return <View accessibilityLabel={`Post from ${dateLabel(post.createdAt)}: ${post.body ?? 'photo'}. ${likes} likes`}
    style={surface} className="aspect-square flex-1 overflow-hidden rounded-[20px]">
    {image ? <>
      <Image source={{uri: image}} className="absolute inset-0 h-full w-full" resizeMode="cover" />
      <View className="absolute bottom-0 left-0 right-0 h-10 bg-black/35" />
    </> : post.body ? <Text numberOfLines={4} style={{color: swatch.fg}} className="p-2.5 text-[12px] font-extrabold leading-[15px]">“{post.body}”</Text>
      : <View className="flex-1 items-center justify-center"><IconPhoto size={28} color={swatch.fg} /></View>}
    <View className="absolute bottom-1.5 left-2 flex-row items-center gap-1">
      <IconHeartFilled size={11} color={ink} />
      <Text style={{color: ink}} className="text-[11px] font-extrabold">{likes}</Text>
    </View>
  </View>;
};

/** Three-column colourful post wall; the last row is padded so tiles keep equal size. */
export const PostGrid = ({posts}: {posts: UserPost[]}) => {
  const rows: UserPost[][] = [];
  posts.forEach((post, i) => {(rows[Math.floor(i / 3)] ||= []).push(post);});
  return <View className="gap-2">
    {rows.map((row, r) => <View key={r} className="flex-row gap-2">
      {row.map((post, c) => <PostTile key={post.id} post={post} index={r * 3 + c} />)}
      {Array.from({length: 3 - row.length}, (_, i) => <View key={`pad${i}`} className="flex-1" />)}
    </View>)}
  </View>;
};

const statusLabel: Record<string, string> = {ACTIVE: 'Live now', SCHEDULED: 'Scheduled', ENDED: 'Ended', CANCELLED: 'Cancelled'};

const RoomCard = ({party, index}: {party: UserParty; index: number}) => {
  const Kind = party.kind === 'VIDEO' ? IconVideo : IconHeadphones;
  const when = party.status === 'ACTIVE' ? 'Live now' : dateLabel(party.scheduled_start_at) || statusLabel[party.status] || '';
  return <View style={{backgroundColor: ROOM_SWATCHES[index % ROOM_SWATCHES.length]}} className="h-[168px] flex-1 justify-between rounded-[22px] p-3.5">
    <View className="flex-row items-start justify-between">
      <Kind size={28} color="#FFFFFF" />
      {!!when && <Text className={`text-[11px] font-bold text-white ${party.status === 'ACTIVE' ? 'overflow-hidden rounded-full bg-black/30 px-2 py-0.5' : 'opacity-85'}`}>{when}</Text>}
    </View>
    <View>
      <Text numberOfLines={2} className="text-[16px] font-extrabold leading-[19px] text-white">{party.title || 'Untitled room'}</Text>
      <Text className="mt-1 text-[12px] text-white/85">{party.participant_count} joined</Text>
    </View>
  </View>;
};

/** Two-column room cards (no "host a room" tile: this is someone else's profile). */
export const RoomGrid = ({parties}: {parties: UserParty[]}) => {
  const rows: UserParty[][] = [];
  parties.forEach((party, i) => {(rows[Math.floor(i / 2)] ||= []).push(party);});
  return <View className="gap-2.5">
    {rows.map((row, r) => <View key={r} className="flex-row gap-2.5">
      {row.map((party, c) => <RoomCard key={party.id} party={party} index={r * 2 + c} />)}
      {row.length < 2 && <View className="flex-1" />}
    </View>)}
  </View>;
};

export const EventCard = ({event}: {event: UserEvent}) =>
  <View className="overflow-hidden rounded-[22px] border border-border bg-card">
    {isRemote(event.cover_url) && <Image source={{uri: event.cover_url}} className="h-28 w-full bg-background" resizeMode="cover" />}
    <View className="p-4">
      <Text numberOfLines={2} className="text-[15px] font-extrabold text-foreground">{event.title}</Text>
      <View className="mt-2 flex-row flex-wrap items-center gap-x-4 gap-y-1">
        <View className="flex-row items-center gap-1.5"><IconCalendarEvent size={15} color={Colors.muted} /><Text className="text-[12px] font-semibold text-muted">{dateLabel(event.starts_at)}</Text></View>
        {!!event.venue && <View className="flex-row items-center gap-1.5"><IconMapPin size={15} color={Colors.muted} /><Text className="text-[12px] font-semibold text-muted">{event.venue}</Text></View>}
        <View className="flex-row items-center gap-1.5"><IconUsers size={15} color={Colors.muted} /><Text className="text-[12px] font-semibold text-muted">{event.attendee_count} going</Text></View>
      </View>
    </View>
  </View>;

const GIFT_STYLES: Record<string, {label: string; emoji: string; bg: string}> = {
  rose: {label: 'Rose', emoji: '🌹', bg: '#3A1426'},
  heart: {label: 'Dil', emoji: '❤️', bg: '#3A1426'},
  crown: {label: 'Taj', emoji: '👑', bg: '#3A2C0E'},
  rocket: {label: 'Rocket', emoji: '🚀', bg: '#241D4A'},
  star: {label: 'Sitara', emoji: '⭐', bg: '#123224'},
};
const giftStyle = (type: string) => GIFT_STYLES[type.toLowerCase()]
  ?? {label: type.replace(/[_-]+/g, ' ').replace(/^\w/, c => c.toUpperCase()), emoji: '🎁', bg: '#211D2C'};

export const GiftPanel = ({summary, name}: {summary: UserGiftSummary; name: string}) => {
  if (!summary.totalReceived) return <View className="items-center py-12">
    <Text className="text-[34px]">🎁</Text>
    <Text className="mt-2 text-[16px] font-extrabold text-foreground">No gifts yet</Text>
    <Text className="mt-1 text-center text-[13px] text-muted">Gifts sent to {name} in rooms show up here.</Text>
  </View>;
  const rows: UserGiftSummary['byGift'][] = [];
  summary.byGift.slice(0, 8).forEach((gift, i) => {(rows[Math.floor(i / 4)] ||= []).push(gift);});
  return <View>
    <View className="gap-3">
      {rows.map((row, r) => <View key={r} className="flex-row gap-2.5">
        {row.map(gift => {
          const style = giftStyle(gift.type);
          return <View key={gift.type} accessibilityLabel={`${gift.count} ${style.label}`} className="flex-1 items-center gap-1">
            <View style={{backgroundColor: style.bg}} className="mb-0.5 h-16 w-16 items-center justify-center rounded-full"><Text className="text-[28px]">{style.emoji}</Text></View>
            <Text className="text-[14px] font-extrabold text-foreground">{gift.count}</Text>
            <Text numberOfLines={1} className="text-[11px] text-[#9C95AE]">{style.label}</Text>
          </View>;
        })}
        {Array.from({length: 4 - row.length}, (_, i) => <View key={`pad${i}`} className="flex-1" />)}
      </View>)}
    </View>
    {!!summary.topSupporters.length && <View className="mt-3.5 flex-row items-center gap-2.5 border-t border-[#211D2C] pt-3">
      <Text className="flex-1 text-[13px] text-[#B3ACC4]">Sabse bade supporters</Text>
      <View className="flex-row">
        {summary.topSupporters.slice(0, 5).map((supporter, i) =>
          <View key={supporter.id} accessibilityLabel={`${supporter.name}, ${supporter.total} gifts`} className={`rounded-full border-2 border-background ${i ? '-ml-[18px]' : ''}`}>
            <Avatar name={supporter.name} url={supporter.avatarUrl} size={28} />
          </View>)}
      </View>
    </View>}
  </View>;
};
