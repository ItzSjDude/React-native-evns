import AsyncStorage from '@react-native-async-storage/async-storage';
import type {DirectMessage} from './directService';
import type {ThreadMessageExtras} from './types';

const keyOf = (userId: string, conversationId: string) => `hiva.messages.cache.${userId}.${conversationId}`;

/** Trailing "(ref: ...)" that mark-paid puts in its SYSTEM body. The reference is payment data. */
const REFERENCE_SUFFIX = / \(ref: [^)]*\)$/;

/**
 * Strips payment and ticket payloads before a message is written to plaintext AsyncStorage. Card and ticket data
 * live in component state only: a payment or ticket row keeps its id, type and time, and nothing else.
 */
export const toCacheableMessage = (message: DirectMessage & ThreadMessageExtras): DirectMessage => {
  const row: DirectMessage & ThreadMessageExtras = {...message};
  delete row.paymentCard;
  delete row.ticket;
  if (row.type === 'PAYMENT_CARD' || row.type === 'TICKET') return {...row, body: null, metadata: null};
  if (row.metadata && ('paymentCardId' in row.metadata || 'ticketId' in row.metadata)) {
    const metadata = {...row.metadata};
    delete metadata.reference;
    return {...row, body: row.body?.replace(REFERENCE_SUFFIX, '') ?? null, metadata};
  }
  return row;
};

export async function loadCachedMessages(userId: string, conversationId: string): Promise<DirectMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(keyOf(userId, conversationId));
    const messages: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(messages) ? messages as DirectMessage[] : [];
  } catch { return []; }
}

export const saveCachedMessages = (userId: string, conversationId: string, messages: DirectMessage[]) =>
  AsyncStorage.setItem(keyOf(userId, conversationId), JSON.stringify(messages.slice(-50).map(toCacheableMessage))).catch(() => {});
