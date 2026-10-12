import type {ConnectionState, NetworkingConnection, NetworkingGoal} from './types';
import {INTEREST_MAX_LENGTH, INTERESTS_MAX, NETWORKING_GOALS} from './types';

export type NetworkingIssue = 'unavailable' | 'not_ticketed' | 'not_opted_in' | 'rate_limited' | 'gone' | 'other';

const statusOf = (error: unknown) => (error as {status?: number})?.status;
const messageOf = (error: unknown) => (error as {message?: string})?.message ?? '';

/** Maps backend failures to a state the UI can explain. 404 is deliberately ambiguous server-side (off, ended, cancelled, or no such person). */
export function issueOf(error: unknown, context: 'event' | 'person' = 'event'): NetworkingIssue {
  const status = statusOf(error);
  if (status === 429) return 'rate_limited';
  if (status === 404) return context === 'person' && /attendee/i.test(messageOf(error)) ? 'gone' : 'unavailable';
  if (status === 403) return /opt in/i.test(messageOf(error)) ? 'not_opted_in' : 'not_ticketed';
  return 'other';
}

export const ISSUE_COPY: Record<NetworkingIssue, string> = {
  unavailable: 'Meeting people is not available for this event right now. The organiser may have turned it off, it may have ended, or the event may have been cancelled.',
  not_ticketed: 'You need a valid ticket for this event to meet other attendees.',
  not_opted_in: 'Join event networking first to connect with people.',
  rate_limited: 'You are going a little fast. Please wait a minute and try again.',
  gone: 'This person is no longer available.',
  other: 'Something went wrong. Please try again.',
};

/** Friendly message for any failure; falls back to the server's own text for unexpected errors. */
export function networkingMessage(error: unknown, context: 'event' | 'person' = 'event') {
  const issue = issueOf(error, context);
  return issue === 'other' ? messageOf(error) || ISSUE_COPY.other : ISSUE_COPY[issue];
}

export const goalLabel = (goal: NetworkingGoal) => NETWORKING_GOALS.find(item => item.value === goal)?.label ?? goal;

/** "music, travel ,Music" -> ['music', 'travel'] (trimmed, case-insensitive unique, within server limits). */
export function parseInterests(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(',')) {
    const value = part.trim().slice(0, INTEREST_MAX_LENGTH);
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    out.push(value);
  }
  return out.slice(0, INTERESTS_MAX);
}

export function connectionStateOf(userId: string, viewerId: string | null | undefined, connections: NetworkingConnection[]): ConnectionState {
  const row = connections.find(item => item.userId === userId);
  if (!row) return 'none';
  if (row.acceptedAt) return 'connected';
  return row.requestedBy === viewerId ? 'requested' : 'incoming';
}

export type EntryState = 'open' | 'closed';

/**
 * Whether the "Meet people" card is shown, and if so whether it is usable. Null hides it: no live ticket, or the
 * organiser has not enabled networking. A cancelled/completed event or a passed networking window shows it closed.
 */
export function networkingEntryState(
  event: {status?: string; networking_enabled?: boolean; networking_ends_at?: string | null},
  hasLiveTicket: boolean, now = Date.now(),
): EntryState | null {
  if (!hasLiveTicket || !event.networking_enabled) return null;
  if (event.status && event.status !== 'PUBLISHED') return 'closed';
  if (event.networking_ends_at && new Date(event.networking_ends_at).getTime() < now) return 'closed';
  return 'open';
}

export const closedCopy = (status?: string) =>
  status === 'CANCELLED' ? 'This event was cancelled, so networking is closed.' : 'Networking for this event has ended.';
