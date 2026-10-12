import {onApiError, type ApiError} from '../../../core/api/apiClient';
import {ageRequired, underage} from '../authSlice';

type Dispatch = (action: ReturnType<typeof ageRequired> | ReturnType<typeof underage>) => unknown;

export const isAgeRequiredError = (error: Partial<ApiError> | null | undefined) =>
  error?.status === 403 && error.code === 'AGE_REQUIRED';
export const isUnderageError = (error: Partial<ApiError> | null | undefined) =>
  error?.status === 403 && error.code === 'UNDERAGE';

/**
 * The single place that turns age policy refusals from any request into navigation:
 * AGE_REQUIRED shows "Confirm your age", UNDERAGE shows the 18+ screen. Returns an unsubscribe.
 */
export function registerAgeGateListener(dispatch: Dispatch): () => void {
  return onApiError(error => {
    if (isUnderageError(error)) dispatch(underage());
    else if (isAgeRequiredError(error)) dispatch(ageRequired());
  });
}
