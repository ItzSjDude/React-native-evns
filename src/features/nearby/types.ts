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
