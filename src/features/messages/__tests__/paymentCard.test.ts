/* eslint-disable no-script-url -- the unsafe URLs below are the test input */
import {
  canClaimPayment, cardRank, maskAccount, mergeCards, paymentCardMetadataOf, safeImageUrl, safePaymentLink, splitRealtimeExtras,
} from '../paymentCard';
import type {ApiMessage, ApiPaymentCard} from '../types';

const card = (overrides: Partial<ApiPaymentCard> = {}): ApiPaymentCard => ({
  id: 'card1', amount_minor: 49900, currency: 'INR', method: 'UPI', payee_name: 'Neon Nights', upi_id: 'neon@okhdfc',
  account_number: null, ifsc: null, payment_link: null, qr_image_url: null, note: null, status: 'SHARED',
  expires_at: null, ...overrides,
});

const message = (overrides: Partial<ApiMessage> = {}): ApiMessage => ({
  id: 'm1', sender_id: 'org', type: 'PAYMENT_CARD', body: 'Pay today', metadata: {paymentCardId: 'card1', amountMinor: 49900, currency: 'INR', method: 'UPI'},
  created_at: '2026-10-08T10:00:00.000Z', ...overrides,
});

test('only https and upi links are opened; javascript, http, intent and malformed links are rejected', () => {
  expect(safePaymentLink('https://pay.example.com/checkout?x=1')).toEqual({url: 'https://pay.example.com/checkout?x=1', host: 'pay.example.com', scheme: 'https'});
  expect(safePaymentLink('  HTTPS://Pay.Example.com/a  ')).toMatchObject({host: 'Pay.Example.com', scheme: 'https'});
  expect(safePaymentLink('upi://pay?pa=neon@okhdfc&am=499.00')).toMatchObject({scheme: 'upi'});

  for (const rejected of [
    'javascript:alert(1)', 'JavaScript:alert(1)', 'http://pay.example.com', 'intent://pay#Intent;scheme=upi;end',
    'data:text/html,hi', 'https://', 'https:///x', 'https://pay.example.com\\@evil.test', 'https://pay.example.com/\u0000x',
    'https://pay.example.com/\nx', 'ftp://pay.example.com', '', '   ', null, undefined,
  ]) {
    expect({rejected, link: safePaymentLink(rejected)}).toEqual({rejected, link: null});
  }
});

test('the host shown to the buyer is the one the browser would contact', () => {
  expect(safePaymentLink('https://user:pw@pay.example.com:8443/x')?.host).toBe('pay.example.com');
});

test('image URLs for QR codes are https only', () => {
  expect(safeImageUrl('https://cdn.example.com/qr.png')).toBe('https://cdn.example.com/qr.png');
  expect(safeImageUrl('http://cdn.example.com/qr.png')).toBeNull();
  expect(safeImageUrl('upi://pay')).toBeNull();
});

test('masks account numbers to the last four digits', () => {
  expect(maskAccount('123456789012')).toBe('••••9012');
  expect(maskAccount('1234')).toBe('••••');
});

test('card status never moves backwards when frames arrive out of order', () => {
  expect(cardRank('SHARED')).toBeLessThan(cardRank('PAID_CLAIMED'));
  expect(cardRank('PAID_CLAIMED')).toBeLessThan(cardRank('CONFIRMED'));
  expect(cardRank('SOMETHING_NEW')).toBe(-1);

  const confirmed = card({status: 'CONFIRMED'});
  expect(mergeCards([confirmed], [card({status: 'SHARED'})])).toEqual([confirmed]);
  const claimed = card({status: 'PAID_CLAIMED', upi_id: 'changed@okaxis'});
  expect(mergeCards([card()], [claimed])).toEqual([{...claimed, status: 'PAID_CLAIMED'}]);
  // An unknown status from a newer server never replaces a known card.
  expect(mergeCards([claimed], [card({status: 'SOMETHING_NEW' as ApiPaymentCard['status']})])[0].status).toBe('PAID_CLAIMED');
  expect(mergeCards([], [card(), card({id: 'card2'})])).toHaveLength(2);
});

test('only a SHARED card is claimable', () => {
  expect(canClaimPayment(card())).toBe(true);
  for (const status of ['PAID_CLAIMED', 'CONFIRMED', 'CANCELLED'] as const) expect(canClaimPayment(card({status}))).toBe(false);
  expect(canClaimPayment(null)).toBe(false);
});

test('narrows message metadata without trusting its types', () => {
  expect(paymentCardMetadataOf(message())).toEqual({paymentCardId: 'card1', amountMinor: 49900, currency: 'INR', method: 'UPI', eventId: undefined});
  expect(paymentCardMetadataOf(message({metadata: {amountMinor: '499', method: 'CRYPTO', paymentCardId: ''}}))).toMatchObject({
    amountMinor: undefined, method: undefined, paymentCardId: undefined,
  });
  expect(paymentCardMetadataOf(message({metadata: null}))).toMatchObject({paymentCardId: undefined});
});

test('socket extras become card state and ids in metadata, never payloads in the message', () => {
  const frame = {
    ...message({metadata: null}),
    paymentCard: card(),
    ticket: {id: 't1', event_id: 'e1', code: 'GTHR-1', status: 'ISSUED', secret: 'do-not-keep'},
  } as ApiMessage & Record<string, unknown>;
  const {message: row, card: shared} = splitRealtimeExtras(frame as never);
  expect(shared).toEqual(card());
  expect(row).not.toHaveProperty('paymentCard');
  expect(row).not.toHaveProperty('ticket');
  expect(JSON.stringify(row)).not.toContain('do-not-keep');
  expect(row.metadata).toMatchObject({paymentCardId: 'card1', ticketId: 't1', eventId: 'e1'});

  // A frame without extras passes through unchanged, null metadata included.
  const plain = message();
  expect(splitRealtimeExtras(plain)).toEqual({message: plain, card: null});
  const bare = message({metadata: null});
  expect(splitRealtimeExtras(bare).message.metadata).toBeNull();
});
