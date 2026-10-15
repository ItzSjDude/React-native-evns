import {apiRequest} from '../../core/api/apiClient';
import type {ApiConversationDetail, ApiInboxConversation, ApiPaymentCard, Conversation} from './types';

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

/** `GET /conversations/:id`: the thread row, the caller's side and its payment cards. Reading it marks the thread read on the server. */
export const getConversationDetail = (conversationId: string) =>
  apiRequest<ApiConversationDetail>(`/conversations/${encodeURIComponent(conversationId)}`, {auth: 'required'});

/** Attendee claims a SHARED card as paid. The optional reference is trimmed and capped at 120 characters. */
export const markPaymentCardPaid = (cardId: string, reference?: string) => {
  const trimmed = reference?.trim().slice(0, 120);
  return apiRequest<ApiPaymentCard>(`/payment-cards/${encodeURIComponent(cardId)}/mark-paid`, {
    auth: 'required', method: 'POST', body: JSON.stringify(trimmed ? {reference: trimmed} : {}),
  });
};
