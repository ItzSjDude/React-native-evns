import React, {createContext, useContext, useEffect, useState} from 'react';
import {AdsConsent, MobileAds} from 'react-native-google-mobile-ads';
import {NATIVE_AD_UNIT_ID} from './adConfig';

type AdsContextValue = {ready: boolean; showPrivacyOptions: () => Promise<void>};
const AdsContext = createContext<AdsContextValue>({ready: false, showPrivacyOptions: async () => {}});
let initializePromise: Promise<unknown> | null = null;

export default function AdsProvider({children}: {children: React.ReactNode}) {
  const [ready, setReady] = useState(false);

  const refreshConsent = async () => {
    const info = await AdsConsent.getConsentInfo();
    if (info.canRequestAds) {
      initializePromise ??= MobileAds().initialize();
      await initializePromise;
      setReady(true);
    } else setReady(false);
  };

  useEffect(() => {
    if (!NATIVE_AD_UNIT_ID) return;
    let mounted = true;
    AdsConsent.gatherConsent()
      .catch(() => AdsConsent.getConsentInfo())
      .then(async info => {
        if (!mounted || !info.canRequestAds) return;
        initializePromise ??= MobileAds().initialize();
        await initializePromise;
        if (mounted) setReady(true);
      })
      .catch(() => {});
    return () => {mounted = false;};
  }, []);

  const showPrivacyOptions = async () => {
    await AdsConsent.showPrivacyOptionsForm();
    await refreshConsent();
  };

  return <AdsContext.Provider value={{ready, showPrivacyOptions}}>{children}</AdsContext.Provider>;
}

export const useAds = () => useContext(AdsContext);
