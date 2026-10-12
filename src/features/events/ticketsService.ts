import {apiRequest, apiRequestPage} from '../../core/api/apiClient';

export type Ticket = {
  id: string;
  code: string;
  status: 'ISSUED' | 'CHECKED_IN' | 'CANCELLED' | 'EXPIRED' | string;
  issued_at: string;
  event_id: string;
  event_title: string;
  event_starts_at: string;
  event_ends_at: string | null;
  event_venue: string | null;
  event_address: string | null;
  event_cover_url: string | null;
  event_timezone: string | null;
  workspace_name: string;
  attendee_name?: string;
  qrPayload?: string;
  qrImageDataUrl?: string;
};

export type TicketPage = {items: Ticket[]; hasMore: boolean; offset: number};

export async function listMyTickets(offset = 0, limit = 20, upcoming = true): Promise<TicketPage> {
  const page = await apiRequestPage<Ticket[]>(`/tickets?upcoming=${upcoming}&limit=${limit}&offset=${offset}`, {auth: 'required'});
  return {items: page.data, hasMore: page.meta.hasMore, offset: page.meta.offset};
}

export const getMyTicket = (ticketId: string) =>
  apiRequest<Ticket>(`/tickets/${encodeURIComponent(ticketId)}?includeImage=true`, {auth: 'required'});

export const cancelMyTicket = (ticketId: string, reason = 'Cancelled by attendee') =>
  apiRequest<Ticket>(`/tickets/${encodeURIComponent(ticketId)}/cancel`, {
    auth: 'required', method: 'POST', body: JSON.stringify({reason}),
  });
