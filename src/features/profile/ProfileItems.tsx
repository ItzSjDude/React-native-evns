import React, {memo} from 'react';
import {Pressable, Text, View} from 'react-native';
import IconHeartFilled from '@tabler/icons-react-native/IconHeartFilled';
import IconUsers from '@tabler/icons-react-native/IconUsers';
import IconCalendarEvent from '@tabler/icons-react-native/IconCalendarEvent';
import IconMapPin from '@tabler/icons-react-native/IconMapPin';
import IconHeadphones from '@tabler/icons-react-native/IconHeadphones';
import IconVideo from '@tabler/icons-react-native/IconVideo';
import IconPlus from '@tabler/icons-react-native/IconPlus';
import IconPhoto from '@tabler/icons-react-native/IconPhoto';
import RemoteImage from '../../components/RemoteImage';
import {Colors} from '../../Constants/Colors';
import type {GiftSummary, ProfileEvent, ProfileParty, ProfilePost} from './types';

export const dateLabel = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
};

// Older clients saved device-local file:// paths instead of uploaded URLs; those never load.
const loadableImages = (post: ProfilePost) =>
  (post.media ?? []).filter(item => item.type === 'IMAGE' && /^https?:\/\//i.test(item.url)).map(item => item.url);

// Text tiles rotate through the design's swatches so a grid of plain posts still reads as a colourful wall.
const TILE_SWATCHES = [
  {bg: '#8B7CF6', fg: '#160F2E'}, {bg: '#5B3FD0', fg: '#FFFFFF'}, {bg: '#FF5D8F', fg: '#1A0610'},
  {bg: '#1E4F5E', fg: '#BFE6F2'}, {bg: '#2F2A55', fg: '#D9D2FF'}, {bg: '#1F6B45', fg: '#FFFFFF'},
];
const ROOM_SWATCHES = ['#5B3FD0', '#C2552F', '#1E6E85', '#1F6B45', '#8A2E5C'];

export const PostTile = ({post, index}: {post: ProfilePost; index: number}) => {
  const image = loadableImages(post)[0];
  const swatch = TILE_SWATCHES[index % TILE_SWATCHES.length];
  const likes = post.reactions?.likeCount ?? 0;
  const surface = {backgroundColor: image ? '#15121E' : swatch.bg};
  const ink = {color: image ? '#FFFFFF' : swatch.fg};
  return <View accessibilityLabel={`Post from ${dateLabel(post.createdAt)}: ${post.body ?? 'photo'}. ${likes} likes`}
    style={surface} className="aspect-square flex-1 overflow-hidden rounded-[20px]">
    {image ? <>
      <RemoteImage uri={image} fadeDuration={0} className="absolute inset-0 h-full w-full" resizeMode="cover" />
      <View className="absolute bottom-0 left-0 right-0 h-10 bg-black/35" />
    </> : post.body ? <Text numberOfLines={4} style={{color: swatch.fg}} className="p-2.5 text-[12px] font-extrabold leading-[15px]">“{post.body}”</Text>
      : <View className="flex-1 items-center justify-center"><IconPhoto size={28} color={swatch.fg} /></View>}
    <View className="absolute bottom-1.5 left-2 flex-row items-center gap-1">
      <IconHeartFilled size={11} color={image ? '#FFFFFF' : swatch.fg} />
      <Text style={ink} className="text-[11px] font-extrabold">{likes}</Text>
    </View>
  </View>;
};

/** One virtualized list row of the profile's content tab: a post-grid row, a room-grid row or an event card. */
export type ProfileRow =
  | {key: string; kind: 'posts'; posts: ProfilePost[]; start: number}
  | {key: string; kind: 'rooms'; parties: (ProfileParty | null)[]; start: number}
  | {key: string; kind: 'event'; event: ProfileEvent};

const chunked = <T,>(items: T[], size: number) => {
  const rows: T[][] = [];
  items.forEach((item, i) => {(rows[Math.floor(i / size)] ||= []).push(item);});
  return rows;
};

/** Three posts per row; the last row is padded so tiles keep equal size. */
export const postRows = (posts: ProfilePost[]): ProfileRow[] =>
  chunked(posts, 3).map((row, r) => ({key: `posts-${row[0].id}`, kind: 'posts', posts: row, start: r * 3}));

/** Two room cards per row, with a trailing `null` for the "host a room" tile, as in the design. */
export const roomRows = (parties: ProfileParty[]): ProfileRow[] =>
  chunked<ProfileParty | null>([...parties, null], 2).map((row, r) => ({key: `rooms-${row[0]?.id ?? 'host'}`, kind: 'rooms', parties: row, start: r * 2}));

export const eventRows = (events: ProfileEvent[]): ProfileRow[] => events.map(event => ({key: `event-${event.id}`, kind: 'event', event}));

const statusLabel: Record<string, string> = {ACTIVE: 'Live now', SCHEDULED: 'Scheduled', ENDED: 'Ended', CANCELLED: 'Cancelled'};

const RoomCard = ({party, index}: {party: ProfileParty; index: number}) => {
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

const HostTile = ({onHost}: {onHost: () => void}) => <Pressable accessibilityRole="button" accessibilityLabel="Host a room" onPress={onHost}
  className="h-[168px] flex-1 items-center justify-center gap-2.5 rounded-[22px] border-[1.5px] border-dashed border-purple-line active:opacity-70">
  <View className="h-12 w-12 items-center justify-center rounded-full bg-purple-tint"><IconPlus size={22} color={Colors.purpleSoft} /></View>
  <Text className="text-[14px] font-extrabold text-purple-soft">Host a room</Text>
</Pressable>;

/** Renders one row of the profile content list. `first` drops the gap above the first row. */
export const ProfileRowView = memo(function ProfileRowView({row, first, onHost, onOpenEvent}: {row: ProfileRow; first: boolean; onHost: () => void; onOpenEvent: (event: ProfileEvent) => void}) {
  if (row.kind === 'posts') {
    return <View className={`flex-row gap-2 px-5 ${first ? '' : 'mt-2'}`}>
      {row.posts.map((post, c) => <PostTile key={post.id} post={post} index={row.start + c} />)}
      {Array.from({length: 3 - row.posts.length}, (_, i) => <View key={`pad${i}`} className="flex-1" />)}
    </View>;
  }
  if (row.kind === 'rooms') {
    return <View className={`flex-row gap-2.5 px-5 ${first ? '' : 'mt-2.5'}`}>
      {row.parties.map((party, c) => party ? <RoomCard key={party.id} party={party} index={row.start + c} /> : <HostTile key="host" onHost={onHost} />)}
      {row.parties.length < 2 && <View className="flex-1" />}
    </View>;
  }
  return <View className={`px-5 ${first ? '' : 'mt-3'}`}><EventCard event={row.event} onPress={onOpenEvent} /></View>;
});

const EventCard = ({event, onPress}: {event: ProfileEvent; onPress?: (event: ProfileEvent) => void}) =>
  <Pressable disabled={!onPress} onPress={onPress && (() => onPress(event))} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={onPress ? `Open event ${event.title}` : undefined} className="overflow-hidden rounded-[22px] border border-border bg-card">
    {!!event.cover_url && /^https?:\/\//i.test(event.cover_url) && <RemoteImage uri={event.cover_url} className="h-28 w-full bg-background" resizeMode="cover" />}
    <View className="p-4">
      <Text numberOfLines={2} className="text-[15px] font-extrabold text-foreground">{event.title}</Text>
      <View className="mt-2 flex-row flex-wrap items-center gap-x-4 gap-y-1">
        <View className="flex-row items-center gap-1.5"><IconCalendarEvent size={15} color={Colors.muted} /><Text className="text-[12px] font-semibold text-muted">{dateLabel(event.starts_at)}</Text></View>
        {!!event.venue && <View className="flex-row items-center gap-1.5"><IconMapPin size={15} color={Colors.muted} /><Text className="text-[12px] font-semibold text-muted">{event.venue}</Text></View>}
        <View className="flex-row items-center gap-1.5"><IconUsers size={15} color={Colors.muted} /><Text className="text-[12px] font-semibold text-muted">{event.attendee_count} going</Text></View>
      </View>
    </View>
  </Pressable>;

// The backend stores free-text gift types with no catalogue, so known ones get the design's icon and colours here.
const GIFT_STYLES: Record<string, {label: string; emoji: string; bg: string}> = {
  rose: {label: 'Rose', emoji: '🌹', bg: '#3A1426'},
  heart: {label: 'Dil', emoji: '❤️', bg: '#3A1426'},
  crown: {label: 'Taj', emoji: '👑', bg: '#3A2C0E'},
  rocket: {label: 'Rocket', emoji: '🚀', bg: '#241D4A'},
  star: {label: 'Sitara', emoji: '⭐', bg: '#123224'},
};
const giftStyle = (type: string) => GIFT_STYLES[type.toLowerCase()]
  ?? {label: type.replace(/[_-]+/g, ' ').replace(/^\w/, c => c.toUpperCase()), emoji: '🎁', bg: '#211D2C'};

const SUPPORTER_COLORS = [['#1F3B4A', '#CDEBFA'], ['#2F3A1E', '#E2F5C6'], ['#3F2A1E', '#FADCC6'], ['#2A1F4A', '#DDD4FF'], ['#4A1F33', '#FAD0E2']];

export const GiftPanel = ({summary}: {summary: GiftSummary}) => {
  if (!summary.totalReceived) return <View className="items-center py-12">
    <Text className="text-[34px]">🎁</Text>
    <Text className="mt-2 text-[16px] font-extrabold text-foreground">No gifts yet</Text>
    <Text className="mt-1 text-center text-[13px] text-muted">Gifts listeners send in your rooms show up here.</Text>
  </View>;
  const cells = summary.byGift.slice(0, 8);
  const rows: GiftSummary['byGift'][] = [];
  cells.forEach((gift, i) => {(rows[Math.floor(i / 4)] ||= []).push(gift);});
  return <View>
    <View className="gap-3">
      {rows.map((row, r) => <View key={r} className="flex-row gap-2.5">
        {row.map(gift => {
          const style = giftStyle(gift.type);
          return <View key={gift.type} accessibilityLabel={`${gift.count} ${style.label}`} className="flex-1 items-center gap-1">
            <View style={{backgroundColor: style.bg}} className="mb-0.5 h-16 w-16 items-center justify-center rounded-full"><Text className="text-[28px]">{style.emoji}</Text></View>
            <Text className="text-[14px] font-extrabold text-foreground">{gift.count}</Text>
            <Text numberOfLines={1} className="text-[11px] text-muted dark:text-[#9C95AE]">{style.label}</Text>
          </View>;
        })}
        {Array.from({length: 4 - row.length}, (_, i) => <View key={`pad${i}`} className="flex-1" />)}
      </View>)}
    </View>
    {!!summary.topSupporters.length && <View className="mt-3.5 flex-row items-center gap-2.5 border-t border-border/60 dark:border-[#211D2C] pt-3">
      <Text className="flex-1 text-[13px] text-muted dark:text-[#B3ACC4]">Sabse bade supporters</Text>
      <View className="flex-row">
        {summary.topSupporters.slice(0, 5).map((supporter, i) => {
          const [bg, fg] = SUPPORTER_COLORS[i % SUPPORTER_COLORS.length];
          return <View key={supporter.id} accessibilityLabel={`${supporter.name}, ${supporter.total} gifts`} style={{backgroundColor: bg}}
            className={`h-[30px] w-[30px] items-center justify-center overflow-hidden rounded-full border-2 border-background ${i ? '-ml-[18px]' : ''}`}>
            {supporter.avatarUrl ? <RemoteImage uri={supporter.avatarUrl} className="h-full w-full" />
              : <Text style={{color: fg}} className="text-[11px] font-extrabold">{supporter.name.slice(0, 2).toUpperCase()}</Text>}
          </View>;
        })}
      </View>
    </View>}
  </View>;
};
