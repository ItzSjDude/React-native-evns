import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import ConfirmAgeScreen from '../age/ConfirmAgeScreen';
import UnderageScreen from '../age/UnderageScreen';
import {clearSession, setAgeGate, setSession} from '../authSlice';
import {logoutFromApi, refreshSessionUser} from '../authService';
import {deleteAccount, fetchMe, submitDateOfBirth} from '../age/ageService';
import {pickDob, press, texts} from '../__testHelpers__/ageTestUtils';

const mockDispatch = jest.fn();
jest.mock('../../../core/store/hooks', () => ({useAppDispatch: () => mockDispatch}));
jest.mock('../authService', () => ({refreshSessionUser: jest.fn(), logoutFromApi: jest.fn()}));
jest.mock('../age/ageService', () => ({...jest.requireActual('../age/ageService'), submitDateOfBirth: jest.fn(), fetchMe: jest.fn(), deleteAccount: jest.fn()}));

const submit = submitDateOfBirth as jest.Mock;
const refresh = refreshSessionUser as jest.Mock;
const logout = logoutFromApi as jest.Mock;
const remove = deleteAccount as jest.Mock;
const session = (ageStatus: string) => ({user: {id: 'u1', email: 'a@example.com', email_verified: true, ageStatus}, accessToken: 'a', refreshToken: 'r', expiresIn: '15m'});

let mounted: ReactTestRenderer.ReactTestRenderer | null = null;
afterEach(async () => {
  const current = mounted;
  mounted = null;
  await ReactTestRenderer.act(async () => { current?.unmount(); });
});

beforeEach(() => {
  jest.clearAllMocks();
  logout.mockResolvedValue(undefined);
});

async function render(element: React.ReactElement) {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { renderer = mounted = ReactTestRenderer.create(element); });
  return renderer!;
}

describe('Confirm your age', () => {
  test('saves the confirmed date and refreshes the session user', async () => {
    submit.mockResolvedValue({ageStatus: 'adult', dateOfBirthSet: true});
    refresh.mockResolvedValue(session('adult'));
    const renderer = await render(<ConfirmAgeScreen />);
    expect(texts(renderer)).toContain('Confirm your age');
    expect(texts(renderer)).toContain("Hiva is for people 18 and over. Your date of birth can't be changed later.");

    await press(renderer, 'Continue');
    expect(texts(renderer)).toContain('Enter your full date of birth.');

    await pickDob(renderer, 5, 'June', 1990);
    await press(renderer, 'Continue');
    expect(texts(renderer)).toContain('Is 5 June 1990 correct?');
    await press(renderer, "Yes, that's right");

    expect(submit).toHaveBeenCalledWith('1990-06-05');
    expect(refresh).toHaveBeenCalledWith({ageStatus: 'adult', dateOfBirthSet: true});
    expect(mockDispatch).toHaveBeenCalledWith(setSession(session('adult') as never));
    expect(mockDispatch).toHaveBeenCalledWith(setAgeGate('none'));
  });

  test('a date already locked on the server uses the server status', async () => {
    submit.mockRejectedValue({status: 400, code: 'DOB_LOCKED', message: 'Date of birth is already set'});
    (fetchMe as jest.Mock).mockResolvedValue({user: {ageStatus: 'minor', dateOfBirthSet: true}});
    refresh.mockResolvedValue(session('minor'));
    const renderer = await render(<ConfirmAgeScreen />);
    await pickDob(renderer, 5, 'June', 1990);
    await press(renderer, 'Continue');
    await press(renderer, "Yes, that's right");
    expect(mockDispatch).toHaveBeenCalledWith(setAgeGate('minor'));
  });

  test('shows save errors and stays put', async () => {
    submit.mockRejectedValue({status: 500, message: 'Server is having a moment'});
    const renderer = await render(<ConfirmAgeScreen />);
    await pickDob(renderer, 5, 'June', 1990);
    await press(renderer, 'Continue');
    await press(renderer, "Yes, that's right");
    expect(texts(renderer)).toContain('Server is having a moment');
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  test('can log out instead', async () => {
    const renderer = await render(<ConfirmAgeScreen />);
    await press(renderer, 'Log out');
    expect(logout).toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledWith(clearSession());
  });
});

describe('18+ screen', () => {
  test('explains politely and logs out', async () => {
    const renderer = await render(<UnderageScreen />);
    expect(texts(renderer)).toContain('Hiva is only for people 18+');
    await press(renderer, 'Log out');
    expect(logout).toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledWith(clearSession());
  });

  test('deletes the account after confirmation, then signs out', async () => {
    remove.mockResolvedValue({deleted: true});
    const renderer = await render(<UnderageScreen />);
    await press(renderer, 'Delete account');
    expect(texts(renderer)).toContain('Delete your account?');
    expect(remove).not.toHaveBeenCalled();
    await press(renderer, 'Delete my account');
    expect(remove).toHaveBeenCalledTimes(1);
    expect(logout).toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledWith(clearSession());
  });

  test('a failed delete keeps the person on the screen with the error', async () => {
    remove.mockRejectedValue({status: 500, message: 'Could not delete right now'});
    const renderer = await render(<UnderageScreen />);
    await press(renderer, 'Delete account');
    await press(renderer, 'Delete my account');
    expect(texts(renderer)).toContain('Could not delete right now');
    expect(logout).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});
