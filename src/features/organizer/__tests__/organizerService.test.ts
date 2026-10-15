import {apiRequest, apiRequestPage} from '../../../core/api/apiClient';
import {getCreditOverview, listCreditPacks, listMyWorkspaces, startCreditPackPurchase} from '../organizerService';
import type {ApiCreditOverview, ApiWorkspace} from '../types';

jest.mock('../../../core/api/apiClient', () => ({apiRequest: jest.fn(), apiRequestPage: jest.fn()}));

beforeEach(() => jest.clearAllMocks());

test('listMyWorkspaces hits the documented route and maps snake_case rows', async () => {
  const row: ApiWorkspace = {
    id: 'w1', name: 'Acme', slug: 'acme', description: null, logo_url: null,
    ticket_balance: 40, status: 'ACTIVE', role: 'OWNER', member_count: '3',
  };
  (apiRequestPage as jest.Mock).mockResolvedValueOnce({data: [row], meta: {limit: 50, offset: 0, hasMore: false}});
  const workspaces = await listMyWorkspaces();
  expect(apiRequestPage).toHaveBeenCalledWith('/workspaces?limit=50', {auth: 'required'});
  expect(workspaces).toEqual([{
    id: 'w1', name: 'Acme', slug: 'acme', description: null, logoUrl: null,
    ticketBalance: 40, status: 'ACTIVE', role: 'OWNER', memberCount: 3, verificationStatus: 'NOT_SUBMITTED',
  }]);
});

test('listMyWorkspaces defaults a missing member count to null', async () => {
  const row: ApiWorkspace = {id: 'w1', name: 'Acme', slug: 'acme', description: null, logo_url: null, ticket_balance: 0, status: 'ACTIVE', role: 'MEMBER'};
  (apiRequestPage as jest.Mock).mockResolvedValueOnce({data: [row], meta: {limit: 50, offset: 0, hasMore: false}});
  const [workspace] = await listMyWorkspaces();
  expect(workspace.memberCount).toBeNull();
});

test('getCreditOverview hits the documented route and maps ledger/purchase rows', async () => {
  const data: ApiCreditOverview = {
    balance: 12,
    ledger: [{id: 'l1', delta: -2, balance_after: 12, reason: 'ISSUE', reference_type: null, reference_id: null, created_at: '2026-01-01T00:00:00Z'}],
    recentPurchases: [{id: 'p1', quantity: 20, amount_minor: 2500, currency: 'INR', status: 'PAID', pack_key: 'starter', created_at: '2026-01-01T00:00:00Z', paid_at: '2026-01-01T00:05:00Z'}],
  };
  (apiRequest as jest.Mock).mockResolvedValueOnce(data);
  const overview = await getCreditOverview('w1');
  expect(apiRequest).toHaveBeenCalledWith('/workspaces/w1/credits?limit=20&offset=0', {auth: 'required'});
  expect(overview).toEqual({
    balance: 12,
    ledger: [{id: 'l1', delta: -2, balanceAfter: 12, reason: 'ISSUE', createdAt: '2026-01-01T00:00:00Z'}],
    recentPurchases: [{id: 'p1', quantity: 20, amountMinor: 2500, currency: 'INR', status: 'PAID', packKey: 'starter', createdAt: '2026-01-01T00:00:00Z', paidAt: '2026-01-01T00:05:00Z'}],
  });
});

test('getCreditOverview encodes the workspace id and respects pagination args', async () => {
  (apiRequest as jest.Mock).mockResolvedValueOnce({balance: 0, ledger: [], recentPurchases: []});
  await getCreditOverview('w 2', 40, 10);
  expect(apiRequest).toHaveBeenCalledWith('/workspaces/w%202/credits?limit=10&offset=40', {auth: 'required'});
});

test('listCreditPacks reads the server catalog for the selected workspace', async () => {
  const packs = [{key: 'tickets_100', quantity: 100, amountMinor: 14900, currency: 'INR'}];
  (apiRequest as jest.Mock).mockResolvedValueOnce(packs);

  await expect(listCreditPacks('w 2')).resolves.toEqual(packs);
  expect(apiRequest).toHaveBeenCalledWith('/workspaces/w%202/credit-packs', {auth: 'required'});
});

test('startCreditPackPurchase sends only pack key and idempotency key, then maps authoritative order data', async () => {
  (apiRequest as jest.Mock).mockResolvedValueOnce({
    purchase: {id: 'purchase-1', quantity: 100, amount_minor: 14900, currency: 'INR', status: 'PENDING', pack_key: 'tickets_100', created_at: 'now', paid_at: null},
    checkout: {provider: 'razorpay', orderId: 'order-1', amountMinor: 14900, currency: 'INR', keyId: 'rzp_test_key'},
  });

  await expect(startCreditPackPurchase('w1', 'tickets_100', 'credit-pack:test:unique-key')).resolves.toEqual({
    purchase: {id: 'purchase-1', quantity: 100, amountMinor: 14900, currency: 'INR', status: 'PENDING', packKey: 'tickets_100', createdAt: 'now', paidAt: null},
    checkout: {provider: 'razorpay', orderId: 'order-1', amountMinor: 14900, currency: 'INR', keyId: 'rzp_test_key'},
  });
  expect(apiRequest).toHaveBeenCalledWith('/workspaces/w1/credits/purchases', {
    auth: 'required', method: 'POST', body: JSON.stringify({packKey: 'tickets_100', idempotencyKey: 'credit-pack:test:unique-key'}),
  });
});
