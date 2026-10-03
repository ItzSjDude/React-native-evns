import {GoogleSignin} from '@react-native-google-signin/google-signin';
import {signInWithGoogle} from '../src/features/auth';

describe('Google authentication contract flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        success: true,
        data: {
          user: {id: 'user-id', name: 'Neha Sharma', email: 'neha@gmail.com', email_verified: true},
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresIn: '15m',
          isNewUser: true,
        },
      }),
    }) as unknown as typeof fetch;
    (GoogleSignin.signIn as jest.Mock).mockResolvedValue({
      type: 'success',
      data: {idToken: 'google-id-token'},
    });
  });

  it('exchanges the Google ID token at /auth/firebase and returns the session', async () => {
    const session = await signInWithGoogle('google-id-token');

    expect(session.accessToken).toBe('access-token');
    expect(session.isNewUser).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/firebase'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({idToken: 'google-id-token'}),
      }),
    );
  });
});
