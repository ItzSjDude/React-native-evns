import React, {useEffect} from 'react';
import {View} from 'react-native';
import ThemedStatusBar from '../components/ThemedStatusBar';
import {NavigationContainer} from '@react-navigation/native';
import {navigationRef} from './navigationRef';
import {AuthStack} from './StackNavigation';
import RootStack from './RootStack';
import {PartySessionProvider, PartyLinkCapture, PartyLinkHandler} from '../features/party';
import {clearVibeNoteRegions, installVibeNoteGeofenceEntryHandler} from '../features/nearby';
import {AdsProvider} from '../features/ads';
import {useAppDispatch, useAppSelector} from '../core/store/hooks';
import {configureApiAuth} from '../core/api/apiClient';
import {clearSession, clearStoredSession, loadSession, refreshOnce, registerAgeGateListener, restoreBackendSession, selectAuthRoute, setSession} from '../features/auth';

export {navigationRef};

const MainNavigation = () => {
  const route = useAppSelector(state => selectAuthRoute(state.auth));
  const dispatch = useAppDispatch();

  useEffect(() => {
    configureApiAuth({
      getAccessToken: async () => (await loadSession())?.accessToken ?? null,
      refreshAccessToken: async failedAccessToken => {
        const current = await loadSession();
        if (!current) throw {status: 401, message: 'Session expired.'};
        if (current.accessToken !== failedAccessToken) return current.accessToken;
        const refreshed = await refreshOnce(current);
        dispatch(setSession(refreshed));
        return refreshed.accessToken;
      },
      onSessionInvalid: async failedAccessToken => {
        if ((await loadSession())?.accessToken !== failedAccessToken) return;
        await clearStoredSession();
        dispatch(clearSession());
      },
    });
    const stopVibeNoteEntries = installVibeNoteGeofenceEntryHandler();
    // 403 AGE_REQUIRED / UNDERAGE from any request routes to the matching age screen.
    const stopAgeGate = registerAgeGateListener(dispatch);
    restoreBackendSession()
      .then(session => { if (session) dispatch(setSession(session)); else dispatch(clearSession()); })
      .catch(() => dispatch(clearSession()));
    return () => {stopAgeGate(); stopVibeNoteEntries();};
  }, [dispatch]);

  useEffect(() => {
    if (route && route !== 'Main') clearVibeNoteRegions();
  }, [route]);

  if (route === null) return null;

  return (
    <View className="flex-1 bg-background">
      <ThemedStatusBar />
      <PartyLinkCapture />
      <NavigationContainer ref={navigationRef}>
        {/* Keyed so moving between auth surfaces starts a fresh stack at the right screen. */}
        {route === 'Main'
          ? <AdsProvider><PartySessionProvider><RootStack /><PartyLinkHandler /></PartySessionProvider></AdsProvider>
          : <AuthStack key={route} initialRouteName={route} />}
      </NavigationContainer>
    </View>
  );
};

export default MainNavigation;
