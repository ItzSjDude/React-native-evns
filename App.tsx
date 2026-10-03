import React, {useState} from 'react';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import MainNavigation from './src/Navigation/MainNavigation';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import {persistor, store} from './src/core/store';
import SplashScreen from './src/components/SplashScreen';

const App = () => {
  const [showSplash, setShowSplash] = useState(false);
  return (
    <SafeAreaProvider>
      <Provider store={store}>
        <PersistGate persistor={persistor}>
          {showSplash ? <SplashScreen onFinish={() => setShowSplash(false)} /> : <MainNavigation />}
        </PersistGate>
      </Provider>
    </SafeAreaProvider>
  );
};

export default App;
