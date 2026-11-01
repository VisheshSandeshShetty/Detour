// Corridor maths: "which places are really close to the route?"
//
// A route is a long squiggly line. A place is "in the corridor" if its SHORTEST distance to that
// line is within the chosen radius (5, 10, 20 or 30 km). We use Turf.js for the geographic maths.
//
// IMPORTANT: a bounding box is NOT a corridor. A winding road has a huge bounding box that
// contains lots of places far away from the road. The bounding box is only a cheap first check.
//
// Speed trick: measuring the distance from one place to a 20,000-point line is slow. So we cut
// the route into small "pieces", each with its own bounding box. For every place we only run
// the exact (slow) Turf distance on the few pieces that are nearby.

import * as turf from '@turf/turf';
import type { Feature, LineString } from 'geojson';

type BBox = [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]

const POINTS_PER_PIECE = 40;

export interface RoutePiece {
  line: Feature<LineString>;
  bbox: BBox;
  startKm: number; // how far from the start of the whole route this piece begins
}

export interface RouteIndex {
  line: Feature<LineString>;
  lengthKm: number;
  bbox: BBox;
  pieces: RoutePiece[];
}

// Makes the route line simpler (fewer points) while keeping its shape.
// Used before sending the route to Overpass and before drawing it on the map.
export function simplifyRoute(coordinates: number[][], maxPoints: number): number[][] {
  if (coordinates.length <= maxPoints) return coordinates;

  let tolerance = 0.0005; // degrees, roughly 50 metres
  let simplified = coordinates;
  for (let attempt = 0; attempt < 14 && simplified.length > maxPoints; attempt++) {
    simplified = turf.simplify(turf.lineString(coordinates), { tolerance, highQuality: false }).geometry
      .coordinates;
    tolerance *= 1.6;
  }
  return simplified;
}

function haversineKm(a: number[], b: number[]): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// Cuts a long route into stretches of about `maxKm` each. Neighbouring stretches share one point,
// so there is no gap between them. A 900 km route with maxKm = 200 becomes 5 stretches.
export function splitRoute(coordinates: number[][], maxKm: number): number[][][] {
  const stretches: number[][][] = [];
  let current: number[][] = [coordinates[0]];
  let currentKm = 0;

  for (let i = 1; i < coordinates.length; i++) {
    currentKm += haversineKm(coordinates[i - 1], coordinates[i]);
    current.push(coordinates[i]);
    const isLastPoint = i === coordinates.length - 1;
    if (currentKm >= maxKm && !isLastPoint) {
      stretches.push(current);
      current = [coordinates[i]]; // the next stretch starts where this one ended
      currentKm = 0;
    }
  }
  if (current.length > 1) stretches.push(current);
  return stretches;
}

// Prepares a route for fast distance checks: the whole line, its bounding box, and its pieces.
export function buildRouteIndex(coordinates: number[][]): RouteIndex {
  const line = turf.lineString(coordinates);
  const lengthKm = turf.length(line, { units: 'kilometers' });
  const bbox = turf.bbox(line) as BBox;

  const pieces: RoutePiece[] = [];
  let startKm = 0;
  // Each piece shares its last point with the next piece, so there are no gaps
  for (let i = 0; i < coordinates.length - 1; i += POINTS_PER_PIECE) {
    const slice = coordinates.slice(i, i + POINTS_PER_PIECE + 1);
    if (slice.length < 2) break;
    const pieceLine = turf.lineString(slice);
    pieces.push({ line: pieceLine, bbox: turf.bbox(pieceLine) as BBox, startKm });
    startKm += turf.length(pieceLine, { units: 'kilometers' });
  }
  return { line, lengthKm, bbox, pieces };
}

