// Filtering and sorting happens here, in the browser, on results we already downloaded.
// Changing a filter never calls OSRM or Overpass again.

import type { CategoryKey, Place } from '../types';

// Sorts numbers ascending but always puts "unknown" (null/undefined) values last.
function compareAscending(a: number | null | undefined, b: number | null | undefined): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

function matchesText(place: Place, query: string): boolean {
  const text = query.trim().toLowerCase();
  return text === '' || place.name.toLowerCase().includes(text);
}

// ---------------- Journey results ----------------

export type JourneySort = 'extraDistance' | 'extraTime' | 'closest';

export const JOURNEY_SORT_LABELS: Record<JourneySort, string> = {
  extraDistance: 'Lowest additional distance',
  extraTime: 'Lowest additional travel time',
  closest: 'Closest to route',
};

export interface JourneyFilters {
  categories: CategoryKey[]; // empty = all categories
  query: string;
  maxExtraKm: number | null; // null = any
  maxExtraMin: number | null;
}

export const EMPTY_JOURNEY_FILTERS: JourneyFilters = {
  categories: [],
  query: '',
  maxExtraKm: null,
  maxExtraMin: null,
};

export function filterAndSortJourney(places: Place[], filters: JourneyFilters, sort: JourneySort): Place[] {
  const visible = places.filter((place) => {
    if (filters.categories.length > 0 && !filters.categories.includes(place.category)) return false;
    if (!matchesText(place, filters.query)) return false;

    // When a limit is set, places whose detour could not be calculated are hidden,
    // because we cannot promise they fit inside the limit.
    if (filters.maxExtraKm !== null) {
      if (place.detourDistanceKm == null || place.detourDistanceKm > filters.maxExtraKm) return false;
    }
    if (filters.maxExtraMin !== null) {
      if (place.detourDurationMin == null || place.detourDurationMin > filters.maxExtraMin) return false;
    }
    return true;
  });

  return [...visible].sort((a, b) => {
    switch (sort) {
      case 'extraDistance':
        return compareAscending(a.detourDistanceKm, b.detourDistanceKm);
      case 'extraTime':
        return compareAscending(a.detourDurationMin, b.detourDurationMin);
      case 'closest':
        return compareAscending(a.distanceFromRouteKm, b.distanceFromRouteKm);
    }
  });
}

// ---------------- Around me ----------------

// Keeps the chosen categories and puts the nearest places first.
export function filterNearby(places: Place[], categories: CategoryKey[]): Place[] {
  return places
    .filter((place) => categories.length === 0 || categories.includes(place.category))
    .sort((a, b) => compareAscending(a.distanceKm, b.distanceKm));
}
