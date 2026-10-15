import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import {AdsConsent, MobileAds} from 'react-native-google-mobile-ads';
import {NATIVE_AD_UNIT_ID} from './adConfig';

type AdsContextValue = {ready: boolean; showPrivacyOptions: () => Promise<void>};
const AdsContext = createContext<AdsContextValue>({ready: false, showPrivacyOptions: async () => {}});
let initializePromise: Promise<unknown> | null = null;

// A rejected initialisation is dropped from the cache so the next consent refresh retries it.
const initializeAds = () => {
  initializePromise ??= MobileAds().initialize().catch(error => {
    initializePromise = null;
    throw error;
  });
  return initializePromise;
};

export default function AdsProvider({children}: {children: React.ReactNode}) {
  const [ready, setReady] = useState(false);

  const refreshConsent = useCallback(async () => {
    const info = await AdsConsent.getConsentInfo();
    if (info.canRequestAds) {
      await initializeAds();
      setReady(true);
    } else setReady(false);
  }, []);

  useEffect(() => {
    if (!NATIVE_AD_UNIT_ID) return;
    let mounted = true;
    AdsConsent.gatherConsent()
      .catch(() => AdsConsent.getConsentInfo())
      .then(async info => {
        if (!mounted || !info.canRequestAds) return;
        await initializeAds();
        if (mounted) setReady(true);
      })
      .catch(() => {});
    return () => {mounted = false;};
  }, []);

  const showPrivacyOptions = useCallback(async () => {
    await AdsConsent.showPrivacyOptionsForm();
    await refreshConsent();
  }, [refreshConsent]);
  const value = useMemo(() => ({ready, showPrivacyOptions}), [ready, showPrivacyOptions]);

  return <AdsContext.Provider value={value}>{children}</AdsContext.Provider>;
}

export const useAds = () => useContext(AdsContext);
