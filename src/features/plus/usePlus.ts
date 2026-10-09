import {useCallback, useSyncExternalStore} from 'react';
import {closePaywall, getPlusState, isPlusActive, isPlusEnabled, openPaywall, refreshSubscription, subscribePlus} from './plusStore';

/** Cached subscription state. `enabled` is false until the server confirms Plus exists, so entry points stay hidden. */
export function usePlus() {
  const state = useSyncExternalStore(subscribePlus, getPlusState, getPlusState);
  const refresh = useCallback(() => refreshSubscription(), []);
  return {
    status: state.status,
    subscription: state.subscription,
    enabled: isPlusEnabled(state),
    isPlus: isPlusActive(state),
    refresh,
  };
}

/** Opens the single app-wide paywall rendered by `PlusProvider`. */
export function usePaywall() {
  const paywall = useSyncExternalStore(subscribePlus, () => getPlusState().paywall, () => getPlusState().paywall);
  return {openPaywall, closePaywall, paywall};
}
