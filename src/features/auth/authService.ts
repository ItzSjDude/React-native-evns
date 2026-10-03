import {apiRequest} from '../../core/api/apiClient';
import type {AuthSession} from './types';

export async function signInWithGoogle(
  idToken: string,
): Promise<AuthSession> {
  console.log('[Auth] Google ID token received; calling auth API', {
    tokenLength: idToken.length,
  });

  const response = await apiRequest<AuthSession>('/auth/firebase', {
    method: 'POST',
    body: JSON.stringify({
      idToken,
    }),
  });

  console.log('[Auth API] /auth/firebase response:', response);

  return response;
}

export function logoutFromApi(refreshToken: string): Promise<unknown> {
  return apiRequest('/auth/logout', {
    method: 'POST',
    body: JSON.stringify({
      refreshToken,
    }),
  });
}