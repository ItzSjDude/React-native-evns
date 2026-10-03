import {Platform} from 'react-native';
import {GoogleSignin, isSuccessResponse} from '@react-native-google-signin/google-signin';
import {getAuth, getIdToken, GoogleAuthProvider, signInWithCredential, signOut as firebaseSignOut} from '@react-native-firebase/auth';
import {apiRequest} from '../../core/api/apiClient';
import {clearSession, loadSession, saveSession} from './session';
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
  const refreshed = await apiRequest<AuthSession>('/auth/refresh', {method: 'POST', body: JSON.stringify({refreshToken: session.refreshToken})});
  await saveSession(refreshed);
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
  try {
    const current = await apiRequest<{user: AuthSession['user']}>('/auth/me', {}, stored.accessToken);
    return {...stored, user: current.user};
  } catch (error) {
    if ((error as {status?: number}).status !== 401) throw error;
    try { return await refreshOnce(stored); }
    catch (refreshError) {
      const status = (refreshError as {status?: number}).status;
      if (status === 400 || status === 401 || status === 403) { await clearSession(); return null; }
      throw refreshError;
    }
  }
}

let refreshInFlight: Promise<AuthSession> | null = null;
export function refreshOnce(session: AuthSession): Promise<AuthSession> {
  if (!refreshInFlight) refreshInFlight = refreshBackendSession(session).finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

export async function logoutFromApi(refreshToken: string): Promise<void> {
  try { await apiRequest('/auth/logout', {method: 'POST', body: JSON.stringify({refreshToken})}); }
  finally { await clearSession(); await Promise.allSettled([firebaseSignOut(getAuth()), GoogleSignin.signOut()]); }
}
