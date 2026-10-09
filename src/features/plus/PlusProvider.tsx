import React, {useEffect} from 'react';
import {AppState} from 'react-native';
import {useAppSelector} from '../../core/store/hooks';
import {disconnectBilling, syncAvailablePurchases} from './billing';
import PaywallSheet from './PaywallSheet';
import {closePaywall, refreshSubscription, resetPlus} from './plusStore';
import {usePaywall, usePlus} from './usePlus';

/** Foreground refreshes closer together than this reuse the cached state. */
const FOREGROUND_MAX_AGE_MS = 30_000;

/**
 * Loads the subscription for the signed-in user, refreshes it on foreground, keeps the Play connection
 * open while Plus is enabled and renders the one paywall the whole app shares.
 */
export default function PlusProvider({children}: {children?: React.ReactNode}) {
  const authStatus = useAppSelector(state => state.auth.status);
  const {enabled, subscription} = usePlus();
  const {paywall} = usePaywall();
  const signedIn = authStatus === 'authenticated';

  useEffect(() => {
    if (!signedIn) {
      resetPlus();
      disconnectBilling().catch(() => {});
      return;
    }
    refreshSubscription().catch(() => {});
    const listener = AppState.addEventListener('change', next => {
      if (next === 'active') refreshSubscription({maxAgeMs: FOREGROUND_MAX_AGE_MS}).catch(() => {});
    });
    return () => listener.remove();
  }, [signedIn]);

  // Once per sign-in (and whenever the sold products change): post every purchase Play knows about.
  const productKey = [...new Set((subscription?.plans ?? []).map(plan => plan.productId))].join(',');
  useEffect(() => {
    if (!signedIn || !enabled || !productKey) return;
    syncAvailablePurchases(productKey.split(',')).catch(() => {});
  }, [enabled, productKey, signedIn]);

  return <>
    {children}
    {enabled && <PaywallSheet visible={paywall.visible} reason={paywall.reason} details={paywall.details} onClose={closePaywall} />}
  </>;
}
