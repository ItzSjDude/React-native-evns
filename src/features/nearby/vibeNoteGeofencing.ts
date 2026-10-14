import {AppState, Linking, NativeEventEmitter, NativeModules, PermissionsAndroid, Platform} from 'react-native';
import {getDeviceLocation} from './deviceLocation';
import {updateMyLocation} from './nearbyService';
import type {DeviceLocationFix} from './deviceLocation';
import type {VibeNoteGeofenceCandidate} from './vibeNoteTypes';

type NativeGeofence = {
  setAlertsEnabled?: (enabled: boolean) => void;
  requestAlwaysAuthorization?: () => Promise<boolean>;
  hasAlwaysAuthorization?: () => Promise<boolean>;
  replaceRegions: (rows: VibeNoteGeofenceCandidate[]) => Promise<number | null>;
  clearRegions: () => Promise<void>;
  getPendingEntries?: () => Promise<PendingEntry[]>;
  clearPendingEntries?: () => Promise<void>;
};

type PendingEntry = Partial<DeviceLocationFix> & {enteredNoteIds?: unknown};
const native = NativeModules.VibeNoteGeofence as NativeGeofence | undefined;
const IOS_SLOTS = 18;
const ANDROID_SLOTS = 100;

export const vibeNoteGeofenceCapacity = Platform.OS === 'ios' ? IOS_SLOTS : ANDROID_SLOTS;

export async function requestVibeNoteBackgroundPermission(): Promise<boolean> {
  if (!native) return false;
  if (Platform.OS === 'ios') return native.requestAlwaysAuthorization?.() ?? false;
  const fine = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
  const coarse = PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION;
  const foreground = await PermissionsAndroid.requestMultiple([fine, coarse]);
  if (foreground[fine] !== PermissionsAndroid.RESULTS.GRANTED && foreground[coarse] !== PermissionsAndroid.RESULTS.GRANTED) return false;
  if (Number(Platform.Version) < 29) return true;
  const background = PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION;
  if (await PermissionsAndroid.check(background)) return true;
  if ((await PermissionsAndroid.request(background)) === PermissionsAndroid.RESULTS.GRANTED) return true;
  if (Number(Platform.Version) >= 30) await Linking.openSettings();
  return false;
}

export async function hasVibeNoteBackgroundPermission(): Promise<boolean> {
  if (!native) return false;
  if (Platform.OS === 'ios') return native.hasAlwaysAuthorization?.() ?? false;
  return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION);
}

export async function replaceVibeNoteRegions(rows: VibeNoteGeofenceCandidate[]): Promise<void> {
  if (!native) throw new Error('Vibe Note region monitoring is unavailable on this device.');
  native.setAlertsEnabled?.(true);
  await native.replaceRegions(rows.slice(0, vibeNoteGeofenceCapacity));
}

export async function clearVibeNoteRegions(): Promise<void> {
  await native?.clearRegions();
}

async function handleEntry(entry: PendingEntry): Promise<void> {
  const enteredNoteIds = Array.isArray(entry.enteredNoteIds)
    ? [...new Set(entry.enteredNoteIds.filter((value): value is string => typeof value === 'string' && value.length > 0))].slice(0, ANDROID_SLOTS)
    : [];
  if (!enteredNoteIds.length) return;
  let fix: DeviceLocationFix | null;
  if (typeof entry.lat === 'number' && typeof entry.lng === 'number') {
    fix = {
      lat: entry.lat,
      lng: entry.lng,
      ...(typeof entry.accuracyMeters === 'number' ? {accuracyMeters: entry.accuracyMeters} : {}),
      ...(typeof entry.observedAt === 'string' ? {observedAt: entry.observedAt} : {}),
    };
  } else {
    fix = await getDeviceLocation(false);
  }
  if (!fix || !Number.isFinite(fix.lat) || !Number.isFinite(fix.lng)) throw new Error('No fresh location fix is available.');
  await updateMyLocation(fix.lat, fix.lng, {
    source: 'vibe_note_geofence',
    enteredNoteIds,
    ...(fix.accuracyMeters === undefined ? {} : {accuracyMeters: fix.accuracyMeters}),
    ...(fix.observedAt === undefined ? {} : {observedAt: fix.observedAt}),
  });
}

export function installVibeNoteGeofenceEntryHandler(): () => void {
  if (!native) return () => {};
  const emitter = Platform.OS === 'ios' ? new NativeEventEmitter(NativeModules.VibeNoteGeofence) : null;
  let active = true;
  let draining = false;
  const drain = async () => {
    if (draining) return;
    draining = true;
    try {
      const entries = await native.getPendingEntries?.() ?? [];
      for (const entry of entries) await handleEntry(entry);
      if (active && entries.length) await native.clearPendingEntries?.();
    } catch {
      // Keep persisted entry data for the next foreground retry.
    } finally {
      draining = false;
    }
  };
  const subscription = emitter?.addListener('onVibeNoteGeofenceEntry', drain);
  const appState = AppState.addEventListener('change', state => { if (state === 'active') drain(); });
  drain();
  return () => {
    active = false;
    subscription?.remove();
    appState.remove();
  };
}
