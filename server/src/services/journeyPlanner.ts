// Plans a journey end to end. This file is the "recipe" that ties the other services together:
//
//   1. OSRM       -> real driving route (geometry, distance, duration)
//   2. Overpass   -> candidate places near the route
//   3. Turf       -> keep only places truly inside the corridor
//   4. Pick       -> best places from every stretch of the route
//   5. OSRM table -> extra driving distance/time (the detour) for each place

import { config } from '../config';
import { AppError } from '../lib/errors';
import { cacheGet, cacheSet } from '../lib/cache';
import type { NamedLocation, PlaceDTO, Candidate } from '../types';
import { getRoute } from './osrm';
import { DEMO_WARNING } from './demoPlaces';
import { fetchCorridorCandidates, removeDuplicates } from './overpass';
import {
  buildRouteIndex,
  filterByCorridor,
  measureDistanceToRoute,
  pickAlongWholeRoute,
  simplifyRoute,
  splitRoute,
  type RouteIndex,
} from './corridor';
import { addDetours } from './detour';

export interface JourneyRequest {
  origin: NamedLocation;
  destination: NamedLocation;
  radiusKm: number;
}

export interface JourneyPlan {
  origin: NamedLocation;
  destination: NamedLocation;
  radiusKm: number;
  route: {
    distanceKm: number;
    durationMin: number;
    geometry: number[][]; // [lon, lat] pairs for drawing the route
  };
  attractions: PlaceDTO[];
  totalInCorridor: number; // how many places were inside the corridor before we picked the best ones
  warnings: string[]; // problems the user should know about (e.g. places service was busy)
}

const MAX_ATTRACTIONS = 75;
// Overpass gets a lighter copy of the route (fewer vertices = faster query) and a slightly bigger
// radius to make up for the simplification. Turf then measures the EXACT distance anyway.
// Long routes are searched in stretches of 200 km, each with at most 60 vertices.
const STRETCH_KM = 200;
const VERTICES_PER_STRETCH = 60;
const OVERPASS_MARGIN_KM = 1;
// The coarse route is slightly simplified, so we allow a little extra distance in the first
// pass and then re-measure the chosen places against the full-detail route.
const COARSE_MARGIN_KM = 0.5;

function straightLineKm(a: NamedLocation, b: NamedLocation): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// Second, precise pass: measure the chosen places against the full-detail route and drop any
// that turn out to be outside the corridor.
function refineDistances<T extends Candidate & { distanceFromRouteKm: number; routeKm: number }>(
  fineIndex: RouteIndex,
  places: T[],
  radiusKm: number
): T[] {
  const refined: T[] = [];
  for (const place of places) {
    const measure = measureDistanceToRoute(
      fineIndex,
      [place.longitude, place.latitude],
      place.distanceFromRouteKm + 1
    );
    if (measure && measure.distanceKm <= radiusKm) {
      refined.push({ ...place, distanceFromRouteKm: measure.distanceKm, routeKm: measure.alongKm });
    }
  }
  return refined;
}

const round = (value: number, decimals: number) => Number(value.toFixed(decimals));

// If the same journey is requested twice at the same moment (React development mode does this,
// and so does a double click), share ONE running plan instead of calling OSRM/Overpass twice.
const plansInProgress = new Map<string, Promise<JourneyPlan>>();

export function planJourney(request: JourneyRequest): Promise<JourneyPlan> {
  const { origin, destination, radiusKm } = request;
  const key = `${origin.latitude.toFixed(4)},${origin.longitude.toFixed(4)}:${destination.latitude.toFixed(4)},${destination.longitude.toFixed(4)}:${radiusKm}`;

  const running = plansInProgress.get(key);
  if (running) return running.then((plan) => ({ ...plan, origin, destination }));

  const promise = buildJourneyPlan(request).finally(() => plansInProgress.delete(key));
  plansInProgress.set(key, promise);
  return promise;
}

