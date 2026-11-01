// End-to-end test of the journey planner.
//
// Detour's real code runs (OSRM client, Overpass client, corridor filter, detour calculation),
// but instead of the public internet services it talks to two tiny fake servers started here.
// That means this test is fast, free and repeatable, and needs no database.
//
// NOTE: the fake servers answer with simple straight-line maths. This proves OUR code is wired
// correctly; it does not prove the real OSRM/Overpass servers are reachable. Try a real journey
// in the browser for that.

import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';

// ---- Fake world: a straight road from Start (74.0, 13.0) to End (74.0, 14.0) heading north ----
const START = { name: 'Start', latitude: 13.0, longitude: 74.0 };
const END = { name: 'End', latitude: 14.0, longitude: 74.0 };

function haversineMeters(a: number[], b: number[]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

// 0.045 degrees of longitude at latitude 13.5 is about 4.9 km
const nearOnRoute = { type: 'node', id: 1, lat: 13.5, lon: 74.045, tags: { name: 'Near Fort', historic: 'fort', wikidata: 'Q1' } };
const nearAgain = { type: 'node', id: 1, lat: 13.5, lon: 74.045, tags: { name: 'Near Fort', historic: 'fort', wikidata: 'Q1' } }; // duplicate id
const nearEnd = { type: 'node', id: 2, lat: 13.95, lon: 74.02, tags: { name: 'End Viewpoint', tourism: 'viewpoint' } };
const tooFar = { type: 'node', id: 3, lat: 13.5, lon: 74.25, tags: { name: 'Far Away Falls', waterway: 'waterfall' } }; // ~27 km from the road: outside 10 and 20 km, inside 30 km
const unnamed = { type: 'node', id: 4, lat: 13.5, lon: 74.01, tags: { tourism: 'museum' } };

let routeCalls = 0;
let overpassCalls = 0;
let lastOverpassAccept = '';
let lastOverpassUserAgent = '';
let osrmTableMode: 'ok' | 'fail' = 'ok';
// 'fail' = every call fails, 'failFirst' = only the first call of each journey fails, 'refuse' = HTTP 406
let overpassMode: 'ok' | 'fail' | 'failFirst' | 'refuse' = 'ok';
let overpassBody = '';

function startServer(handler: http.RequestListener): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const urlOf = (server: http.Server) => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

let osrmServer: http.Server;
let overpassServer: http.Server;
let planJourney: typeof import('../services/journeyPlanner').planJourney;
let cacheClear: typeof import('../lib/cache').cacheClear;

before(async () => {
  osrmServer = await startServer((req, res) => {
    const url = new URL(req.url ?? '', 'http://x');
    const [, , , , coordPart] = url.pathname.split('/');
    const points = decodeURIComponent(coordPart).split(';').map((p) => p.split(',').map(Number));
    res.setHeader('Content-Type', 'application/json');

    if (url.pathname.startsWith('/route/')) {
      routeCalls++;
      const [from, to] = points;
      const geometry = Array.from({ length: 101 }, (_, i) => [
        from[0] + ((to[0] - from[0]) * i) / 100,
        from[1] + ((to[1] - from[1]) * i) / 100,
      ]);
      const distance = haversineMeters(from, to) * 1.2;
      res.end(JSON.stringify({ code: 'Ok', routes: [{ distance, duration: distance / 16, geometry: { coordinates: geometry } }] }));
      return;
    }

    if (url.pathname.startsWith('/table/')) {
      if (osrmTableMode === 'fail') {
        res.statusCode = 500;
        res.end('{}');
        return;
      }
      const sources = (url.searchParams.get('sources') ?? '').split(';').map(Number);
      const destinations = (url.searchParams.get('destinations') ?? '').split(';').map(Number);
      // Pretend roads are 30% longer than a straight line, driven at 16 m/s (~58 km/h)
      const distances = sources.map((s) => destinations.map((d) => haversineMeters(points[s], points[d]) * 1.3));
      const durations = distances.map((row) => row.map((meters) => meters / 16));
      res.end(JSON.stringify({ code: 'Ok', distances, durations }));
      return;
    }
    res.statusCode = 404;
    res.end('{}');
  });

  overpassServer = await startServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      overpassBody = decodeURIComponent(body);
      overpassCalls++;
      lastOverpassAccept = String(req.headers.accept ?? '');
      lastOverpassUserAgent = String(req.headers['user-agent'] ?? '');
      res.setHeader('Content-Type', 'application/json');
      if (overpassMode === 'refuse') {
        res.statusCode = 406;
        res.end('{}');
        return;
      }
      if (overpassMode === 'fail' || (overpassMode === 'failFirst' && overpassCalls === 1)) {
        res.statusCode = 504;
        res.end('{}');
        return;
      }
      res.end(JSON.stringify({ elements: [nearOnRoute, nearAgain, nearEnd, tooFar, unnamed] }));
    });
  });

  process.env.JWT_SECRET = 'test-secret-test-secret';
  process.env.OSRM_URL = urlOf(osrmServer);
  process.env.OVERPASS_URLS = urlOf(overpassServer);
  process.env.OSRM_DELAY_MS = '0';

  // Import AFTER the environment is set, because config.ts reads it when first loaded
  ({ planJourney } = await import('../services/journeyPlanner'));
  ({ cacheClear } = await import('../lib/cache'));
});

