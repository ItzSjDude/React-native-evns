import {apiRequest, apiRequestPage} from '../../core/api/apiClient';
import {CITY_MAX_LENGTH, discoveryQuery, type DiscoveryFilters} from '../plus';
import {MIN_RADIUS_METERS} from './distance';
import type {DeviceLocationFix} from './deviceLocation';
import type {LocationFix, LocationVisibility, NearbyPerson, PassportPage, PassportPerson} from './types';

export const getLocationVisibility = () =>
  apiRequest<LocationVisibility>('/me/visibility', {auth: 'required'});

export type LocationUpdateMetadata = {
  accuracyMeters?: number;
  observedAt?: string;
  source?: 'foreground' | 'vibe_note_geofence';
  enteredNoteIds?: string[];
};

export const updateMyLocation = (lat: number, lng: number, metadata?: LocationUpdateMetadata) =>
  apiRequest<LocationFix>('/me/location', {
    auth: 'required', method: 'POST', body: JSON.stringify({lat, lng, ...metadata}),
  });

export const updateMyLocationFromFix = (fix: DeviceLocationFix) => {
  const metadata = {
    ...(fix.accuracyMeters === undefined ? {} : {accuracyMeters: fix.accuracyMeters}),
    ...(fix.observedAt === undefined ? {} : {observedAt: fix.observedAt}),
  };
  return Object.keys(metadata).length
    ? updateMyLocation(fix.lat, fix.lng, {...metadata, source: 'foreground'})
    : updateMyLocation(fix.lat, fix.lng);
};

export const setLocationVisibility = (visible: boolean) =>
  apiRequest<LocationFix>('/me/visibility', {
    auth: 'required', method: 'POST', body: JSON.stringify({visible}),
  });

/** `filters` are Plus-only (403 PLUS_REQUIRED otherwise): callers pass them only for Plus users. */
export const getNearbyPeople = (radiusMeters: number, filters?: DiscoveryFilters) =>
  apiRequest<NearbyPerson[]>(`/nearby?radiusMeters=${Math.max(MIN_RADIUS_METERS, Math.round(radiusMeters))}&limit=50${discoveryQuery(filters)}`, {auth: 'required'});

export const PASSPORT_PAGE_SIZE = 20;

/**
 * Plus-only Social Passport: people in `city`, never a distance. Needs no device location and the server
 * never touches the caller's stored location. The city is the argument, so `filters.city` is dropped.
 */
export const getPassportPeople = async (city: string, filters: DiscoveryFilters | undefined, offset = 0): Promise<PassportPage> => {
  const page = await apiRequestPage<PassportPerson[]>(
    `/nearby/passport?city=${encodeURIComponent(city.trim().slice(0, CITY_MAX_LENGTH))}&limit=${PASSPORT_PAGE_SIZE}&offset=${offset}${discoveryQuery({...filters, city: undefined})}`,
    {auth: 'required'});
  return {people: page.data, hasMore: page.meta.hasMore};
};
