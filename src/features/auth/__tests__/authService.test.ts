import {Platform} from 'react-native';
import * as Keychain from 'react-native-keychain';
import {GoogleSignin} from '@react-native-google-signin/google-signin';
import {getAuth, getIdToken, signOut as firebaseSignOut} from '@react-native-firebase/auth';
import {apiRequest} from '../../../core/api/apiClient';
import {
  logoutFromApi, refreshBackendSession, refreshOnce, refreshSessionUser, restoreBackendSession, signInWithGoogle,
} from '../authService';
import {clearSession, loadSession, saveSession} from '../session';
import type {AuthSession} from '../types';

jest.mock('../../../core/api/apiClient', () => ({apiRequest: jest.fn()}));
const request = apiRequest as jest.Mock;

const base = (overrides: Partial<AuthSession> = {}): AuthSession => ({
  user: {id: 'u1', email: 'a@example.com', email_verified: true, name: 'Asha'}, accessToken: 'access-1', refreshToken: 'refresh-1', expiresIn: '15m', ...overrides,
});

let stored: string | null;
const routes: Record<string, jest.Mock> = {};
const route = (path: string, handler: jest.Mock) => { routes[path] = handler; };
const calls = (path: string) => request.mock.calls.filter(call => call[0] === path);

beforeEach(async () => {
  jest.clearAllMocks();
  stored = null;
  (Keychain.setGenericPassword as jest.Mock).mockImplementation(async (_u: string, password: string) => { stored = password; return true; });
  (Keychain.getGenericPassword as jest.Mock).mockImplementation(async () => stored === null ? false : {username: 'backend-session', password: stored});
  (Keychain.resetGenericPassword as jest.Mock).mockImplementation(async () => { stored = null; return true; });
  (getAuth as jest.Mock).mockReturnValue({currentUser: null});
  (getIdToken as jest.Mock).mockResolvedValue('firebase-id-token');
  Object.keys(routes).forEach(key => delete routes[key]);
  request.mockImplementation(async (path: string, options?: unknown) => {
    if (!routes[path]) throw new Error(`Unexpected request to ${path}`);
    return routes[path](options);
  });
  await clearSession();
});

