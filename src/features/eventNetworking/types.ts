export type NetworkingGoal = 'FRIENDS' | 'COLLABORATORS' | 'NETWORKING' | 'ACTIVITY_PARTNERS';

export const NETWORKING_GOALS: {value: NetworkingGoal; label: string}[] = [
  {value: 'FRIENDS', label: 'Friends'},
  {value: 'COLLABORATORS', label: 'Collaborators'},
  {value: 'NETWORKING', label: 'Networking'},
  {value: 'ACTIVITY_PARTNERS', label: 'Activity partners'},
];

/** Limits enforced by the backend validator (`networkingProfile` in gathr-api). */
export const INTRO_MAX_LENGTH = 240;
export const INTEREST_MAX_LENGTH = 40;
export const INTERESTS_MAX = 12;
export const ATTENDEES_PAGE_SIZE = 20;
export const CONNECTIONS_PAGE_SIZE = 50;

/** The viewer's own per-event profile. `GET /networking/me` returns null when they have not opted in. */
export type EventNetworkingProfile = {
  eventId: string;
  optedIn: boolean;
  goals: NetworkingGoal[];
  interests: string[];
  intro: string | null;
  discoverableBeforeEvent: boolean;
  discoverableDuringEvent: boolean;
  discoverableAfterEvent: boolean;
};

/** Body of `PUT /events/:eventId/networking/me` (strict on the server: no other keys). */
export type NetworkingProfileInput = {
  goals: NetworkingGoal[];
  interests: string[];
  intro?: string;
  discoverableBefore: boolean;
  discoverableDuring: boolean;
  discoverableAfter: boolean;
};

/** Raw row the backend returns for `/networking/me` (snake_case straight from the DB). */
export type ApiNetworkingProfile = {
  event_id: string;
  opted_in: boolean;
  goals: NetworkingGoal[];
  interests: string[];
  intro: string | null;
  discoverable_before: boolean;
  discoverable_during: boolean;
  discoverable_after: boolean;
};

/** Row of `GET /networking/attendees`: only the safe card fields, never exact distance or private profile data. */
export type NetworkingAttendee = {
  id: string;
  name: string;
  avatarUrl: string | null;
  goals: NetworkingGoal[];
  interests: string[];
  intro: string | null;
};

/** Row of `GET /networking/connections`. A row with `acceptedAt: null` is a pending request. */
export type NetworkingConnection = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  intro: string | null;
  goals: NetworkingGoal[];
  interests: string[];
  requestedBy: string;
  acceptedAt: string | null;
  createdAt: string;
};

/** `POST /networking/connections/:userId` */
export type ConnectResult = {connected: boolean; pending?: boolean; createdAt?: string};

export type ConnectionState = 'none' | 'connected' | 'requested' | 'incoming';

export type AttendeeFilters = {goal?: NetworkingGoal; interest?: string};

export type NetworkingPage<T> = {items: T[]; hasMore: boolean; offset: number};
