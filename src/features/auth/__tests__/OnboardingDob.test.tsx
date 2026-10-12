import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import Onboarding from '../Onboarding';
import {setAgeGate, setSession} from '../authSlice';
import {refreshSessionUser} from '../authService';
import {submitDateOfBirth} from '../age/ageService';
import {getOnboardingProfile, saveOnboardingProfile} from '../onboarding/onboardingService';
import {pickDob, press, pressable, texts} from '../__testHelpers__/ageTestUtils';

const mockDispatch = jest.fn();
const mockAuth = {ageGate: 'confirm'};
jest.mock('../../../core/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (select: (state: unknown) => unknown) => select({auth: mockAuth}),
}));
jest.mock('../onboarding/onboardingService', () => ({getOnboardingProfile: jest.fn(), saveOnboardingProfile: jest.fn()}));
jest.mock('../age/ageService', () => ({...jest.requireActual('../age/ageService'), submitDateOfBirth: jest.fn(), fetchMe: jest.fn()}));
jest.mock('../authService', () => ({refreshSessionUser: jest.fn(), logoutFromApi: jest.fn()}));
jest.mock('../../../core/media', () => ({imagePicker: {available: false, pickImage: jest.fn()}, uploadMedia: jest.fn()}));

const submit = submitDateOfBirth as jest.Mock;
const refresh = refreshSessionUser as jest.Mock;
const profile = {id: 'u1', name: 'Asha Rao', email: 'asha@example.com', handle: null, avatar_url: null, interests: [], city: null, ageStatus: 'unknown', dateOfBirthSet: false};
const storedSession = (ageStatus: string) => ({user: {id: 'u1', email: 'asha@example.com', email_verified: true, ageStatus}, accessToken: 'a', refreshToken: 'r', expiresIn: '15m'});

beforeAll(() => {
  // Only Date is faked; timers stay real so the sheets' animations and act() behave normally.
  jest.useFakeTimers({now: new Date(2026, 9, 9, 12), doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame']});
});
afterAll(() => { jest.useRealTimers(); });

let mounted: ReactTestRenderer.ReactTestRenderer | null = null;
afterEach(async () => {
  const current = mounted;
  mounted = null;
  await ReactTestRenderer.act(async () => { current?.unmount(); });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.ageGate = 'confirm';
  (getOnboardingProfile as jest.Mock).mockResolvedValue(profile);
  (saveOnboardingProfile as jest.Mock).mockResolvedValue(profile);
});

async function render() {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { renderer = mounted = ReactTestRenderer.create(<Onboarding />); });
  return renderer!;
}

test('step 1 asks for a date of birth with the 18+ notice and requires it', async () => {
  const renderer = await render();
  expect(texts(renderer)).toContain("Hiva is for people 18 and over. Your date of birth can't be changed later.");
  await press(renderer, 'Next');
  expect(texts(renderer)).toContain('Enter your full date of birth.');
  expect(texts(renderer)).toContain('Step 1 of 3');
  expect(submit).not.toHaveBeenCalled();
});

test('rejects a future date of birth without contacting the server', async () => {
  const renderer = await render();
  await pickDob(renderer, 10, 'October', 2026);
  await press(renderer, 'Next');
  expect(texts(renderer)).toContain("Your date of birth can't be in the future.");
  expect(texts(renderer)).not.toContain('correct?');
  expect(submit).not.toHaveBeenCalled();
});

test('confirms the date, saves it once, then moves on', async () => {
  submit.mockResolvedValue({...profile, ageStatus: 'adult', dateOfBirthSet: true});
  refresh.mockResolvedValue(storedSession('adult'));
  const renderer = await render();
  await pickDob(renderer, 12, 'March', 1998);
  await press(renderer, 'Next');
  expect(texts(renderer)).toContain('Is 12 March 1998 correct?');

  await press(renderer, 'Change');
  expect(submit).not.toHaveBeenCalled();
  await press(renderer, 'Next');
  await press(renderer, "Yes, that's right");

  expect(submit).toHaveBeenCalledTimes(1);
  expect(submit).toHaveBeenCalledWith('1998-03-12');
  expect(mockDispatch).toHaveBeenCalledWith(setSession(storedSession('adult') as never));
  expect(mockDispatch).toHaveBeenCalledWith(setAgeGate('none'));
  expect(texts(renderer)).toContain('Step 2 of 3');

  // The picker is gone; going back does not ask again.
  await press(renderer, 'Back');
  expect(texts(renderer)).not.toContain('Date of birth');
});

test('an under-18 date gets the same neutral confirmation, then the server verdict blocks the app', async () => {
  submit.mockResolvedValue({...profile, ageStatus: 'minor', dateOfBirthSet: true});
  refresh.mockResolvedValue(storedSession('minor'));
  const renderer = await render();
  await pickDob(renderer, 10, 'October', 2008);
  await press(renderer, 'Next');
  expect(texts(renderer)).toContain('Is 10 October 2008 correct?');
  await press(renderer, "Yes, that's right");

  expect(submit).toHaveBeenCalledWith('2008-10-10');
  expect(mockDispatch).toHaveBeenCalledWith(setAgeGate('minor'));
  expect(texts(renderer)).not.toContain('Step 2 of 3');
});

test('a server refusal of a very young date still blocks', async () => {
  submit.mockRejectedValue({status: 400, message: 'Invalid request body', details: [{field: 'dateOfBirth', message: 'You must be at least 13'}]});
  const renderer = await render();
  await pickDob(renderer, 1, 'January', 2016);
  await press(renderer, 'Next');
  await press(renderer, "Yes, that's right");
  expect(mockDispatch).toHaveBeenCalledWith(setAgeGate('minor'));
});

test('servers without the age gate (no ageStatus) show no date of birth step', async () => {
  mockAuth.ageGate = 'none';
  (getOnboardingProfile as jest.Mock).mockResolvedValue({...profile, ageStatus: undefined, dateOfBirthSet: undefined});
  const renderer = await render();
  expect(texts(renderer)).not.toContain('Date of birth');
  await press(renderer, 'Next');
  expect(texts(renderer)).toContain('Step 2 of 3');
  expect(() => pressable(renderer, 'Birth day')).toThrow();
});
