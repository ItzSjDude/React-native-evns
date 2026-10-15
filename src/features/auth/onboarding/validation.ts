import type {ApiError} from '../../../core/api/apiClient';
import type {OnboardingDraft, OnboardingField, OnboardingFieldErrors, OnboardingStep} from './types';

export const INTEREST_OPTIONS = [
  'music', 'gaming', 'chill', 'talk', 'study', 'travel',
  'sports', 'tech', 'startups', 'movies', 'food', 'fitness',
] as const;
export const MAX_INTERESTS = 8;
export const HANDLE_PATTERN = /^[a-z0-9_]{3,30}$/;

export const normalizeHandle = (value: string) => value.trim().replace(/^@/, '').toLowerCase();

/** Best-effort handle from a display name, or '' when nothing valid remains. */
export function suggestHandle(name: string | null | undefined): string {
  const candidate = (name ?? '').toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 30);
  return HANDLE_PATTERN.test(candidate) ? candidate : '';
}

export function validateProfile(draft: Pick<OnboardingDraft, 'name' | 'handle' | 'gender' | 'country' | 'profession'>, photoMissing: boolean): OnboardingFieldErrors {
  const errors: OnboardingFieldErrors = {...validateIdentity(draft, photoMissing), ...validateAbout(draft), ...validateProfession(draft.profession)};
  return errors;
}

export function validateIdentity(draft: Pick<OnboardingDraft, 'name' | 'handle'>, photoMissing: boolean): OnboardingFieldErrors {
  const errors: OnboardingFieldErrors = {};
  const name = draft.name.trim();
  if (name.length < 2 || name.length > 80) errors.name = 'Name must be 2–80 characters.';
  if (!HANDLE_PATTERN.test(normalizeHandle(draft.handle))) {
    errors.handle = 'Handle must be 3–30 lowercase letters, numbers, or underscores.';
  }
  if (photoMissing) errors.avatarUrl = 'Add a profile photo.';
  return errors;
}

export function validateAbout(draft: Pick<OnboardingDraft, 'gender' | 'country'>): OnboardingFieldErrors {
  const errors: OnboardingFieldErrors = {};
  if (!draft.gender) errors.gender = 'Select your gender.';
  if (!draft.country) errors.country = 'Select your country.';
  return errors;
}

export function validateWork(draft: Pick<OnboardingDraft, 'profession' | 'intent'>): OnboardingFieldErrors {
  return {...validateProfession(draft.profession), ...validateIntent(draft.intent)};
}

export function validateProfession(profession: string): OnboardingFieldErrors {
  if (!profession.trim()) return {profession: 'Select or enter your profession.'};
  if (profession.trim().length > 60) return {profession: 'Profession must be 60 characters or less.'};
  return {};
}

export const validateIntent = (intent: string): OnboardingFieldErrors => (intent ? {} : {intent: 'Pick one to continue.'});

export function validateInterests(interests: string[]): OnboardingFieldErrors {
  if (interests.length < 1) return {interests: 'Pick at least one interest.'};
  if (interests.length > MAX_INTERESTS) return {interests: `Pick up to ${MAX_INTERESTS} interests.`};
  return {};
}

export const stepForField: Record<OnboardingField, OnboardingStep> = {
  name: 0, handle: 0, avatarUrl: 0, gender: 1, country: 1, profession: 2, intent: 3, interests: 4,
};

/**
 * Maps a failed PATCH /auth/me into field errors. Validation failures arrive
 * as 400 with `details[].field` (e.g. "handle", "interests.2"); a duplicate
 * handle arrives as 409 CONFLICT without details.
 */
export function mapSaveError(error: unknown): {fields: OnboardingFieldErrors; message: string | null} {
  const apiError = error as Partial<ApiError> | null;
  const fields: OnboardingFieldErrors = {};
  if (apiError?.status === 409) {
    fields.handle = 'That handle is already taken. Try another.';
    return {fields, message: null};
  }
  for (const detail of apiError?.details ?? []) {
    const root = detail.field?.split('.')[0] as OnboardingField | undefined;
    if (root && root in stepForField && !fields[root]) fields[root] = detail.message;
  }
  if (Object.keys(fields).length > 0) return {fields, message: null};
  return {fields, message: apiError?.message || 'Could not save your profile. Please try again.'};
}
