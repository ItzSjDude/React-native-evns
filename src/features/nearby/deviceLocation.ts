import Geolocation from '@react-native-community/geolocation';
import {AppState, PermissionsAndroid, Platform} from 'react-native';

export type DeviceLocationFix = {lat: number; lng: number; accuracyMeters?: number; observedAt?: string};

Geolocation.setRNConfiguration({skipPermissionRequests: false, authorizationLevel: 'whenInUse'});

export async function getDeviceLocation(requestPermission: boolean): Promise<DeviceLocationFix | null> {
  let highAccuracy = true;
  if (Platform.OS === 'android') {
    const fine = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
    const coarse = PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION;
    if (requestPermission) {
      const results = await PermissionsAndroid.requestMultiple([fine, coarse]);
      highAccuracy = results[fine] === PermissionsAndroid.RESULTS.GRANTED;
      if (!highAccuracy && results[coarse] !== PermissionsAndroid.RESULTS.GRANTED) return null;
    } else {
      highAccuracy = await PermissionsAndroid.check(fine);
      if (!highAccuracy && !(await PermissionsAndroid.check(coarse))) return null;
    }
  }

  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      position => resolve({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        ...(Number.isFinite(position.coords.accuracy) ? {accuracyMeters: position.coords.accuracy} : {}),
        ...(Number.isFinite(position.timestamp) ? {observedAt: new Date(position.timestamp).toISOString()} : {}),
      }),
      error => reject(new Error(error.code === 1
        ? 'Location permission is off. Allow location access in device settings.'
        : error.code === 3
          ? 'Could not get your location in time. Try again outdoors or turn on location services.'
          : 'Could not get your location. Check that location services are on.')),
      {enableHighAccuracy: highAccuracy, timeout: 15000, maximumAge: 60000},
    );
  });
}

/** Asks for location permission only; never waits for a GPS fix. */
export async function requestLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    ]);
    return Object.values(results).includes(PermissionsAndroid.RESULTS.GRANTED);
  }
  return new Promise(resolve => {
    // Shows the prompt and fires when it is answered, but never for a status that was already decided.
    Geolocation.requestAuthorization(() => resolve(true), () => resolve(false));
    // So also probe: a denied status fails at once (code 1), a granted one succeeds or just times out.
    const probe = () => Geolocation.getCurrentPosition(
      () => resolve(true),
      error => {
        // A timeout while the system prompt is on screen (app inactive) means "still deciding", so keep waiting.
        if (error.code === 3 && AppState.currentState !== 'active') probe();
        else resolve(error.code === 3);
      },
      {timeout: 3000, maximumAge: 24 * 60 * 60 * 1000},
    );
    probe();
  });
}
