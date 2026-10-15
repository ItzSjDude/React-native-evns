import {apiRequest, apiRequestPage} from '../../../core/api/apiClient';
import {checkInOrganizerTicket, getCreditOverview, getOrganizerDashboard, getOrganizerEventStats, isRouteNotDeployed, listCreditPacks, listMyWorkspaces, listOrganizerAttendees, getPayoutAccountStatus, listOrganizerEvents, startCreditPackPurchase} from '../organizerService';
import {cancelPaymentCard, confirmPaymentCard, getOrganizerEventPrice, listSalesThreads, sharePaymentDetails, shareTicket} from '../organizerService';
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

const evRow = (id: string, startsAt: string, extra: Record<string, unknown> = {}) => ({id, title: id, starts_at: startsAt, venue: 'Hall', cover_url: null, status: 'PUBLISHED', capacity: '100', tickets_issued: '7', ...extra});
const meta = {limit: 20, offset: 0, hasMore: false};

test.each([['UPCOMING', 'PUBLISHED'], ['PAST', 'COMPLETED'], ['DRAFT', 'DRAFT']] as const)('listOrganizerEvents maps %s to backend status %s', async (filter, status) => {
  (apiRequestPage as jest.Mock).mockResolvedValueOnce({data: [], meta});
  await listOrganizerEvents('w 1', filter, 20);
  expect(apiRequestPage).toHaveBeenCalledWith(`/workspaces/w%201/events?status=${status}&limit=20&offset=20`, {auth: 'required'});
});

test('listOrganizerEvents maps rows, drops past published events and sorts upcoming ascending', async () => {
  const now = Date.parse('2026-06-01T00:00:00Z');
  (apiRequestPage as jest.Mock).mockResolvedValueOnce({data: [evRow('late', '2026-08-01T00:00:00Z'), evRow('old', '2026-01-01T00:00:00Z'), evRow('soon', '2026-07-01T00:00:00Z', {capacity: null})], meta: {limit: 20, offset: 0, hasMore: true}});
  const page = await listOrganizerEvents('w1', 'UPCOMING', 0, now);
  expect(page.items.map(e => e.id)).toEqual(['soon', 'late']);
  expect(page.items[0]).toEqual({id: 'soon', title: 'soon', startsAt: '2026-07-01T00:00:00Z', venue: 'Hall', status: 'PUBLISHED', coverUrl: null, ticketsSold: 7, capacity: null});
  expect(page.hasMore).toBe(true);
});

test('getOrganizerEventStats reads the stats route and sums issued + checked_in', async () => {
  (apiRequest as jest.Mock).mockResolvedValueOnce({interested: '4', issued: '3', checked_in: 2, cancelled: '1', conversations: 0});
  await expect(getOrganizerEventStats('w1', 'e/1')).resolves.toEqual({ticketsSold: 5, checkedIn: 2, interested: 4, cancelled: 1});
  expect(apiRequest).toHaveBeenCalledWith('/workspaces/w1/events/e%2F1/stats', {auth: 'required'});
});

test('getOrganizerDashboard totals the next 5 upcoming events and never calls payouts or the dropped routes', async () => {
  const future = (n: number) => evRow(`e${n}`, new Date(Date.now() + n * 86400000).toISOString());
  (apiRequestPage as jest.Mock).mockResolvedValueOnce({data: [1, 2, 3, 4, 5, 6, 7].map(future), meta});
  (apiRequest as jest.Mock).mockResolvedValue({interested: 0, issued: 1, checked_in: 1, cancelled: 0, conversations: 0});
  const summary = await getOrganizerDashboard('w1');
  expect(summary.events).toHaveLength(5);
  expect(summary).toMatchObject({ticketsSold: 10, checkedIn: 5});
  expect(Object.keys(summary).sort()).toEqual(['checkedIn', 'events', 'ticketsSold']);
  const paths = [...(apiRequest as jest.Mock).mock.calls, ...(apiRequestPage as jest.Mock).mock.calls].map(c => c[0] as string);
  expect(paths.every(p => !/payouts|organizer-dashboard|organizer-summary|check-ins/.test(p))).toBe(true);
  expect((apiRequest as jest.Mock)).toHaveBeenCalledTimes(5);
});

