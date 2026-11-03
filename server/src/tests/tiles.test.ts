// Tests for the tile-based Overpass search (Around me and along a route).
// Mocked: a fake Overpass server answers per bounding box. This proves OUR logic (tile choice,
// caching, partial results, no duplicates). It says nothing about real Overpass speed.

import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, test } from 'node:test';

let server: http.Server;
let calls: string[] = [];
let failBoxesContaining: string | null = null;
let failAll = false;
let findNearbyPlaces: typeof import('../services/nearby').findNearbyPlaces;
let tilesAround: typeof import('../services/overpass').tilesAround;
let tilesAlongRoute: typeof import('../services/overpass').tilesAlongRoute;
let tierForRadius: typeof import('../services/overpass').tierForRadius;
let fetchCorridorCandidates: typeof import('../services/overpass').fetchCorridorCandidates;
let cacheClear: typeof import('../lib/cache').cacheClear;

// One place every 0.05 degrees on a grid around Udupi, so every tile has something in it
const PLACES: { id: number; lat: number; lon: number }[] = [];
for (let i = -40; i <= 40; i++) {
  for (let j = -40; j <= 40; j++) PLACES.push({ id: 1000 + (i + 40) * 100 + (j + 40), lat: 13.35 + i * 0.05, lon: 74.78 + j * 0.05 });
}

before(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const query = decodeURIComponent(body.replace(/^data=/, ''));
      const box = query.match(/\((-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)\)/);
      calls.push(box ? box[0] : 'no-box');
      if (failAll || !box || (failBoxesContaining && box[0].includes(failBoxesContaining))) {
        res.statusCode = 504;
        res.end('{}');
        return;
      }
      const [s, w, n, e] = box.slice(1).map(Number);
      const elements = PLACES.filter((p) => p.lat >= s && p.lat < n && p.lon >= w && p.lon < e).map((p) => ({
        type: 'node', id: p.id, lat: p.lat, lon: p.lon, tags: { name: `Place ${p.id}`, tourism: 'attraction' },
      }));
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ elements }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  process.env.JWT_SECRET = 'test-secret-test-secret';
  process.env.OVERPASS_URLS = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  ({ findNearbyPlaces } = await import('../services/nearby'));
  ({ tilesAround, tilesAlongRoute, tierForRadius, fetchCorridorCandidates } = await import('../services/overpass'));
  ({ cacheClear } = await import('../lib/cache'));
});
after(() => server?.close());
beforeEach(() => {
  calls = [];
  failBoxesContaining = null;
  failAll = false;
  cacheClear();
});

describe('choosing tiles', () => {
  test('bigger radius uses a lighter search', () => {
    assert.equal(tierForRadius(0.5), 'full');
    assert.equal(tierForRadius(10), 'full');
    assert.equal(tierForRadius(10.5), 'sights');
    assert.equal(tierForRadius(30), 'sights');
    assert.equal(tierForRadius(31), 'notable');
    assert.equal(tierForRadius(100), 'notable');
  });

  test('a 5 km search needs only a handful of small tiles, closest first', () => {
    const tiles = tilesAround(13.35, 74.78, 5, 'full');
    assert.ok(tiles.length >= 1 && tiles.length <= 4, `tiles: ${tiles.length}`);
  });

  test('a 100 km search stays under about 25 tiles', () => {
    const tiles = tilesAround(13.35, 74.78, 100, 'notable');
    assert.ok(tiles.length > 4 && tiles.length <= 25, `tiles: ${tiles.length}`);
  });

  test('tiles along a route cover the whole route, in order, without absurd counts', () => {
    const route = Array.from({ length: 71 }, (_, i) => [74.8, 12.9 + i * 0.1]); // about 780 km north
    const tiles = tilesAlongRoute(route, 10);
    assert.ok(tiles.length >= 15 && tiles.length <= 40, `tiles: ${tiles.length}`);
    assert.ok(tiles[0].row <= tiles[tiles.length - 1].row, 'tiles follow the route');
  });
});

