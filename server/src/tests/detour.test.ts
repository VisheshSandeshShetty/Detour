// Tests for the detour formula and anchor spots.

process.env.JWT_SECRET ??= 'test-secret-test-secret';

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateDetour, chooseAnchorKm } from '../services/detour';

test('detour = (A to place) + (place to B) - (A to B)', () => {
  const result = calculateDetour({
    toPlace: { meters: 6000, seconds: 480 },
    fromPlace: { meters: 7000, seconds: 540 },
    direct: { meters: 9000, seconds: 420 },
  });
  assert.equal(result.detourDistanceKm, 4); // 6 + 7 - 9 km
  assert.equal(result.detourDurationMin, 10); // (480 + 540 - 420) s = 10 min
});

test('a detour is never negative', () => {
  const result = calculateDetour({
    toPlace: { meters: 4000, seconds: 300 },
    fromPlace: { meters: 4000, seconds: 300 },
    direct: { meters: 8010, seconds: 610 },
  });
  assert.equal(result.detourDistanceKm, 0);
  assert.equal(result.detourDurationMin, 0);
});

test('if the routing service could not connect a trip, the detour is unavailable (never guessed)', () => {
  const result = calculateDetour({
    toPlace: { meters: null, seconds: null },
    fromPlace: { meters: 7000, seconds: 540 },
    direct: { meters: 9000, seconds: 420 },
  });
  assert.equal(result.detourDistanceKm, null);
  assert.equal(result.detourDurationMin, null);
});

test('anchor spots surround the place and stay on the route', () => {
  // place at km 50 on a 100 km route, 3 km off the road -> margin = 6 km
  assert.deepEqual(chooseAnchorKm(50, 3, 100), { beforeKm: 44, afterKm: 56 });
  // near the start and end they are clamped to the route
  assert.deepEqual(chooseAnchorKm(1, 3, 100), { beforeKm: 0, afterKm: 7 });
  assert.deepEqual(chooseAnchorKm(99, 3, 100), { beforeKm: 93, afterKm: 100 });
  // very close places still use a sensible minimum stretch (2 km), far ones are capped (15 km)
  assert.deepEqual(chooseAnchorKm(50, 0.1, 100), { beforeKm: 48, afterKm: 52 });
  assert.deepEqual(chooseAnchorKm(50, 25, 100), { beforeKm: 35, afterKm: 65 });
});
