// Shared TypeScript shapes used across the server.

import type { CategoryKey } from './lib/categories';

export interface LatLon {
  latitude: number;
  longitude: number;
}

export interface NamedLocation extends LatLon {
  name: string;
}

// A place as the frontend sees it.
import type { ThemeKey } from './lib/themes';

export interface PlaceDTO {
  // OpenStreetMap identity, e.g. "node-123456". Also used in the URL: /places/node-123456
  id: string;
  name: string;
  category: CategoryKey;
  latitude: number;
  longitude: number;
  description: string | null;
  // OpenStreetMap has no ratings, so this is null unless a place source provides one
  rating: number | null;
  imageUrl: string | null;
  openingHours: string | null;
  website: string | null;
  // Finer kinds of place (beach, waterfall ...) used by the Surprise Me filter
  themes?: ThemeKey[];

  // Only set for "nearby" searches: straight-line distance from the search point
  distanceKm?: number;

  // Only set for journey searches:
  distanceFromRouteKm?: number; // A. shortest straight-line distance to the route
  detourDistanceKm?: number | null; // B. extra kilometres of driving (null = could not be calculated)
  detourDurationMin?: number | null; // extra minutes of driving (null = could not be calculated)
  routeKm?: number; // how far along the journey the closest point is
}

// ---------------- Surprise Me ----------------

export interface SurpriseStop extends PlaceDTO {
  stopNumber: number; // 1 = first stop
  visitMin: number; // ESTIMATED time spent at the place (see VISIT_MINUTES)
  legDistanceKm?: number; // "Around me" trips: driving distance from the previous point
  legDurationMin?: number;
}

export interface SurpriseSummary {
  drivingKm: number;
  drivingMin: number;
  visitMin: number; // time at the stops
  breakMin: number; // RESERVED rest/food/fuel time. It is not exploration time.
  totalMin: number; // driving + visiting + reserved break
  maxKm: number | null; // the limits the user asked for (null = not limited)
  maxMin: number | null;
  directKm?: number; // route trips: the journey without any surprise stops
  directMin?: number;
}

export interface SurpriseResult {
  mode: 'around' | 'route';
  tripType: 'roundtrip' | 'oneway' | 'route';
  start: NamedLocation;
  destination: NamedLocation | null; // only for route trips
  stops: SurpriseStop[];
  summary: SurpriseSummary;
  geometry: number[][] | null; // the trip as [lon, lat] pairs, null if it could not be drawn
  warnings: string[];
}

// A place while we are still working on it on the server. `score` says how "interesting"
// we think it is, and is used to choose the best places when there are too many.
export interface Candidate extends PlaceDTO {
  score: number;
}
