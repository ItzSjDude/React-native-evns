import {apiRequestPage, apiRequest} from '../../core/api/apiClient';
import type {ApiCreditOverview, ApiCreditPurchase, ApiEventStats, ApiOrganizerAttendee, ApiOrganizerEvent, ApiVerifyResponse, ApiWorkspace, CreditCheckout, CreditOverview, CreditPack, OrganizerAttendeeFilter, OrganizerAttendeePage, OrganizerCheckIn, OrganizerDashboardSummary, OrganizerEvent, OrganizerEventFilter, OrganizerEventStats, OrganizerEventStatus, OrganizerPayoutAccount, Workspace} from './types';
import type {OrganizerOnboardingDraft} from './types';

export const LEDGER_PAGE_SIZE = 20;

const toWorkspace = (row: ApiWorkspace): Workspace => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  description: row.description ?? null,
  logoUrl: row.logo_url ?? null,
  ticketBalance: Number(row.ticket_balance) || 0,
  status: row.status,
  role: row.role,
  verificationStatus: row.verification_status ?? 'NOT_SUBMITTED',
  memberCount: row.member_count == null ? null : Number(row.member_count),
});

const toCreditOverview = (data: ApiCreditOverview): CreditOverview => ({
  balance: Number(data.balance) || 0,
  ledger: data.ledger.map(row => ({
    id: row.id, delta: row.delta, balanceAfter: row.balance_after, reason: row.reason, createdAt: row.created_at,
  })),
  recentPurchases: data.recentPurchases.map(row => ({
    id: row.id, quantity: row.quantity, amountMinor: row.amount_minor, currency: row.currency,
    status: row.status, packKey: row.pack_key, createdAt: row.created_at, paidAt: row.paid_at,
  })),
});

const toCreditPurchase = (row: ApiCreditPurchase) => ({
  id: row.id, quantity: row.quantity, amountMinor: row.amount_minor, currency: row.currency,
  status: row.status, packKey: row.pack_key, createdAt: row.created_at, paidAt: row.paid_at,
});

/** Workspaces the viewer is an active member of, each with their role in it. */
export async function listMyWorkspaces(): Promise<Workspace[]> {
  const page = await apiRequestPage<ApiWorkspace[]>('/workspaces?limit=50', {auth: 'required'});
  return page.data.map(toWorkspace);
}

/**
 * Balance, recent ledger movements and recent purchase attempts for one workspace.
 * ADMIN/OWNER only; the server returns 403 for a MEMBER/SCANNER caller.
 */
export async function getCreditOverview(workspaceId: string, offset = 0, limit = LEDGER_PAGE_SIZE): Promise<CreditOverview> {
  const data = await apiRequest<ApiCreditOverview>(
    `/workspaces/${encodeURIComponent(workspaceId)}/credits?limit=${limit}&offset=${offset}`,
    {auth: 'required'},
  );
  return toCreditOverview(data);
}

/** The server catalog is the sole source of pack quantities and prices. */
export function listCreditPacks(workspaceId: string): Promise<CreditPack[]> {
  return apiRequest<CreditPack[]>(`/workspaces/${encodeURIComponent(workspaceId)}/credit-packs`, {auth: 'required'});
}

/** Create an idempotent Razorpay order for a catalog pack. The server decides amount and quantity. */
export async function startCreditPackPurchase(workspaceId: string, packKey: string, idempotencyKey: string): Promise<{purchase: ReturnType<typeof toCreditPurchase>; checkout: CreditCheckout}> {
  const data = await apiRequest<{purchase: ApiCreditPurchase; checkout: CreditCheckout}>(
    `/workspaces/${encodeURIComponent(workspaceId)}/credits/purchases`,
    {auth: 'required', method: 'POST', body: JSON.stringify({packKey, idempotencyKey})},
  );
  return {purchase: toCreditPurchase(data.purchase), checkout: data.checkout};
}

