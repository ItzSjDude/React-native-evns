import AsyncStorage from '@react-native-async-storage/async-storage';
import {loadCachedMessages, saveCachedMessages, toCacheableMessage} from '../messageCache';
import type {DirectMessage} from '../directService';

const base = {sender_id: 'org', created_at: '2026-10-08T10:00:00.000Z', edited_at: null, deleted_at: null};
const cardMessage: DirectMessage = {
  ...base, id: 'p1', type: 'PAYMENT_CARD', body: 'Pay ₹499 to Neon Nights, UPI neon@okhdfc',
  metadata: {paymentCardId: 'card1', amountMinor: 49900, currency: 'INR', method: 'UPI', eventId: 'e1'},
};
const ticketMessage: DirectMessage = {
  ...base, id: 't1', type: 'TICKET', body: null, metadata: {ticketId: 'tk1', code: 'GTHR-7K2M-9QX4', eventId: 'e1'},
};
const systemMessage: DirectMessage = {
  ...base, id: 's1', type: 'SYSTEM', body: 'Marked as paid (ref: UTR123456789)', metadata: {paymentCardId: 'card1', reference: 'UTR123456789'},
};
const text: DirectMessage = {...base, id: 'x1', type: 'TEXT', body: 'hello', metadata: null};

beforeEach(() => { jest.clearAllMocks(); });

test('payment and ticket rows keep their id, type and time; their payloads are dropped', () => {
  expect(toCacheableMessage(cardMessage)).toEqual({...base, id: 'p1', type: 'PAYMENT_CARD', body: null, metadata: null});
  expect(toCacheableMessage(ticketMessage)).toEqual({...base, id: 't1', type: 'TICKET', body: null, metadata: null});
});

test('socket extras and payment references never survive the cache', () => {
  const withExtras = {
    ...cardMessage,
    paymentCard: {id: 'card1', upi_id: 'neon@okhdfc', amount_minor: 49900} as never,
    ticket: {id: 'tk1', secret: 'do-not-cache'} as never,
  };
  const cleaned = toCacheableMessage(withExtras);
  expect(cleaned).not.toHaveProperty('paymentCard');
  expect(cleaned).not.toHaveProperty('ticket');
  expect(JSON.stringify(cleaned)).not.toMatch(/neon@okhdfc|do-not-cache|Neon Nights/);

  expect(toCacheableMessage(systemMessage)).toEqual({...systemMessage, body: 'Marked as paid', metadata: {paymentCardId: 'card1'}});
});

test('ordinary messages are cached unchanged', () => {
  expect(toCacheableMessage(text)).toEqual(text);
});

test('saving to AsyncStorage writes no card, ticket or reference data and loads back the same shape', async () => {
  await saveCachedMessages('me', 'c1', [text, cardMessage, ticketMessage, systemMessage]);
  const raw = (AsyncStorage.setItem as jest.Mock).mock.calls.at(-1)?.[1] as string;
  for (const leaked of ['neon@okhdfc', 'Neon Nights', 'GTHR-7K2M-9QX4', 'UTR123456789', 'amountMinor', 'eventId', 'tk1']) {
    expect(raw).not.toContain(leaked);
  }
  const loaded = await loadCachedMessages('me', 'c1');
  expect(loaded.map(message => message.id)).toEqual(['x1', 'p1', 't1', 's1']);
  expect(loaded[1]).toMatchObject({type: 'PAYMENT_CARD', body: null, metadata: null});
});
