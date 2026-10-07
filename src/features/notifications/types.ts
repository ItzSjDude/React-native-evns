/**
 * Contracts for gathr-api `/notifications` (src/routes/notification.routes.js).
 *
 * The list endpoint returns raw `notifications` rows (`SELECT *`), so fields are
 * snake_case, unlike most of the API. `data` is the JSON object the producer
 * attached; over FCM the same keys arrive as strings in the push's data payload.
 */

/** Values in gathr-api src/constants NOTIFICATION_TYPE plus module-sent ones. Unknown types still render. */
export type NotificationType =
  | 'EVENT_PUBLISHED' | 'EVENT_REMINDER' | 'EVENT_CANCELLED'
  | 'WORKSPACE_INVITE' | 'PURCHASE_REQUESTED'
  | 'NEW_MESSAGE' | 'PAYMENT_CARD_SHARED' | 'PAYMENT_MARKED_PAID'
  | 'TICKET_ISSUED' | 'TICKET_CANCELLED' | 'TICKET_TRANSFERRED'
  | 'CREDITS_PURCHASED' | 'CREDITS_LOW'
  | 'WAITLIST_OFFER' | 'WAITLIST_OFFER_EXPIRED'
  | 'USER_ARRIVED'
  | 'PARTY_INVITE' | 'PARTY_REMINDER' | 'PARTY_SCHEDULED_START' | 'PARTY_CANCELLED'
  | 'VIBE_NOTE_NEARBY'
  | (string & {});

export type ApiNotification = {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
  dedupe_key?: string | null;
};

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  data: Record<string, string>;
  readAt: string | null;
  createdAt: string;
  target: NotificationTarget;
};

export type DevicePlatform = 'android' | 'ios' | 'web';

/** Where a notification should take the user. `notifications` means "no specific destination". */
export type NotificationTargetKind = 'conversation' | 'party' | 'post' | 'event' | 'vibeNote' | 'user';

export type NotificationTarget =
  | {kind: NotificationTargetKind; id: string; type: NotificationType; data: Record<string, string>}
  | {kind: 'notifications'; type?: NotificationType; data: Record<string, string>};

/**
 * Called when the user opens a push or a notification row. Return `true` once the
 * target was handled; anything else makes the provider fall back to opening the
 * notifications sheet.
 */
export type NotificationNavigator = (target: NotificationTarget) => boolean | void;

/** What the in-app banner shows for a push received while the app is in the foreground. */
export type ForegroundNotice = {
  key: string;
  title: string;
  body: string | null;
  target: NotificationTarget;
};
