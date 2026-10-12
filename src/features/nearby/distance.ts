import type {DistanceBand, NearbyPerson} from './types';

/** The server never searches tighter than this. */
export const MIN_RADIUS_METERS = 500;

const BAND_LABELS: Record<DistanceBand, string> = {
  '<500m': 'Within 500 m',
  '<1km': 'Under 1 km',
  '<2km': 'Under 2 km',
  '<5km': 'Under 5 km',
  '<10km': 'Under 10 km',
  '10km+': 'Over 10 km',
};

const isBand = (value: unknown): value is DistanceBand =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(BAND_LABELS, value);

/** Same buckets as the server, for servers that only send `distanceMeters`. */
export function bandForMeters(meters: number): DistanceBand {
  if (!Number.isFinite(meters) || meters < 500) return '<500m';
  if (meters < 1000) return '<1km';
  if (meters < 2000) return '<2km';
  if (meters < 5000) return '<5km';
  if (meters < 10000) return '<10km';
  return '10km+';
}

/** Never exact metres: the server's band when present, otherwise one derived from `distanceMeters`. */
export function distanceLabel(person: Pick<NearbyPerson, 'distanceBand' | 'distanceMeters'>): string {
  return BAND_LABELS[isBand(person.distanceBand) ? person.distanceBand : bandForMeters(person.distanceMeters)];
}