describe('nearby search', () => {
  test('returns only places inside the radius, with no duplicates, nearest first', async () => {
    for (const radius of [0.5, 5, 20, 60]) {
      const { places } = await findNearbyPlaces(13.35, 74.78, radius, 500);
      assert.ok(places.length > 0, `radius ${radius} found nothing`);
      assert.ok(places.every((p) => (p.distanceKm ?? 0) <= radius), `radius ${radius}: a place was outside`);
      assert.equal(new Set(places.map((p) => p.id)).size, places.length);
      for (let i = 1; i < places.length; i++) assert.ok((places[i].distanceKm ?? 0) >= (places[i - 1].distanceKm ?? 0));
    }
  });

  test('a 5 km search makes only a few small requests', async () => {
    await findNearbyPlaces(13.35, 74.78, 5, 500);
    assert.ok(calls.length >= 1 && calls.length <= 4, `calls: ${calls.length}`);
  });

  test('a second search nearby reuses the cached tiles', async () => {
    await findNearbyPlaces(13.35, 74.78, 5, 500);
    const first = calls.length;
    await findNearbyPlaces(13.352, 74.782, 5, 500); // different centre, same tiles
    assert.equal(calls.length, first, 'no new Overpass calls expected');
  });

  test('a different centre never returns a place that is outside ITS radius', async () => {
    const a = await findNearbyPlaces(13.35, 74.78, 5, 500);
    const b = await findNearbyPlaces(13.55, 74.98, 5, 500);
    assert.ok(b.places.every((p) => (p.distanceKm ?? 0) <= 5));
    assert.ok(a.places.every((p) => (p.distanceKm ?? 0) <= 5));
  });

  test('if some tiles fail, the working ones are kept and a warning is shown', async () => {
    const tiles = tilesAround(13.35, 74.78, 20, 'sights');
    assert.ok(tiles.length >= 2);
    // fail every tile whose south edge is the first tile's south edge
    const south = (tiles[0].row * 0.2).toFixed(4);
    failBoxesContaining = `(${south},`;
    const result = await findNearbyPlaces(13.35, 74.78, 20, 500);
    assert.ok(result.places.length > 0);
    assert.match(result.warning ?? '', /map sections could be searched/);
  });

  test('if every tile fails far from the demo area, the error comes through', async () => {
    failAll = true;
    await assert.rejects(() => findNearbyPlaces(40.7, -74.0, 5, 500), /Overpass/);
  });

  test('if every tile fails near Udupi, the built-in demo places are shown with a clear warning', async () => {
    failAll = true;
    const result = await findNearbyPlaces(13.34, 74.75, 5, 500);
    assert.ok(result.places.some((p) => p.name.includes('Krishna Matha')));
    assert.ok(result.places.every((p) => (p.distanceKm ?? 0) <= 5));
    assert.match(result.warning ?? '', /DEMO/);
  });

  test('progress is reported tile by tile', async () => {
    const seen: string[] = [];
    await findNearbyPlaces(13.35, 74.78, 20, 500, (done, total) => seen.push(`${done}/${total}`));
    assert.equal(seen[0].startsWith('0/'), true);
    const last = seen[seen.length - 1].split('/');
    assert.equal(last[0], last[1]);
  });
});

describe('route search', () => {
  test('a route is searched tile by tile and partial failure is reported, not thrown', async () => {
    const route = Array.from({ length: 21 }, (_, i) => [74.78, 13.0 + i * 0.1]);
    const ok = await fetchCorridorCandidates([route], 10);
    assert.equal(ok.failedStretches, 0);
    assert.ok(ok.totalStretches >= 3);
    cacheClear();
    failBoxesContaining = '(13.0000,'; // fail one row of tiles
    const partial = await fetchCorridorCandidates([route], 10);
    assert.ok(partial.failedStretches >= 1 && partial.failedStretches < partial.totalStretches);
    assert.ok(partial.candidates.length > 0);
  });

  test('if the whole route search fails inside the demo area, demo places are used and flagged', async () => {
    const route = [[74.75, 13.2], [74.75, 13.5]];
    failAll = true;
    const result = await fetchCorridorCandidates([route], 10);
    assert.equal(result.demo, true);
    assert.ok(result.candidates.length > 0);
    await assert.rejects(() => fetchCorridorCandidates([[[-74, 40.6], [-74, 40.9]]], 10), /Overpass/);
  });
});
