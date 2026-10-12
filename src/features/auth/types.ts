/** Server-side age decision. Servers before the age gate omit it; treat a missing value as "no gate". */
export type AgeStatus = 'unknown' | 'adult' | 'minor';

/** Which blocking age screen, if any, sits in front of the app. */
export type AgeGate = 'none' | 'confirm' | 'minor';

export type AuthUser = {
  id: string;
  name?: string;
  email: string;
  avatar_url?: string;
  email_verified: boolean;
  account_type?: 'ATTENDEE' | 'ORGANISER';
  ageStatus?: AgeStatus;
  dateOfBirthSet?: boolean;
};

export type AuthSession = {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  isNewUser?: boolean;
};

/** Age fields of `GET/PATCH /auth/me`; they appear at the top level and inside `user`. */
export type AgeInfo = {
  ageStatus?: AgeStatus;
  dateOfBirthSet?: boolean;
};

/** `GET/PATCH /auth/me` return `{...profile, user: profile}`. */
export type AuthMeResponse = Partial<AuthUser> & {user?: AuthUser};
