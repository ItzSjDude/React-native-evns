/** Row shape of GET /events and `event` of GET /events/:eventId (snake_case, straight from the DB). */
export type ApiEvent = {
  id: string;
  workspace_id?: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  venue: string | null;
  address: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string | null;
  is_paid: boolean;
  price_minor: number;
  currency: string;
  capacity: number | null;
  tickets_issued: number;
  status: string;
  workspace_name: string | null;
  workspace_logo_url: string | null;
};

export type EventViewer = {
  interest: 'INTERESTED' | 'REQUESTED' | 'TICKETED' | null;
  ticket: {id: string; code: string; status: string} | null;
  conversationId: string | null;
  isStaff: boolean;
};

export type EventDetailResponse = {event: ApiEvent; viewer: EventViewer; stats: unknown | null};
export type EventsPage = {items: ApiEvent[]; hasMore: boolean; offset: number};

export const EVENTS_PAGE_SIZE = 20;
