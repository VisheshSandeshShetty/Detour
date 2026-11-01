// DETOUR CALCULATION: Detour's key feature.
//
// We show two different numbers for every place:
//
//   A. Distance from route   - straight-line distance from the place to the road (corridor.ts)
//   B. Additional driving    - how many EXTRA kilometres/minutes you drive by visiting it
//
// They are not the same. A lake can be 2 km from the highway as the crow flies, but if the only
// access road loops around a hill it may cost 10 extra km of driving.
//
// HOW WE CALCULATE B
// ------------------
// For each place P we pick two spots on the ORIGINAL route:
//
//        A (leave the route here)          B (rejoin the route here)
//   ----*-----------------------------------*---------->  original route
//        \                                 /
//         \________________ P ____________/
//
//   extra distance = road(A -> P) + road(P -> B) - road(A -> B)
//   extra time     = same formula using driving times
//
// Using spots ON the route (instead of the trip origin and destination) means the maths cannot
// change the rest of your journey: we only compare the small stretch between A and B.
//
// Doing this with one OSRM request per place would be slow, so we use OSRM's "table" service,
// which answers many A->P, P->B and A->B questions in one request (25 places per request).

import { config } from '../config';
import { sleep } from '../lib/http';
import { getRoadMatrix } from './osrm';
import { pointAtKm, type RouteIndex } from './corridor';

const PLACES_PER_REQUEST = 25; // 25 places x 3 points = 75 points, under the OSRM public limit of 100

export interface DetourResult {
  detourDistanceKm: number | null;
  detourDurationMin: number | null;
}

// Where do we leave and rejoin the route? Further-away places need a longer stretch.
export function chooseAnchorKm(
  placeAlongKm: number,
  distanceFromRouteKm: number,
  routeLengthKm: number
): { beforeKm: number; afterKm: number } {
  const margin = Math.min(15, Math.max(2, distanceFromRouteKm * 2));
  return {
    beforeKm: Math.max(0, placeAlongKm - margin),
    afterKm: Math.min(routeLengthKm, placeAlongKm + margin),
  };
}

// The formula from the top of this file. Inputs are metres and seconds straight from OSRM.
// If OSRM could not connect any of the three trips, the detour is unavailable (null), never guessed.
export function calculateDetour(trips: {
  toPlace: { meters: number | null; seconds: number | null };
  fromPlace: { meters: number | null; seconds: number | null };
  direct: { meters: number | null; seconds: number | null };
}): DetourResult {
  const { toPlace, fromPlace, direct } = trips;
  const values = [
    toPlace.meters, toPlace.seconds, fromPlace.meters, fromPlace.seconds, direct.meters, direct.seconds,
  ];
  if (values.some((value) => value === null || value === undefined)) {
    return { detourDistanceKm: null, detourDurationMin: null };
  }

  const extraMeters = toPlace.meters! + fromPlace.meters! - direct.meters!;
  const extraSeconds = toPlace.seconds! + fromPlace.seconds! - direct.seconds!;
  // Tiny negative numbers can happen from rounding/snapping. Visiting a place never saves distance.
  return {
    detourDistanceKm: Math.max(0, extraMeters) / 1000,
    detourDurationMin: Math.max(0, extraSeconds) / 60,
  };
}

interface PlaceOnRoute {
  latitude: number;
  longitude: number;
  routeKm: number;
  distanceFromRouteKm: number;
}

// Works out the detour for up to 25 places with a single OSRM "table" request.
async function detoursForBatch(index: RouteIndex, batch: PlaceOnRoute[]): Promise<DetourResult[]> {
  const count = batch.length;

  // One list of points: [all A spots][all place spots][all B spots]
  const leavePoints: number[][] = [];
  const placePoints: number[][] = [];
  const rejoinPoints: number[][] = [];
  for (const place of batch) {
    const { beforeKm, afterKm } = chooseAnchorKm(place.routeKm, place.distanceFromRouteKm, index.lengthKm);
    leavePoints.push(pointAtKm(index, beforeKm));
    placePoints.push([place.longitude, place.latitude]);
    rejoinPoints.push(pointAtKm(index, afterKm));
  }
  const coordinates = [...leavePoints, ...placePoints, ...rejoinPoints];

  // Sources: A spots and place spots (indexes 0 .. 2*count-1)
  // Destinations: place spots and B spots (indexes count .. 3*count-1)
  const sources = Array.from({ length: 2 * count }, (_, i) => i);
  const destinations = Array.from({ length: 2 * count }, (_, i) => count + i);
  const { distances, durations } = await getRoadMatrix(coordinates, sources, destinations);

  // Reading the answer: row = source, column = destination (see the numbering above).
  return batch.map((_, i) =>
    calculateDetour({
      toPlace: { meters: distances[i]?.[i] ?? null, seconds: durations[i]?.[i] ?? null }, // A_i -> P_i
      fromPlace: { meters: distances[count + i]?.[count + i] ?? null, seconds: durations[count + i]?.[count + i] ?? null }, // P_i -> B_i
      direct: { meters: distances[i]?.[count + i] ?? null, seconds: durations[i]?.[count + i] ?? null }, // A_i -> B_i
    })
  );
}

// Adds detourDistanceKm / detourDurationMin to every place. If a batch fails (OSRM busy), those
// places get null ("Detour unavailable") and we report it, instead of failing the whole journey.
export async function addDetours<T extends PlaceOnRoute>(
  index: RouteIndex,
  places: T[]
): Promise<{ places: (T & DetourResult)[]; failedBatches: number }> {
  const results: (T & DetourResult)[] = [];
  let failedBatches = 0;

  for (let start = 0; start < places.length; start += PLACES_PER_REQUEST) {
    if (start > 0) await sleep(config.osrmDelayMs); // be polite to the public server
    const batch = places.slice(start, start + PLACES_PER_REQUEST);

    let detours: DetourResult[] | null = null;
    try {
      detours = await detoursForBatch(index, batch);
    } catch (error) {
      failedBatches++;
      console.error('Detour batch failed:', error instanceof Error ? error.message : error);
    }

    batch.forEach((place, i) => {
      results.push({
        ...place,
        detourDistanceKm: detours?.[i]?.detourDistanceKm ?? null,
        detourDurationMin: detours?.[i]?.detourDurationMin ?? null,
      });
    });
  }
  return { places: results, failedBatches };
}
