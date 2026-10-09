import type {ImageSourcePropType} from 'react-native';
import {Colors} from '../../Constants/Colors';
import type {PartyRoom} from './partyService';

export const PartyColors = {
  background: Colors.background,
  card: Colors.card,
  border: Colors.border,
  accent: Colors.primary,
  text: Colors.text,
  muted: Colors.muted,
  ink: Colors.textDark,
  coral: Colors.coral,
  gold: Colors.gold,
  goldInk: Colors.goldInk,
} as const;

export type PartyCategory = 'all' | 'music' | 'chill' | 'gaming' | 'talk' | 'study' | 'travel' | 'sports';
export const partyCategories: {key: PartyCategory; label: string; category?: string; interest?: string}[] = [
  {key: 'all', label: 'All'},
  {key: 'music', label: 'Music', category: 'MUSIC'},
  {key: 'chill', label: 'Chill', interest: 'chill'},
  {key: 'gaming', label: 'Gaming', category: 'GAMING'},
  {key: 'talk', label: 'Talk', category: 'SOCIAL'},
  {key: 'study', label: 'Study', interest: 'study'},
  {key: 'travel', label: 'Travel', interest: 'travel'},
  {key: 'sports', label: 'Sports', category: 'SPORTS'},
];

const covers: Record<Exclude<PartyCategory, 'all'>, ImageSourcePropType> = {
  music: require('../../../assets/images/party/music.jpg'),
  chill: require('../../../assets/images/party/chill.jpg'),
  gaming: require('../../../assets/images/party/gaming.jpg'),
  talk: require('../../../assets/images/party/talk.jpg'),
  study: require('../../../assets/images/party/study.jpg'),
  travel: require('../../../assets/images/party/travel.jpg'),
  sports: require('../../../assets/images/party/sports.jpg'),
};

const normalizeTag = (tag: string) => {
  const value = tag.trim().toLowerCase().replace(/_/g, ' ');
  return value === 'social' ? 'talk' : value;
};

export const roomTitle = (room: PartyRoom) => room.title?.trim() || room.topic?.trim() || (room.host.name || 'Community') + "'s room";
export const roomTags = (room: PartyRoom) => Array.from(new Set([
  ...(room.interestTags || []),
  ...(room.category ? [room.category] : []),
].map(normalizeTag).filter(Boolean))).slice(0, 2);

export const roomCover = (room: PartyRoom): ImageSourcePropType => {
  const key = roomTags(room).find(tag => tag in covers) as keyof typeof covers | undefined;
  return covers[key || 'talk'];
};

export const startsAt = (value: string | null) => value ? new Date(value).toLocaleString(undefined, {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
}) : '';

export const tagClasses = (tag: string) => {
  switch (normalizeTag(tag)) {
    case 'music': return 'bg-primary-dark text-primary';
    case 'chill': return 'bg-[#32232B] text-coral';
    case 'gaming':
    case 'travel': return 'bg-[#212238] text-[#B5B3E5]';
    case 'study': return 'bg-primary-dark text-primary';
    case 'sports': return 'bg-[#32232B] text-coral';
    default: return 'bg-[#262331] text-[#C2BECE]';
  }
};
