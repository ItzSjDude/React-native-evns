export type AuthUser = {
  id: string;
  name: string;
  email: string;
  avatar_url?: string;
  email_verified: boolean;
  account_type?: 'ATTENDEE' | 'ORGANISER';
};

export type AuthSession = {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  isNewUser: boolean;
};
