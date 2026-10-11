/** Shown read-only before a buyer pays and before a host enables paid access. */
export const PAID_ROOM_TERMS = [
  'Access is a one-time Google Play purchase for this room. Hiva takes no payment outside Google Play.',
  'Refunds follow Google Play’s policy. If Google refunds or cancels the purchase, your access is removed and you can’t rejoin unless you buy again.',
  'If the host reschedules the room, your purchase still applies. If the room is cancelled, request a refund from Google Play.',
  'Reporting, blocking and leaving a room never need a purchase.',
] as const;

export const PAID_ROOM_MESSAGES = {
  alreadyOwned: 'You already bought this room. Tap “Restore purchase” to unlock it.',
  pending: 'Your payment is pending. Access unlocks only after Google Play confirms it.',
  tokenInUse: 'This Google Play purchase is already linked to another Hiva account or room.',
  disabled: 'Paid rooms aren’t available right now.',
  invalid: 'Google Play couldn’t confirm this purchase yet. If you were charged and it never completes, Google refunds it.',
  notFound: 'No purchase of this room was found on this Google account.',
} as const;

export const ACCESS_REVOKED_MESSAGE = 'Your access to this paid room is no longer active, for example after a refund. Buy access again to rejoin.';
