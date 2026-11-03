// Tests for the tile cache that is saved on disk (so it survives a server restart).
// The cache file is a temporary one made for this test. Mocked Overpass, no internet.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';

const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'detour-test-')), 'tiles.json');
let server: http.Server;
let calls = 0;
let findNearbyPlaces: typeof import('../services/nearby').findNearbyPlaces;
let flushTileCache: typeof import('../services/overpass').flushTileCache;

before(async () => {
  // A cache file written by an "earlier run of the server": tile row 133, column 747 (around Manipal)
  const seeded = {
    'tile:v2:full:133:747': {
      at: Date.now(),
      candidates: [
        { id: 'node-1', name: 'Seeded Place', category: 'attraction', latitude: 13.351, longitude: 74.781, description: null, rating: null, imageUrl: null, openingHours: null, website: null, score: 20 },
      ],
    },
  };
  fs.writeFileSync(file, JSON.stringify(seeded));

  server = http.createServer((req, res) => {
    req.on('data', () => undefined);
    req.on('end', () => {
      calls++;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ elements: [{ type: 'node', id: 7, lat: 13.151, lon: 74.881, tags: { name: 'Live Place', tourism: 'museum' } }] }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  process.env.JWT_SECRET = 'test-secret-test-secret';
  process.env.TILE_CACHE_FILE = file;
  process.env.OVERPASS_URLS = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  ({ findNearbyPlaces } = await import('../services/nearby'));
  ({ flushTileCache } = await import('../services/overpass'));
});
after(() => server?.close());

test('a tile saved by an earlier run is used without calling Overpass', async () => {
  const result = await findNearbyPlaces(13.35, 74.78, 0.5, 100);
  assert.equal(calls, 0);
  assert.ok(result.places.some((p) => p.name === 'Seeded Place'));
});

test('new tiles are written to the file, and the old ones are kept', async () => {
  const result = await findNearbyPlaces(13.15, 74.88, 0.5, 100);
  assert.ok(calls >= 1);
  assert.ok(result.places.some((p) => p.name === 'Live Place'));
  flushTileCache();
  const saved = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  assert.ok('tile:v2:full:133:747' in saved);
  assert.ok(Object.keys(saved).length >= 2);
});
