import {Platform} from 'react-native';
import {
  endConnection, fetchProducts, getAvailablePurchases, initConnection,
  purchaseErrorListener, purchaseUpdatedListener, requestPurchase,
  type EventSubscription, type Purchase, type PurchaseError,
} from 'react-native-iap';
import {buildPlanOptions, type SubscriptionProductLike} from './pricing';
import {verifyGooglePlayPurchase} from './plusService';
import {setSubscription} from './plusStore';
import {refreshProfileThemes} from './profileThemeStore';
import {verifyThemePurchase, type ThemePurchaseOutcome} from './profileThemeService';
import type {BillingError, BillingErrorKind, PlanOption, PurchaseOutcome, Subscription, SubscriptionPlanRef} from './types';

/**
 * Google Play Billing via react-native-iap (Nitro, Play Billing 9). Purchases arrive through the
 * purchase listener and are posted to our backend, which verifies AND acknowledges them. The app never
 * acknowledges or consumes: on Android react-native-iap's `finishTransaction({isConsumable: false})` is
 * exactly an acknowledge call, so it is deliberately not used here (the backend contract forbids it).
 * The same holds for permanent theme packs (one-time products): the backend verifies, acknowledges and revokes on refund.
 */

export const UNAVAILABLE_MESSAGE = 'Purchases aren’t available on this device';

const MESSAGES: Record<BillingErrorKind, string> = {
  cancelled: 'Purchase cancelled.',
  unavailable: UNAVAILABLE_MESSAGE,
  alreadyOwned: 'You already have this subscription. Tap “Restore purchases” to link it.',
  pending: 'Your payment is pending. Plus unlocks as soon as Google Play confirms it.',
  network: 'Couldn’t reach Google Play. Check your connection and try again.',
  tokenInUse: 'This Google Play subscription is already linked to another Hiva account.',
  disabled: 'Hiva Plus isn’t available right now.',
  invalid: 'Google Play couldn’t confirm this purchase. If you were charged, it will be refunded automatically.',
  verifyFailed: 'We couldn’t confirm your purchase yet. Tap “Restore purchases” in a moment.',
  notFound: 'No Hiva Plus subscription was found on this Google account.',
  unknown: 'Something went wrong with Google Play. Please try again.',
};

/** Theme packs are one-time products with their own copy; everything else falls back to the subscription messages. */
const THEME_MESSAGES: Partial<Record<BillingErrorKind, string>> = {
  alreadyOwned: 'You already own this theme. Tap “Restore theme purchases” to link it.',
  pending: 'Your payment is pending. The theme unlocks as soon as Google Play confirms it.',
  tokenInUse: 'This Google Play purchase is already linked to another Hiva account.',
  disabled: 'Theme packs aren’t available right now.',
  notFound: 'No theme purchases were found on this Google account.',
};

const billingError = (kind: BillingErrorKind, message = MESSAGES[kind]): BillingError => ({kind, message});

const UNAVAILABLE_CODES = new Set(['billing-unavailable', 'iap-not-available', 'init-connection', 'feature-not-supported', 'service-disconnected', 'connection-closed', 'not-prepared']);

/** Maps a store error or an API error from our verify call into something the UI can show. */
export function toBillingError(error: unknown): BillingError {
  if (isBillingError(error)) return error;
  const value = error as {code?: unknown; status?: number; message?: string} | null;
  const code = String(value?.code ?? '');
  if (value?.status === 409 && code === 'TOKEN_IN_USE') return billingError('tokenInUse');
  if (code === 'PLUS_DISABLED' || code === 'PLAY_NOT_CONFIGURED') return billingError('disabled');
  if (code === 'PRODUCT_MISMATCH' || code === 'PACKAGE_MISMATCH' || code === 'INVALID_PURCHASE') return billingError('invalid');
  if (typeof value?.status === 'number') return billingError('verifyFailed', value.status >= 500 || value.status === 408 ? MESSAGES.verifyFailed : value.message || MESSAGES.verifyFailed);
  if (code === 'user-cancelled') return billingError('cancelled');
  if (UNAVAILABLE_CODES.has(code)) return billingError('unavailable');
  if (code === 'already-owned') return billingError('alreadyOwned');
  if (code === 'pending' || code === 'deferred-payment') return billingError('pending');
  if (code === 'network-error' || code === 'service-timeout' || code === 'service-error' || code === 'remote-error') return billingError('network');
  if (code === 'sku-not-found' || code === 'item-unavailable' || code === 'sku-offer-mismatch') return billingError('unknown', 'This plan isn’t available right now.');
  return billingError('unknown');
}

