import reducer, {ageRequired, clearSession, completeOnboarding, selectAuthRoute, setAgeGate, setSession, underage, type AuthState} from '../authSlice';
import {gateAfterDobSaved, validateDob} from '../age/ageValidation';
import {registerAgeGateListener} from '../age/ageGateListener';
import {apiRequest} from '../../../core/api/apiClient';
import type {AgeStatus, AuthSession} from '../types';

const today = new Date(2026, 9, 9); // 9 October 2026

const session = (ageStatus?: AgeStatus, isNewUser?: boolean): AuthSession => ({
  user: {id: 'u1', email: 'a@example.com', email_verified: true, ...(ageStatus ? {ageStatus} : {})},
  accessToken: 'a', refreshToken: 'r', expiresIn: '15m', ...(isNewUser !== undefined ? {isNewUser} : {}),
});
const run = (...actions: Parameters<typeof reducer>[1][]) =>
  actions.reduce<AuthState>((state, action) => reducer(state, action), reducer(undefined, {type: 'init'}));

describe('validateDob', () => {
  test('requires every part', () => {
    expect(validateDob({day: 1, month: null, year: 2000}, today)).toEqual({ok: false, error: 'Enter your full date of birth.'});
  });
  test('rejects impossible dates', () => {
    expect(validateDob({day: 30, month: 2, year: 2000}, today)).toEqual({ok: false, error: "February 2000 doesn't have 30 days."});
    expect(validateDob({day: 29, month: 2, year: 2000}, today).ok).toBe(true);
    expect(validateDob({day: 29, month: 2, year: 2001}, today).ok).toBe(false);
  });
  test('rejects future dates, including later today-year days', () => {
    const future = {ok: false, error: "Your date of birth can't be in the future."};
    expect(validateDob({day: 10, month: 10, year: 2026}, today)).toEqual(future);
    expect(validateDob({day: 1, month: 11, year: 2026}, today)).toEqual(future);
    expect(validateDob({day: 9, month: 10, year: 2026}, today).ok).toBe(true);
  });
  test('accepts under-18 dates (the server decides) and reports the age at the birthday boundary', () => {
    expect(validateDob({day: 10, month: 10, year: 2008}, today)).toMatchObject({ok: true, age: 17, isoDate: '2008-10-10'});
    expect(validateDob({day: 9, month: 10, year: 2008}, today)).toMatchObject({ok: true, age: 18, label: '9 October 2008'});
  });
  test('rejects implausibly old dates', () => {
    expect(validateDob({day: 1, month: 1, year: 1900}, today).ok).toBe(false);
  });
  test('falls back to the local age only when the server reports no status', () => {
    expect(gateAfterDobSaved('adult', 15)).toBe('none');
    expect(gateAfterDobSaved('minor', 30)).toBe('minor');
    expect(gateAfterDobSaved(undefined, 17)).toBe('minor');
    expect(gateAfterDobSaved(undefined, 18)).toBe('none');
  });
});

describe('gate routing', () => {
  test('a missing ageStatus (today\'s production) never gates', () => {
    expect(selectAuthRoute(run(setSession(session())))).toBe('Main');
  });
  test('existing users with an unknown age must confirm it before the tabs', () => {
    expect(selectAuthRoute(run(setSession(session('unknown'))))).toBe('ConfirmAge');
    expect(selectAuthRoute(run(setSession(session('unknown')), setSession(session('adult'))))).toBe('Main');
  });
  test('new users give their date of birth inside onboarding, then hit the gate if they still have not', () => {
    const state = run(setSession(session('unknown', true)));
    expect(selectAuthRoute(state)).toBe('Onboarding');
    expect(selectAuthRoute(reducer(state, completeOnboarding()))).toBe('ConfirmAge');
  });
  test('minor wins over everything and is not lifted by later updates', () => {
    const state = run(setSession(session('minor', true)));
    expect(selectAuthRoute(state)).toBe('Underage');
    expect(selectAuthRoute(reducer(state, setSession(session('adult'))))).toBe('Underage');
    expect(selectAuthRoute(reducer(state, setAgeGate('none')))).toBe('Underage');
    expect(selectAuthRoute(reducer(state, clearSession()))).toBe('Login');
  });
  test('AGE_REQUIRED from an old session routes to Confirm your age; UNDERAGE to the 18+ screen', () => {
    expect(selectAuthRoute(run(setSession(session()), ageRequired()))).toBe('ConfirmAge');
    expect(selectAuthRoute(run(setSession(session()), underage()))).toBe('Underage');
    expect(selectAuthRoute(run(setSession(session()), underage(), ageRequired()))).toBe('Underage');
  });
});

describe('registerAgeGateListener', () => {
  const respond = (status: number, body: unknown) => jest.fn().mockResolvedValue({ok: status < 400, status, text: () => Promise.resolve(JSON.stringify(body))});
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  test('turns AGE_REQUIRED and UNDERAGE from any request into gate actions, and nothing else', async () => {
    const dispatch = jest.fn();
    const stop = registerAgeGateListener(dispatch);

    globalThis.fetch = respond(403, {success: false, error: {code: 'AGE_REQUIRED', message: 'Confirm your age'}});
    await expect(apiRequest('/nearby')).rejects.toMatchObject({status: 403, code: 'AGE_REQUIRED'});
    expect(dispatch).toHaveBeenLastCalledWith(ageRequired());

    globalThis.fetch = respond(403, {success: false, error: {code: 'UNDERAGE', message: 'No'}});
    await expect(apiRequest('/posts')).rejects.toMatchObject({code: 'UNDERAGE'});
    expect(dispatch).toHaveBeenLastCalledWith(underage());

    globalThis.fetch = respond(403, {success: false, error: {code: 'FORBIDDEN', message: 'No'}});
    await expect(apiRequest('/posts')).rejects.toMatchObject({code: 'FORBIDDEN'});
    expect(dispatch).toHaveBeenCalledTimes(2);

    stop();
    globalThis.fetch = respond(403, {success: false, error: {code: 'AGE_REQUIRED', message: 'Confirm your age'}});
    await expect(apiRequest('/nearby')).rejects.toBeTruthy();
    expect(dispatch).toHaveBeenCalledTimes(2);
  });
});