after(() => {
  osrmServer?.close();
  overpassServer?.close();
});

test('finds places along the route, drops far-away ones and duplicates, and computes detours', async () => {
  cacheClear();
  osrmTableMode = 'ok';
  overpassMode = 'ok';
  const plan = await planJourney({ origin: START, destination: END, radiusKm: 10 });

  assert.deepEqual(plan.warnings, []);
  assert.ok(plan.route.distanceKm > 100 && plan.route.distanceKm < 160, `route km: ${plan.route.distanceKm}`);
  assert.ok(plan.route.geometry.length > 50);

  const names = plan.attractions.map((place) => place.name).sort();
  assert.deepEqual(names, ['End Viewpoint', 'Near Fort']); // far falls, unnamed museum and duplicate are gone

  const fort = plan.attractions.find((place) => place.name === 'Near Fort')!;
  assert.ok(Math.abs(fort.distanceFromRouteKm! - 4.9) < 0.6, `distance from route: ${fort.distanceFromRouteKm}`);
  assert.ok(Math.abs(fort.routeKm! - 55.6) < 3, `km along route: ${fort.routeKm}`);
  assert.equal(fort.rating, null);
  assert.equal(fort.category, 'historic');

  // The two numbers are different things: straight-line distance vs extra driving
  assert.ok(fort.detourDistanceKm !== null && fort.detourDistanceKm! > 0);
  assert.ok(fort.detourDurationMin !== null && fort.detourDurationMin! > 0);
  assert.notEqual(fort.detourDistanceKm, fort.distanceFromRouteKm);

  // Worked out by hand: the fort is 4.9 km off the road, so we leave and rejoin 9.8 km before/after it.
  // Fake roads are 1.3x straight lines:
  //   A -> fort = sqrt(9.8^2 + 4.9^2) * 1.3 = 14.25 km (same for fort -> B)
  //   A -> B    = 19.6 * 1.3               = 25.48 km
  //   detour    = 14.25 + 14.25 - 25.48    = about 3.0 km
  assert.ok(Math.abs(fort.detourDistanceKm! - 3.0) < 0.3, `detour km: ${fort.detourDistanceKm}`);
  // Time: the same 3.0 km extra at the fake 16 m/s is about 3.1 minutes
  assert.ok(Math.abs(fort.detourDurationMin! - 3.1) < 0.4, `detour min: ${fort.detourDurationMin}`);
});

test('a wider corridor finds the far place too', async () => {
  cacheClear();
  const plan = await planJourney({ origin: START, destination: END, radiusKm: 30 });
  assert.ok(plan.attractions.some((place) => place.name === 'Far Away Falls'));
});

test('the Overpass queries are small bounding boxes (map tiles) along the route', async () => {
  cacheClear();
  await planJourney({ origin: START, destination: END, radiusKm: 20 });
  assert.match(overpassBody, /\["tourism"="viewpoint"\]\["name"\]\(\d+\.\d+,\d+\.\d+,\d+\.\d+,\d+\.\d+\)/);
  assert.doesNotMatch(overpassBody, /around:/);
});

