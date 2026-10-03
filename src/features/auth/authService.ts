import {Platform} from 'react-native';
import {GoogleSignin, isSuccessResponse} from '@react-native-google-signin/google-signin';
import {getAuth, getIdToken, GoogleAuthProvider, signInWithCredential, signOut as firebaseSignOut} from '@react-native-firebase/auth';
import {apiRequest} from '../../core/api/apiClient';
import {clearSession, getSessionVersion, loadSession, saveSession} from './session';
import type {AuthSession} from './types';

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
  return session;
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
    return session;
  }
  const version = getSessionVersion();
  try {
    const current = await apiRequest<{user: AuthSession['user']}>('/auth/me', {auth: 'required'});
    const latest = await loadSession();
    return {...(latest ?? stored), user: current.user};
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
