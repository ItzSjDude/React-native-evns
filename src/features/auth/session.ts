import * as Keychain from 'react-native-keychain';
import type {AuthSession} from './types';

const SESSION_SERVICE = 'hiva.backend.session';

let version = 0;
let pendingMutation: Promise<void> = Promise.resolve();

export function getSessionVersion(): number {
  return version;
}

function queueMutation(operation: () => Promise<void>): Promise<void> {
  const next = pendingMutation.catch(() => {}).then(operation);
  pendingMutation = next;
  return next;
}

export async function saveSession(session: AuthSession, expectedVersion?: number): Promise<boolean> {
  if (expectedVersion !== undefined && expectedVersion !== version) return false;
  const writeVersion = ++version;
  const persisted = {...session};
  delete persisted.isNewUser;
  await queueMutation(async () => {
    if (writeVersion !== version) return;
    const saved = await Keychain.setGenericPassword('backend-session', JSON.stringify(persisted), {service: SESSION_SERVICE});
    if (!saved) throw new Error('Could not store backend session securely');
  });
  return writeVersion === version;
}

export async function loadSession(): Promise<AuthSession | null> {
  await pendingMutation.catch(() => {});
  const stored = await Keychain.getGenericPassword({service: SESSION_SERVICE});
  if (!stored) return null;
  try { return JSON.parse(stored.password) as AuthSession; }
  catch { await clearSession(); return null; }
}

export async function clearSession(): Promise<void> {
  ++version;
  await queueMutation(async () => {
    await Keychain.resetGenericPassword({service: SESSION_SERVICE});
  });
}
