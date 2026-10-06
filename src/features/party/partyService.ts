import {apiRequest} from '../../core/api/apiClient';

export type PartySeatCount = 4 | 8;

export type PartyRoom = {
  id: string;
  kind: 'AUDIO' | 'VIDEO';
  status: 'ACTIVE' | 'SCHEDULED' | 'ENDED' | 'CANCELLED';
  hostId?: string;
  shareToken?: string | null;
  visibility?: 'PUBLIC' | 'PRIVATE';
  chatEnabled?: boolean; requestsEnabled?: boolean; slowModeSeconds?: number;
  seatCount?: number;
  maxParticipants?: number;
  title: string | null;
  topic: string | null;
  category: string | null;
  language: string | null;
  interestTags: string[];
  host: {id: string; name: string | null; avatarUrl: string | null};
  participantCount: number;
  scheduledStartAt: string | null;
};

export type PartyParticipant = {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  role: 'HOST' | 'CO_HOST' | 'MEMBER';
  muted: boolean;
  videoEnabled: boolean;
  seatIndex: number | null;
  locked: boolean;
  active: boolean;
  joinedAt: string | null;
  leftAt: string | null;
};

export type PartyMedia = {
  provider: 'livekit';
  url: string;
  roomName: string;
  token: string;
  expiresAt: string;
};

export type JoinedParty = {
  party: PartyRoom & {participants: PartyParticipant[]};
  participants: PartyParticipant[];
  media: PartyMedia;
};

export type PartySeatRequest = {id: string; userId: string; name: string | null; avatarUrl: string | null; status: 'PENDING' | 'APPROVED' | 'DENIED' | 'CANCELLED'; requestedAt: string};
export type PartyChatMessage = {id: string; userId: string; name: string; body: string; createdAt: string};
export type PartySnapshot = {
  party: JoinedParty['party']; participants: PartyParticipant[];
  seatRequests: PartySeatRequest[]; lockedSeats: number[];
  chatMessages: PartyChatMessage[]; realtimeUrl: string | null;
  seatInvitations?: {id: string; seatIndex: number; expiresAt: string}[];
};
export const getPartyRoom = (id: string, signal?: AbortSignal) => apiRequest<PartySnapshot>(`/parties/${id}`, {auth: 'required', signal});
const action = <T = {ok: boolean}>(id: string, path: string, method = 'POST', body?: unknown) => apiRequest<T>(`/parties/${id}${path}`, {auth: 'required', method, ...(body ? {body: JSON.stringify(body)} : {})});
export const endParty = (id: string) => action(id, '/end');
export const approvePartySeat = (id: string, requestId: string, seatIndex: number) => action(id, `/seat-requests/${requestId}/approve`, 'POST', {seatIndex});
export const denyPartySeat = (id: string, requestId: string) => action(id, `/seat-requests/${requestId}/deny`);
export const cancelPartySeatRequest = (id: string, requestId: string) => action(id, `/seat-requests/${requestId}`, 'DELETE');
export const releasePartySeat = (id: string) => action(id, '/seat', 'DELETE');
export const patchPartySeat = (id: string, seatIndex: number, body: {locked?: boolean; muted?: boolean}) => action(id, `/seats/${seatIndex}`, 'PATCH', body);
export const movePartySpeakerToAudience = (id: string, seatIndex: number) => action(id, `/seats/${seatIndex}/kick`);
export const inviteToPartySeat = (id: string, userId: string, seatIndex: number) => action(id, `/seats/${seatIndex}/invite`, 'POST', {userId, requireAcceptance: true});
export const removePartyParticipant = (id: string, userId: string) => action(id, `/participants/${userId}/remove`);
export const setPartyCoHost = (id: string, userId: string, enabled: boolean) => enabled
  ? action(id, '/co-hosts', 'POST', {userId}) : action(id, `/co-hosts/${userId}`, 'DELETE');
export const reportPartyParticipant = (id: string, userId: string, reason: string) => action(id, '/reports', 'POST', {targetUserId: userId, reason});
export const blockPartyParticipant = (id: string, userId: string) => action(id, `/participants/${userId}/block`);

export type PartyFeed = {rooms: PartyRoom[]; nextCursor: string | null};
export type PartyFilter = 'all' | 'trending' | 'following' | 'nearby';
export type PartyDiscoveryOptions = {category?: string; interest?: string; kind?: 'AUDIO' | 'VIDEO'; search?: string; language?: string; filter?: PartyFilter};
export type PartyCursors = {audio: string | null; video: string | null};
export type PartyDiscoveryPage = {rooms: PartyRoom[]; cursors: PartyCursors};
export type CreatePartyInput = {
  title: string; topic: string; kind: 'AUDIO' | 'VIDEO';
  category: string; interestTags: string[]; seatCount?: PartySeatCount;
  visibility?: 'PUBLIC' | 'PRIVATE'; inviteeIds?: string[]; language?: string; scheduledStartAt?: string; timeZone?: string;
};
export type CreatedParty = {
  party: {
    id: string; title: string | null; topic: string | null; kind: 'AUDIO' | 'VIDEO';
    status: 'ACTIVE' | 'SCHEDULED'; category: string | null; interestTags: string[];
    language: string | null; scheduledStartAt: string | null; seatCount?: number;
    visibility?: 'PUBLIC' | 'PRIVATE'; hostId?: string;
  };
  participants: {userId: string; name: string | null; avatarUrl: string | null; role: string}[];
};

