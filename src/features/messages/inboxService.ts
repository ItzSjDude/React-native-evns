import {apiRequest, apiRequestPage} from '../../core/api/apiClient';
import {toConversation} from './messagesService';
import type {
  ApiInboxConversation, ApiInboxRow, ApiPartyChat, ApiPartyRequest, InboxFolder, InboxItem, InboxPage, InboxQuery,
  InboxStatePatch, InboxStateResult, PartyChat, PartyRequest, PartyStatePatch, PartyStateResult,
} from './types';

export const INBOX_PAGE_SIZE = 20;
/** The API caps `limit` at 50. */
export const INBOX_MAX_PAGE_SIZE = 50;
export const MAX_FOLDERS = 10;
export const MAX_PINS = 5;
export const MAX_FOLDER_NAME = 32;

const toPartyChat = (row: ApiPartyChat): PartyChat => {
  const unread = Number(row.unread_count);
  return {
    type: 'PARTY',
    id: row.id,
    title: row.title?.trim() || row.topic?.trim() || 'Party room',
    hostName: row.host_name?.trim() || 'Hiva user',
    avatarUrl: row.host_avatar_url || null,
    participantCount: Number(row.participant_count) || 0,
    unreadCount: Number.isFinite(unread) && unread > 0 ? unread : 0,
    lastActivityAt: row.last_activity_at ?? row.created_at,
    preview: row.last_message?.body ?? null,
    archived: row.is_archived === true,
    ended: !!row.ended_at,
  };
};

const toPartyRequest = (row: ApiPartyRequest): PartyRequest => ({
  type: 'PARTY_REQUEST',
  id: row.id,
  partyId: row.party_id,
  requesterName: row.requester_name?.trim() || 'Hiva user',
  avatarUrl: row.requester_avatar_url || null,
  partyTitle: row.party_title?.trim() || 'Party room',
  requestedAt: row.requested_at,
});

/** Rows are told apart by `type`; conversation rows have none. */
export const toInboxItem = (row: ApiInboxRow): InboxItem => {
  const type = (row as {type?: string}).type;
  if (type === 'PARTY') return toPartyChat(row as ApiPartyChat);
  if (type === 'PARTY_REQUEST') return toPartyRequest(row as ApiPartyRequest);
  return toConversation(row as ApiInboxConversation);
};

const queryString = ({view, folderId}: InboxQuery, offset: number, limit: number) =>
  `view=${view}${view === 'folder' && folderId ? `&folderId=${encodeURIComponent(folderId)}` : ''}&limit=${limit}&offset=${offset}`;

/** `GET /conversations/inbox`: offset-paginated; pinned rows first, then latest activity. */
export const getInbox = async (query: InboxQuery, offset = 0, limit = INBOX_PAGE_SIZE): Promise<InboxPage> => {
  const page = await apiRequestPage<ApiInboxRow[]>(`/conversations/inbox?${queryString(query, offset, limit)}`, {auth: 'required'});
  return {items: page.data.map(toInboxItem), hasMore: page.meta.hasMore, nextOffset: offset + page.data.length};
};

const json = (method: string, body?: unknown) => ({auth: 'required' as const, method, ...(body === undefined ? {} : {body: JSON.stringify(body)})});

/** Folders are Plus only: 403 `PLUS_REQUIRED` for a free account. */
export const getFolders = () => apiRequest<InboxFolder[]>('/conversations/inbox/folders', {auth: 'required'});
export const createFolder = (name: string) => apiRequest<InboxFolder>('/conversations/inbox/folders', json('POST', {name}));
export const renameFolder = (folderId: string, name: string) =>
  apiRequest<InboxFolder>(`/conversations/inbox/folders/${encodeURIComponent(folderId)}`, json('PATCH', {name}));
export const deleteFolder = (folderId: string) =>
  apiRequest<{deleted: boolean}>(`/conversations/inbox/folders/${encodeURIComponent(folderId)}`, json('DELETE'));

/** Per-user state; never affects the other participant. Pinning and folders need Plus, archiving does not. */
export const updateConversationState = (conversationId: string, patch: InboxStatePatch) =>
  apiRequest<InboxStateResult>(`/conversations/inbox/${encodeURIComponent(conversationId)}/inbox-state`, json('PATCH', patch));
export const updatePartyState = (partyId: string, patch: PartyStatePatch) =>
  apiRequest<PartyStateResult>(`/conversations/inbox/parties/${encodeURIComponent(partyId)}/state`, json('PATCH', patch));
