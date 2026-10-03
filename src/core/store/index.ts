import AsyncStorage from '@react-native-async-storage/async-storage';
import {configureStore} from '@reduxjs/toolkit';
import {persistReducer, persistStore} from 'redux-persist';
import {authReducer} from '../../features/auth';

const persistedAuthReducer = persistReducer(
  {key: 'auth', storage: AsyncStorage, whitelist: ['user', 'accessToken', 'refreshToken', 'status', 'needsOnboarding']},
  authReducer,
);

export const store = configureStore({
  reducer: {auth: persistedAuthReducer},
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({serializableCheck: false}),
});

export const persistor = persistStore(store);
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
