import {apiRequest} from '../../core/api/apiClient';
import type {PersonResult, RoomResult, SearchRequestOptions} from './types';

/** Both backend validators cap the term at 80 characters (`search: z.string().trim().max(80)`). */
export const SEARCH_MAX_LENGTH = 80;

/**
 * Discovery returns AUDIO rooms by default and the Party tab only lists AUDIO, so search matches
 * that. Add 'VIDEO' here to search both (costs one extra request against the 60/min discovery limit).
 */
const ROOM_SEARCH_KINDS: RoomResult['kind'][] = ['AUDIO'];

const statusOf = (error: unknown) => (error as {status?: number} | null)?.status;

/** True when the server has no such route yet, so the UI can say "coming soon" instead of "error". */
export const isSearchUnavailable = (error: unknown) => [404, 405, 501].includes(statusOf(error) ?? 0);

export const searchErrorMessage = (error: unknown) =>
  statusOf(error) === 429 ? 'You’re searching a little fast. Try again in a moment.'
    : (error as {message?: string} | null)?.message || 'Search failed. Please try again.';

type PersonRow = {id: string; name: string | null; handle?: string | null; avatarUrl?: string | null; isFollowing?: boolean};

/**
 * People search: `GET /users/search?q=&limit=&offset=` -> `[{id, name, handle, avatarUrl, isFollowing}]`.
 * An older server without the route answers 404 and the screen shows "People search is coming soon"
 * (see `isSearchUnavailable`).
 */
export async function searchPeople(query: string, {limit = 20, offset = 0, signal}: SearchRequestOptions = {}): Promise<PersonResult[]> {
  const q = encodeURIComponent(query.trim().slice(0, SEARCH_MAX_LENGTH));
  const rows = await apiRequest<PersonRow[]>(`/users/search?q=${q}&limit=${limit}&offset=${offset}`, {auth: 'required', signal});
  return (rows ?? []).map(row => ({
    id: row.id,
    name: row.name?.trim() || 'Hiva user',
    handle: row.handle ?? null,
    avatarUrl: row.avatarUrl ?? null,
    isFollowing: row.isFollowing === true,
  }));
}

const liveFirst = (a: RoomResult, b: RoomResult) => {
  if (a.status !== b.status) return a.status === 'ACTIVE' ? -1 : b.status === 'ACTIVE' ? 1 : 0;
  if (a.status === 'ACTIVE') return b.participantCount - a.participantCount;
  const at = (room: RoomResult) => Date.parse(room.scheduledStartAt ?? '') || Number.MAX_SAFE_INTEGER;
  return at(a) - at(b);
};

/**
 * Room search over `GET /parties/discover?search=` (production today). The server matches the term
 * against title, topic and host name (ILIKE), returns PUBLIC ACTIVE/SCHEDULED rooms only and hides
 * rooms hosted by people the viewer blocked, was blocked by, or reported.
 */
export async function searchRooms(query: string, {limit = 20, signal}: SearchRequestOptions = {}): Promise<RoomResult[]> {
  const search = encodeURIComponent(query.trim().slice(0, SEARCH_MAX_LENGTH));
  const pages = await Promise.all(ROOM_SEARCH_KINDS.map(kind =>
    apiRequest<{rooms: RoomResult[]; nextCursor: string | null}>(
      `/parties/discover?limit=${limit}&kind=${kind}&search=${search}`, {auth: 'required', signal})));
  const rooms = pages.flatMap(page => page?.rooms ?? []).filter(room => room.status === 'ACTIVE' || room.status === 'SCHEDULED');
  return rooms.sort(liveFirst);
}
