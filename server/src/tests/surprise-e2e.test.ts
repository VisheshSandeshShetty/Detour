// Surprise Me end to end: the real services run against two tiny fake servers (OSRM and
// Overpass). That proves OUR code is wired correctly. It does not prove the real public
// servers are reachable. Lives in its own file because config.ts reads the environment only
// once, so each file (one process) needs its own fake server addresses.

import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';

// A random number generator we can repeat: the same seed always gives the same numbers.
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function haversineMeters(a: number[], b: number[]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

// 24 places in a strip right next to a road running north along longitude 74.0,
// from latitude 13.1 to 13.9, 1 to 4 km to the east of it. Six different kinds.
const KINDS: Record<string, string>[] = [
  { tourism: 'attraction' },
  { tourism: 'viewpoint' },
  { historic: 'fort' },
  { leisure: 'park' },
  { waterway: 'waterfall' },
  { tourism: 'theme_park' },
];
const ELEMENTS = Array.from({ length: 24 }, (_, i) => ({
  type: 'node',
  id: 1000 + i,
  lat: 13.1 + i * 0.033,
  lon: 74.0 + ((i % 4) + 1) * 0.01,
  tags: { name: `Place ${i}`, ...KINDS[i % KINDS.length] },
}));

let extraPerWaypointM = 0; // makes real routes through stops longer than the estimate (see test)

function startServer(handler: http.RequestListener): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}
const urlOf = (server: http.Server) => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

