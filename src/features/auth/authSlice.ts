import {createSlice, PayloadAction} from '@reduxjs/toolkit';
import type {AuthSession} from './types';

export type AuthState = {
  status: 'loading' | 'authenticated' | 'unauthenticated';
  needsOnboarding: boolean;
};

const initialState: AuthState = {
  status: 'loading',
  needsOnboarding: false,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setSession: (state, action: PayloadAction<AuthSession>) => {
      state.status = 'authenticated';
      if (action.payload.isNewUser !== undefined) {
        state.needsOnboarding = action.payload.isNewUser;
      }
    },
    completeOnboarding: state => {
      state.needsOnboarding = false;
    },
    clearSession: state => {
      Object.assign(state, initialState);
      state.status = 'unauthenticated';
    },
  },
});

export const {setSession, completeOnboarding, clearSession} = authSlice.actions;
export default authSlice.reducer;
