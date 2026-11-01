// SURPRISE ME: "pick some unexpected places for me, but keep the trip inside my time/distance".
//
// Two modes:
//
//   AROUND ME   You are at a point. You say "3 hours, 100 km, round trip" (time, distance or both).
//               We pick random places nearby and order them into a small trip.
//
//   ALONG A ROUTE   You already planned A -> B (say 360 km). You say "400 km total" and/or
//               "8 hours total". We pick random places along the route whose detours add up to
//               the spare 40 km / spare time. 90 minutes are RESERVED for rest, food and fuel
//               and are never spent on sightseeing.
//
// How "random" works: places are shuffled with weights, so sights, viewpoints and forts come up
// much more often than cafes and shops. Then we add places one by one, but only if the trip
// still fits the limits. All distances and times come from real road routing (OSRM).

import { VISIT_MINUTES, type CategoryKey } from '../lib/categories';
import { AppError } from '../lib/errors';
import type { NamedLocation, PlaceDTO, SurpriseResult, SurpriseStop } from '../types';
import { simplifyRoute } from './corridor';
import { planJourney } from './journeyPlanner';
import { findNearbyPlaces } from './nearby';
import { getRoadMatrix, getRouteThrough } from './osrm';

export type Rng = () => number; // returns a number from 0 up to (not including) 1, like Math.random

const MAX_STOPS = 5;
const MAX_PER_CATEGORY = 2; // keeps the trip varied: not five forts in a row
const MAX_CANDIDATES = 14; // places we measure real road distances for (OSRM limits request size)
const ROAD_FACTOR = 1.3; // roads are about 30% longer than a straight line
const LOCAL_SPEED_KMH = 40; // average speed for local driving, only used to size the search area
const MIN_GAP_ON_ROUTE_KM = 8; // along a route, stops are at least this far apart

const round = (value: number, decimals: number) => Number(value.toFixed(decimals));

function formatMinutes(minutes: number): string {
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours === 0) return `${mins} min`;
  return mins === 0 ? `${hours} h` : `${hours} h ${mins} min`;
}

// ---------------------------------------------------------------------------------------
// 1. Random choice with weights
// ---------------------------------------------------------------------------------------

// How likely a place is to be picked. Sights beat shops.
const CATEGORY_INTEREST: Record<CategoryKey, number> = {
  attraction: 3,
  nature: 3,
  historic: 3,
  entertainment: 2,
  park: 2,
  food: 0.6,
  shopping: 0.4,
};

export function interestWeight(place: { category: CategoryKey; imageUrl: string | null; website: string | null }): number {
  let weight = CATEGORY_INTEREST[place.category];
  if (place.imageUrl) weight *= 1.8; // somebody photographed it, so it is probably worth seeing
  if (place.website) weight *= 1.3;
  return weight;
}

// A shuffle where heavier items tend to come first, but any item can end up anywhere.
// (Each item gets the key  random ^ (1 / weight)  and we sort by key, biggest first.
// A bigger weight pushes the key towards 1, so that item tends to win.)
export function weightedShuffle<T>(items: T[], weightOf: (item: T) => number, rng: Rng): T[] {
  return items
    .map((item) => ({ item, key: Math.pow(rng(), 1 / Math.max(weightOf(item), 0.0001)) }))
    .sort((a, b) => b.key - a.key)
    .map((entry) => entry.item);
}

// ---------------------------------------------------------------------------------------
// 2. Building a trip around a starting point (the "Around me" mode)
// ---------------------------------------------------------------------------------------

// Road distances and times between every pair of points. Index 0 is the start,
// 1, 2, 3 ... are the candidate places. null = OSRM could not connect those two points.
export interface RoadMatrix {
  meters: (number | null)[][];
  seconds: (number | null)[][];
}

// Driving cost of visiting the places in `order` (indexes into the matrix), starting at point 0.
// A round trip ends by driving back to point 0. A one-way trip simply ends at the last place.
export function legsCost(
  order: number[],
  matrix: RoadMatrix,
  roundTrip: boolean
): { meters: number; seconds: number } | null {
  const path = roundTrip ? [0, ...order, 0] : [0, ...order];
  let meters = 0;
  let seconds = 0;
  for (let i = 1; i < path.length; i++) {
    const legMeters = matrix.meters[path[i - 1]]?.[path[i]];
    const legSeconds = matrix.seconds[path[i - 1]]?.[path[i]];
    if (legMeters == null || legSeconds == null) return null;
    meters += legMeters;
    seconds += legSeconds;
  }
  return { meters, seconds };
}

