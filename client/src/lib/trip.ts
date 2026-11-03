// Pure helpers for the trip (itinerary) that the user is building. No React in here, so they are
// easy to test. The list, the map markers, Navigate and Save all use these same functions.

import type { NamedLocation, Place, SaveTripBody, SurpriseResult, TripKind, TripStop } from '../types';

// place id -> its position in the trip (1 = first stop)
export function stopNumbers(stops: { id: string }[]): Record<string, number> {
  const numbers: Record<string, number> = {};
  stops.forEach((stop, index) => {
    if (!(stop.id in numbers)) numbers[stop.id] = index + 1;
  });
  return numbers;
}

// All places to show: the freshly discovered ones PLUS every selected stop, even when discovery did
// not return it this time (saved stops are the source of truth). Duplicates are removed by place id.
export function mergeWithStops(discovered: Place[], stops: TripStop[]): Place[] {
  const byId = new Map<string, Place>();
  for (const place of discovered) if (!byId.has(place.id)) byId.set(place.id, place);
  for (const stop of stops) byId.set(stop.id, { ...byId.get(stop.id), ...stop });
  return [...byId.values()];
}

export interface ListSections {
  selected: TripStop[]; // the trip, in itinerary order, always shown (filters never hide them)
  others: Place[]; // everything else, filtered and sorted
}

// Selected stops first (in trip order), then the other places. `arrange` filters and sorts the others.
export function buildListSections(
  discovered: Place[],
  stops: TripStop[],
  arrange: (places: Place[]) => Place[]
): ListSections {
  const merged = mergeWithStops(discovered, stops);
  const byId = new Map(merged.map((p) => [p.id, p]));
  const selectedIds = new Set<string>();
  const selected: TripStop[] = [];
  for (const stop of stops) {
    if (selectedIds.has(stop.id)) continue; // never twice
    selectedIds.add(stop.id);
    selected.push(byId.get(stop.id) as TripStop);
  }
  return { selected, others: arrange(merged.filter((p) => !selectedIds.has(p.id))) };
}

export interface TripTotals {
  drivingKm: number;
  drivingMin: number;
  visitMin: number;
  totalMin: number; // for plain journeys this is just the driving time
}

// Surprise trips also count the (estimated) time at the places, each stop counted exactly once.
export function tripTotals(route: { distanceKm: number; durationMin: number }, stops: TripStop[], kind: TripKind): TripTotals {
  const seen = new Set<string>();
  let visitMin = 0;
  if (kind !== 'journey') {
    for (const stop of stops) {
      if (seen.has(stop.id)) continue;
      seen.add(stop.id);
      visitMin += stop.visitMin ?? 0;
    }
  }
  return { drivingKm: route.distanceKm, drivingMin: route.durationMin, visitMin, totalMin: Math.round(route.durationMin + visitMin) };
}

// Used only if the routing service cannot be reached: the direct route plus each stop's own detour
export function estimateRoute(base: { distanceKm: number; durationMin: number }, stops: Place[]) {
  return {
    distanceKm: Math.round((base.distanceKm + stops.reduce((sum, s) => sum + (s.detourDistanceKm ?? 0), 0)) * 10) / 10,
    durationMin: Math.round(base.durationMin + stops.reduce((sum, s) => sum + (s.detourDurationMin ?? 0), 0)),
  };
}

export const stopsKey = (stops: { id: string }[]): string => stops.map((s) => s.id).join(',');

// A one-way "around me" trip ends AT its last stop: that stop is the destination, not a waypoint.
// Everything that draws a route, builds a Navigate link or saves a trip uses this one function.
export function tripEnds(
  kind: TripKind,
  settings: Record<string, unknown> | null | undefined,
  origin: NamedLocation,
  destination: NamedLocation,
  stops: TripStop[]
): { via: TripStop[]; end: NamedLocation } {
  if (kind === 'surprise-around' && settings?.tripType === 'oneway') {
    if (stops.length === 0) return { via: [], end: origin };
    const last = stops[stops.length - 1];
    return { via: stops.slice(0, -1), end: { name: last.name, latitude: last.latitude, longitude: last.longitude } };
  }
  return { via: stops, end: destination };
}

// What gets saved for a Surprise Me result: the exact stops that were generated, in order
export function surpriseToTripBody(result: SurpriseResult, radiusKm: number | null): SaveTripBody {
  const isRoute = result.mode === 'route';
  const oneway = !isRoute && result.tripType === 'oneway';
  const last = result.stops[result.stops.length - 1];
  const destination: NamedLocation = isRoute && result.destination
    ? result.destination
    : oneway && last
      ? { name: last.name, latitude: last.latitude, longitude: last.longitude }
      : result.start;
  return {
    kind: isRoute ? 'surprise-route' : 'surprise-around',
    origin: result.start,
    destination,
    radiusKm: isRoute ? radiusKm : null,
    totalDistanceKm: result.summary.drivingKm,
    totalDurationMin: result.summary.totalMin,
    drivingDistanceKm: result.summary.drivingKm,
    drivingDurationMin: result.summary.drivingMin,
    geometry: result.geometry,
    stops: result.stops.map((stop) => ({ ...stop })),
    settings: { tripType: result.tripType, summary: result.summary },
  };
}
