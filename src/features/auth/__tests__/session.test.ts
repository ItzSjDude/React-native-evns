import * as Keychain from 'react-native-keychain';
import {clearSession, getSessionVersion, loadSession, saveSession} from '../session';
import type {AuthSession} from '../types';

const session = (overrides: Partial<AuthSession> = {}): AuthSession => ({
  user: {id: 'u1', email: 'a@example.com', email_verified: true}, accessToken: 'access-1', refreshToken: 'refresh-1', expiresIn: '15m', ...overrides,
});

let stored: string | null;
const setGeneric = Keychain.setGenericPassword as jest.Mock;
const getGeneric = Keychain.getGenericPassword as jest.Mock;
const resetGeneric = Keychain.resetGenericPassword as jest.Mock;

beforeEach(async () => {
  jest.clearAllMocks();
  stored = null;
  setGeneric.mockImplementation(async (_user: string, password: string) => { stored = password; return true; });
  getGeneric.mockImplementation(async () => stored === null ? false : {username: 'backend-session', password: stored});
  resetGeneric.mockImplementation(async () => { stored = null; return true; });
  await clearSession();
  jest.clearAllMocks();
});

test('stores the session under the dedicated keychain service and round-trips it', async () => {
  await expect(saveSession(session())).resolves.toBe(true);
  expect(setGeneric).toHaveBeenCalledWith('backend-session', expect.any(String), {service: 'hiva.backend.session'});
  await expect(loadSession()).resolves.toEqual(session());
  expect(getGeneric).toHaveBeenCalledWith({service: 'hiva.backend.session'});
});

test('never persists the one-shot isNewUser flag', async () => {
  await saveSession(session({isNewUser: true}));
  expect(JSON.parse(stored!)).not.toHaveProperty('isNewUser');
});

test('loadSession returns null when nothing is stored', async () => {
  await expect(loadSession()).resolves.toBeNull();
});

test('a corrupt keychain entry is wiped and read as signed out', async () => {
  stored = '{not json';
  await expect(loadSession()).resolves.toBeNull();
  expect(resetGeneric).toHaveBeenCalledWith({service: 'hiva.backend.session'});
  expect(stored).toBeNull();
});

test('every save and clear advances the version', async () => {
  const v0 = getSessionVersion();
  await saveSession(session());
  expect(getSessionVersion()).toBe(v0 + 1);
  await clearSession();
  expect(getSessionVersion()).toBe(v0 + 2);
});

test('a save guarded by a stale expected version is refused and writes nothing', async () => {
  const stale = getSessionVersion();
  await saveSession(session({accessToken: 'newer'}));
  setGeneric.mockClear();
  await expect(saveSession(session({accessToken: 'late'}), stale)).resolves.toBe(false);
  expect(setGeneric).not.toHaveBeenCalled();
  expect((await loadSession())!.accessToken).toBe('newer');
});

test('a save guarded by the current version succeeds', async () => {
  await expect(saveSession(session({accessToken: 'guarded'}), getSessionVersion())).resolves.toBe(true);
  expect((await loadSession())!.accessToken).toBe('guarded');
});

test('logout racing an in-flight save wins: the session is not resurrected and the save reports failure', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  setGeneric.mockImplementationOnce(async (_user: string, password: string) => { await gate; stored = password; return true; });
  const saving = saveSession(session());
  await Promise.resolve();
  const clearing = clearSession();
  release();
  await expect(saving).resolves.toBe(false);
  await clearing;
  await expect(loadSession()).resolves.toBeNull();
});

test('of two overlapping saves only the newest is written', async () => {
  const first = saveSession(session({accessToken: 'first'}));
  const second = saveSession(session({accessToken: 'second'}));
  await expect(first).resolves.toBe(false);
  await expect(second).resolves.toBe(true);
  expect((await loadSession())!.accessToken).toBe('second');
  expect(setGeneric).toHaveBeenCalledTimes(1);
});

test('loadSession waits for a pending write instead of returning the previous value', async () => {
  await saveSession(session({accessToken: 'old'}));
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  setGeneric.mockImplementationOnce(async (_user: string, password: string) => { await gate; stored = password; return true; });
  const saving = saveSession(session({accessToken: 'new'}));
  const loading = loadSession();
  release();
  await saving;
  expect((await loading)!.accessToken).toBe('new');
});

test('a keychain refusal rejects the save, and later saves still work', async () => {
  setGeneric.mockResolvedValueOnce(false);
  await expect(saveSession(session())).rejects.toThrow('Could not store backend session securely');
  await expect(saveSession(session({accessToken: 'recovered'}))).resolves.toBe(true);
  expect((await loadSession())!.accessToken).toBe('recovered');
});
