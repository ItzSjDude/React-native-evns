import {apiRequest} from '../../core/api/apiClient';
import {
  ATTENDEES_PAGE_SIZE, CONNECTIONS_PAGE_SIZE, type ApiNetworkingProfile, type AttendeeFilters, type ConnectResult,
  type EventNetworkingProfile, type NetworkingAttendee, type NetworkingConnection, type NetworkingPage,
  type NetworkingProfileInput,
} from './types';

const base = (eventId: string) => `/events/${encodeURIComponent(eventId)}/networking`;

export const toProfile = (row: ApiNetworkingProfile): EventNetworkingProfile => ({
  eventId: row.event_id,
  optedIn: row.opted_in,
  goals: row.goals ?? [],
  interests: row.interests ?? [],
  intro: row.intro ?? null,
  discoverableBeforeEvent: row.discoverable_before,
  discoverableDuringEvent: row.discoverable_during,
  discoverableAfterEvent: row.discoverable_after,
});

/** null when the viewer has not opted in for this event. */
export async function getMyNetworkingProfile(eventId: string): Promise<EventNetworkingProfile | null> {
  const row = await apiRequest<ApiNetworkingProfile | null>(`${base(eventId)}/me`, {auth: 'required'});
  return row && row.opted_in ? toProfile(row) : null;
}

/** Explicit opt-in (or edit): the server flips `opted_in` to true on every PUT. */
export async function saveMyNetworkingProfile(eventId: string, input: NetworkingProfileInput): Promise<EventNetworkingProfile> {
  const row = await apiRequest<ApiNetworkingProfile>(`${base(eventId)}/me`, {auth: 'required', method: 'PUT', body: JSON.stringify(input)});
  return toProfile(row);
}

/** Immediate opt-out. The server also deletes the viewer's connections for this event; the ticket and event chat are untouched. */
export const optOutOfNetworking = (eventId: string) =>
  apiRequest<{optedIn: false}>(`${base(eventId)}/me`, {auth: 'required', method: 'DELETE'});

/** The attendees endpoint returns a bare array (no page meta), so a full page is the only hint that more exist. */
export async function getNetworkingAttendees(
  eventId: string, filters: AttendeeFilters = {}, offset = 0, limit = ATTENDEES_PAGE_SIZE,
): Promise<NetworkingPage<NetworkingAttendee>> {
  const interest = filters.interest?.trim();
  const query = `limit=${limit}&offset=${offset}${filters.goal ? `&goal=${filters.goal}` : ''}${interest ? `&interest=${encodeURIComponent(interest)}` : ''}`;
  const items = await apiRequest<NetworkingAttendee[]>(`${base(eventId)}/attendees?${query}`, {auth: 'required'});
  return {items, hasMore: items.length >= limit, offset};
}

export async function getNetworkingConnections(eventId: string, offset = 0, limit = CONNECTIONS_PAGE_SIZE): Promise<NetworkingPage<NetworkingConnection>> {
  const items = await apiRequest<NetworkingConnection[]>(`${base(eventId)}/connections?limit=${limit}&offset=${offset}`, {auth: 'required'});
  return {items, hasMore: items.length >= limit, offset};
}

export const connectWithAttendee = (eventId: string, userId: string) =>
  apiRequest<ConnectResult>(`${base(eventId)}/connections/${encodeURIComponent(userId)}`, {auth: 'required', method: 'POST'});

export const disconnectFromAttendee = (eventId: string, userId: string) =>
  apiRequest<{disconnected: true}>(`${base(eventId)}/connections/${encodeURIComponent(userId)}`, {auth: 'required', method: 'DELETE'});
