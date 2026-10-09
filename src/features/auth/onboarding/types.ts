/** Subset of the `GET /auth/me` profile used to prefill onboarding. */
export type OnboardingProfile = {
  id: string;
  name: string | null;
  email: string;
  handle: string | null;
  avatar_url: string | null;
  interests: string[] | null;
  city: string | null;
  /** Absent on servers without the age gate. */
  ageStatus?: 'unknown' | 'adult' | 'minor';
  dateOfBirthSet?: boolean;
};

/** `GET/PATCH /auth/me` return `{...profile, user: profile}`. */
export type OnboardingProfileResponse = OnboardingProfile & {user: OnboardingProfile};

/** Body for `PATCH /auth/me` (gathr-api validators/auth.schema.js `updateProfile`). */
export type OnboardingProfileUpdate = {
  name: string;
  handle: string;
  interests: string[];
  city?: string;
  avatarUrl?: string;
};

export type OnboardingDraft = {
  name: string;
  handle: string;
  interests: string[];
  city: string;
  avatarUrl: string | null;
};

export type OnboardingField = 'name' | 'handle' | 'interests' | 'city' | 'avatarUrl';
export type OnboardingFieldErrors = Partial<Record<OnboardingField, string>>;
export type OnboardingStep = 0 | 1 | 2;