describe('restoreBackendSession', () => {
  test('with nothing stored and no Firebase user the app is signed out', async () => {
    await expect(restoreBackendSession()).resolves.toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  test('with nothing stored but a Firebase user it exchanges a fresh Firebase token for a backend session and stores it', async () => {
    const firebaseUser = {uid: 'f1'};
    (getAuth as jest.Mock).mockReturnValue({currentUser: firebaseUser});
    route('/auth/firebase', jest.fn().mockResolvedValue(base({user: {...base().user, ageStatus: 'adult'}})));
    const restored = await restoreBackendSession();
    expect(getIdToken).toHaveBeenCalledWith(firebaseUser, true);
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({idToken: 'firebase-id-token'});
    expect(restored).toMatchObject({accessToken: 'access-1'});
    expect(await loadSession()).toMatchObject({accessToken: 'access-1'});
  });

  test('a stored session is refreshed from /auth/me and the latest age status is persisted for offline restarts', async () => {
    await saveSession(base());
    route('/auth/me', jest.fn().mockResolvedValue({id: 'u1', name: 'Asha R', ageStatus: 'adult', dateOfBirthSet: true, user: {id: 'u1', name: 'Asha R', email: 'a@example.com', email_verified: true}}));
    const restored = await restoreBackendSession();
    expect(restored!.user).toMatchObject({id: 'u1', name: 'Asha R', ageStatus: 'adult', dateOfBirthSet: true});
    expect((await loadSession())!.user).toMatchObject({name: 'Asha R', ageStatus: 'adult'});
    expect(restored!.refreshToken).toBe('refresh-1');
  });

  test('an unauthorised /auth/me means the session is dead: signed out (and the stored copy is left to the API client to clear)', async () => {
    await saveSession(base());
    route('/auth/me', jest.fn().mockRejectedValue({status: 401, message: 'expired'}));
    await expect(restoreBackendSession()).resolves.toBeNull();
  });

  test.each([
    ['a network error', new TypeError('Network request failed')],
    ['a server error', {status: 503, message: 'down'}],
    ['a timeout', {status: 408, message: 'timed out'}],
  ])('%s keeps the locally stored session so users are not logged out by an outage', async (_name, failure) => {
    await saveSession(base());
    route('/auth/me', jest.fn().mockRejectedValue(failure));
    await expect(restoreBackendSession()).resolves.toMatchObject({accessToken: 'access-1', user: {id: 'u1'}});
  });

  test('if the user logs out while /auth/me is loading, an outage does not hand back the stale session', async () => {
    await saveSession(base());
    route('/auth/me', jest.fn(async () => { await clearSession(); throw new TypeError('Network request failed'); }));
    await expect(restoreBackendSession()).resolves.toBeNull();
  });

  test('uses tokens rotated while /auth/me was in flight rather than the ones read at startup', async () => {
    await saveSession(base());
    route('/auth/me', jest.fn(async () => {
      await saveSession(base({accessToken: 'rotated-access', refreshToken: 'rotated-refresh'}));
      return {id: 'u1', ageStatus: 'adult'};
    }));
    const restored = await restoreBackendSession();
    expect(restored).toMatchObject({accessToken: 'rotated-access', refreshToken: 'rotated-refresh'});
  });
});

describe('refreshBackendSession', () => {
  test('posts the refresh token and stores the rotated pair while keeping the user', async () => {
    await saveSession(base());
    route('/auth/refresh', jest.fn().mockResolvedValue({accessToken: 'access-2', refreshToken: 'refresh-2', expiresIn: '15m'}));
    const refreshed = await refreshBackendSession(base());
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({refreshToken: 'refresh-1'});
    expect(refreshed).toMatchObject({accessToken: 'access-2', refreshToken: 'refresh-2', user: {id: 'u1'}});
    expect(await loadSession()).toMatchObject({accessToken: 'access-2', refreshToken: 'refresh-2'});
  });

  test.each([
    ['no access token', {refreshToken: 'r2'}],
    ['no refresh token', {accessToken: 'a2'}],
    ['an empty response', {}],
  ])('a response with %s is rejected and does not overwrite the stored session', async (_name, tokens) => {
    await saveSession(base());
    route('/auth/refresh', jest.fn().mockResolvedValue(tokens));
    await expect(refreshBackendSession(base())).rejects.toThrow('Refresh response did not include both tokens.');
    expect(await loadSession()).toMatchObject({accessToken: 'access-1', refreshToken: 'refresh-1'});
  });

  test('if the user signs out during the request the new tokens are discarded', async () => {
    await saveSession(base());
    route('/auth/refresh', jest.fn(async () => { await clearSession(); return {accessToken: 'late', refreshToken: 'late-r'}; }));
    await expect(refreshBackendSession(base())).rejects.toThrow('Session changed while refreshing.');
    expect(await loadSession()).toBeNull();
  });
});

describe('refreshOnce', () => {
  test('callers holding the same refresh token share a single /auth/refresh request', async () => {
    await saveSession(base());
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    route('/auth/refresh', jest.fn(async () => { await gate; return {accessToken: 'access-2', refreshToken: 'refresh-2'}; }));
    const results = [refreshOnce(base()), refreshOnce(base()), refreshOnce(base())];
    await new Promise<void>(resolve => setImmediate(resolve));
    release();
    const resolved = await Promise.all(results);
    expect(calls('/auth/refresh')).toHaveLength(1);
    expect(new Set(resolved.map(item => item.accessToken))).toEqual(new Set(['access-2']));
  });

  test('a caller with an already-rotated refresh token gets the current session without another refresh', async () => {
    await saveSession(base({accessToken: 'access-2', refreshToken: 'refresh-2'}));
    const result = await refreshOnce(base());
    expect(result.accessToken).toBe('access-2');
    expect(request).not.toHaveBeenCalled();
  });

  test('without a stored session it fails with a 401 so the caller can sign out', async () => {
    await expect(refreshOnce(base())).rejects.toEqual({status: 401, message: 'Session expired.'});
  });

  test('the in-flight slot is released after a failure so the next attempt really retries', async () => {
    await saveSession(base());
    route('/auth/refresh', jest.fn().mockRejectedValueOnce(new TypeError('Network request failed')).mockResolvedValue({accessToken: 'access-2', refreshToken: 'refresh-2'}));
    await expect(refreshOnce(base())).rejects.toThrow('Network request failed');
    await expect(refreshOnce(base())).resolves.toMatchObject({accessToken: 'access-2'});
    expect(calls('/auth/refresh')).toHaveLength(2);
  });
});

describe('refreshSessionUser', () => {
  test('merges a supplied /auth/me response into the stored user without another request', async () => {
    await saveSession(base());
    const refreshed = await refreshSessionUser({id: 'u1', ageStatus: 'minor', dateOfBirthSet: true});
    expect(request).not.toHaveBeenCalled();
    expect(refreshed!.user).toMatchObject({id: 'u1', name: 'Asha', ageStatus: 'minor', dateOfBirthSet: true});
    expect((await loadSession())!.user.ageStatus).toBe('minor');
  });

  test('fetches /auth/me when nothing is supplied', async () => {
    await saveSession(base());
    route('/auth/me', jest.fn().mockResolvedValue({id: 'u1', ageStatus: 'adult'}));
    await expect(refreshSessionUser()).resolves.toMatchObject({user: {ageStatus: 'adult'}});
  });

  test('returns null when there is no stored session to update', async () => {
    await expect(refreshSessionUser({id: 'u1'})).resolves.toBeNull();
    expect(Keychain.setGenericPassword).not.toHaveBeenCalled();
  });
});

describe('signInWithGoogle', () => {
  const googleOk = (idToken: string | null = 'google-id-token') => (GoogleSignin.signIn as jest.Mock).mockResolvedValue({type: 'success', data: {idToken}});

  test('a cancelled Google sheet returns null without touching Firebase or the API', async () => {
    (GoogleSignin.signIn as jest.Mock).mockResolvedValue({type: 'cancelled', data: null});
    await expect(signInWithGoogle()).resolves.toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  test('a successful Google response without an ID token is a configuration error', async () => {
    googleOk(null);
    await expect(signInWithGoogle()).rejects.toThrow('Google returned no ID token');
    expect(request).not.toHaveBeenCalled();
  });

  test('checks Play services on Android only', async () => {
    googleOk();
    route('/auth/firebase', jest.fn().mockResolvedValue(base({user: {...base().user, ageStatus: 'adult'}})));
    const original = Platform.OS;
    try {
      Platform.OS = 'android';
      await signInWithGoogle();
      expect(GoogleSignin.hasPlayServices).toHaveBeenCalledWith({showPlayServicesUpdateDialog: true});
      (GoogleSignin.hasPlayServices as jest.Mock).mockClear();
      Platform.OS = 'ios';
      await signInWithGoogle();
      expect(GoogleSignin.hasPlayServices).not.toHaveBeenCalled();
    } finally { Platform.OS = original; }
  });

  test('stores the session; when /auth/firebase omits the age fields they are read from /auth/me and merged in', async () => {
    googleOk();
    route('/auth/firebase', jest.fn().mockResolvedValue(base({isNewUser: true})));
    route('/auth/me', jest.fn().mockResolvedValue({id: 'u1', ageStatus: 'unknown', dateOfBirthSet: false}));
    const session = await signInWithGoogle();
    expect(session).toMatchObject({isNewUser: true, user: {ageStatus: 'unknown', dateOfBirthSet: false}});
    expect((await loadSession())!.user.ageStatus).toBe('unknown');
    expect(JSON.parse(stored!)).not.toHaveProperty('isNewUser');
  });

  test('does not call /auth/me when the exchange already carries an age status', async () => {
    googleOk();
    route('/auth/firebase', jest.fn().mockResolvedValue(base({user: {...base().user, ageStatus: 'adult'}})));
    await signInWithGoogle();
    expect(calls('/auth/me')).toHaveLength(0);
  });

  test('an /auth/me outage during sign-in still signs the user in (the age gate is best-effort)', async () => {
    googleOk();
    route('/auth/firebase', jest.fn().mockResolvedValue(base()));
    route('/auth/me', jest.fn().mockRejectedValue(new TypeError('Network request failed')));
    await expect(signInWithGoogle()).resolves.toMatchObject({accessToken: 'access-1'});
    expect(await loadSession()).toMatchObject({accessToken: 'access-1'});
  });

  test('a backend rejection of the Firebase token propagates and nothing is stored', async () => {
    googleOk();
    route('/auth/firebase', jest.fn().mockRejectedValue({status: 401, message: 'Invalid token'}));
    await expect(signInWithGoogle()).rejects.toMatchObject({status: 401});
    expect(await loadSession()).toBeNull();
  });
});

describe('logoutFromApi', () => {
  test('clears the local session first, then revokes the refresh token server-side, then signs out of Firebase and Google', async () => {
    await saveSession(base());
    const order: string[] = [];
    route('/auth/logout', jest.fn(async () => { order.push(stored === null ? 'api-after-clear' : 'api-before-clear'); }));
    (firebaseSignOut as jest.Mock).mockImplementation(async () => { order.push('firebase'); });
    (GoogleSignin.signOut as jest.Mock).mockImplementation(async () => { order.push('google'); });
    await logoutFromApi();
    expect(JSON.parse(calls('/auth/logout')[0][1].body)).toEqual({refreshToken: 'refresh-1'});
    expect(order[0]).toBe('api-after-clear');
    expect(order.slice(1).sort()).toEqual(['firebase', 'google']);
    expect(await loadSession()).toBeNull();
  });

  test('skips the API call when no session exists, but still signs out of the identity providers', async () => {
    await logoutFromApi();
    expect(request).not.toHaveBeenCalled();
    expect(firebaseSignOut).toHaveBeenCalledTimes(1);
    expect(GoogleSignin.signOut).toHaveBeenCalledTimes(1);
  });

  test('a failing revoke call still leaves the user signed out locally and signed out of Firebase/Google, but surfaces the error', async () => {
    await saveSession(base());
    route('/auth/logout', jest.fn().mockRejectedValue(new TypeError('Network request failed')));
    await expect(logoutFromApi()).rejects.toThrow('Network request failed');
    expect(await loadSession()).toBeNull();
    expect(firebaseSignOut).toHaveBeenCalledTimes(1);
    expect(GoogleSignin.signOut).toHaveBeenCalledTimes(1);
  });

  test('a failing Firebase/Google sign-out does not make logout fail', async () => {
    (firebaseSignOut as jest.Mock).mockRejectedValue(new Error('firebase'));
    (GoogleSignin.signOut as jest.Mock).mockRejectedValue(new Error('google'));
    await expect(logoutFromApi()).resolves.toBeUndefined();
    (firebaseSignOut as jest.Mock).mockResolvedValue(undefined);
    (GoogleSignin.signOut as jest.Mock).mockResolvedValue(undefined);
  });
});
