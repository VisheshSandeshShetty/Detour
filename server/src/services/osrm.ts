// OSRM = Open Source Routing Machine. It gives us real driving routes over the road network.
//
//   - /route/v1  : the driving route between two places (geometry, distance, duration)
//   - /table/v1  : many "how far / how long from A to B" answers in a single request.
//                  We use this to work out detours cheaply (see detour.ts).

import { config } from '../config';
import { AppError } from '../lib/errors';
import { cacheGet, cacheSet } from '../lib/cache';
import { fetchJson, sleep, UpstreamError } from '../lib/http';
import type { LatLon } from '../types';

export interface RouteInfo {
  distanceKm: number;
  durationMin: number;
  // GeoJSON order: [longitude, latitude]
  coordinates: number[][];
}

interface OsrmRouteResponse {
  code: string;
  routes?: { distance: number; duration: number; geometry: { coordinates: number[][] } }[];
}

interface OsrmTableResponse {
  code: string;
  distances?: (number | null)[][];
  durations?: (number | null)[][];
}

// Calls OSRM, retries once on temporary failures and turns problems into friendly errors.
async function callOsrm<T extends { code: string }>(url: string): Promise<T> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await fetchJson<T>(url, { timeoutMs: 30000 });
    } catch (error) {
      if (error instanceof UpstreamError) {
        // OSRM explains routing problems with an HTTP 400 and a JSON body like {"code":"NoRoute"}
        const code = (error.body as { code?: string } | null)?.code;
        if (code === 'NoRoute') {
          throw new AppError(
            422,
            'No driving route exists between these two places. They may be separated by water or have no connecting roads.'
          );
        }
        if (code === 'NoSegment') {
          throw new AppError(
            422,
            'One of the places is too far from any road. Try a nearby town or a more specific location.'
          );
        }
        const isTemporary = error.status === null || error.status >= 500 || error.status === 429;
        if (isTemporary && attempt < 2) {
          await sleep(1000);
          continue;
        }
      }
      throw new AppError(
        502,
        'The routing service (OSRM) is not responding right now. Please try again in a moment.'
      );
    }
  }
  throw new AppError(502, 'The routing service (OSRM) is not responding right now.');
}

function roundedKey(point: LatLon): string {
  return `${point.latitude.toFixed(4)},${point.longitude.toFixed(4)}`;
}

function toLonLatString(points: number[][]): string {
  return points.map(([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)}`).join(';');
}

export async function getRoute(origin: LatLon, destination: LatLon): Promise<RouteInfo> {
  const cacheKey = `route:${roundedKey(origin)}:${roundedKey(destination)}`;
  const cached = cacheGet<RouteInfo>(cacheKey);
  if (cached) return cached;

  const coordinates = toLonLatString([
    [origin.longitude, origin.latitude],
    [destination.longitude, destination.latitude],
  ]);
  const url =
    `${config.osrmUrl}/route/v1/driving/${coordinates}` +
    '?overview=full&geometries=geojson&alternatives=false&steps=false';

  const data = await callOsrm<OsrmRouteResponse>(url);
  const route = data.routes?.[0];
  if (data.code !== 'Ok' || !route) {
    throw new AppError(502, 'The routing service did not return a route. Please try again.');
  }

  const result: RouteInfo = {
    distanceKm: route.distance / 1000,
    durationMin: route.duration / 60,
    coordinates: route.geometry.coordinates,
  };
  cacheSet(cacheKey, result, 60 * 60);
  return result;
}

// A driving route that passes through several points in order (used by Surprise Me).
// Not cached: every Surprise Me trip is different.
export async function getRouteThrough(points: LatLon[]): Promise<RouteInfo> {
  if (points.length < 2) throw new AppError(400, 'A route needs at least two points.');

  const coordinates = toLonLatString(points.map((point) => [point.longitude, point.latitude]));
  const url =
    `${config.osrmUrl}/route/v1/driving/${coordinates}` +
    '?overview=full&geometries=geojson&alternatives=false&steps=false';

  const data = await callOsrm<OsrmRouteResponse>(url);
  const route = data.routes?.[0];
  if (data.code !== 'Ok' || !route) {
    throw new AppError(502, 'The routing service did not return a route. Please try again.');
  }
  return {
    distanceKm: route.distance / 1000,
    durationMin: route.duration / 60,
    coordinates: route.geometry.coordinates,
  };
}

// Road distances (metres) and durations (seconds) between lists of points.
// `coordinates` is one list of [lon, lat]. `sources` and `destinations` are positions in that
// list. Entry [i][j] of the result is the trip from sources[i] to destinations[j],
// or null when OSRM cannot connect them.
export async function getRoadMatrix(
  coordinates: number[][],
  sources: number[],
  destinations: number[]
): Promise<{ distances: (number | null)[][]; durations: (number | null)[][] }> {
  const url =
    `${config.osrmUrl}/table/v1/driving/${toLonLatString(coordinates)}` +
    `?sources=${sources.join(';')}&destinations=${destinations.join(';')}` +
    '&annotations=duration,distance';

  const data = await callOsrm<OsrmTableResponse>(url);
  if (data.code !== 'Ok' || !data.distances || !data.durations) {
    throw new AppError(502, 'The routing service did not return travel times.');
  }
  return { distances: data.distances, durations: data.durations };
}