test('if the places service is down, the route still comes back with a warning', async () => {
  cacheClear();
  overpassMode = 'fail';
  const plan = await planJourney({ origin: START, destination: END, radiusKm: 10 });
  overpassMode = 'ok';

  assert.ok(plan.route.distanceKm > 100);
  assert.equal(plan.attractions.length, 0);
  assert.equal(plan.warnings.length, 1);
  assert.match(plan.warnings[0], /Overpass/);
});

test('if routing for detours fails, places are kept and marked "detour unavailable" (null)', async () => {
  cacheClear();
  osrmTableMode = 'fail';
  const plan = await planJourney({ origin: START, destination: END, radiusKm: 10 });
  osrmTableMode = 'ok';

  assert.equal(plan.attractions.length, 2);
  for (const place of plan.attractions) {
    assert.equal(place.detourDistanceKm, null);
    assert.equal(place.detourDurationMin, null);
    assert.ok(place.distanceFromRouteKm! > 0); // the straight-line distance is still real
  }
  assert.equal(plan.warnings.length, 1);
});

test('a failed result is not cached, so retrying really tries again', async () => {
  cacheClear();
  osrmTableMode = 'fail';
  const first = await planJourney({ origin: START, destination: END, radiusKm: 10 });
  osrmTableMode = 'ok';
  const second = await planJourney({ origin: START, destination: END, radiusKm: 10 });
  assert.equal(first.warnings.length, 1);
  assert.equal(second.warnings.length, 0);
  assert.ok(second.attractions.every((place) => place.detourDistanceKm !== null));
});

test('Overpass gets an identifying User-Agent and Accept: */* (not application/json)', async () => {
  cacheClear();
  await planJourney({ origin: START, destination: END, radiusKm: 10 });
  assert.equal(lastOverpassAccept, '*/*');
  assert.match(lastOverpassUserAgent, /^Detour\//);
});

test('an HTTP 406 from Overpass gives a clear "refusing requests" message', async () => {
  cacheClear();
  overpassMode = 'refuse';
  const plan = await planJourney({ origin: START, destination: END, radiusKm: 10 });
  overpassMode = 'ok';
  assert.equal(plan.attractions.length, 0);
  assert.match(plan.warnings[0], /refusing requests/);
});

test('a ~1000 km journey is searched in several stretches, and one failed stretch only gives a warning', async () => {
  // (13, 74) to (22, 74) is about 1000 km in a straight line, 1200 km on the fake "roads"
  const far = { name: 'Far North', latitude: 21.5, longitude: 74.0 };
  cacheClear();
  overpassCalls = 0;
  overpassMode = 'ok';
  const full = await planJourney({ origin: START, destination: far, radiusKm: 10 });
  assert.ok(full.route.distanceKm > 900, `route km: ${full.route.distanceKm}`);
  assert.ok(overpassCalls >= 4, `expected several Overpass calls, got ${overpassCalls}`);
  assert.deepEqual(full.warnings, []);

  cacheClear();
  overpassCalls = 0;
  overpassMode = 'failFirst';
  const partial = await planJourney({ origin: START, destination: far, radiusKm: 10 });
  overpassMode = 'ok';
  assert.equal(partial.warnings.length, 1);
  assert.match(partial.warnings[0], /map sections along the route could not be searched/);
  assert.ok(partial.route.distanceKm > 900); // the route itself is still there
});

test('two identical requests at the same moment share one plan (one OSRM route call)', async () => {
  cacheClear();
  const before = routeCalls;
  const [a, b] = await Promise.all([
    planJourney({ origin: START, destination: END, radiusKm: 10 }),
    planJourney({ origin: START, destination: END, radiusKm: 10 }),
  ]);
  assert.equal(routeCalls - before, 1);
  assert.equal(a.attractions.length, b.attractions.length);
});

test('the same start and end is rejected', async () => {
  await assert.rejects(planJourney({ origin: START, destination: { ...START, name: 'Same' }, radiusKm: 10 }), /same place/);
});
