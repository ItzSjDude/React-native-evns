import AsyncStorage from '@react-native-async-storage/async-storage';
import {normalizeSubscription} from './plusService';
import type {Subscription} from './types';

const KEY = 'hiva.plus.subscription';

/** Last known subscription, for instant UI on cold start. The server is the source of truth and always overwrites it. */
export const saveCachedSubscription = (subscription: Subscription) =>
  AsyncStorage.setItem(KEY, JSON.stringify(subscription)).catch(() => {});

export const clearCachedSubscription = () => AsyncStorage.removeItem(KEY).catch(() => {});

/** `null` when there is nothing cached or the cached paid period has already ended. */
export async function loadCachedSubscription(now = Date.now()): Promise<Subscription | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const cached = normalizeSubscription(JSON.parse(raw));
    if (cached.plan === 'plus' && (!cached.expiresAt || new Date(cached.expiresAt).getTime() <= now)) return null;
    return cached;
  } catch {
    return null;
  }
}