test('listOrganizerAttendees uses the new route with q/status paging and maps rows without email', async () => {
  (apiRequestPage as jest.Mock).mockResolvedValueOnce({data: [{ticketId: 't1', displayName: 'Ravi K.', status: 'ISSUED', issuedAt: 'x', checkedInAt: null}], meta: {limit: 20, offset: 0, hasMore: false}});
  const page = await listOrganizerAttendees('w1', 'e1', {search: ' ra ', status: 'NOT_CHECKED_IN', offset: 0});
  expect(apiRequestPage).toHaveBeenCalledWith('/workspaces/w1/events/e1/attendees?limit=20&offset=0&status=NOT_CHECKED_IN&q=ra', {auth: 'required'});
  expect(page.items).toEqual([{id: 't1', displayName: 'Ravi K.', ticketLabel: null, status: 'ISSUED', checkedInAt: null}]);
  expect(JSON.stringify(page)).not.toMatch(/email/i);
});

test('listOrganizerAttendees omits a too-short q and surfaces 404 so callers can hide the list', async () => {
  (apiRequestPage as jest.Mock).mockRejectedValueOnce({status: 404, message: 'Not found'});
  const failure = await listOrganizerAttendees('w1', 'e1', {search: 'a'}).catch(e => e);
  expect(apiRequestPage).toHaveBeenCalledWith('/workspaces/w1/events/e1/attendees?limit=20&offset=0&status=ALL', {auth: 'required'});
  expect(isRouteNotDeployed(failure)).toBe(true);
  expect(isRouteNotDeployed({status: 500})).toBe(false);
});

test('checkInOrganizerTicket posts code + eventId to tickets/verify and keeps no email', async () => {
  (apiRequest as jest.Mock).mockResolvedValueOnce({ok: true, result: 'SUCCESS', message: 'Welcome', ticket: {attendee_name: 'Neha', attendee_email: 'n@x.in', checked_in_at: 't'}});
  const result = await checkInOrganizerTicket('w1', 'e1', ' gthr-7k2m-9qx4 ');
  expect(apiRequest).toHaveBeenCalledWith('/workspaces/w1/tickets/verify', {auth: 'required', method: 'POST', body: JSON.stringify({code: 'GTHR-7K2M-9QX4', eventId: 'e1'})});
  expect(result).toEqual({ok: true, result: 'SUCCESS', message: 'Welcome', attendeeName: 'Neha', checkedInAt: 't'});
  expect(JSON.stringify(result)).not.toMatch(/email|n@x/i);
});

test.each(['ALREADY_USED', 'INVALID', 'WRONG_EVENT', 'CANCELLED', 'EXPIRED'] as const)('checkInOrganizerTicket reports refusal %s as not ok', async code => {
  (apiRequest as jest.Mock).mockResolvedValueOnce({ok: false, result: code, message: 'm'});
  await expect(checkInOrganizerTicket('w1', 'e1', 'ABCD')).resolves.toMatchObject({ok: false, result: code});
});

test('checkInOrganizerTicket treats an unknown verdict as UNKNOWN, never success', async () => {
  (apiRequest as jest.Mock).mockResolvedValueOnce({ok: true, result: 'WHATEVER'});
  await expect(checkInOrganizerTicket('w1', 'e1', 'ABCD')).resolves.toMatchObject({ok: false, result: 'UNKNOWN'});
});

describe('getPayoutAccountStatus', () => {
  test('reads the masked payout account route for the workspace', async () => {
    const account = {status: 'PENDING', accountSuffix: '1234', payoutSchedule: 'EVERY_MONDAY', rejectionReason: null, updatedAt: '2026-01-01T00:00:00Z'};
    (apiRequest as jest.Mock).mockResolvedValueOnce(account);
    await expect(getPayoutAccountStatus('w 2')).resolves.toEqual(account);
    expect(apiRequest).toHaveBeenCalledWith('/workspaces/w%202/payout-account', {auth: 'required'});
  });

  test.each(['PENDING', 'VERIFIED', 'REJECTED', 'NOT_SUBMITTED'] as const)('passes through %s and its rejection reason', async status => {
    const rejectionReason = status === 'REJECTED' ? 'Account holder name does not match' : null;
    (apiRequest as jest.Mock).mockResolvedValueOnce({status, accountSuffix: null, payoutSchedule: null, rejectionReason, updatedAt: null});
    await expect(getPayoutAccountStatus('w1')).resolves.toMatchObject({status, rejectionReason});
  });

  test('treats a 404 (API not deployed yet) as unknown instead of an error', async () => {
    (apiRequest as jest.Mock).mockRejectedValueOnce({status: 404, message: 'Not found'});
    await expect(getPayoutAccountStatus('w1')).resolves.toBeNull();
  });

  test('still surfaces other failures so the caller can decide', async () => {
    const failure = {status: 500, message: 'Something went wrong'};
    (apiRequest as jest.Mock).mockRejectedValueOnce(failure);
    await expect(getPayoutAccountStatus('w1')).rejects.toEqual(failure);
  });
});

