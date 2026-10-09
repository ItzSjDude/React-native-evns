import type {PartyRoom} from '../party';

export type SearchTab = 'top' | 'people' | 'rooms';

/**
 * Row of `GET /users/search?q=&limit=&offset=` (NOT on the backend yet; see searchService).
 * Blocked, suspended and deleted users are excluded server-side.
 */
export type PersonResult = {
  id: string;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
  isFollowing: boolean;
};

/** Row of `GET /parties/discover?search=` (live on production `main`). */
export type RoomResult = PartyRoom;

/** `unavailable` = the backend doesn't expose this search yet (404/405/501). */
export type SectionStatus = 'idle' | 'loading' | 'success' | 'error' | 'unavailable';

export type SearchSection<T> = {status: SectionStatus; items: T[]; error: string | null};

export type SearchResults = {
  /** The trimmed query these results belong to ('' when idle). */
  query: string;
  people: SearchSection<PersonResult>;
  rooms: SearchSection<RoomResult>;
};

export type SearchRequestOptions = {limit?: number; offset?: number; signal?: AbortSignal};
