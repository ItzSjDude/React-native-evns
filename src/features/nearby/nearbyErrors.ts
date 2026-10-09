import type {ApiError} from '../../core/api/apiClient';

export const RATE_LIMIT_MESSAGE = 'Slow down a bit — try again in a minute.';
export const IMPLAUSIBLE_LOCATION_MESSAGE = "Your location couldn't be verified. Check that location services are on, then try again.";

const asApiError = (error: unknown) => (error ?? {}) as Partial<ApiError>;

export const isRateLimited = (error: unknown) => asApiError(error).status === 429;

/** Friendly copy for Nearby and location failures. */
export function nearbyErrorMessage(error: unknown): string {
  const apiError = asApiError(error);
  if (apiError.status === 429) return RATE_LIMIT_MESSAGE;
  if (apiError.code === 'LOCATION_IMPLAUSIBLE') return IMPLAUSIBLE_LOCATION_MESSAGE;
  if (apiError.code === 'AGE_REQUIRED') return 'Confirm your age to use Nearby.';
  if (apiError.code === 'UNDERAGE') return 'Nearby is only for people 18+.';
  return apiError.message || 'Please try again.';
}
