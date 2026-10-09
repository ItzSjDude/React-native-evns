import type {ApiEvent, EventViewer} from './types';

export const messageOf = (error: unknown) => (error as {message?: string})?.message || 'Please try again.';

export const formatEventWhen = (startsAt: string, endsAt?: string | null) => {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return '';
  const date = start.toLocaleDateString(undefined, {weekday: 'short', month: 'short', day: 'numeric'});
  const time = (d: Date) => d.toLocaleTimeString(undefined, {hour: 'numeric', minute: '2-digit'});
  const end = endsAt ? new Date(endsAt) : null;
  return end && !Number.isNaN(end.getTime()) ? `${date}, ${time(start)} - ${time(end)}` : `${date}, ${time(start)}`;
};

export const formatEventPrice = (event: Pick<ApiEvent, 'is_paid' | 'price_minor' | 'currency'>) => {
  if (!event.is_paid) return 'Free';
  const amount = event.price_minor / 100;
  try {
    return new Intl.NumberFormat(undefined, {style: 'currency', currency: event.currency, maximumFractionDigits: amount % 1 ? 2 : 0}).format(amount);
  } catch {
    return `${event.currency} ${amount}`;
  }
};

/** The list has no attendee count column; tickets_issued is the closest honest number. */
export const goingLabel = (event: Pick<ApiEvent, 'tickets_issued' | 'capacity'>) => {
  const going = Math.max(0, event.tickets_issued || 0);
  return event.capacity ? `${going} / ${event.capacity} going` : `${going} going`;
};

export const isSoldOut = (event: Pick<ApiEvent, 'tickets_issued' | 'capacity'>) =>
  !!event.capacity && event.tickets_issued >= event.capacity;

/** Read-only summary of the viewer's relationship to the event; null when there is nothing to say. */
export const viewerStatusLabel = (viewer: EventViewer | null | undefined) => {
  if (!viewer) return null;
  if (viewer.ticket) return viewer.ticket.status === 'CHECKED_IN' ? 'You attended' : `You have a ticket (${viewer.ticket.code})`;
  if (viewer.interest === 'REQUESTED') return 'Ticket requested - the organiser will reply in chat';
  if (viewer.interest === 'INTERESTED') return 'You are interested';
  return null;
};
