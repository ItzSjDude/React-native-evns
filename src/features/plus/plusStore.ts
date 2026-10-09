import {getSubscription} from './plusService';
import type {LimitReachedDetails, LimitReason, PaywallState, Subscription} from './types';

/**
 * Server state for the signed-in user's subscription, cached in memory and shared by every `usePlus()`
 * caller, plus the one app-wide paywall's visibility. Kept outside React so services can open the paywall.
 */
export type PlusState = {
  /** idle: never fetched; unavailable: the route 404s or `enabled` is false, so Plus is hidden everywhere. */
  status: 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';
  subscription: Subscription | null;
  fetchedAt: number;
  paywall: PaywallState;
};

const INITIAL: PlusState = {status: 'idle', subscription: null, fetchedAt: 0, paywall: {visible: false}};
let state: PlusState = INITIAL;
const listeners = new Set<() => void>();
let inflight: Promise<Subscription | null> | null = null;
/** Bumped on reset so a response for a signed-out user is dropped. */
let generation = 0;

const emit = (next: Partial<PlusState>) => {
  state = {...state, ...next};
  listeners.forEach(listener => listener());
};

export const getPlusState = () => state;
export const subscribePlus = (listener: () => void) => {
  listeners.add(listener);
  return () => {listeners.delete(listener);};
};

/** Plus is offered only when the server enables it and has plans to sell (`plans` is [] while its flag is off). */
const offered = (subscription: Subscription | null) => !!subscription?.enabled && subscription.plans.length > 0;
export const isPlusEnabled = (value: PlusState = state) => value.status === 'ready' && offered(value.subscription);
export const isPlusActive = (value: PlusState = state) => isPlusEnabled(value) && value.subscription?.plan === 'plus';

export function setSubscription(subscription: Subscription | null) {
  emit({
    subscription,
    status: offered(subscription) ? 'ready' : 'unavailable',
    fetchedAt: Date.now(),
    paywall: offered(subscription) ? state.paywall : {visible: false},
  });
}

/** Fetches unless a recent copy is cached; concurrent callers share one request. */
export function refreshSubscription({maxAgeMs = 0}: {maxAgeMs?: number} = {}): Promise<Subscription | null> {
  if (inflight) return inflight;
  if (maxAgeMs > 0 && state.fetchedAt && Date.now() - state.fetchedAt < maxAgeMs && state.status !== 'error') {
    return Promise.resolve(state.subscription);
  }
  const run = generation;
  if (state.status === 'idle') emit({status: 'loading'});
  inflight = getSubscription()
    .then(subscription => {
      if (run === generation) setSubscription(subscription);
      return subscription;
    })
    .catch(() => {
      // Keep whatever we had; an unknown state never shows Plus entry points.
      if (run === generation) emit({status: state.subscription ? state.status : 'error'});
      return state.subscription;
    })
    .finally(() => {inflight = null;});
  return inflight;
}

/**
 * Opens the app-wide paywall. If the subscription hasn't loaded yet it loads first. Nothing opens when Plus
 * is disabled, or for a limit error unless the server says `plusAvailable: true`.
 */
export function openPaywall(reason?: LimitReason, details?: LimitReachedDetails) {
  if (details && details.plusAvailable !== true) return;
  const show = () => {if (isPlusEnabled()) emit({paywall: {visible: true, reason, details}});};
  if (state.status === 'ready') show();
  else refreshSubscription().then(show).catch(() => {});
}

export const closePaywall = () => emit({paywall: {...state.paywall, visible: false}});

/** Sign-out: forget the previous user's subscription. */
export function resetPlus() {
  generation += 1;
  inflight = null;
  state = INITIAL;
  listeners.forEach(listener => listener());
}