export interface TourOptions {
  roundTrip: boolean;
  maxMeters: number | null; // distance limit (driving), null = none
  maxSeconds: number | null; // limit for driving + time at the places, null = none
  maxStops: number;
  maxPerCategory: number;
}

// "Cheapest insertion" in plain words: go through the candidates in the (random) order given.
// For each one, try it at every position in the trip so far, keep the position that adds the
// least driving, and accept it only if the whole trip still fits the limits.
// Returns the chosen candidates (matrix indexes) in the order they are visited.
export function buildTour(
  matrix: RoadMatrix,
  visitSeconds: number[],
  categories: string[],
  tryOrder: number[],
  options: TourOptions
): number[] {
  const tour: number[] = [];
  const perCategory = new Map<string, number>();

  for (const candidate of tryOrder) {
    if (tour.length >= options.maxStops) break;
    const category = categories[candidate];
    if ((perCategory.get(category) ?? 0) >= options.maxPerCategory) continue;

    const visitTotal = tour.reduce((sum, index) => sum + visitSeconds[index], 0) + visitSeconds[candidate];

    let best: { position: number; meters: number } | null = null;
    for (let position = 0; position <= tour.length; position++) {
      const trial = [...tour.slice(0, position), candidate, ...tour.slice(position)];
      const cost = legsCost(trial, matrix, options.roundTrip);
      if (!cost) continue;
      if (options.maxMeters !== null && cost.meters > options.maxMeters) continue;
      if (options.maxSeconds !== null && cost.seconds + visitTotal > options.maxSeconds) continue;
      if (!best || cost.meters < best.meters) best = { position, meters: cost.meters };
    }

    if (best) {
      tour.splice(best.position, 0, candidate);
      perCategory.set(category, (perCategory.get(category) ?? 0) + 1);
    }
  }
  return tour;
}

// How far from the start is worth searching? Used only to size the Overpass search; the real
// limits are checked later with real road distances.
export function searchRadiusKm(roundTrip: boolean, maxKm: number | null, timeMin: number | null): number {
  const options: number[] = [];
  if (maxKm !== null) options.push((roundTrip ? maxKm / 2 : maxKm) / ROAD_FACTOR);
  if (timeMin !== null) {
    // assume about 60% of the time is spent driving
    const drivingKm = ((timeMin * 0.6) / 60) * LOCAL_SPEED_KMH;
    options.push((roundTrip ? drivingKm / 2 : drivingKm) / ROAD_FACTOR);
  }
  const radius = Math.min(...options);
  return Math.min(25, Math.max(2, radius));
}

export interface AroundRequest {
  start: NamedLocation;
  tripType: 'roundtrip' | 'oneway';
  timeMin: number | null; // total time available, null = no time limit
  maxKm: number | null; // maximum driving distance, null = no distance limit
  breakMin?: number; // reserved rest time (default 0 for Around me)
}