describe('sales', () => {
  test('listSalesThreads hits the workspace inbox and maps buyer, event and unread', async () => {
    (apiRequestPage as jest.Mock).mockResolvedValueOnce({data: [
      {id: 'c1', status: 'OPEN', event_id: 'e1', event_title: 'Night Run', event_starts_at: null, user_id: 'u1', attendee_name: 'Asha', attendee_avatar_url: null, last_message_at: '2026-10-01T10:00:00Z', created_at: '2026-09-30T10:00:00Z', unread_count: '2'},
      {id: 'c2', status: 'CLOSED', event_id: null, event_title: null, event_starts_at: null, user_id: 'u2', attendee_name: null, attendee_avatar_url: null, last_message_at: null, created_at: '2026-09-30T10:00:00Z', unread_count: 0, last_message: {type: 'PAYMENT_CARD', body: 'secret'}},
    ], meta: {limit: 20, offset: 0, hasMore: true}});
    const page = await listSalesThreads('w 1', {eventId: 'e1'});
    expect(apiRequestPage).toHaveBeenCalledWith('/workspaces/w%201/conversations?limit=20&offset=0&eventId=e1', {auth: 'required'});
    expect(page.hasMore).toBe(true);
    expect(page.items[0]).toMatchObject({id: 'c1', buyerName: 'Asha', eventTitle: 'Night Run', unreadCount: 2, lastActivityAt: '2026-10-01T10:00:00Z', lastMessagePreview: null});
    expect(page.items[1]).toMatchObject({buyerName: 'Buyer', eventTitle: 'Event', eventId: null, lastMessagePreview: 'Payment details shared'});
  });

  test('getOrganizerEventPrice reads the published event price', async () => {
    (apiRequestPage as jest.Mock).mockResolvedValueOnce({data: [{id: 'e1', is_paid: true, price_minor: '49900', currency: 'INR'}, {id: 'e2', is_paid: false}], meta: {limit: 100, offset: 0, hasMore: false}});
    await expect(getOrganizerEventPrice('w1', 'e1')).resolves.toEqual({isPaid: true, priceMinor: 49900, currency: 'INR'});
    (apiRequestPage as jest.Mock).mockResolvedValueOnce({data: [], meta: {limit: 100, offset: 0, hasMore: false}});
    await expect(getOrganizerEventPrice('w1', 'zz')).resolves.toBeNull();
  });

  test('share, confirm, cancel and ticket use the documented routes', async () => {
    const paymentCard = {id: 'card1', status: 'SHARED'};
    (apiRequest as jest.Mock).mockResolvedValueOnce({message: {}, paymentCard});
    await expect(sharePaymentDetails('c 1', {amountMinor: 100, currency: 'INR', method: 'CASH'})).resolves.toBe(paymentCard);
    expect(apiRequest).toHaveBeenLastCalledWith('/conversations/c%201/payment-cards', {auth: 'required', method: 'POST', body: JSON.stringify({amountMinor: 100, currency: 'INR', method: 'CASH'})});
    (apiRequest as jest.Mock).mockResolvedValue({});
    await confirmPaymentCard('card/1');
    expect(apiRequest).toHaveBeenLastCalledWith('/payment-cards/card%2F1/confirm', {auth: 'required', method: 'POST'});
    await cancelPaymentCard('card1');
    expect(apiRequest).toHaveBeenLastCalledWith('/payment-cards/card1/cancel', {auth: 'required', method: 'POST'});
    await shareTicket('c1', {paymentCardId: 'card1', tierId: 't1'});
    expect(apiRequest).toHaveBeenLastCalledWith('/conversations/c1/ticket', {auth: 'required', method: 'POST', body: JSON.stringify({paymentCardId: 'card1', tierId: 't1'})});
    await shareTicket('c1');
    expect(apiRequest).toHaveBeenLastCalledWith('/conversations/c1/ticket', {auth: 'required', method: 'POST', body: '{}'});
  });

  test('a failed share rejects with the server error and does not echo the body', async () => {
    (apiRequest as jest.Mock).mockRejectedValueOnce({status: 402, code: 'NO_TICKET_CREDITS', message: 'No credits'});
    await expect(shareTicket('c1')).rejects.toMatchObject({status: 402});
  });
});