/** Like `toBillingError` for theme purchases: 409 (another account/theme), 404 (disabled), 503 (Play not configured), 400 (not complete). */
export function toThemeBillingError(error: unknown): BillingError {
  const status = (error as {status?: unknown} | null)?.status;
  const kind: BillingErrorKind | null = status === 409 ? 'tokenInUse' : status === 404 || status === 503 ? 'disabled' : status === 400 ? 'invalid' : null;
  const base = kind ? billingError(kind) : toBillingError(error);
  return billingError(base.kind, THEME_MESSAGES[base.kind] ?? base.message);
}

export function isBillingError(error: unknown): error is BillingError {
  const value = error as BillingError | null;
  return !!value && typeof value === 'object' && typeof value.kind === 'string' && typeof value.message === 'string' && value.kind in MESSAGES;
}

type Waiter = {productId: string; resolve: (outcome: PurchaseOutcome | ThemePurchaseOutcome) => void; reject: (error: BillingError) => void};

let connection: Promise<boolean> | null = null;
let subscriptions: EventSubscription[] = [];
let waiter: Waiter | null = null;
/** Theme pack product ids seen this session: their purchases go to the theme endpoint, not the subscription one. */
const themeProducts = new Set<string>();
/** Tokens already sent to the backend in this session, so replays from Play aren't posted twice. */
const handledTokens = new Set<string>();

const settle = (productId: string, result: {outcome?: PurchaseOutcome | ThemePurchaseOutcome; error?: BillingError}) => {
  if (!waiter || waiter.productId !== productId) return;
  const current = waiter;
  waiter = null;
  if (result.error) current.reject(result.error);
  else current.resolve(result.outcome!);
};

/** Posts one purchase to the backend (which acknowledges it) and publishes the new subscription state. */
async function syncPurchase(purchase: Purchase): Promise<Subscription> {
  const token = purchase.purchaseToken;
  if (!token) throw billingError('verifyFailed');
  const subscription = await verifyGooglePlayPurchase(purchase.productId, token);
  handledTokens.add(token);
  setSubscription(subscription);
  return subscription;
}

/** Posts one theme purchase (the backend acknowledges it), then refetches the catalog so ownership shows everywhere. */
async function syncThemePurchase(purchase: Purchase): Promise<string> {
  const token = purchase.purchaseToken;
  if (!token) throw billingError('verifyFailed');
  const result = await verifyThemePurchase(purchase.productId, token);
  if (!result.owned) throw billingError('invalid', THEME_MESSAGES.invalid);
  handledTokens.add(token);
  await refreshProfileThemes();
  return result.themeId;
}

const toError = (productId: string, error: unknown) => (themeProducts.has(productId) ? toThemeBillingError(error) : toBillingError(error));

async function onPurchaseUpdated(purchase: Purchase) {
  if (purchase.purchaseState === 'pending') {
    settle(purchase.productId, {outcome: {status: 'pending'}});
    return;
  }
  if (purchase.purchaseState !== 'purchased' || !purchase.purchaseToken) return;
  if (handledTokens.has(purchase.purchaseToken) && !waiter) return;
  try {
    const outcome: PurchaseOutcome | ThemePurchaseOutcome = themeProducts.has(purchase.productId)
      ? {status: 'owned', themeId: await syncThemePurchase(purchase)}
      : {status: 'active', subscription: await syncPurchase(purchase)};
    settle(purchase.productId, {outcome});
  } catch (error) {
    settle(purchase.productId, {error: toError(purchase.productId, error)});
  }
}

function onPurchaseError(error: PurchaseError) {
  if (!waiter) return;
  settle(waiter.productId, {error: toError(waiter.productId, error)});
}

/** Opens the Play connection and attaches listeners once. Resolves false when this device can't buy. */
export function connectBilling(): Promise<boolean> {
  if (Platform.OS !== 'android') return Promise.resolve(false);
  if (connection) return connection;
  connection = (async () => {
    try {
      subscriptions = [
        purchaseUpdatedListener(purchase => {onPurchaseUpdated(purchase).catch(() => {});}),
        purchaseErrorListener(onPurchaseError),
      ];
      const ready = await initConnection();
      if (!ready) throw billingError('unavailable');
      return true;
    } catch {
      subscriptions.forEach(subscription => subscription.remove());
      subscriptions = [];
      connection = null;
      return false;
    }
  })();
  return connection;
}

export async function disconnectBilling() {
  const wasConnected = connection;
  subscriptions.forEach(subscription => subscription.remove());
  subscriptions = [];
  connection = null;
  if (waiter) settle(waiter.productId, {error: billingError('cancelled')});
  handledTokens.clear();
  themeProducts.clear();
  if (wasConnected) await endConnection().catch(() => {});
}

/** Play's localized offers for the backend's base plans. Throws `unavailable` when billing is missing. */
export async function loadPlanOptions(plans: SubscriptionPlanRef[]): Promise<PlanOption[]> {
  if (!(await connectBilling())) throw billingError('unavailable');
  const skus = [...new Set(plans.map(plan => plan.productId))];
  try {
    const products = await fetchProducts({skus, type: 'subs'});
    return buildPlanOptions((products ?? []) as SubscriptionProductLike[], plans);
  } catch (error) {
    throw toBillingError(error);
  }
}

