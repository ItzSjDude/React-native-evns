import {apiRequest, apiRequestPage} from '../../core/api/apiClient';
import {isLimitReached, openPaywall} from '../plus';
import type {ApiMessage} from './types';

export type DirectMessage = ApiMessage;

/** A 429 `LIMIT_REACHED` (daily new-chat cap) opens the Plus paywall, then still rejects so callers stop their spinner. */
export const startDirectConversation = async (targetUserId: string) => {
  try {
    return await apiRequest<{id: string}>('/conversations/direct', {
      auth: 'required', method: 'POST', body: JSON.stringify({targetUserId}),
    });
  } catch (error) {
    if (isLimitReached(error)) openPaywall(error.details.limit, error.details);
    throw error;
  }
};

export const getDirectMessages = (conversationId: string) =>
  apiRequestPage<DirectMessage[]>(`/conversations/${encodeURIComponent(conversationId)}/messages?limit=50`, {
    auth: 'required',
  });

export const sendDirectMessage = (conversationId: string, body: string) =>
  apiRequest<DirectMessage>(`/conversations/${encodeURIComponent(conversationId)}/messages`, {
    auth: 'required', method: 'POST', body: JSON.stringify({type: 'TEXT', body}),
  });
