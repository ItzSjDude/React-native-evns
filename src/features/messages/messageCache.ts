import AsyncStorage from '@react-native-async-storage/async-storage';
import type {DirectMessage} from './directService';

const keyOf = (userId: string, conversationId: string) => `hiva.messages.cache.${userId}.${conversationId}`;

export async function loadCachedMessages(userId: string, conversationId: string): Promise<DirectMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(keyOf(userId, conversationId));
    const messages: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(messages) ? messages as DirectMessage[] : [];
  } catch { return []; }
}

export const saveCachedMessages = (userId: string, conversationId: string, messages: DirectMessage[]) =>
  AsyncStorage.setItem(keyOf(userId, conversationId), JSON.stringify(messages.slice(-50))).catch(() => {});