// Is the point inside the box, after growing the box by `marginKm` on every side?
// This is the cheap "bounding box" check.
export function isNearBox(box: BBox, point: [number, number], marginKm: number): boolean {
  const [lon, lat] = point;
  // One degree of latitude is about 111 km. Longitude degrees get shorter away from the equator.
  // We use 110 so the margin is slightly generous, which is the safe direction.
  const latMargin = marginKm / 110;
  const lonMargin = marginKm / (110 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  return (
    lon >= box[0] - lonMargin &&
    lon <= box[2] + lonMargin &&
    lat >= box[1] - latMargin &&
    lat <= box[3] + latMargin
  );
}

export interface RouteMeasure {
  distanceKm: number; // shortest distance from the point to the route
  alongKm: number; // how far along the route the closest spot is
}

// The real work: shortest distance from a point to the route line (Turf: nearestPointOnLine).
// `searchKm` limits which pieces we bother to check, so pass the largest distance you care about.
export function measureDistanceToRoute(
  index: RouteIndex,
  point: [number, number],
  searchKm: number
): RouteMeasure | null {
  let best: RouteMeasure | null = null;
  for (const piece of index.pieces) {
    if (!isNearBox(piece.bbox, point, searchKm)) continue; // this piece is too far away, skip it

    const snapped = turf.nearestPointOnLine(piece.line, point, { units: 'kilometers' });
    const distanceKm = snapped.properties.dist;
    const kmInsidePiece = snapped.properties.location;
    if (distanceKm === undefined || kmInsidePiece === undefined) continue;

    if (best === null || distanceKm < best.distanceKm) {
      best = { distanceKm, alongKm: piece.startKm + kmInsidePiece };
    }
  }
  return best;
}

// Keeps only the places whose real distance to the route is within the corridor radius,
// and tells us how far each one is from the route.
export function filterByCorridor<T extends { latitude: number; longitude: number }>(
  index: RouteIndex,
  places: T[],
  radiusKm: number
): (T & { distanceFromRouteKm: number; routeKm: number })[] {
  const result: (T & { distanceFromRouteKm: number; routeKm: number })[] = [];
  for (const place of places) {
    const point: [number, number] = [place.longitude, place.latitude];

    // Step 1: cheap bounding box check, throws away places that are obviously far away
    if (!isNearBox(index.bbox, point, radiusKm)) continue;

    // Step 2: exact distance to the actual road line
    const measure = measureDistanceToRoute(index, point, radiusKm);
    if (measure && measure.distanceKm <= radiusKm) {
      result.push({ ...place, distanceFromRouteKm: measure.distanceKm, routeKm: measure.alongKm });
    }
  }
  return result;
}

// The coordinates of the spot `km` kilometres along the route.
export function pointAtKm(index: RouteIndex, km: number): [number, number] {
  const clamped = Math.min(Math.max(km, 0), index.lengthKm);
  let piece = index.pieces[0];
  for (const candidate of index.pieces) {
    if (candidate.startKm <= clamped) piece = candidate;
    else break;
  }
  const point = turf.along(piece.line, clamped - piece.startKm, { units: 'kilometers' });
  return point.geometry.coordinates as [number, number];
}

// A 300 km route can have hundreds of matching places, all bunched up near cities. We want results
// from the WHOLE journey, so we cut the route into equal stretches and take the best places from
// each stretch (best = highest score). Leftover room is filled with the best remaining places.
export function pickAlongWholeRoute<T extends { score: number; routeKm: number }>(
  places: T[],
  routeLengthKm: number,
  maxPlaces: number,
  stretches = 10
): T[] {
  if (places.length <= maxPlaces) return places;

  const perStretch = Math.ceil(maxPlaces / stretches);
  const groups: T[][] = Array.from({ length: stretches }, () => []);
  for (const place of places) {
    const position = Math.floor((place.routeKm / Math.max(routeLengthKm, 0.001)) * stretches);
    groups[Math.min(stretches - 1, Math.max(0, position))].push(place);
  }

  const chosen: T[] = [];
  const leftovers: T[] = [];
  for (const group of groups) {
    group.sort((a, b) => b.score - a.score);
    chosen.push(...group.slice(0, perStretch));
    leftovers.push(...group.slice(perStretch));
  }

  if (chosen.length < maxPlaces) {
    leftovers.sort((a, b) => b.score - a.score);
    chosen.push(...leftovers.slice(0, maxPlaces - chosen.length));
  }
  return chosen.sort((a, b) => b.score - a.score).slice(0, maxPlaces);
}
