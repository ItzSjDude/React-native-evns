import {apiRequest} from '../../core/api/apiClient';
import {ANDROID_PACKAGE} from './plusService';
import type {ProfileThemeEntry} from './types';

/** `POST /me/profile-themes/google-play`. */
export type ThemePurchaseResult = {themeId: string; owned: boolean; alreadyOwned: boolean};

/** What a theme purchase resolves to in the UI: unlocked, or waiting on Play. */
export type ThemePurchaseOutcome = {status: 'owned'; themeId: string} | {status: 'pending'};

const ID = /^[a-z][a-z0-9_]{0,39}$/;
const ACCESS: ProfileThemeEntry['access'][] = ['FREE', 'PLUS', 'PURCHASE'];

/** Drops malformed rows so one bad catalog entry can't break the picker. */
export function normalizeProfileThemes(raw: unknown): ProfileThemeEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item: Record<string, unknown> | null) => {
    if (!item || typeof item.id !== 'string' || !ID.test(item.id) || typeof item.name !== 'string' || !item.name.trim()) return [];
    const access = ACCESS.find(value => value === item.access);
    if (!access) return [];
    const productId = typeof item.productId === 'string' && item.productId ? {productId: item.productId} : {};
    return [{id: item.id, name: item.name, access, available: item.available === true, owned: item.owned === true, ...productId}];
  });
}

/** `[]` when the server has no theme catalog yet (404): the picker hides and every profile renders default. */
export async function getProfileThemes(): Promise<ProfileThemeEntry[]> {
  try {
    return normalizeProfileThemes(await apiRequest<unknown>('/me/profile-themes', {auth: 'required'}));
  } catch (error) {
    if ((error as {status?: number})?.status === 404) return [];
    throw error;
  }
}

/**
 * The server verifies AND acknowledges the one-time purchase. Errors: 404 permanent themes disabled, 400 product not in
 * the catalog / purchase not complete, 409 purchase belongs to another account or theme, 503 PLAY_NOT_CONFIGURED.
 * The token is only ever sent in the body, never logged.
 */
export const verifyThemePurchase = (productId: string, purchaseToken: string) =>
  apiRequest<ThemePurchaseResult>('/me/profile-themes/google-play', {
    auth: 'required', method: 'POST', body: JSON.stringify({productId, purchaseToken, packageName: ANDROID_PACKAGE}),
  });
