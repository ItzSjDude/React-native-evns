import {apiRequest, apiRequestPage} from '../../core/api/apiClient';

export type EventWaitlistEntry = {
  id: string;
  event_id: string;
  status: 'WAITING' | 'OFFERED' | 'CLAIMED' | 'EXPIRED' | 'LEFT';
  position?: number;
  offer_expires_at: string | null;
  created_at: string;
};

export const getMyWaitlistEntries = async () => {
  const page = await apiRequestPage<EventWaitlistEntry[]>('/waitlist/mine?limit=100&offset=0', {auth: 'required'});
  return page.data;
};

export const joinEventWaitlist = (eventId: string) =>
  apiRequest<EventWaitlistEntry>(`/waitlist/events/${encodeURIComponent(eventId)}/join`, {auth: 'required', method: 'POST'});

export const leaveEventWaitlist = (eventId: string) =>
  apiRequest<EventWaitlistEntry>(`/waitlist/events/${encodeURIComponent(eventId)}/leave`, {auth: 'required', method: 'DELETE'});

export const claimWaitlistOffer = (entryId: string) =>
  apiRequest<EventWaitlistEntry>(`/waitlist/entries/${encodeURIComponent(entryId)}/claim`, {auth: 'required', method: 'POST'});