/** Creates the workspace used by organiser tools. Older API responses return the workspace row directly. */
export const createOrganizerWorkspace = async (draft: OrganizerOnboardingDraft): Promise<ApiWorkspace> => {
  const result = await apiRequest<ApiWorkspace | {workspace?: ApiWorkspace}>('/workspaces', {
    auth: 'required', method: 'POST', body: JSON.stringify({
    name: draft.organizationName.trim(), type: draft.organizationType, city: draft.city.trim(),
    eventKinds: draft.eventKinds.map(kind => kind.toUpperCase().replace(/\s+/g, '_')), logoUrl: draft.logoUrl,
    }),
  });
  const workspace = result && typeof result === 'object' && 'workspace' in result && result.workspace
    ? result.workspace : result as ApiWorkspace;
  if (!workspace || typeof workspace.id !== 'string' || !workspace.id) {
    throw new Error('The organisation was created, but the server did not return its ID. Refresh your workspaces before trying again.');
  }
  return workspace;
};

export const updateOrganizerWorkspace = (workspaceId: string, draft: OrganizerOnboardingDraft) => apiRequest<{workspace: ApiWorkspace}>(`/workspaces/${encodeURIComponent(workspaceId)}`, {
  auth: 'required', method: 'PATCH', body: JSON.stringify({
    name: draft.organizationName.trim(), type: draft.organizationType, city: draft.city.trim(),
    eventKinds: draft.eventKinds.map(kind => kind.toUpperCase().replace(/\s+/g, '_')), logoUrl: draft.logoUrl,
  }),
});

/** Submits a private identity document for workspace review. */
export const submitOrganizerVerification = (workspaceId: string, input: {documentType: OrganizerOnboardingDraft['verificationType']; fileUrl: string}) =>
  apiRequest<{status: 'PENDING' | 'APPROVED' | 'REJECTED'}>(`/workspaces/${encodeURIComponent(workspaceId)}/verification`, {
    auth: 'required', method: 'POST', body: JSON.stringify(input),
  });

/** Bank details are sent only to the payout setup route and must be masked in responses/logs. */
export const saveOrganizerPayoutAccount = (workspaceId: string, draft: OrganizerOnboardingDraft) =>
  apiRequest<{status: 'PENDING' | 'VERIFIED'}>(`/workspaces/${encodeURIComponent(workspaceId)}/payout-account`, {
    auth: 'required', method: 'PUT', body: JSON.stringify({
      accountHolder: draft.accountHolder.trim(), accountNumber: draft.accountNumber,
      ifsc: draft.ifsc.trim().toUpperCase(), payoutSchedule: draft.payoutSchedule,
    }),
  });

/**
 * Masked payout account status for the organiser. Resolves `null` ("unknown") when the route is not
 * deployed yet (404), so callers show nothing and keep the existing behaviour. Other failures reject.
 */
export const getPayoutAccountStatus = (workspaceId: string): Promise<OrganizerPayoutAccount | null> =>
  apiRequest<OrganizerPayoutAccount>(`/workspaces/${encodeURIComponent(workspaceId)}/payout-account`, {auth: 'required'})
    .catch((error: unknown) => {
      if ((error as {status?: number} | null)?.status === 404) return null;
      throw error;
    });

/** Creates the workspace's first event as a draft; paid publishing remains verification-gated. */
export const createOrganizerEvent = (workspaceId: string, draft: OrganizerOnboardingDraft) =>
  apiRequest<{event: {id: string; status: string}}>(`/workspaces/${encodeURIComponent(workspaceId)}/events`, {
    auth: 'required', method: 'POST', body: JSON.stringify({
      title: draft.eventName.trim(), startsAt: new Date(`${draft.eventDate}T${draft.eventTime}`).toISOString(),
      description: draft.eventDescription.trim() || undefined, coverUrl: draft.eventCoverUrl,
      venue: draft.venue.trim(), isPaid: draft.ticketType === 'PAID', capacity: Number(draft.capacity), status: 'DRAFT',
    }),
  });

const DASHBOARD_EVENT_CAP = 5;
const EVENTS_PAGE_SIZE = 20;
const FILTER_STATUS: Record<OrganizerEventFilter, OrganizerEventStatus> = {UPCOMING: 'PUBLISHED', PAST: 'COMPLETED', DRAFT: 'DRAFT'};
const count = (value: number | string | null | undefined) => Number(value) || 0;

const toOrganizerEvent = (row: ApiOrganizerEvent): OrganizerEvent => ({
  id: row.id, title: row.title, startsAt: row.starts_at, venue: row.venue ?? '', status: row.status, coverUrl: row.cover_url ?? null,
  ticketsSold: count(row.tickets_issued), capacity: row.capacity == null ? null : Number(row.capacity) || 0,
});

