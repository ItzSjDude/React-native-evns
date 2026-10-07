import {apiRequest, apiRequestPage} from '../../core/api/apiClient';
import type {ApiMessage} from './types';

export type DirectMessage = ApiMessage;

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