const route: Record<PartyFilter, string> = {
  all: '/parties/discover',
  trending: '/parties/discover/trending',
  following: '/parties/discover/following',
  nearby: '/parties/discover/nearby',
};

export const discoverParties = (filter: PartyFilter, cursor?: string, options: PartyDiscoveryOptions = {}) => {
  const params = Object.entries({...options, cursor}).filter(([key, value]) => key !== 'filter' && value !== undefined)
    .map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(value!));
  const query = '?limit=20' + (params.length ? '&' + params.join('&') : '');
  return apiRequest<PartyFeed>(route[filter] + query, {auth: 'required'});
};

export const getPartyDiscoveryPage = async (options: Omit<PartyDiscoveryOptions, 'kind'>, cursors?: PartyCursors): Promise<PartyDiscoveryPage> => {
  const result = await discoverParties(options.filter || 'all', cursors?.audio || undefined, {...options, kind: 'AUDIO'});
  return {rooms: result.rooms, cursors: {audio: result.nextCursor, video: null}};
};

export const createParty = (input: CreatePartyInput) => apiRequest<CreatedParty>('/parties', {
  auth: 'required', method: 'POST',
  body: JSON.stringify({...input, inviteeIds: input.inviteeIds ?? [], visibility: input.visibility ?? 'PUBLIC', seatCount: input.seatCount ?? (input.kind === 'VIDEO' ? 4 : 8)}),
});

export const joinParty = (partyId: string) => apiRequest<JoinedParty>(`/parties/${partyId}/join`, {
  auth: 'required', method: 'POST',
});

export const setPartyState = (partyId: string, state: {muted: boolean}) => apiRequest<{muted: boolean; videoEnabled: boolean}>(`/parties/${partyId}/state`, {
  auth: 'required', method: 'PATCH', body: JSON.stringify(state),
});

export const leaveParty = (partyId: string) => apiRequest<{ok: boolean}>(`/parties/${partyId}/leave`, {
  auth: 'required', method: 'POST',
});

export const requestPartySeat = (partyId: string) => apiRequest<{id: string; status: string}>(`/parties/${partyId}/seat-requests`, {
  auth: 'required', method: 'POST',
});

export const createPartyShareLink = (partyId: string) => apiRequest<{shareToken: string; link: string}>(`/parties/${partyId}/share`, {
  auth: 'required', method: 'GET',
});

export const sendPartyChat = (partyId: string, body: string) => apiRequest<{ok: boolean; message: PartyChatMessage}>(`/parties/${partyId}/chat`, {
  auth: 'required', method: 'POST', body: JSON.stringify({body}),
});

export type PartyRoomSettings = {title?: string; topic?: string; chatEnabled?: boolean; requestsEnabled?: boolean; slowModeSeconds?: number};
export const updatePartySettings = (id: string, settings: PartyRoomSettings) => action(id, '/settings', 'PATCH', settings);
export const respondPartyInvitation = (id: string, invitationId: string, accept: boolean) => action(id, `/seat-invitations/${invitationId}/${accept ? 'accept' : 'decline'}`);
export const deletePartyChat = (id: string, messageId: string) => action(id, `/chat/${messageId}`, 'DELETE');
export const setPartyReminder = (id: string, enabled: boolean) => action(id, '/reminder', enabled ? 'POST' : 'DELETE');
export const startScheduledParty = (id: string) => action(id, '/schedule/start');
export const cancelScheduledParty = (id: string) => action(id, '/schedule/cancel');
export const getPartyInvitees = async () => {
  const page = await apiRequest<{userId: string; name: string | null; avatarUrl: string | null}[]>('/parties/invitees?limit=50', {auth: 'required'});
  return page.map(person=>({id:person.userId,name:person.name,avatarUrl:person.avatarUrl}));
};
export const getSharedParty = async (token: string): Promise<PartyRoom> => {
  const result = await apiRequest<{party: PartyRoom; host: PartyRoom['host']; participantCount: number}>(`/parties/share/${token}`, {auth: 'required'});
  return {...result.party, host: result.host, participantCount: result.participantCount};
};

export const transferPartyHost = (id: string, userId: string) => action(id, '/host', 'POST', {userId});