/** The backend only accepts DRAFT|PUBLISHED|CANCELLED|COMPLETED, so UPCOMING/PAST are mapped here. */
export async function listOrganizerEvents(workspaceId: string, filter: OrganizerEventFilter = 'UPCOMING', offset = 0, now = Date.now()) {
  const page = await apiRequestPage<ApiOrganizerEvent[]>(
    `/workspaces/${encodeURIComponent(workspaceId)}/events?status=${FILTER_STATUS[filter]}&limit=${EVENTS_PAGE_SIZE}&offset=${offset}`,
    {auth: 'required'},
  );
  let items = page.data.map(toOrganizerEvent);
  if (filter === 'UPCOMING') items = items.filter(event => Date.parse(event.startsAt) >= now).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  return {items, hasMore: page.meta.hasMore, offset: page.meta.offset};
}

export async function getOrganizerEventStats(workspaceId: string, eventId: string): Promise<OrganizerEventStats> {
  const stats = await apiRequest<ApiEventStats>(`/workspaces/${encodeURIComponent(workspaceId)}/events/${encodeURIComponent(eventId)}/stats`, {auth: 'required'});
  return {ticketsSold: count(stats.issued) + count(stats.checked_in), checkedIn: count(stats.checked_in), interested: count(stats.interested), cancelled: count(stats.cancelled)};
}

/** Overview composed client-side: totals over the next few upcoming events. No money figures exist server-side. */
export async function getOrganizerDashboard(workspaceId: string): Promise<OrganizerDashboardSummary> {
  const {items} = await listOrganizerEvents(workspaceId, 'UPCOMING');
  const events = items.slice(0, DASHBOARD_EVENT_CAP);
  const stats = await Promise.all(events.map(event => getOrganizerEventStats(workspaceId, event.id)));
  return {events, ticketsSold: stats.reduce((sum, row) => sum + row.ticketsSold, 0), checkedIn: stats.reduce((sum, row) => sum + row.checkedIn, 0)};
}

/**
 * Attendee list (OWNER/ADMIN). Rejects with the ApiError as-is; a 404 means the route is not deployed
 * yet and callers should hide the list rather than show an error.
 */
export async function listOrganizerAttendees(workspaceId: string, eventId: string, input: {limit?: number; offset?: number; search?: string; status?: OrganizerAttendeeFilter} = {}): Promise<OrganizerAttendeePage> {
  const query = new URLSearchParams({limit: String(input.limit ?? 20), offset: String(input.offset ?? 0), status: input.status ?? 'ALL'});
  const q = input.search?.trim();
  if (q && q.length >= 2) query.set('q', q);
  const page = await apiRequestPage<ApiOrganizerAttendee[]>(`/workspaces/${encodeURIComponent(workspaceId)}/events/${encodeURIComponent(eventId)}/attendees?${query}`, {auth: 'required'});
  return {
    items: page.data.map(row => ({id: row.ticketId, displayName: row.displayName, ticketLabel: row.ticketLabel ?? null, status: row.status, checkedInAt: row.checkedInAt ?? null})),
    hasMore: page.meta.hasMore, offset: page.meta.offset,
  };
}

export const isRouteNotDeployed = (error: unknown) => (error as {status?: number} | null)?.status === 404;

/** Check in a manually typed ticket code through `tickets/verify`. The ticket's email is never read. */
export async function checkInOrganizerTicket(workspaceId: string, eventId: string, ticketCode: string): Promise<OrganizerCheckIn> {
  const data = await apiRequest<ApiVerifyResponse>(`/workspaces/${encodeURIComponent(workspaceId)}/tickets/verify`, {
    auth: 'required', method: 'POST', body: JSON.stringify({code: ticketCode.trim().toUpperCase(), eventId}),
  });
  const known = ['SUCCESS', 'ALREADY_USED', 'INVALID', 'WRONG_EVENT', 'CANCELLED', 'EXPIRED'].includes(data?.result);
  return {
    ok: data?.ok === true && data.result === 'SUCCESS', result: known ? data.result : 'UNKNOWN', message: data?.message ?? '',
    attendeeName: data?.ticket?.attendee_name ?? null, checkedInAt: data?.ticket?.checked_in_at ?? null,
  };
}
