import {Platform} from 'react-native';
import {
  endConnection, fetchProducts, getAvailablePurchases, initConnection,
  purchaseErrorListener, purchaseUpdatedListener, requestPurchase,
  type EventSubscription, type Purchase, type PurchaseError,
} from 'react-native-iap';
import {buildPlanOptions, type SubscriptionProductLike} from './pricing';
import {verifyGooglePlayPurchase} from './plusService';
import {setSubscription} from './plusStore';
import type {BillingError, BillingErrorKind, PlanOption, PurchaseOutcome, Subscription, SubscriptionPlanRef} from './types';

/**
 * Google Play Billing via react-native-iap (Nitro, Play Billing 9). Purchases arrive through the
 * purchase listener and are posted to our backend, which verifies AND acknowledges them. The app never
 * acknowledges or consumes: on Android react-native-iap's `finishTransaction({isConsumable: false})` is
 * exactly an acknowledge call, so it is deliberately not used here (the backend contract forbids it).
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

export function isBillingError(error: unknown): error is BillingError {
  const value = error as BillingError | null;
  return !!value && typeof value === 'object' && typeof value.kind === 'string' && typeof value.message === 'string' && value.kind in MESSAGES;
}

type Waiter = {productId: string; resolve: (outcome: PurchaseOutcome) => void; reject: (error: BillingError) => void};

let connection: Promise<boolean> | null = null;
let subscriptions: EventSubscription[] = [];
let waiter: Waiter | null = null;
/** Tokens already sent to the backend in this session, so replays from Play aren't posted twice. */
const handledTokens = new Set<string>();

const settle = (productId: string, result: {outcome?: PurchaseOutcome; error?: BillingError}) => {
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

async function onPurchaseUpdated(purchase: Purchase) {
  if (purchase.purchaseState === 'pending') {
    settle(purchase.productId, {outcome: {status: 'pending'}});
    return;
  }
  if (purchase.purchaseState !== 'purchased' || !purchase.purchaseToken) return;
  if (handledTokens.has(purchase.purchaseToken) && !waiter) return;
  try {
    const subscription = await syncPurchase(purchase);
    settle(purchase.productId, {outcome: {status: 'active', subscription}});
  } catch (error) {
    settle(purchase.productId, {error: toBillingError(error)});
  }
}

function onPurchaseError(error: PurchaseError) {
  if (!waiter) return;
  settle(waiter.productId, {error: toBillingError(error)});
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

/**
 * Starts the Play purchase sheet for one base plan offer and resolves once the backend has verified
 * the purchase (or Play reports it pending). Rejects with a `BillingError`.
 */
export async function purchasePlan(option: PlanOption): Promise<PurchaseOutcome> {
  if (!(await connectBilling())) throw billingError('unavailable');
  if (waiter) throw billingError('unknown', 'A purchase is already in progress.');
  const result = new Promise<PurchaseOutcome>((resolve, reject) => {waiter = {productId: option.productId, resolve, reject};});
  try {
    await requestPurchase({
      type: 'subs',
      request: {google: {skus: [option.productId], subscriptionOffers: [{sku: option.productId, offerToken: option.offerToken}]}},
    });
  } catch (error) {
    settle(option.productId, {error: toBillingError(error)});
  }
  return result;
}

/**
 * Re-links subscriptions this Google account already owns: every active Hiva subscription purchase is
 * posted to the backend and finished. Rejects with `notFound` when there is nothing to restore.
 */
export async function restorePurchases(productIds: string[]): Promise<Subscription> {
  if (!(await connectBilling())) throw billingError('unavailable');
  let purchases: Purchase[];
  try {
    purchases = await getAvailablePurchases();
  } catch (error) {
    throw toBillingError(error);
  }
  const ours = purchases.filter(purchase => productIds.includes(purchase.productId) && purchase.purchaseState === 'purchased' && !!purchase.purchaseToken);
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
}