/** Opens the Play purchase sheet and resolves once the backend has verified the purchase (or Play reports it pending). */
async function runPurchase<T extends PurchaseOutcome | ThemePurchaseOutcome>(productId: string, request: Parameters<typeof requestPurchase>[0]): Promise<T> {
  if (!(await connectBilling())) throw billingError('unavailable');
  if (waiter) throw billingError('unknown', 'A purchase is already in progress.');
  const result = new Promise<T>((resolve, reject) => {waiter = {productId, resolve: resolve as Waiter['resolve'], reject};});
  try {
    await requestPurchase(request);
  } catch (error) {
    settle(productId, {error: toError(productId, error)});
  }
  return result;
}

/** Starts the subscription purchase for one base plan offer. Rejects with a `BillingError`. */
export const purchasePlan = (option: PlanOption) => runPurchase<PurchaseOutcome>(option.productId, {
  type: 'subs',
  request: {google: {skus: [option.productId], subscriptionOffers: [{sku: option.productId, offerToken: option.offerToken}]}},
});

/** Play's localized price per permanent theme product (`{productId: '₹49'}`); a product Play doesn't know is left out. */
export async function loadThemePrices(productIds: string[]): Promise<Record<string, string>> {
  if (!(await connectBilling())) throw billingError('unavailable');
  productIds.forEach(id => themeProducts.add(id));
  try {
    const products = await fetchProducts({skus: productIds, type: 'in-app'});
    return Object.fromEntries((products ?? []).map(product => [product.id, product.displayPrice]));
  } catch (error) {
    throw toThemeBillingError(error);
  }
}

/** Buys one permanent theme pack (one-time product). Resolves `owned` after the backend verified it. */
export function purchaseTheme(productId: string) {
  themeProducts.add(productId);
  return runPurchase<ThemePurchaseOutcome>(productId, {type: 'in-app', request: {google: {skus: [productId]}}});
}

/** Completed Play purchases of this Google account for the given products. */
async function ownedPurchases(productIds: string[]): Promise<Purchase[]> {
  if (!(await connectBilling())) throw billingError('unavailable');
  try {
    const purchases = await getAvailablePurchases();
    return purchases.filter(purchase => productIds.includes(purchase.productId) && purchase.purchaseState === 'purchased' && !!purchase.purchaseToken);
  } catch (error) {
    throw toBillingError(error);
  }
}

/**
 * Re-links subscriptions this Google account already owns: every active Hiva subscription purchase is
 * posted to the backend, which verifies and acknowledges it. Rejects with `notFound` when there is nothing to restore.
 */
export async function restorePurchases(productIds: string[]): Promise<Subscription> {
  const ours = await ownedPurchases(productIds);
  if (!ours.length) throw billingError('notFound');
  let latest: Subscription | null = null;
  let failure: unknown = null;
  for (const purchase of ours) {
    try {latest = await syncPurchase(purchase);}
    catch (error) {failure = error;}
  }
  if (latest) return latest;
  throw toBillingError(failure);
}

/** Re-posts the permanent themes this Google account owns; resolves with the theme ids the backend confirmed. */
export async function restoreThemePurchases(productIds: string[]): Promise<string[]> {
  productIds.forEach(id => themeProducts.add(id));
  const ours = await ownedPurchases(productIds);
  if (!ours.length) throw billingError('notFound', THEME_MESSAGES.notFound);
  const restored: string[] = [];
  let failure: unknown = null;
  for (const purchase of ours) {
    try {restored.push(await syncThemePurchase(purchase));}
    catch (error) {failure = error;}
  }
  if (restored.length) return restored;
  throw toThemeBillingError(failure);
}

/**
 * Launch sync: posts every Hiva purchase Play reports for this Google account so the backend can link,
 * renew or acknowledge it (covers a purchase whose POST never landed; Play refunds unacknowledged ones after 3 days).
 */
export async function syncAvailablePurchases(productIds: string[]): Promise<void> {
  if (!(await connectBilling())) return;
  const purchases = await getAvailablePurchases().catch(() => [] as Purchase[]);
  for (const purchase of purchases) {
    if (!productIds.includes(purchase.productId) || purchase.purchaseState !== 'purchased') continue;
    if (purchase.purchaseToken && handledTokens.has(purchase.purchaseToken)) continue;
    await syncPurchase(purchase).catch(() => {});
  }
}

/** Test-only: forget module state between tests. */
export function resetBillingForTests() {
  subscriptions = [];
  connection = null;
  waiter = null;
  handledTokens.clear();
  themeProducts.clear();
}
