import {apiRequestPage, apiRequest} from '../../core/api/apiClient';
import type {ApiCreditOverview, ApiCreditPurchase, ApiWorkspace, CreditCheckout, CreditOverview, CreditPack, Workspace} from './types';

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
