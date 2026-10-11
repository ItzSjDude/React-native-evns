import {apiRequest, apiRequestPage} from '../../core/api/apiClient';
import type {ApiMessage} from './types';

export type DirectMessage = ApiMessage;

/** A 429 `LIMIT_REACHED` (daily new-chat cap) opens the Plus paywall via PlusProvider's error listener. */
export const startDirectConversation = (targetUserId: string) =>
  apiRequest<{id: string}>('/conversations/direct', {
    auth: 'required', method: 'POST', body: JSON.stringify({targetUserId}),
  });

export const getDirectMessages = (conversationId: string) =>
  apiRequestPage<DirectMessage[]>(`/conversations/${encodeURIComponent(conversationId)}/messages?limit=50`, {
    auth: 'required',
  });

export const sendDirectMessage = (conversationId: string, body: string) =>
  apiRequest<DirectMessage>(`/conversations/${encodeURIComponent(conversationId)}/messages`, {
    auth: 'required', method: 'POST', body: JSON.stringify({type: 'TEXT', body}),
  });
