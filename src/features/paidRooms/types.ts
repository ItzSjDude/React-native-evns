/** `GET /parties/:id/paid-room`: the active Play SKU of a room. `hasAccess` is the caller's server-side entitlement. */
export type PaidRoomProduct = {partyId: string; productId: string; currency: string; hasAccess: boolean};

/** `PUT /parties/:id/paid-room` (host only; the body is `.strict()`: `{productId, currency}`). */
export type PaidRoomConfig = {partyId: string; productId: string; currency: string; status: string};

/** `POST /parties/:id/paid-room/purchase` body is strictly `{productId, purchaseToken}`. */
export type PaidRoomPurchaseResult = {partyId: string; hasAccess: boolean; status: string};

/** `GET /parties/:id/monetization` (only the field this feature reads). */
export type PaidRoomsAvailability = {paidRoomsEnabled: boolean};