export async function surpriseAround(request: AroundRequest, rng: Rng = Math.random): Promise<SurpriseResult> {
  const { start, tripType, timeMin, maxKm } = request;
  const roundTrip = tripType === 'roundtrip';
  const breakMin = request.breakMin ?? 0;
  const warnings: string[] = [];

  if (timeMin !== null && timeMin - breakMin <= 0) {
    throw new AppError(422, 'The reserved break uses up all of your time. Allow more time.');
  }

  // 1. Places near the start. We ask for a wide choice (up to 1000), not just the closest ones.
  const radius = searchRadiusKm(roundTrip, maxKm, timeMin);
  const nearby = await findNearbyPlaces(start.latitude, start.longitude, radius, 1000);
  if (nearby.warning) warnings.push(nearby.warning);

  // A place further away (in a straight line) than the limit allows can never fit, whatever the roads are like
  const reachKm = maxKm === null ? Infinity : roundTrip ? maxKm / 2 : maxKm;
  const pool = nearby.places.filter((place) => (place.distanceKm ?? 0) >= 0.2 && (place.distanceKm ?? 0) <= reachKm);
  if (pool.length === 0) {
    throw new AppError(
      422,
      'No places found within reach. Try a bit more distance or time, or a different starting point.'
    );
  }

  // 2. A random, interest-weighted selection of candidates
  const candidates = weightedShuffle(pool, interestWeight, rng).slice(0, MAX_CANDIDATES);

  // 3. Real road distances and times between the start and every candidate (one OSRM request)
  const points = [start, ...candidates];
  const indexes = points.map((_, index) => index);
  const roads = await getRoadMatrix(
    points.map((point) => [point.longitude, point.latitude]),
    indexes,
    indexes
  );
  const matrix: RoadMatrix = { meters: roads.distances, seconds: roads.durations };

  // 4. Add candidates one by one while the trip still fits
  const visitSeconds = [0, ...candidates.map((place) => VISIT_MINUTES[place.category] * 60)];
  const categories = ['', ...candidates.map((place) => place.category)];
  const order = buildTour(
    matrix,
    visitSeconds,
    categories,
    candidates.map((_, i) => i + 1),
    {
      roundTrip,
      maxMeters: maxKm === null ? null : maxKm * 1000,
      maxSeconds: timeMin === null ? null : (timeMin - breakMin) * 60,
      maxStops: MAX_STOPS,
      maxPerCategory: MAX_PER_CATEGORY,
    }
  );
  const cost = legsCost(order, matrix, roundTrip);
  if (order.length === 0 || !cost) {
    throw new AppError(422, 'Nothing fits in that time and distance. Try a little more of either.');
  }

  const stops: SurpriseStop[] = order.map((index, position) => {
    const previous = position === 0 ? 0 : order[position - 1];
    const place = candidates[index - 1];
    return {
      ...place,
      stopNumber: position + 1,
      visitMin: VISIT_MINUTES[place.category],
      legDistanceKm: round((matrix.meters[previous][index] ?? 0) / 1000, 1),
      legDurationMin: Math.round((matrix.seconds[previous][index] ?? 0) / 60),
    };
  });

  // 5. The line to draw on the map (nice to have: the numbers are already final)
  let geometry: number[][] | null = null;
  try {
    const waypoints = [start, ...stops, ...(roundTrip ? [start] : [])];
    geometry = simplifyRoute(
      (await getRouteThrough(waypoints)).coordinates,
      3000
    ).map(([lon, lat]) => [round(lon, 5), round(lat, 5)]);
  } catch {
    warnings.push('The trip line could not be drawn right now. The stops and the numbers are still correct.');
  }

  const visitMin = stops.reduce((sum, stop) => sum + stop.visitMin, 0);
  const drivingMin = cost.seconds / 60;
  return {
    mode: 'around',
    tripType,
    start,
    destination: null,
    stops,
    summary: {
      drivingKm: round(cost.meters / 1000, 1),
      drivingMin: Math.round(drivingMin),
      visitMin,
      breakMin,
      totalMin: Math.round(drivingMin + visitMin + breakMin),
      maxKm,
      maxMin: timeMin,
    },
    geometry,
    warnings,
  };
}

// ---------------------------------------------------------------------------------------
// 3. Choosing surprise stops along an existing route (the "Along this route" mode)
// ---------------------------------------------------------------------------------------

export interface RouteCandidate {
  routeKm: number; // how far along the route the place is
  detourKm: number; // extra driving to visit it
  detourMin: number;
  visitMin: number; // estimated time at the place
  category: string;
}

// Goes through the candidates in the (random) order given and keeps each one only if:
//   - the total extra distance stays inside `extraKm`
//   - the total extra time (detour driving + time at the place) stays inside `extraMin`
//   - it is not too close to a stop we already chose (their detours could overlap)
//   - we do not already have 2 of that category, or 5 stops
// null for extraKm / extraMin means "no limit of that kind".
export function chooseRouteStops<T extends RouteCandidate>(
  candidatesInRandomOrder: T[],
  extraKm: number | null,
  extraMin: number | null,
  options: { maxStops: number; minGapKm: number; maxPerCategory: number }
): T[] {
  const chosen: T[] = [];
  let usedKm = 0;
  let usedMin = 0;

  for (const candidate of candidatesInRandomOrder) {
    if (chosen.length >= options.maxStops) break;
    if (extraKm !== null && usedKm + candidate.detourKm > extraKm) continue;
    if (extraMin !== null && usedMin + candidate.detourMin + candidate.visitMin > extraMin) continue;
    if (chosen.some((other) => Math.abs(other.routeKm - candidate.routeKm) < options.minGapKm)) continue;
    if (chosen.filter((other) => other.category === candidate.category).length >= options.maxPerCategory) continue;

    chosen.push(candidate);
    usedKm += candidate.detourKm;
    usedMin += candidate.detourMin + candidate.visitMin;
  }
  // Show them in the order you will drive past them
  return chosen.sort((a, b) => a.routeKm - b.routeKm);
}

export interface RouteRequest {
  origin: NamedLocation;
  destination: NamedLocation;
  radiusKm: number; // corridor radius, same as the planner
  maxTotalKm: number | null; // limit for the whole trip, null = none
  totalMin: number | null; // time for the whole trip INCLUDING the reserved break, null = none
  breakMin: number; // reserved rest time (default 90)
}

