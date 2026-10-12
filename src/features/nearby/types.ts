import type {DiscoveryLanguage} from '../plus';

export type NearbySharedEvent = {
  eventId: string;
  title: string;
  startsAt: string;
};

/** Coarse distance the server shares instead of exact metres. Older servers omit it. */
export type DistanceBand = '<500m' | '<1km' | '<2km' | '<5km' | '<10km' | '10km+';

export type NearbyPerson = {
  id: string;
  name: string;
  avatarUrl: string | null;
  /** Coarse on servers that send `distanceBand`; exact on older ones. */
  distanceMeters: number;
  distanceBand?: DistanceBand;
  sharedEvents?: NearbySharedEvent[];
};

export type LocationFix = {
  lat: number;
  lng: number;
  visible: boolean;
  updatedAt: string;
};

export type LocationVisibility = {visible: boolean};

/** A Social Passport result: someone in another city. Never carries a distance. */
export type PassportPerson = {id: string; name: string; avatarUrl: string | null; city: string | null; isFollowing: boolean; isPassportResult: true};

export type PassportPage = {people: PassportPerson[]; hasMore: boolean};

export type DiscoveryPresetMode = 'NEARBY' | 'PASSPORT';

/** `GET /me/discovery-presets` item (Plus only). */
export type DiscoveryPreset = {
  id: string;
  name: string;
  mode: DiscoveryPresetMode;
  city: string | null;
  radiusMeters: number;
  interest: string | null;
  language: DiscoveryLanguage | null;
  activeNow: boolean;
  createdAt: string;
  updatedAt: string;
};

/** `POST /me/discovery-presets`; a PASSPORT preset needs `city`, a NEARBY preset must not have one. */
export type NewDiscoveryPreset = {
  name: string;
  mode: DiscoveryPresetMode;
  city?: string;
  radiusMeters?: number;
  interest?: string;
  language?: DiscoveryLanguage;
  activeNow?: boolean;
};