describe('Surprise Me end to end (fake OSRM and Overpass)', () => {
  let osrm: http.Server;
  let overpass: http.Server;
  let surpriseAround: typeof import('../services/surprise').surpriseAround;
  let surpriseRoute: typeof import('../services/surprise').surpriseRoute;
  let cacheClear: typeof import('../lib/cache').cacheClear;

  before(async () => {
    osrm = await startServer((req, res) => {
      const url = new URL(req.url ?? '', 'http://x');
      const points = decodeURIComponent(url.pathname.split('/')[4]).split(';').map((p) => p.split(',').map(Number));
      res.setHeader('Content-Type', 'application/json');

      if (url.pathname.startsWith('/route/')) {
        // A route through all the points. Fake roads are 20% longer than straight lines.
        const coordinates: number[][] = [];
        let meters = 0;
        for (let i = 0; i < points.length - 1; i++) {
          meters += haversineMeters(points[i], points[i + 1]) * 1.2;
          for (let s = 0; s < 50; s++) {
            coordinates.push([
              points[i][0] + ((points[i + 1][0] - points[i][0]) * s) / 50,
              points[i][1] + ((points[i + 1][1] - points[i][1]) * s) / 50,
            ]);
          }
        }
        coordinates.push(points[points.length - 1]);
        meters += Math.max(0, points.length - 2) * extraPerWaypointM;
        res.end(JSON.stringify({ code: 'Ok', routes: [{ distance: meters, duration: meters / 16, geometry: { coordinates } }] }));
        return;
      }

      if (url.pathname.startsWith('/table/')) {
        const sources = (url.searchParams.get('sources') ?? '').split(';').map(Number);
        const destinations = (url.searchParams.get('destinations') ?? '').split(';').map(Number);
        // Fake roads are 30% longer than straight lines here. 16 m/s is about 58 km/h.
        const distances = sources.map((s) => destinations.map((d) => haversineMeters(points[s], points[d]) * 1.3));
        const durations = distances.map((row) => row.map((meters) => meters / 16));
        res.end(JSON.stringify({ code: 'Ok', distances, durations }));
        return;
      }
      res.statusCode = 404;
      res.end('{}');
    });

    overpass = await startServer((req, res) => {
      req.on('data', () => undefined);
      req.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ elements: ELEMENTS }));
      });
    });

    process.env.JWT_SECRET = 'test-secret-test-secret';
    process.env.OSRM_URL = urlOf(osrm);
    process.env.OVERPASS_URLS = urlOf(overpass);
    process.env.OSRM_DELAY_MS = '0';
    ({ surpriseAround, surpriseRoute } = await import('../services/surprise'));
    ({ cacheClear } = await import('../lib/cache'));
  });

  after(() => {
    osrm?.close();
    overpass?.close();
  });

  const here = { name: 'Here', latitude: 13.5, longitude: 74.0 };
  const origin = { name: 'South', latitude: 13.0, longitude: 74.0 };
  const destination = { name: 'North', latitude: 14.0, longitude: 74.0 };

  test('around me, round trip: stays inside the time and distance, with a drawable trip', async () => {
    cacheClear();
    const result = await surpriseAround({ start: here, tripType: 'roundtrip', timeMin: 180, maxKm: 60 }, seeded(1));

    assert.ok(result.stops.length >= 1 && result.stops.length <= 5, `stops: ${result.stops.length}`);
    assert.ok(result.summary.drivingKm <= 60.05, `driving km: ${result.summary.drivingKm}`);
    assert.ok(result.summary.totalMin <= 181, `total min: ${result.summary.totalMin}`);
    assert.equal(result.summary.breakMin, 0); // Around me reserves no break by default
    assert.ok(Math.abs(result.summary.drivingMin + result.summary.visitMin + result.summary.breakMin - result.summary.totalMin) <= 1);
    assert.deepEqual(result.stops.map((stop) => stop.stopNumber), result.stops.map((_, i) => i + 1));
    assert.ok(result.stops.every((stop) => stop.visitMin > 0 && stop.legDistanceKm !== undefined));
    assert.ok(result.geometry && result.geometry.length > 2, 'the trip line is returned');
    assert.equal(result.mode, 'around');

    const kinds = result.stops.map((stop) => stop.category);
    for (const kind of new Set(kinds)) assert.ok(kinds.filter((k) => k === kind).length <= 2, 'at most 2 of one kind');
  });

  test('around me: different seeds give different surprises', async () => {
    cacheClear();
    const sets = new Set<string>();
    for (let seed = 1; seed <= 10; seed++) {
      const result = await surpriseAround({ start: here, tripType: 'roundtrip', timeMin: 180, maxKm: 60 }, seeded(seed));
      sets.add(result.stops.map((stop) => stop.id).sort().join(','));
    }
    assert.ok(sets.size >= 3, `only ${sets.size} different results out of 10`);
  });

  test('around me, one way, distance only', async () => {
    cacheClear();
    const result = await surpriseAround({ start: here, tripType: 'oneway', timeMin: null, maxKm: 30 }, seeded(3));
    assert.ok(result.stops.length >= 1);
    assert.ok(result.summary.drivingKm <= 30.05, `driving km: ${result.summary.drivingKm}`);
    assert.equal(result.summary.maxMin, null);
  });

  test('around me, time only', async () => {
    cacheClear();
    const result = await surpriseAround({ start: here, tripType: 'roundtrip', timeMin: 90, maxKm: null }, seeded(4));
    assert.ok(result.stops.length >= 1);
    assert.ok(result.summary.totalMin <= 91, `total min: ${result.summary.totalMin}`);
  });

  test('around me: a limit too small for anything gives a clear message', async () => {
    cacheClear();
    await assert.rejects(
      surpriseAround({ start: here, tripType: 'roundtrip', timeMin: null, maxKm: 2 }, seeded(1)),
      (error: { status?: number; message: string }) => error.status === 422 && /No places found within reach/.test(error.message)
    );
  });

  test('along a route: stays inside the total distance and reserves the 90 minute break', async () => {
    cacheClear();
    extraPerWaypointM = 0;
    // the direct trip is about 133 km on the fake roads
    const result = await surpriseRoute(
      { origin, destination, radiusKm: 10, maxTotalKm: 160, totalMin: null, breakMin: 90 },
      seeded(1)
    );
    assert.equal(result.mode, 'route');
    assert.ok(result.stops.length >= 1 && result.stops.length <= 5);
    assert.ok(result.summary.drivingKm <= 160, `driving km: ${result.summary.drivingKm}`);
    assert.ok(result.summary.directKm! > 125 && result.summary.directKm! < 140, `direct km: ${result.summary.directKm}`);
    assert.equal(result.summary.breakMin, 90);
    assert.ok(Math.abs(result.summary.drivingMin + result.summary.visitMin + 90 - result.summary.totalMin) <= 1);
    assert.ok(result.geometry && result.geometry.length > 10);

    // in driving order, spread out, and with the detour numbers from the planner
    const positions = result.stops.map((stop) => stop.routeKm!);
    assert.deepEqual([...positions].sort((a, b) => a - b), positions);
    for (let i = 1; i < positions.length; i++) assert.ok(positions[i] - positions[i - 1] >= 8);
    assert.ok(result.stops.every((stop) => typeof stop.detourDistanceKm === 'number' && typeof stop.detourDurationMin === 'number'));
  });

  test('along a route: the time budget includes the reserved break', async () => {
    cacheClear();
    extraPerWaypointM = 0;
    // Direct drive is about 139 min. 139 + 90 (break) + 60 spare = 290 minutes.
    const result = await surpriseRoute(
      { origin, destination, radiusKm: 10, maxTotalKm: null, totalMin: 290, breakMin: 90 },
      seeded(2)
    );
    assert.ok(result.summary.totalMin <= 291, `total min: ${result.summary.totalMin}`);
    assert.ok(result.summary.visitMin <= 60, `visiting: ${result.summary.visitMin}`);
    assert.equal(result.summary.breakMin, 90);
  });

  test('along a route: the break length can be changed', async () => {
    cacheClear();
    extraPerWaypointM = 0;
    const result = await surpriseRoute(
      { origin, destination, radiusKm: 10, maxTotalKm: null, totalMin: 290, breakMin: 30 },
      seeded(2)
    );
    assert.equal(result.summary.breakMin, 30);
    // with a shorter break there is more room for sightseeing
    assert.ok(result.summary.visitMin <= 120);
  });

  test('along a route: if the real trip is longer than the estimate, stops are dropped until it fits', async () => {
    cacheClear();
    extraPerWaypointM = 15000; // pretend every stop adds 15 km of winding road
    const result = await surpriseRoute(
      { origin, destination, radiusKm: 10, maxTotalKm: 160, totalMin: null, breakMin: 90 },
      seeded(1)
    );
    extraPerWaypointM = 0;
    assert.ok(result.summary.drivingKm <= 160, `driving km: ${result.summary.drivingKm}`);
    assert.ok(result.stops.length <= 1, `stops: ${result.stops.length}`); // 133 + 15 = 148 fits, 133 + 30 does not
    assert.equal(result.warnings.length, 0);
  });

  test('along a route: limits shorter than the direct trip give a clear message', async () => {
    cacheClear();
    await assert.rejects(
      surpriseRoute({ origin, destination, radiusKm: 10, maxTotalKm: 100, totalMin: null, breakMin: 90 }, seeded(1)),
      (error: { status?: number; message: string }) => error.status === 422 && /direct route is already 13\d km/.test(error.message)
    );
    await assert.rejects(
      surpriseRoute({ origin, destination, radiusKm: 10, maxTotalKm: null, totalMin: 200, breakMin: 90 }, seeded(1)),
      (error: { status?: number; message: string }) => error.status === 422 && /reserved for breaks/.test(error.message)
    );
  });
});
