/* eslint-disable no-script-url -- the unsafe URLs below are the test input */
import {buildSharePaymentBody, emptyShareForm, isSafeHttpsLink, issuableCardOf, openCardOf, salesFailure, ShareFormError} from '../sales';
import type {ApiPaymentCard} from '../../messages';

const price = {priceMinor: 49900, currency: 'INR'};
const card = (id: string, status: ApiPaymentCard['status'], created: string): ApiPaymentCard => ({
  id, amount_minor: 1, currency: 'INR', method: 'CASH', payee_name: null, upi_id: null, account_number: null, ifsc: null,
  payment_link: null, qr_image_url: null, note: null, status, expires_at: null, created_at: created,
});

describe('isSafeHttpsLink', () => {
  test.each(['https://pay.example.com/x?a=1', 'https://example.co.in', 'HTTPS://Pay.Example.com'])('accepts %s', url => expect(isSafeHttpsLink(url)).toBe(true));
  test.each([
    'http://example.com', 'javascript:alert(1)', 'upi://pay?pa=a@b', 'intent://x', 'data:text/html,hi', '', 'https://user:pw@example.com',
    'https://a@example.com', 'https://127.0.0.1/x', 'https://[::1]/x', 'https://example.com:8443/x', 'https://localhost', 'https://exa mple.com',
    'https://example.com\\evil.com', 'https://example.com/​x', `https://example.com/${'a'.repeat(2050)}`,
  ])('rejects %j', url => expect(isSafeHttpsLink(url)).toBe(false));
});

describe('buildSharePaymentBody', () => {
  test('UPI sends the amount from the event and only UPI fields', () => {
    const body = buildSharePaymentBody({...emptyShareForm(), upiId: ' neon@okhdfc ', payeeName: 'Neon', accountNumber: '123456789', paymentLink: 'https://x.com'}, price);
    expect(body).toEqual({amountMinor: 49900, currency: 'INR', method: 'UPI', payeeName: 'Neon', upiId: 'neon@okhdfc'});
  });
  test('BANK needs digits and a valid IFSC', () => {
    const form = {...emptyShareForm(), method: 'BANK' as const, accountNumber: '1234 5678 9012', ifsc: 'hdfc0001234'};
    expect(buildSharePaymentBody(form, price)).toMatchObject({method: 'BANK', accountNumber: '123456789012', ifsc: 'HDFC0001234'});
    expect(() => buildSharePaymentBody({...form, ifsc: 'bad'}, price)).toThrow(ShareFormError);
    expect(() => buildSharePaymentBody({...form, accountNumber: 'abc'}, price)).toThrow(ShareFormError);
  });
  test('LINK is https only and CASH needs nothing', () => {
    const link = {...emptyShareForm(), method: 'LINK' as const};
    expect(buildSharePaymentBody({...link, paymentLink: 'https://pay.example.com/p'}, price)).toMatchObject({paymentLink: 'https://pay.example.com/p'});
    expect(() => buildSharePaymentBody({...link, paymentLink: 'http://pay.example.com'}, price)).toThrow(/https/);
    expect(buildSharePaymentBody({...emptyShareForm(), method: 'CASH'}, price)).toEqual({amountMinor: 49900, currency: 'INR', method: 'CASH'});
  });
  test('refuses an invalid UPI id and a missing price', () => {
    expect(() => buildSharePaymentBody({...emptyShareForm(), upiId: 'nope'}, price)).toThrow(/UPI/);
    expect(() => buildSharePaymentBody({...emptyShareForm(), method: 'CASH'}, {priceMinor: 0, currency: 'INR'})).toThrow(/price/);
  });
});

describe('card selection', () => {
  const cards = [card('a', 'CANCELLED', '2026-10-01T00:00:00Z'), card('b', 'CONFIRMED', '2026-10-02T00:00:00Z'), card('c', 'SHARED', '2026-10-03T00:00:00Z')];
  test('open card is the newest SHARED or PAID_CLAIMED one', () => {
    expect(openCardOf(cards)?.id).toBe('c');
    expect(openCardOf([cards[0], cards[1]])).toBeNull();
  });
  test('a ticket can settle against SHARED, PAID_CLAIMED or CONFIRMED, never CANCELLED', () => {
    expect(issuableCardOf(cards)?.id).toBe('c');
    expect(issuableCardOf([cards[0], cards[1]])?.id).toBe('b');
    expect(issuableCardOf([cards[0]])).toBeNull();
  });
});

describe('salesFailure', () => {
  test('402 points to credits', () => expect(salesFailure({status: 402, code: 'NO_TICKET_CREDITS'})).toMatchObject({needsCredits: true}));
  test.each([
    [{status: 409, code: 'TIER_SOLD_OUT'}, /tier is sold out/],
    [{status: 409, message: 'This event is sold out'}, /event is sold out/],
    [{status: 409, message: 'Attendee already holds a ticket for this event'}, /already holds/],
    [{status: 409, message: 'Event is still DRAFT'}, /Publish/],
    [{status: 409, message: 'No payment card for this event'}, /Share payment details again/],
    [{status: 429, code: 'RATE_LIMITED'}, /Too many/],
    [{status: 404}, /not available/],
    [{status: 403}, /owners and admins/],
  ])('maps %j', (error, pattern) => {
    const result = salesFailure(error);
    expect(result.message).toMatch(pattern);
    expect(result.needsCredits).toBe(false);
  });
});
