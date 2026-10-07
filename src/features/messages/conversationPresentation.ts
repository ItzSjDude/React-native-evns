import type {ApiMessage, ConversationKind} from './types';

export const initialsOf = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0]?.slice(0, 2) ?? '';
  return letters.toUpperCase() || '?';
};

/** Whether the viewer sent this message. On EVENT threads the viewer is always the attendee side. */
export const isOwnMessage = (message: Pick<ApiMessage, 'sender_id' | 'sender_role'>, kind: ConversationKind, contactId: string | null) =>
  kind === 'EVENT' ? message.sender_role === 'ATTENDEE' : message.sender_id !== null && message.sender_id !== contactId;

const typeLabels: Record<string, string> = {
  IMAGE: 'Photo',
  VOICE: 'Voice note',
  PAYMENT_CARD: 'Payment request',
  TICKET: 'Ticket',
};

export const messageText = (message: Pick<ApiMessage, 'type' | 'body' | 'deleted_at'>) => {
  if (message.deleted_at) return 'Message deleted';
  if (message.type === 'TEXT' || message.type === 'SYSTEM') return message.body ?? '';
  return typeLabels[message.type] ?? `${message.type.toLowerCase()} message`;
};

const DAY = 86400000;

/** Compact list timestamp: "now", "5m", "3h", "Yesterday", "Tue", "Mar 4", "Mar 4, 2024". */
export const relativeTime = (value: string, now: Date = new Date()) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const elapsed = now.getTime() - date.getTime();
  if (elapsed < 60000) return 'now';
  if (elapsed < 3600000) return `${Math.floor(elapsed / 60000)}m`;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (date.getTime() >= startOfToday) return `${Math.floor(elapsed / 3600000)}h`;
  if (date.getTime() >= startOfToday - DAY) return 'Yesterday';
  if (date.getTime() >= startOfToday - 6 * DAY) return date.toLocaleDateString('en-US', {weekday: 'short'});
  return date.toLocaleDateString('en-US', date.getFullYear() === now.getFullYear()
    ? {month: 'short', day: 'numeric'}
    : {month: 'short', day: 'numeric', year: 'numeric'});
};
