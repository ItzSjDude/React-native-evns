import {apiRequest} from '../../core/api/apiClient';
import {MIN_RADIUS_METERS} from './distance';
import type {LocationFix, LocationVisibility, NearbyPerson} from './types';

export const getLocationVisibility = () =>
  apiRequest<LocationVisibility>('/me/visibility', {auth: 'required'});

export const updateMyLocation = (lat: number, lng: number) =>
  apiRequest<LocationFix>('/me/location', {
    auth: 'required', method: 'POST', body: JSON.stringify({lat, lng}),
  });

export const setLocationVisibility = (visible: boolean) =>
  apiRequest<LocationFix>('/me/visibility', {
    auth: 'required', method: 'POST', body: JSON.stringify({visible}),
  });

export const getNearbyPeople = (radiusMeters: number) =>
  apiRequest<NearbyPerson[]>(`/nearby?radiusMeters=${Math.max(MIN_RADIUS_METERS, Math.round(radiusMeters))}&limit=50`, {auth: 'required'});
