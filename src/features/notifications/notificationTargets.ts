import type {AppNotification, ApiNotification, NotificationTarget, NotificationTargetKind, NotificationType} from './types';

/**
 * Data keys in priority order. PURCHASE_REQUESTED / TICKET_ISSUED carry both a
 * conversation and an event; the conversation is where the follow-up happens,
 * so it wins. USER_ARRIVED only carries `userId`.
 */
const TARGET_KEYS: [string, NotificationTargetKind][] = [
  ['conversationId', 'conversation'],
  ['partyId', 'party'],
  ['postId', 'post'],
  ['eventId', 'event'],
  ['noteId', 'vibeNote'],
  ['userId', 'user'],
];

/** FCM data values are always strings; REST `data` is JSON. Normalise both to strings. */
export function toStringData(data: unknown): Record<string, string> {
  if (!data || typeof data !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (value === null || value === undefined) continue;
    out[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return out;
}

export function resolveNotificationTarget(type: NotificationType | undefined, rawData: unknown): NotificationTarget {
  const data = toStringData(rawData);
  // A cancelled party has no room left to open.
  const skipParty = type === 'PARTY_CANCELLED';
  for (const [key, kind] of TARGET_KEYS) {
    if (skipParty && kind === 'party') continue;
    const id = data[key];
    if (id && id !== 'null') return {kind, id, type: type ?? data.type ?? '', data};
  }
  return {kind: 'notifications', type: type ?? data.type, data};
}

export function mapNotification(row: ApiNotification): AppNotification {
  const data = toStringData(row.data);
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body ?? null,
    data,
    readAt: row.read_at ?? null,
    createdAt: row.created_at,
    target: resolveNotificationTarget(row.type, data),
  };
}

export function formatNotificationTime(iso: string, now = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return 'now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(then).toLocaleDateString(undefined, {day: 'numeric', month: 'short'});
}
