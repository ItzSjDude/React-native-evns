import {apiRequest, apiRequestPage} from '../../core/api/apiClient';
import {EVENTS_PAGE_SIZE, type ApiEvent, type EventDetailResponse, type EventsPage} from './types';

/** Public browse; the token is sent when signed in so the backend can add viewer state. */
export const getEvents = async (offset = 0, limit = EVENTS_PAGE_SIZE, search?: string): Promise<EventsPage> => {
  const query = `limit=${limit}&offset=${offset}${search?.trim() ? `&search=${encodeURIComponent(search.trim())}` : ''}`;
  const page = await apiRequestPage<ApiEvent[]>(`/events?${query}`, {auth: 'optional'});
  return {items: page.data, hasMore: page.meta.hasMore, offset: page.meta.offset};
};

export const getEvent = (eventId: string) =>
  apiRequest<EventDetailResponse>(`/events/${encodeURIComponent(eventId)}`, {auth: 'optional'});

export const setEventInterest = (eventId: string, status: 'INTERESTED' | 'CANCELLED') =>
  apiRequest<{status: string}>(`/events/${encodeURIComponent(eventId)}/interest`, {
    auth: 'required', method: 'POST', body: JSON.stringify({status}),
  });

export type EventTicketRequest =
  | {mode: 'TICKET_ISSUED'; ticket: {id: string; code: string}; conversationId?: string | null}
  | {mode: 'CHAT_OPENED'; conversationId: string};

/** Free events issue a ticket; paid events open an organiser chat for payment instructions. */
export const requestEventTicket = (eventId: string) =>
  apiRequest<EventTicketRequest>(`/events/${encodeURIComponent(eventId)}/purchase`, {auth: 'required', method: 'POST'});
