import React, {useEffect} from 'react';
import {StatusBar, StyleSheet, View} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {navigationRef} from './navigationRef';
import {AuthStack} from './StackNavigation';
import TabNavigation from './TabNavigation';
import {useAppDispatch, useAppSelector} from '../core/store/hooks';
import {clearSession, restoreBackendSession, setSession} from '../features/auth';

export {navigationRef};

const MainNavigation = () => {
  const {status, needsOnboarding} = useAppSelector(state => state.auth);
  const dispatch = useAppDispatch();

  useEffect(() => {
    restoreBackendSession()
      .then(session => { if (session) dispatch(setSession(session)); else dispatch(clearSession()); })
      .catch(() => dispatch(clearSession()));
  }, [dispatch]);

  if (status === 'loading') return null;
  const isAuthenticated = status === 'authenticated';

  return (
    <View style={[styles.container,
    //  {paddingTop: insets.top}
     ]}>
      <StatusBar
        barStyle="light-content"
      />
      <NavigationContainer ref={navigationRef}>
        {!isAuthenticated ? <AuthStack initialRouteName="Login" /> : needsOnboarding ? <AuthStack initialRouteName="Onboarding" /> : <TabNavigation />}
      </NavigationContainer>
    </View>
  );
};

export default MainNavigation;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
