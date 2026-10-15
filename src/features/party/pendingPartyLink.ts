import AsyncStorage from '@react-native-async-storage/async-storage';
import {registerLocalDataWiper} from '../../core/localData';
import {isPartyShareToken} from './partyLinks';

const STORAGE_KEY = '@hiva/pending-party-link';
let current: string | null = null;
const subscribers = new Set<(token: string | null) => void>();

const publish = (token: string | null) => {
  current = token;
  subscribers.forEach(listener => listener(token));
};

// Logout/account change: a link opened by the previous user must not join the next user to that room. The stored key is swept by the wipe.
registerLocalDataWiper(() => publish(null));

export const subscribeToPendingPartyLink = (listener: (token: string | null) => void) => {
  subscribers.add(listener);
  return () => {subscribers.delete(listener);};
};

export const savePendingPartyLink = async (token: string) => {
  if (!isPartyShareToken(token)) return;
  publish(token);
  await AsyncStorage.setItem(STORAGE_KEY, token);
};

export const loadPendingPartyLink = async (): Promise<string | null> => {
  if (current) return current;
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  // A URL event may arrive while storage is being read; never overwrite the newer link.
  if (current) return current;
  if (!stored || !isPartyShareToken(stored)) {
    if (stored) await AsyncStorage.removeItem(STORAGE_KEY);
    return null;
  }
  publish(stored);
  return stored;
};

export const clearPendingPartyLink = async (expectedToken?: string) => {
  if (expectedToken && current && current !== expectedToken) return;
  publish(null);
  await AsyncStorage.removeItem(STORAGE_KEY);
};

export const resetPendingPartyLinkMemoryForTests = () => {current = null;};
