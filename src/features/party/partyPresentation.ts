import type {ImageSourcePropType} from 'react-native';
import {Colors} from '../../Constants/Colors';
import type {PartyRoom} from './partyService';

// Getters so these follow the current theme instead of freezing the palette at import time.
export const PartyColors = {
  get background() {return Colors.background;},
  get card() {return Colors.card;},
  get border() {return Colors.border;},
  get accent() {return Colors.primary;},
  get text() {return Colors.text;},
  get muted() {return Colors.muted;},
  get ink() {return Colors.textDark;},
  get coral() {return Colors.coral;},
  get gold() {return Colors.gold;},
  get goldInk() {return Colors.goldInk;},
};

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
    case 'chill': return 'bg-coral/15 dark:bg-[#32232B] text-coral';
    case 'gaming':
    case 'travel': return 'bg-purple-tint dark:bg-[#212238] text-purple-soft dark:text-[#B5B3E5]';
    case 'study': return 'bg-primary-dark text-primary';
    case 'sports': return 'bg-coral/15 dark:bg-[#32232B] text-coral';
    default: return 'bg-card dark:bg-[#262331] text-muted dark:text-[#C2BECE]';
  }
};

/** How many avatars to draw in a stack and how many people the "+N" chip stands for. */
export const participantStack = (count: number, maxAvatars = 3) => {
  const total = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
  const shown = Math.min(total, maxAvatars);
  return {shown, overflow: total - shown};
};

export const listenerLabel = (count: number) => {
  const total = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
  return total === 1 ? '1 listening' : total + ' listening';
};

export type PartyStateTone = 'live' | 'scheduled' | 'ended';
/** Single source of truth for the state chip on cards and the preview. */
export const partyState = (room: Pick<PartyRoom, 'status' | 'scheduledStartAt'>): {label: string; tone: PartyStateTone} => {
  switch (room.status) {
    case 'ACTIVE': return {label: 'Live', tone: 'live'};
    case 'SCHEDULED': return {label: room.scheduledStartAt ? 'Starts ' + startsAt(room.scheduledStartAt) : 'Scheduled', tone: 'scheduled'};
    case 'CANCELLED': return {label: 'Cancelled', tone: 'ended'};
    default: return {label: 'Ended', tone: 'ended'};
  }
};

const LANGUAGE_NAMES: Record<string, string> = {en: 'English', hi: 'Hindi', hinglish: 'Hinglish'};
export const languageLabel = (language: string | null | undefined) => {
  const key = (language || '').trim().toLowerCase();
  return key ? LANGUAGE_NAMES[key] || key.charAt(0).toUpperCase() + key.slice(1) : '';
};

export const initialsOf = (name: string | null | undefined, length = 2) => (name || '?').trim().slice(0, length).toUpperCase();

export type PartyListItem =
  | {type: 'header'; key: string; title: string; count: number}
  | {type: 'room'; key: string; room: PartyRoom};

/** Groups discovery results into "Live now" and "Starting soon" sections, keeping server order inside each group. */
export const buildPartyListItems = (rooms: PartyRoom[]): PartyListItem[] => {
  const live = rooms.filter(room => room.status !== 'SCHEDULED');
  const soon = rooms.filter(room => room.status === 'SCHEDULED');
  const toItems = (list: PartyRoom[]): PartyListItem[] => list.map(room => ({type: 'room', key: room.id, room}));
  const out: PartyListItem[] = [];
  if (live.length) out.push({type: 'header', key: 'h-live', title: 'Live now', count: live.length}, ...toItems(live));
  if (soon.length) out.push({type: 'header', key: 'h-soon', title: 'Starting soon', count: soon.length}, ...toItems(soon));
  return out;
};

/** Splits tagClasses into background and text class strings (both may carry dark: variants). */
export const tagParts = (tag: string) => {
  const tokens = tagClasses(tag).split(' ');
  const isText = (token: string) => token.replace(/^dark:/, '').startsWith('text-');
  return {box: tokens.filter(token => !isText(token)).join(' '), text: tokens.filter(isText).join(' ')};
};
