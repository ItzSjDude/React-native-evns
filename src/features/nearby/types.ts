export type NearbySharedEvent = {
  eventId: string;
  title: string;
  startsAt: string;
};

export type NearbyPerson = {
  id: string;
  name: string;
  avatarUrl: string | null;
  distanceMeters: number;
  sharedEvents?: NearbySharedEvent[];
};

export type LocationFix = {
  lat: number;
  lng: number;
  visible: boolean;
  updatedAt: string;
};

export type LocationVisibility = {visible: boolean};
