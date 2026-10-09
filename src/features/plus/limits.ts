import type {LimitReachedError, LimitReason} from './types';

const REASONS: LimitReason[] = ['dmStarts', 'vibeNotes', 'vibeNoteLifetime', 'randomMatches'];

/**
 * True for a 429 `LIMIT_REACHED` from the API client, so any feature can do:
 * `if (isLimitReached(error)) openPaywall(error.details.limit, error.details)`.
 */
export function isLimitReached(error: unknown): error is LimitReachedError {
  const candidate = error as Partial<LimitReachedError> | null;
  return !!candidate && typeof candidate === 'object' && candidate.code === 'LIMIT_REACHED' &&
    !!candidate.details && typeof candidate.details === 'object' && !Array.isArray(candidate.details) &&
    REASONS.includes(candidate.details.limit as LimitReason);
}

const LIMIT_MESSAGES: Record<LimitReason, string> = {
  dmStarts: 'You’ve reached today’s limit for new chats.',
  vibeNotes: 'You’ve reached today’s limit for vibe notes.',
  vibeNoteLifetime: 'That’s longer than free vibe notes can stay up.',
  randomMatches: 'You’ve reached today’s limit for random matches.',
};

export const limitMessage = (reason: LimitReason) => LIMIT_MESSAGES[reason];
