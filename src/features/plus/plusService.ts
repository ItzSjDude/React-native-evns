import {apiRequest} from '../../core/api/apiClient';
import type {Subscription, SubscriptionPlanRef} from './types';

export const DEFAULT_PRODUCT_ID = 'hiva_plus';
export const DEFAULT_PLANS: SubscriptionPlanRef[] = ['weekly', 'monthly', 'yearly'].map(basePlanId => ({productId: DEFAULT_PRODUCT_ID, basePlanId}));
export const ANDROID_PACKAGE = 'com.hivachat.app';

const asNumber = (value: unknown, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

/** Tolerates partial payloads while the backend contract settles. */
export function normalizeSubscription(raw: Partial<Subscription> | null | undefined): Subscription {
  const plans = Array.isArray(raw?.plans) ? raw.plans.filter(plan => plan && typeof plan.productId === 'string' && typeof plan.basePlanId === 'string') : [];
  return {
    enabled: raw?.enabled === true,
    plan: raw?.plan === 'plus' ? 'plus' : 'free',
    status: raw?.status ?? null,
    productId: raw?.productId ?? null,
    basePlanId: raw?.basePlanId ?? null,
    expiresAt: raw?.expiresAt ?? null,
    autoRenewing: raw?.autoRenewing === true,
    limits: raw?.limits ? {
      dmStartsPerDay: asNumber(raw.limits.dmStartsPerDay),
      vibeNotesPerDay: asNumber(raw.limits.vibeNotesPerDay),
      vibeNoteMaxMinutes: asNumber(raw.limits.vibeNoteMaxMinutes),
      randomMatchesPerDay: asNumber(raw.limits.randomMatchesPerDay),
    } : null,
    usage: raw?.usage ? {
      dmStartsToday: asNumber(raw.usage.dmStartsToday),
      vibeNotesToday: asNumber(raw.usage.vibeNotesToday),
      randomMatchesToday: asNumber(raw.usage.randomMatchesToday),
      resetAt: raw.usage.resetAt ?? null,
    } : null,
    // The server sends [] while the Plus flag is off; that hides the paywall.
    plans,
  };
}

const isNotFound = (error: unknown) => (error as {status?: number})?.status === 404;

/** `null` when the server doesn't have subscriptions yet (404), which hides every Plus entry point. */
export async function getSubscription(): Promise<Subscription | null> {
  try {
    return normalizeSubscription(await apiRequest<Subscription>('/me/subscription', {auth: 'required'}));
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/**
 * The server verifies AND acknowledges the purchase, then returns the new state. Errors: 404 PLUS_DISABLED,
 * 400 PRODUCT_MISMATCH | PACKAGE_MISMATCH | INVALID_PURCHASE, 409 TOKEN_IN_USE, 502 UPSTREAM_ERROR, 503 PLAY_NOT_CONFIGURED.
 */
export const verifyGooglePlayPurchase = async (productId: string, purchaseToken: string) =>
  normalizeSubscription(await apiRequest<Subscription>('/me/subscription/google-play', {
    auth: 'required', method: 'POST', body: JSON.stringify({productId, purchaseToken, packageName: ANDROID_PACKAGE}),
  }));

export const manageSubscriptionUrl = (productId?: string | null) =>
  `https://play.google.com/store/account/subscriptions?${productId ? `sku=${encodeURIComponent(productId)}&` : ''}package=${ANDROID_PACKAGE}`;
