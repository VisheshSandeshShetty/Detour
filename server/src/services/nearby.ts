// "What is around this point?" Used by Explore (Around me) and by Surprise Me.
// Kept separate from places.ts (place details) so it does not need the database.

import * as turf from '@turf/turf';
import { cacheGet, cacheSet } from '../lib/cache';
import type { PlaceDTO } from '../types';
import { fetchNearbyCandidates, removeDuplicates } from './overpass';

const DEFAULT_MAX_RESULTS = 150;

export interface NearbyResult {
  places: PlaceDTO[];
  warning: string | null;
}

// `maxResults` keeps the closest places. Explore shows the closest 150. Surprise Me asks for
// more, because it wants a wide choice to pick from, not only what is next door.
export async function findNearbyPlaces(
  latitude: number,
  longitude: number,
  radiusKm: number,
  maxResults = DEFAULT_MAX_RESULTS
): Promise<NearbyResult> {
  const cacheKey = `nearby:${latitude.toFixed(3)},${longitude.toFixed(3)}:${radiusKm}:${maxResults}`;
  const cached = cacheGet<NearbyResult>(cacheKey);
  if (cached) return cached;

  const { candidates, warning } = await fetchNearbyCandidates(latitude, longitude, radiusKm);

  const here = turf.point([longitude, latitude]);
  const places = removeDuplicates(candidates)
    .map(({ score, ...place }): PlaceDTO => ({
      ...place,
      distanceKm: Number(
        turf.distance(here, turf.point([place.longitude, place.latitude]), { units: 'kilometers' }).toFixed(2)
      ),
    }))
    .filter((place) => (place.distanceKm ?? 0) <= radiusKm)
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
    .slice(0, maxResults);

  const result: NearbyResult = { places, warning };
  if (!warning) cacheSet(cacheKey, result, 10 * 60);
  return result;
}
