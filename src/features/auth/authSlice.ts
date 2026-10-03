import {createSlice, PayloadAction} from '@reduxjs/toolkit';
import type {AuthSession} from './types';

export type AuthState = {
  status: 'authenticated' | 'unauthenticated';
  user: AuthSession['user'] | null;
  accessToken: string | null;
  refreshToken: string | null;
  needsOnboarding: boolean;
};

const initialState: AuthState = {
  status: 'unauthenticated',
  user: null,
  accessToken: null,
  refreshToken: null,
  needsOnboarding: false,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setSession: (state, action: PayloadAction<AuthSession>) => {
      state.status = 'authenticated';
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      state.needsOnboarding = action.payload.isNewUser;
    },
    completeOnboarding: state => {
      state.needsOnboarding = false;
    },
    clearSession: state => {
      Object.assign(state, initialState);
    },
  },
});

export const {setSession, completeOnboarding, clearSession} = authSlice.actions;
export default authSlice.reducer;
