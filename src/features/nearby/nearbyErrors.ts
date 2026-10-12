import type {ApiError} from '../../core/api/apiClient';
import {isLimitReached, isPlusRequired, limitMessage, PLUS_REQUIRED_MESSAGE} from '../plus';

export const RATE_LIMIT_MESSAGE = 'Slow down a bit — try again in a minute.';
export const IMPLAUSIBLE_LOCATION_MESSAGE = "Your location couldn't be verified. Check that location services are on, then try again.";

const asApiError = (error: unknown) => (error ?? {}) as Partial<ApiError>;

export const isRateLimited = (error: unknown) => asApiError(error).status === 429;

export const PASSPORT_PLUS_REQUIRED_MESSAGE = 'Social Passport and saved searches are Hiva Plus features.';
export const PRESET_NAME_TAKEN_MESSAGE = 'You already have a saved search with that name.';
export const PRESET_LIMIT_MESSAGE = 'You can save up to 10 searches. Delete one to save another.';

/** Friendly copy for Nearby, Passport, saved-search and location failures. `feature` picks the Plus-required wording. */
export function nearbyErrorMessage(error: unknown, feature?: 'passport'): string {
  const apiError = asApiError(error);
  if (isLimitReached(error)) return limitMessage(error.details.limit);
  if (isPlusRequired(error)) return feature === 'passport' ? PASSPORT_PLUS_REQUIRED_MESSAGE : PLUS_REQUIRED_MESSAGE;
  // The server words both 409s ("A preset with that name already exists" / "You can save up to 10 ...").
  if (feature === 'passport' && apiError.status === 409) return /name/i.test(apiError.message ?? '') ? PRESET_NAME_TAKEN_MESSAGE : PRESET_LIMIT_MESSAGE;
  if (apiError.status === 429) return RATE_LIMIT_MESSAGE;
  if (apiError.code === 'LOCATION_IMPLAUSIBLE') return IMPLAUSIBLE_LOCATION_MESSAGE;
  if (apiError.code === 'AGE_REQUIRED') return 'Confirm your age to use Explore.';
  if (apiError.code === 'UNDERAGE') return 'Explore is only for people 18+.';
  return apiError.message || 'Please try again.';
}
