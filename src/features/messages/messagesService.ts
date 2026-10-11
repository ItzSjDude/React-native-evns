import {apiRequest} from '../../core/api/apiClient';
import type {ApiInboxConversation, Conversation} from './types';

export const toConversation = (row: ApiInboxConversation): Conversation => {
  const direct = row.kind === 'DIRECT';
  const unread = Number(row.unread_count);
  return {
    type: 'CONVERSATION',
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
    folderId: row.folder_id ?? null,
    folderName: row.folder_name ?? null,
    pinned: row.is_pinned === true,
    archived: row.is_archived === true,
  };
};

export const markConversationRead = (conversationId: string) =>
  apiRequest<{read: boolean}>(`/conversations/${encodeURIComponent(conversationId)}/read`, {
    auth: 'required', method: 'POST',
  });
