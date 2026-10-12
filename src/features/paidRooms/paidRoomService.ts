import {apiRequest} from '../../core/api/apiClient';
import type {PaidRoomConfig, PaidRoomProduct, PaidRoomPurchaseResult, PaidRoomsAvailability} from './types';

const status = (error: unknown) => (error as {status?: number} | null)?.status;

/** Join gate: the backend answers 403 "Purchase access to this room before joining" (the only other join 403 is "party is full"). */
export const isPaidAccessRequired = (error: unknown) =>
  status(error) === 403 && /purchase access/i.test((error as {message?: string}).message ?? '');

/** False when the flag is off or the caller can't see the party (any error): the host section simply stays hidden. */
export async function getPaidRoomsEnabled(partyId: string, signal?: AbortSignal): Promise<boolean> {
  try {
    return (await apiRequest<PaidRoomsAvailability>(`/parties/${partyId}/monetization`, {auth: 'required', signal}))?.paidRoomsEnabled === true;
  } catch {
    return false;
  }
}

/** `null` when the room is free or paid rooms are disabled (404). Any user may read it; `hasAccess` is theirs. */
export async function getPaidRoomProduct(partyId: string, signal?: AbortSignal): Promise<PaidRoomProduct | null> {
  try {
    const row = await apiRequest<PaidRoomProduct | null>(`/parties/${partyId}/paid-room`, {auth: 'required', signal});
    return row?.productId ? {...row, hasAccess: row.hasAccess === true} : null;
  } catch (error) {
    if (status(error) === 404) return null;
    throw error;
  }
}

/** Host only. The backend has no "clear" call: a SKU stays active until it is replaced. */
export const configurePaidRoom = (partyId: string, productId: string, currency = 'INR') =>
  apiRequest<PaidRoomConfig>(`/parties/${partyId}/paid-room`, {
    auth: 'required', method: 'PUT', body: JSON.stringify({productId: productId.trim(), currency}),
  });

/**
 * The server verifies AND acknowledges the one-time purchase (the app never does). Errors: 404 disabled/not paid,
 * 400 product mismatch or purchase not complete, 409 token linked elsewhere, 503 PLAY_NOT_CONFIGURED.
 * The token is only ever sent in the body, never logged.
 */
export const verifyPaidRoomPurchase = (partyId: string, productId: string, purchaseToken: string) =>
  apiRequest<PaidRoomPurchaseResult>(`/parties/${partyId}/paid-room/purchase`, {
    auth: 'required', method: 'POST', body: JSON.stringify({productId, purchaseToken}),
  });
