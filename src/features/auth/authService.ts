import {Platform} from 'react-native';
import {GoogleSignin, isSuccessResponse} from '@react-native-google-signin/google-signin';
import {getAuth, getIdToken, GoogleAuthProvider, signInWithCredential, signOut as firebaseSignOut} from '@react-native-firebase/auth';
import {apiRequest} from '../../core/api/apiClient';
import {ageInfoOf, fetchMe, userOf} from './age/ageService';
import {clearSession, getSessionVersion, loadSession, saveSession} from './session';
import type {AuthMeResponse, AuthSession} from './types';

const HIVA_WEB_CLIENT_ID = '45623280223-d1ldfjkerts5tbpap45iqgnfon06c0sg.apps.googleusercontent.com';
GoogleSignin.configure({webClientId: HIVA_WEB_CLIENT_ID});

export async function exchangeFirebaseToken(firebaseIdToken: string): Promise<AuthSession> {
  return apiRequest<AuthSession>('/auth/firebase', {method: 'POST', body: JSON.stringify({idToken: firebaseIdToken})});
}

export async function signInWithGoogle(): Promise<AuthSession | null> {
  if (Platform.OS === 'android') await GoogleSignin.hasPlayServices({showPlayServicesUpdateDialog: true});
  const result = await GoogleSignin.signIn();
  if (!isSuccessResponse(result)) return null;
  const googleIdToken = result.data.idToken;
  if (!googleIdToken) throw new Error('Google returned no ID token; check webClientId.');
  const {user} = await signInWithCredential(getAuth(), GoogleAuthProvider.credential(googleIdToken));
  const firebaseIdToken = await getIdToken(user, true);
  const session = await exchangeFirebaseToken(firebaseIdToken);
  await saveSession(session);
  return withAgeInfo(session);
}

/**
 * `/auth/firebase` may not carry the age fields, so read them from `/auth/me` before the
 * app decides which screen to show. Best-effort: an older server or an outage means no gate.
 */
async function withAgeInfo(session: AuthSession): Promise<AuthSession> {
  if (session.user.ageStatus) return session;
  const version = getSessionVersion();
  try {
    const info = ageInfoOf(await fetchMe());
    if (!info.ageStatus) return session;
    const merged: AuthSession = {...session, user: {...session.user, ...info}};
    await saveSession(merged, version);
    return merged;
  } catch {
    return session;
  }
}

/**
 * Re-reads `/auth/me` (or uses a response the caller already has) and stores it as the
 * session user, so restarts and token refreshes see the latest age status.
 */
export async function refreshSessionUser(latest?: AuthMeResponse): Promise<AuthSession | null> {
  const version = getSessionVersion();
  const me = latest ?? await fetchMe();
  const stored = await loadSession();
  if (!stored) return null;
  const refreshed: AuthSession = {...stored, user: {...stored.user, ...userOf(me), ...ageInfoOf(me)}};
  await saveSession(refreshed, version);
  return refreshed;
}

export async function refreshBackendSession(session: AuthSession): Promise<AuthSession> {
  const version = getSessionVersion();
  const tokens = await apiRequest<Partial<AuthSession>>('/auth/refresh', {method: 'POST', body: JSON.stringify({refreshToken: session.refreshToken})});
  if (!tokens.accessToken || !tokens.refreshToken) {
    throw new Error('Refresh response did not include both tokens.');
  }
  const refreshed: AuthSession = {...session, ...tokens};
  if (!await saveSession(refreshed, version)) {
    throw new Error('Session changed while refreshing.');
  }
  return refreshed;
}

export async function restoreBackendSession(): Promise<AuthSession | null> {
  const stored = await loadSession();
  if (!stored) {
    const user = getAuth().currentUser;
    if (!user) return null;
    const firebaseIdToken = await getIdToken(user, true);
    const session = await exchangeFirebaseToken(firebaseIdToken);
    await saveSession(session);
    return withAgeInfo(session);
  }
  const version = getSessionVersion();
  try {
    const current = await fetchMe();
    const latest = await loadSession();
    const base = latest ?? stored;
    const restored: AuthSession = {...base, user: {...base.user, ...userOf(current), ...ageInfoOf(current)}};
    // Persist the age status so an offline restart still shows the right gate.
    if (getSessionVersion() === version) await saveSession(restored, version).catch(() => false);
    return restored;
  } catch (error) {
    if ((error as {status?: number}).status === 401) return null;
    // A temporary outage should not discard a valid locally stored session.
    return getSessionVersion() === version ? stored : loadSession();
  }
}

let refreshInFlight: {refreshToken: string; promise: Promise<AuthSession>} | null = null;
export function refreshOnce(session: AuthSession): Promise<AuthSession> {
  if (!refreshInFlight || refreshInFlight.refreshToken !== session.refreshToken) {
    const promise = (async () => {
      const current = await loadSession();
      if (!current) throw {status: 401, message: 'Session expired.'};
      if (current.refreshToken !== session.refreshToken) return current;
      return refreshBackendSession(current);
    })().finally(() => {
      if (refreshInFlight?.promise === promise) refreshInFlight = null;
    });
    refreshInFlight = {refreshToken: session.refreshToken, promise};
  }
  return refreshInFlight.promise;
}

export async function logoutFromApi(): Promise<void> {
  const refreshToken = (await loadSession())?.refreshToken;
  await clearSession();
  try {
    if (refreshToken) {
      await apiRequest('/auth/logout', {method: 'POST', body: JSON.stringify({refreshToken})});
    }
  }
  finally { await Promise.allSettled([firebaseSignOut(getAuth()), GoogleSignin.signOut()]); }
}
