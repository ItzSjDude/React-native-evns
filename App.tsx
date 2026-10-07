import React, {useCallback, useState} from 'react';
import {View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import MainNavigation from './src/Navigation/MainNavigation';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import {persistor, store} from './src/core/store';
import SplashScreen from './src/components/SplashScreen';
import {useAppSelector} from './src/core/store/hooks';
import {NotificationsProvider, registerNotificationBackgroundHandler} from './src/features/notifications';

// FCM needs its background handler registered at bundle load, before any component mounts.
registerNotificationBackgroundHandler();

const AppContent = () => {
  const [showSplash, setShowSplash] = useState(true);
  const [rehydrated, setRehydrated] = useState(false);
  const status = useAppSelector(state => state.auth.status);
  const finishSplash = useCallback(() => setShowSplash(false), []);
  return (
    <View className="flex-1 bg-background">
      <NotificationsProvider>
        <PersistGate persistor={persistor} onBeforeLift={() => setRehydrated(true)}>
          <MainNavigation />
        </PersistGate>
      </NotificationsProvider>
      {showSplash && <SplashScreen ready={rehydrated && status !== 'loading'} onFinish={finishSplash} />}
    </View>
  );
};

const App = () => {
  return (
    <SafeAreaProvider>
      <Provider store={store}>
        <AppContent />
      </Provider>
    </SafeAreaProvider>
  );
};

export default App;