export async function surpriseRoute(request: RouteRequest, rng: Rng = Math.random): Promise<SurpriseResult> {
  const { origin, destination, radiusKm, maxTotalKm, totalMin, breakMin } = request;

  // The direct trip (this is cached, so it is quick if the user just planned it)
  const plan = await planJourney({ origin, destination, radiusKm });
  const baseKm = plan.route.distanceKm;
  const baseMin = plan.route.durationMin;

  // How much room is left for surprises?
  //   distance: 400 km allowed - 360 km direct = 40 km of detours
  //   time:     8 h allowed - 6 h driving - 90 min reserved break = 30 min for detours AND time at the places
  const extraKm = maxTotalKm === null ? null : maxTotalKm - baseKm;
  const extraMin = totalMin === null ? null : totalMin - breakMin - baseMin;
  if (extraKm !== null && extraKm <= 0) {
    throw new AppError(
      422,
      `The direct route is already ${Math.round(baseKm)} km. Choose a maximum distance above that to leave room for surprises.`
    );
  }
  if (extraMin !== null && extraMin <= 0) {
    throw new AppError(
      422,
      `The drive alone takes ${formatMinutes(baseMin)} and ${breakMin} min are reserved for breaks. Allow more than ${formatMinutes(baseMin + breakMin)} to leave room for surprises.`
    );
  }

  // Only places whose detour we could actually calculate
  const pool = plan.attractions.filter((place) => place.detourDistanceKm != null && place.detourDurationMin != null);
  if (pool.length === 0) {
    throw new AppError(
      422,
      plan.warnings[0] ?? 'No places with a known detour were found along this route. Try a wider corridor radius.'
    );
  }

  type Candidate = RouteCandidate & { place: PlaceDTO };
  const candidates: Candidate[] = pool.map((place) => ({
    place,
    routeKm: place.routeKm ?? 0,
    detourKm: place.detourDistanceKm ?? 0,
    detourMin: place.detourDurationMin ?? 0,
    visitMin: VISIT_MINUTES[place.category],
    category: place.category,
  }));

  const shuffled = weightedShuffle(candidates, (candidate) => interestWeight(candidate.place), rng);
  let stops = chooseRouteStops(shuffled, extraKm, extraMin, {
    maxStops: MAX_STOPS,
    minGapKm: MIN_GAP_ON_ROUTE_KM,
    maxPerCategory: MAX_PER_CATEGORY,
  });

  // The numbers above add up each place's separate detour, which is an estimate. Now we check the
  // WHOLE trip with one real route through all the stops. If it is over the limits, we drop the
  // stop with the biggest detour and measure again.
  const warnings = [...plan.warnings];
  let drivingKm = 0;
  let drivingMin = 0;
  let geometry: number[][] | null = null;

  while (stops.length > 0) {
    const visitMin = stops.reduce((sum, stop) => sum + stop.visitMin, 0);
    try {
      const route = await getRouteThrough([origin, ...stops.map((stop) => stop.place), destination]);
      drivingKm = route.distanceKm;
      drivingMin = route.durationMin;
      geometry = simplifyRoute(route.coordinates, 3000).map(([lon, lat]) => [round(lon, 5), round(lat, 5)]);
    } catch {
      // Could not double-check: fall back to the estimate and say so
      drivingKm = baseKm + stops.reduce((sum, stop) => sum + stop.detourKm, 0);
      drivingMin = baseMin + stops.reduce((sum, stop) => sum + stop.detourMin, 0);
      geometry = null;
      warnings.push('The routing service was busy, so the final trip could not be double-checked. Distances and times are estimates.');
      break;
    }

    const overDistance = maxTotalKm !== null && drivingKm > maxTotalKm;
    const overTime = totalMin !== null && drivingMin + visitMin + breakMin > totalMin;
    if (!overDistance && !overTime) break;

    const biggest = stops.reduce((a, b) => (b.detourKm > a.detourKm ? b : a));
    stops = stops.filter((stop) => stop !== biggest);
    geometry = null;
  }

  if (stops.length === 0) {
    throw new AppError(422, 'No surprise stops fit in that budget. Allow a little more distance or time.');
  }

  const visitMin = stops.reduce((sum, stop) => sum + stop.visitMin, 0);
  return {
    mode: 'route',
    tripType: 'route',
    start: origin,
    destination,
    stops: stops.map((stop, index) => ({ ...stop.place, stopNumber: index + 1, visitMin: stop.visitMin })),
    summary: {
      drivingKm: round(drivingKm, 1),
      drivingMin: Math.round(drivingMin),
      visitMin,
      breakMin,
      totalMin: Math.round(drivingMin + visitMin + breakMin),
      maxKm: maxTotalKm,
      maxMin: totalMin,
      directKm: round(baseKm, 1),
      directMin: Math.round(baseMin),
    },
    geometry,
    warnings,
  };
}
