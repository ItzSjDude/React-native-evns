import AsyncStorage from '@react-native-async-storage/async-storage';
import {recordError} from '../monitoring';

/**
 * Local data that belongs to the signed-in person: cached chats, saved posts, recent searches, reminders,
 * pending purchase/link context, geofence registrations. All of it must be gone when that person logs out,
 * deletes the account, loses the session, or a different account signs in on this device.
 *
 * Rule: every AsyncStorage key the app owns starts with `hiva.` or `@hiva/`, so one prefix sweep removes
 * data even for modules that are not loaded (headless tasks). In-memory or native state (caches, sockets,
 * OS-scheduled reminders, geofences) registers a wiper next to the code that owns it.
 */
const OWNED_PREFIXES = ['hiva.', '@hiva/'];
const OWNER_KEY = 'hiva.localData.owner';
/** A stuck native call must never keep the user from logging out. */
const WIPER_TIMEOUT_MS = 4000;

export type LocalDataWiper = () => void | Promise<void>;

const wipers = new Set<LocalDataWiper>();
let epoch = 0;
let pendingWipe: Promise<void> = Promise.resolve();

/** Registers state to reset on every wipe. Returns the unregister function. */
export function registerLocalDataWiper(wiper: LocalDataWiper): () => void {
  wipers.add(wiper);
  return () => {wipers.delete(wiper);};
}

/** Read before starting async work whose result will be persisted; pass it to `setItemUnlessWiped`. */
export const getWipeEpoch = () => epoch;

/** Persists `value` unless a wipe started after `startedAtEpoch`, so a late response cannot restore wiped data. */
export async function setItemUnlessWiped(startedAtEpoch: number, key: string, value: string): Promise<void> {
  if (startedAtEpoch !== epoch) return;
  await AsyncStorage.setItem(key, value);
}

const withTimeout = (work: Promise<void>) => {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<void>((_, reject) => {timer = setTimeout(() => reject(new Error('Local data wiper timed out')), WIPER_TIMEOUT_MS);});
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
};

async function removeOwnedKeys() {
  const keys = await AsyncStorage.getAllKeys();
  const owned = keys.filter(key => OWNED_PREFIXES.some(prefix => key.startsWith(prefix)));
  if (owned.length) await AsyncStorage.removeMany(owned);
}

async function runWipe() {
  // Wipers first: some read stored data (e.g. reminder ids to cancel) before the keys disappear.
  const steps = [...wipers].map(wiper => withTimeout(Promise.resolve().then(wiper)));
  const results = await Promise.allSettled(steps);
  results.push(...await Promise.allSettled([removeOwnedKeys()]));
  for (const result of results) {
    // Error objects from storage/native modules only; never anything the user typed.
    if (result.status === 'rejected') recordError(result.reason, 'Local data wipe step failed');
  }
}

/**
 * Removes everything stored for the current user. Safe to call repeatedly and while offline; never rejects.
 * Wipes are serialized, and persisted writes that started before a wipe are dropped (`setItemUnlessWiped`).
 */
export function wipeLocalUserData(): Promise<void> {
  epoch += 1;
  const run = pendingWipe.then(runWipe);
  pendingWipe = run;
  return run;
}

/**
 * Call when a session for `userId` is in place. If another account's data is still on the device (the
 * earlier wipe never ran, e.g. the app was killed mid-logout) it is wiped first. A device with no owner
 * marker (data from before this existed) is claimed as is, because its owner is unknown.
 */
export async function claimLocalDataOwner(userId: string): Promise<void> {
  if (!userId) return;
  const startedAt = epoch;
  try {
    const owner = await AsyncStorage.getItem(OWNER_KEY);
    if (owner === userId) return;
    if (owner) await wipeLocalUserData();
    await setItemUnlessWiped(owner ? epoch : startedAt, OWNER_KEY, userId);
  } catch (error) {
    recordError(error, 'Local data owner check failed');
  }
}