async function buildJourneyPlan(request: JourneyRequest): Promise<JourneyPlan> {
  const { origin, destination, radiusKm } = request;

  if (straightLineKm(origin, destination) < 0.5) {
    throw new AppError(400, 'The origin and destination are the same place. Pick two different places.');
  }

  const cacheKey = `plan:${origin.latitude.toFixed(4)},${origin.longitude.toFixed(4)}:${destination.latitude.toFixed(4)},${destination.longitude.toFixed(4)}:${radiusKm}`;
  const cached = cacheGet<JourneyPlan>(cacheKey);
  if (cached) return { ...cached, origin, destination };

  // 1. Real driving route. If this fails there is nothing to show, so the error goes to the user.
  const route = await getRoute(origin, destination);
  if (route.distanceKm > config.maxRouteKm) {
    throw new AppError(
      422,
      `This journey is about ${Math.round(route.distanceKm)} km. Detour can search along journeys up to ${config.maxRouteKm} km. Try a shorter trip.`
    );
  }

  // Two versions of the route line:
  //  - coarse: ~300 points. Small enough to send to Overpass and quick to measure against.
  //  - fine:   every point OSRM gave us. Used for the final, precise numbers.
  const coarseCoordinates = simplifyRoute(route.coordinates, 300);
  const coarseIndex = buildRouteIndex(coarseCoordinates);
  const fineIndex = buildRouteIndex(route.coordinates);

  const warnings: string[] = [];
  let attractions: PlaceDTO[] = [];
  let totalInCorridor = 0;

  // Everything below is "extra". If it fails we still return the route plus a warning.
  try {
    // 2. Candidate places near the route (Overpass does a rough "within X km of this line" cut)
    const stretches = splitRoute(route.coordinates, STRETCH_KM).map((stretch) =>
      simplifyRoute(stretch, VERTICES_PER_STRETCH)
    );
    const fetched = await fetchCorridorCandidates(stretches, radiusKm + OVERPASS_MARGIN_KM);
    if (fetched.demo) warnings.push(DEMO_WARNING);
    else if (fetched.failedStretches > 0) {
      warnings.push(
        `The places service was busy, so ${fetched.failedStretches} of ${fetched.totalStretches} map sections along the route could not be searched. Results may be incomplete. Try again in a minute.`
      );
    }
    const unique = removeDuplicates(fetched.candidates);

    // 3. Exact corridor filter with Turf
    const inCorridor = filterByCorridor(coarseIndex, unique, radiusKm + COARSE_MARGIN_KM);
    totalInCorridor = inCorridor.length;

    // 4. Too many? Keep the best from every stretch. Closer to the road is slightly better.
    const ranked = inCorridor.map((place) => ({ ...place, score: place.score - place.distanceFromRouteKm * 1.5 }));
    const chosen = pickAlongWholeRoute(ranked, coarseIndex.lengthKm, MAX_ATTRACTIONS);

    // Precise distances against the full route
    const precise = refineDistances(fineIndex, chosen, radiusKm);

    // 5. Extra driving distance and time for each place
    const withDetours = await addDetours(fineIndex, precise);
    if (withDetours.failedBatches > 0) {
      warnings.push(
        'The routing service was busy, so the extra driving distance could not be calculated for some places. They are marked "Detour unavailable". Try again in a minute.'
      );
    }

    attractions = withDetours.places
      .map(({ score, ...place }): PlaceDTO => ({
        ...place,
        distanceFromRouteKm: round(place.distanceFromRouteKm, 2),
        routeKm: round(place.routeKm, 1),
        detourDistanceKm: place.detourDistanceKm === null ? null : round(place.detourDistanceKm, 1),
        detourDurationMin: place.detourDurationMin === null ? null : round(place.detourDurationMin, 1),
      }))
      .sort((a, b) => (a.routeKm ?? 0) - (b.routeKm ?? 0));
  } catch (error) {
    if (error instanceof AppError) {
      warnings.push(`${error.message} The route is shown without places.`);
    } else {
      console.error('Unexpected error while finding places along the route:', error);
      warnings.push('Something went wrong while searching for places along the route. The route is shown without places.');
    }
  }

  const plan: JourneyPlan = {
    origin,
    destination,
    radiusKm,
    route: {
      distanceKm: round(route.distanceKm, 1),
      durationMin: round(route.durationMin, 0),
      // A lighter copy of the geometry for drawing, rounded to ~1 metre precision
      geometry: simplifyRoute(route.coordinates, 3000).map(([lon, lat]) => [round(lon, 5), round(lat, 5)]),
    },
    attractions,
    totalInCorridor,
    warnings,
  };

  // Only cache complete results, so a "retry" after a failure really tries again
  if (warnings.length === 0) cacheSet(cacheKey, plan, 30 * 60);
  return plan;
}
