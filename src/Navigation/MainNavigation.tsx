import React, {useEffect} from 'react';
import {StatusBar, View} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {navigationRef} from './navigationRef';
import {AppStack, AuthStack} from './StackNavigation';
import {useAppDispatch, useAppSelector} from '../core/store/hooks';
import {configureApiAuth} from '../core/api/apiClient';
import {clearSession, clearStoredSession, loadSession, refreshOnce, restoreBackendSession, setSession} from '../features/auth';

export {navigationRef};

const MainNavigation = () => {
  const {status, needsOnboarding} = useAppSelector(state => state.auth);
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
    restoreBackendSession()
      .then(session => { if (session) dispatch(setSession(session)); else dispatch(clearSession()); })
      .catch(() => dispatch(clearSession()));
  }, [dispatch]);

  if (status === 'loading') return null;
  const isAuthenticated = status === 'authenticated';

  return (
    <View className="flex-1 bg-background">
      <StatusBar
        barStyle="light-content"
      />
      <NavigationContainer ref={navigationRef}>
        {!isAuthenticated ? <AuthStack initialRouteName="Login" /> : needsOnboarding ? <AuthStack initialRouteName="Onboarding" /> : <AppStack />}
      </NavigationContainer>
    </View>
  );
};

export default MainNavigation;
