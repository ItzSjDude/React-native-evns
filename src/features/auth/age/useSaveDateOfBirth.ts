import {useCallback, useEffect, useRef, useState} from 'react';
import type {ApiError} from '../../../core/api/apiClient';
import {useAppDispatch} from '../../../core/store/hooks';
import {refreshSessionUser} from '../authService';
import {setAgeGate, setSession} from '../authSlice';
import type {AgeGate, AuthMeResponse} from '../types';
import {ageInfoOf, fetchMe, submitDateOfBirth} from './ageService';
import {gateAfterDobSaved, MINIMUM_AGE, type DobValidation} from './ageValidation';

export type ValidDob = Extract<DobValidation, {ok: true}>;

const asApiError = (error: unknown) => (error ?? {}) as Partial<ApiError>;

/** The server's field message for a rejected `dateOfBirth`, if that's why the PATCH failed. */
function dobFieldMessage(error: unknown): string | null {
  const apiError = asApiError(error);
  if (apiError.status !== 400) return null;
  return apiError.details?.find(detail => detail.field?.split('.')[0] === 'dateOfBirth')?.message ?? null;
}

/**
 * Saves a confirmed date of birth, then stores the server's verdict in the session so
 * restarts and token refreshes keep the right gate. Resolves to the resulting gate, or
 * null when saving failed (the hook's `error` explains why).
 */
export function useSaveDateOfBirth() {
  const dispatch = useAppDispatch();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const save = useCallback(async (dob: ValidDob): Promise<AgeGate | null> => {
    setSaving(true);
    setError(null);
    try {
      let response: AuthMeResponse;
      try {
        response = await submitDateOfBirth(dob.isoDate);
      } catch (cause) {
        // Already set (e.g. saved from another device): the server's status is what counts.
        if (asApiError(cause).code !== 'DOB_LOCKED') throw cause;
        response = await fetchMe();
      }
      const gate = gateAfterDobSaved(ageInfoOf(response).ageStatus, dob.age);
      const refreshed = await refreshSessionUser(response).catch(() => null);
      if (refreshed) dispatch(setSession(refreshed));
      dispatch(setAgeGate(gate));
      return gate;
    } catch (cause) {
      const fieldMessage = dobFieldMessage(cause);
      // The server refuses very young dates outright instead of storing them; block here too.
      if (fieldMessage && dob.age < MINIMUM_AGE) {
        dispatch(setAgeGate('minor'));
        return 'minor';
      }
      if (mounted.current) setError(fieldMessage ?? asApiError(cause).message ?? 'Could not save your date of birth. Please try again.');
      return null;
    } finally {
      if (mounted.current) setSaving(false);
    }
  }, [dispatch]);

  return {save, saving, error, clearError: () => setError(null)};
}
