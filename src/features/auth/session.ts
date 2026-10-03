import * as Keychain from 'react-native-keychain';
import type {AuthSession} from './types';

const SESSION_SERVICE = 'hiva.backend.session';

export async function saveSession(session: AuthSession): Promise<void> {
  const persisted = {...session};
  delete persisted.isNewUser;
  const saved = await Keychain.setGenericPassword('backend-session', JSON.stringify(persisted), {service: SESSION_SERVICE});
  if (!saved) throw new Error('Could not store backend session securely');
}

export async function loadSession(): Promise<AuthSession | null> {
  const stored = await Keychain.getGenericPassword({service: SESSION_SERVICE});
  if (!stored) return null;
  try { return JSON.parse(stored.password) as AuthSession; }
  catch { await clearSession(); return null; }
}

export async function clearSession(): Promise<void> {
  await Keychain.resetGenericPassword({service: SESSION_SERVICE});
}
