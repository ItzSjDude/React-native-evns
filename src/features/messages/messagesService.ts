import {apiRequest, apiRequestPage} from '../../core/api/apiClient';
import type {ApiConversation, Conversation, ConversationPage} from './types';

export const CONVERSATIONS_PAGE_SIZE = 20;

export const toConversation = (row: ApiConversation): Conversation => {
  const direct = row.kind === 'DIRECT';
  const unread = Number(row.unread_count);
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    title: (direct ? row.other_user_name : row.event_title ?? row.workspace_name)?.trim() || (direct ? 'Hiva user' : 'Event chat'),
    avatarUrl: (direct ? row.other_user_avatar_url : row.workspace_logo_url) || null,
    contactId: direct ? row.other_user_id : null,
    unreadCount: Number.isFinite(unread) && unread > 0 ? unread : 0,
    lastActivityAt: row.last_message_at ?? row.created_at,
    lastMessageAt: row.last_message_at,
    lastMessage: row.last_message ?? null,
  };
};

/** `GET /conversations` is offset-paginated and ordered by latest activity. */
export const getConversations = async (offset = 0, limit = CONVERSATIONS_PAGE_SIZE): Promise<ConversationPage> => {
  const page = await apiRequestPage<ApiConversation[]>(`/conversations?limit=${limit}&offset=${offset}`, {auth: 'required'});
  return {
    conversations: page.data.map(toConversation),
    hasMore: page.meta.hasMore,
    nextOffset: offset + page.data.length,
  };
};

export const markConversationRead = (conversationId: string) =>
  apiRequest<{read: boolean}>(`/conversations/${encodeURIComponent(conversationId)}/read`, {
    auth: 'required', method: 'POST',
  });
