import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@hiva/pending-party-gift';

export type PendingGiftPurchase = {
  partyId: string;
  senderId: string;
  creatorId: string;
  productId: string;
  reservationId: string | null;
  expiresAt: string | null;
};

/** Persist only the non-secret context needed to reconnect a Play callback after process death. */
export async function savePendingGiftPurchase(value: PendingGiftPurchase): Promise<void> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const previous = JSON.parse(raw) as Partial<PendingGiftPurchase>;
      if (previous.senderId !== value.senderId || previous.partyId !== value.partyId || previous.creatorId !== value.creatorId || previous.productId !== value.productId) {
        throw new Error('Finish the interrupted gift purchase before starting another one.');
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Finish the interrupted')) throw error;
    }
  }
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

/** Ignore stale/corrupt records and never expose another signed-in user's pending purchase. */
export async function getPendingGiftPurchase(partyId: string, senderId: string): Promise<PendingGiftPurchase | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingGiftPurchase>;
    if (value.partyId !== partyId || value.senderId !== senderId || !value.creatorId || !value.productId) return null;
    return {
      partyId, senderId, creatorId: value.creatorId, productId: value.productId,
      reservationId: typeof value.reservationId === 'string' ? value.reservationId : null,
      expiresAt: typeof value.expiresAt === 'string' ? value.expiresAt : null,
    };
  } catch {
    return null;
  }
}

export async function clearPendingGiftPurchase(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
