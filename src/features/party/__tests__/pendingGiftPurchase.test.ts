import AsyncStorage from '@react-native-async-storage/async-storage';
import {clearPendingGiftPurchase, getPendingGiftPurchase, savePendingGiftPurchase} from '../extras/pendingGiftPurchase';

jest.mock('@react-native-async-storage/async-storage', () => {
  const values = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((key: string) => Promise.resolve(values.get(key) ?? null)),
      setItem: jest.fn((key: string, value: string) => {values.set(key, value); return Promise.resolve();}),
      removeItem: jest.fn((key: string) => {values.delete(key); return Promise.resolve();}),
      clear: jest.fn(() => {values.clear(); return Promise.resolve();}),
    },
  };
});

const pending = {
  partyId: 'party-1', senderId: 'sender-1', creatorId: 'creator-1', productId: 'hiva_gift_rose',
  reservationId: 'reservation-1', expiresAt: '2026-10-12T12:00:00.000Z',
};

beforeEach(async () => {await AsyncStorage.clear();});

test('stores only recoverable purchase context and scopes reads to the signed-in sender and party', async () => {
  await savePendingGiftPurchase(pending);

  expect(await getPendingGiftPurchase(pending.partyId, pending.senderId)).toEqual(pending);
  expect(await getPendingGiftPurchase(pending.partyId, 'another-sender')).toBeNull();
  expect(await getPendingGiftPurchase('another-party', pending.senderId)).toBeNull();
  expect(await AsyncStorage.getItem('@hiva/pending-party-gift')).not.toContain('purchaseToken');
});

test('does not overwrite an interrupted purchase with a different gift', async () => {
  await savePendingGiftPurchase(pending);

  await expect(savePendingGiftPurchase({...pending, productId: 'hiva_gift_crown'})).rejects.toThrow('Finish the interrupted gift purchase');
  expect(await getPendingGiftPurchase(pending.partyId, pending.senderId)).toEqual(pending);
});

test('clears the persisted context after the purchase is settled or cancelled', async () => {
  await savePendingGiftPurchase(pending);
  await clearPendingGiftPurchase();

  expect(await AsyncStorage.getItem('@hiva/pending-party-gift')).toBeNull();
});
