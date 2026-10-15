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

/* ---------- Live audio room layout helpers (pure, unit-tested) ---------- */

export type SpeakerGrid = {columns: number; rows: number; size: number; cell: number};

/**
 * Adaptive speaker grid: few speakers get big tiles in one row, up to 4 per row, never more than 2 rows
 * for 8 seats. `size` is the avatar diameter, `cell` the tile width (avatar plus label room).
 */
export const speakerGrid = (count: number, availableWidth: number): SpeakerGrid => {
  const total = Math.max(1, Math.floor(Number.isFinite(count) ? count : 1));
  const width = Math.max(240, Math.floor(Number.isFinite(availableWidth) ? availableWidth : 320));
  const columns = Math.min(total, 4);
  const rows = Math.ceil(total / columns);
  const maxAvatar = total === 1 ? 120 : total === 2 ? 104 : total <= 4 ? 84 : 76;
  const cell = Math.floor(width / columns);
  const size = Math.max(48, Math.min(maxAvatar, cell - 16));
  return {columns, rows, size, cell: Math.min(cell, size + 28)};
};

export type StagePlan = {
  /** Speakers in display order: host, co-hosts, then by seat. */
  speakers: {seatIndex: number; userId: string}[];
  /** Empty or locked seat indexes to draw as small slots. */
  slots: number[];
  /** Empty seats folded behind the "+ k more seats" affordance. */
  hidden: number;
};

export const MAX_EMPTY_SLOTS = 4;

/** Decides which seats become tiles, which stay as quiet slots and how many are collapsed. */
export const planStage = (
  seatCount: number,
  people: {userId: string; seatIndex: number | null; role: 'HOST' | 'CO_HOST' | 'MEMBER'}[],
  lockedSeats: number[] = [],
  expanded = false,
  maxSlots = MAX_EMPTY_SLOTS,
): StagePlan => {
  const rank = {HOST: 0, CO_HOST: 1, MEMBER: 2} as const;
  const seated = people.filter(p => p.seatIndex !== null)
    .sort((a, b) => rank[a.role] - rank[b.role] || (a.seatIndex as number) - (b.seatIndex as number))
    .map(p => ({seatIndex: p.seatIndex as number, userId: p.userId}));
  const taken = new Set(seated.map(p => p.seatIndex));
  const free = Array.from({length: Math.max(0, seatCount)}, (_, i) => i).filter(i => !taken.has(i));
  // Open seats first (they are actionable), locked ones after.
  const ordered = [...free.filter(i => !lockedSeats.includes(i)), ...free.filter(i => lockedSeats.includes(i))];
  const shown = expanded || ordered.length <= maxSlots ? ordered : ordered.slice(0, Math.max(0, maxSlots - 1));
  return {speakers: seated, slots: shown.sort((a, b) => a - b), hidden: ordered.length - shown.length};
};

export const moreSeatsLabel = (hidden: number) => hidden === 1 ? '+ 1 more seat' : `+ ${hidden} more seats`;

export const seatSlotLabel = (index: number, locked: boolean) => locked ? `Locked seat ${index + 1}` : `Open seat ${index + 1}, tap to take it`;

export const speakerLabel = (name: string | null | undefined, opts: {mine: boolean; role: 'HOST' | 'CO_HOST' | 'MEMBER'; speaking?: boolean; muted?: boolean}) =>
  `${name || 'Guest'}, ${opts.mine ? 'you, ' : ''}${opts.role === 'HOST' ? 'host, ' : opts.role === 'CO_HOST' ? 'co-host, ' : ''}${opts.speaking ? 'speaking' : opts.muted ? 'muted' : 'on stage'}`;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "3 listening · 2 speaking" style subtitle for the room header. */
export const roomMetaLabel = (listeners: number, speakers: number) =>
  `${plural(Math.max(0, listeners), 'listener', 'listeners')} · ${plural(Math.max(0, speakers), 'speaker', 'speakers')}`;

/** Avatars to draw in the listeners strip and the "+N" overflow. */
export const listenerStrip = (count: number, maxAvatars = 6) => participantStack(count, maxAvatars);
