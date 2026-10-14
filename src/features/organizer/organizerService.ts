import {apiRequestPage, apiRequest} from '../../core/api/apiClient';
import type {ApiCreditOverview, ApiCreditPurchase, ApiWorkspace, CreditCheckout, CreditOverview, CreditPack, OrganizerAttendeePage, OrganizerDashboardSummary, OrganizerEvent, OrganizerEventSummary, OrganizerPayouts, Workspace} from './types';
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

/** Creates the workspace's first event as a draft; paid publishing remains verification-gated. */
export const createOrganizerEvent = (workspaceId: string, draft: OrganizerOnboardingDraft) =>
  apiRequest<{event: {id: string; status: string}}>(`/workspaces/${encodeURIComponent(workspaceId)}/events`, {
    auth: 'required', method: 'POST', body: JSON.stringify({
      title: draft.eventName.trim(), startsAt: new Date(`${draft.eventDate}T${draft.eventTime}`).toISOString(),
      description: draft.eventDescription.trim() || undefined, coverUrl: draft.eventCoverUrl,
      venue: draft.venue.trim(), isPaid: draft.ticketType === 'PAID', capacity: Number(draft.capacity), status: 'DRAFT',
    }),
  });

/** Owner/admin dashboard data; backend contract is documented in ORGANIZER_DASHBOARD_API_CONTRACT.md. */
export const getOrganizerDashboard = (workspaceId: string) =>
  apiRequest<OrganizerDashboardSummary>(`/workspaces/${encodeURIComponent(workspaceId)}/organizer-dashboard`, {auth: 'required'});

export const listOrganizerEvents = (workspaceId: string, status: 'UPCOMING' | 'PAST' | 'DRAFT' = 'UPCOMING', offset = 0) =>
  apiRequest<{items: OrganizerEvent[]; hasMore: boolean; offset: number}>(`/workspaces/${encodeURIComponent(workspaceId)}/events?status=${status}&limit=20&offset=${offset}`, {auth: 'required'});

export const getOrganizerEventSummary = (workspaceId: string, eventId: string) =>
  apiRequest<OrganizerEventSummary>(`/workspaces/${encodeURIComponent(workspaceId)}/events/${encodeURIComponent(eventId)}/organizer-summary`, {auth: 'required'});

export const listOrganizerAttendees = (workspaceId: string, eventId: string, input: {limit?: number; offset?: number; search?: string; status?: 'ALL' | 'CHECKED_IN' | 'NOT_CHECKED_IN'}) => {
  const query = new URLSearchParams({limit: String(input.limit ?? 20), offset: String(input.offset ?? 0), status: input.status ?? 'ALL'});
  if (input.search?.trim()) query.set('search', input.search.trim());
  return apiRequest<OrganizerAttendeePage>(`/workspaces/${encodeURIComponent(workspaceId)}/events/${encodeURIComponent(eventId)}/attendees?${query}`, {auth: 'required'});
};

export const checkInOrganizerTicket = (workspaceId: string, eventId: string, ticketCode: string, idempotencyKey: string) =>
  apiRequest<{status: 'CHECKED_IN'; attendeeName: string; ticketLabel: string; checkedInAt: string}>(`/workspaces/${encodeURIComponent(workspaceId)}/events/${encodeURIComponent(eventId)}/check-ins`, {
    auth: 'required', method: 'POST', body: JSON.stringify({ticketCode, idempotencyKey}),
  });

export const getOrganizerPayouts = (workspaceId: string) =>
  apiRequest<OrganizerPayouts>(`/workspaces/${encodeURIComponent(workspaceId)}/payouts`, {auth: 'required'});
