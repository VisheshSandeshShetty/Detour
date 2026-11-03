// Shapes of the data the Detour API sends back. They mirror server/src/types.ts.

export type CategoryKey =
  | 'attraction'
  | 'nature'
  | 'historic'
  | 'food'
  | 'park'
  | 'entertainment'
  | 'shopping';

export interface Place {
  id: string; // e.g. "node-123456"
  name: string;
  category: CategoryKey;
  latitude: number;
  longitude: number;
  description: string | null;
  rating: number | null; // OpenStreetMap has no ratings, so this is usually null
  imageUrl: string | null;
  openingHours: string | null;
  website: string | null;

  // "Explore nearby" only
  distanceKm?: number;

  // Journey results only
  distanceFromRouteKm?: number; // straight-line distance to the route
  detourDistanceKm?: number | null; // extra driving distance (null = unavailable)
  detourDurationMin?: number | null; // extra driving time (null = unavailable)
  routeKm?: number;
}

export interface PlaceDetails extends Place {
  address: string | null;
  phone: string | null;
  descriptionSource: 'wikipedia' | 'openstreetmap' | null;
  wikipediaUrl: string | null;
}

export interface NamedLocation {
  name: string;
  latitude: number;
  longitude: number;
}

export interface GeocodeResult extends NamedLocation {
  id: string;
  subtitle: string;
  label: string;
}

export interface NearbyResponse {
  center: { latitude: number; longitude: number };
  radiusKm: number;
  places: Place[];
  warning: string | null;
}

export interface JourneyPlan {
  origin: NamedLocation;
  destination: NamedLocation;
  radiusKm: number;
  route: {
    distanceKm: number;
    durationMin: number;
    geometry: number[][]; // [lon, lat]
  };
  attractions: Place[];
  totalInCorridor: number;
  warnings: string[];
}

export interface User {
  id: number;
  name: string;
  email: string;
  createdAt: string;
}

export interface SavedItem {
  savedId: number;
  savedAt: string;
  place: Place;
}

export interface JourneySummary {
  id: number;
  originName: string;
  destinationName: string;
  corridorRadius: number;
  totalDistance: number;
  estimatedDuration: number;
  createdAt: string;
  stopCount: number;
}

export interface SavedJourney {
  id: number;
  origin: NamedLocation;
  destination: NamedLocation;
  radiusKm: number;
  totalDistanceKm: number;
  durationMin: number;
  createdAt: string;
  stops: { stopOrder: number; place: Place }[];
}

// ---------------- Surprise Me (mirrors server/src/types.ts) ----------------
export interface SurpriseStop extends Place {
  stopNumber: number; // 1 = first stop
  visitMin: number; // ESTIMATED time at the place
  legDistanceKm?: number;
  legDurationMin?: number;
}

export interface SurpriseSummary {
  drivingKm: number;
  drivingMin: number;
  visitMin: number;
  breakMin: number; // always 0 now: the entered total already includes everything
  totalMin: number;
  maxKm: number | null;
  maxMin: number | null;
  directKm?: number;
  directMin?: number;
}

export interface SurpriseResult {
  mode: 'around' | 'route';
  tripType: 'roundtrip' | 'oneway' | 'route';
  start: NamedLocation;
  destination: NamedLocation | null;
  stops: SurpriseStop[];
  summary: SurpriseSummary;
  geometry: number[][] | null;
  warnings: string[];
}

// ---------------- Photos (mirrors server/src/services/photos) ----------------
export interface PlacePhoto {
  url: string;
  pageUrl: string;
  title: string;
  author: string | null;
  license: string | null;
  licenseUrl: string | null;
  attribution: string;
  source: 'osm-image' | 'wikidata' | 'commons-search';
}
export interface PhotosResult {
  status: 'ok' | 'none' | 'unavailable';
  photos: PlacePhoto[];
  searched: string[];
}

// ---------------- Saved trips (mirrors server/src/services/savedTrips.ts) ----------------
export type TripKind = 'journey' | 'surprise-route' | 'surprise-around';

export interface NavigationLeg {
  url: string;
  fromName: string;
  toName: string;
  stopCount: number;
}

// A stop inside a trip: a Place plus, for surprise trips, the estimated visit time
export type TripStop = Place & { visitMin?: number };

export interface SavedTrip {
  id: number;
  name: string;
  kind: TripKind;
  origin: NamedLocation;
  destination: NamedLocation;
  radiusKm: number | null;
  totalDistanceKm: number;
  totalDurationMin: number;
  drivingDistanceKm: number;
  drivingDurationMin: number;
  geometry: number[][] | null;
  stops: TripStop[];
  settings: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  stopCount: number;
  navigation: { legs: NavigationLeg[]; split: boolean };
}

export interface SaveTripBody {
  kind: TripKind;
  name?: string;
  origin: NamedLocation;
  destination: NamedLocation;
  radiusKm: number | null;
  totalDistanceKm: number;
  totalDurationMin: number;
  drivingDistanceKm: number;
  drivingDurationMin: number;
  geometry: number[][] | null;
  stops: TripStop[];
  settings?: Record<string, unknown> | null;
}

export interface RouteInfo {
  distanceKm: number;
  durationMin: number;
  geometry: number[][];
}
