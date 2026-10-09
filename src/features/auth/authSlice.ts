import {createSlice, PayloadAction} from '@reduxjs/toolkit';
import {gateForStatus} from './age/ageValidation';
import type {AgeGate, AuthSession} from './types';

export type AuthState = {
  status: 'loading' | 'authenticated' | 'unauthenticated';
  needsOnboarding: boolean;
  /** Blocking age screen; 'none' whenever the server doesn't report an age status. */
  ageGate: AgeGate;
};

const initialState: AuthState = {
  status: 'loading',
  needsOnboarding: false,
  ageGate: 'none',
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
      const ageStatus = action.payload.user?.ageStatus;
      // A minor decision is final for this session; nothing short of logging out lifts it.
      if (ageStatus && state.ageGate !== 'minor') state.ageGate = gateForStatus(ageStatus);
    },
    completeOnboarding: state => {
      state.needsOnboarding = false;
    },
    setAgeGate: (state, action: PayloadAction<AgeGate>) => {
      if (state.ageGate !== 'minor') state.ageGate = action.payload;
    },
    /** A request was refused with 403 AGE_REQUIRED (e.g. an old session). */
    ageRequired: state => {
      if (state.ageGate === 'none') state.ageGate = 'confirm';
    },
    /** A request was refused with 403 UNDERAGE. */
    underage: state => {
      state.ageGate = 'minor';
    },
    clearSession: state => {
      Object.assign(state, initialState);
      state.status = 'unauthenticated';
    },
  },
});

export const {setSession, completeOnboarding, setAgeGate, ageRequired, underage, clearSession} = authSlice.actions;
export default authSlice.reducer;

/** Which top-level surface the navigator should show. */
export type AuthRoute = 'Login' | 'Underage' | 'Onboarding' | 'ConfirmAge' | 'Main';

export function selectAuthRoute(state: Pick<AuthState, 'status' | 'needsOnboarding' | 'ageGate'>): AuthRoute | null {
  if (state.status === 'loading') return null;
  if (state.status !== 'authenticated') return 'Login';
  if (state.ageGate === 'minor') return 'Underage';
  // New accounts give their date of birth inside onboarding.
  if (state.needsOnboarding) return 'Onboarding';
  if (state.ageGate === 'confirm') return 'ConfirmAge';
  return 'Main';
}
