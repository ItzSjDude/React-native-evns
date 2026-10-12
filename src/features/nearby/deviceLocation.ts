import Geolocation from '@react-native-community/geolocation';
import {PermissionsAndroid, Platform} from 'react-native';

type Coordinates = {lat: number; lng: number};

Geolocation.setRNConfiguration({skipPermissionRequests: false, authorizationLevel: 'whenInUse'});

export async function getDeviceLocation(requestPermission: boolean): Promise<Coordinates | null> {
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
      position => resolve({lat: position.coords.latitude, lng: position.coords.longitude}),
      error => reject(new Error(error.code === 1
        ? 'Location permission is off. Allow location access in device settings.'
        : error.code === 3
          ? 'Could not get your location in time. Try again outdoors or turn on location services.'
          : 'Could not get your location. Check that location services are on.')),
      {enableHighAccuracy: highAccuracy, timeout: 15000, maximumAge: 60000},
    );
  });
}
