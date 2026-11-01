// Tests for Surprise Me. No database and no internet needed.
//
// Part 1 tests the selection logic on small hand-made numbers.
// Part 2 runs the real services against two tiny fake servers (OSRM and Overpass). That proves
// OUR code is wired correctly. It does not prove the real public servers are reachable.

import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import {
  buildTour,
  chooseRouteStops,
  interestWeight,
  legsCost,
  searchRadiusKm,
  weightedShuffle,
  type RoadMatrix,
} from '../services/surprise';

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

// ======================= Part 1: the selection logic =======================

// Points on a straight road. Index 0 = start, then places at 10, 20 and 30 km.
// Driving speed is 10 m/s, so 10 km takes 1000 seconds.
const kmAt = [0, 10, 20, 30];
const matrix: RoadMatrix = {
  meters: kmAt.map((a) => kmAt.map((b) => Math.abs(a - b) * 1000)),
  seconds: kmAt.map((a) => kmAt.map((b) => Math.abs(a - b) * 100)),
};
const noVisit = [0, 0, 0, 0];
const categories = ['', 'a', 'b', 'c'];
const baseOptions = { roundTrip: true, maxMeters: null, maxSeconds: null, maxStops: 5, maxPerCategory: 2 };

describe('weighted random', () => {
  test('heavier items come first much more often, but not always', () => {
    const items = [{ name: 'heavy', w: 20 }, { name: 'light', w: 1 }];
    let heavyFirst = 0;
    for (let seed = 1; seed <= 300; seed++) {
      if (weightedShuffle(items, (item) => item.w, seeded(seed))[0].name === 'heavy') heavyFirst++;
    }
    assert.ok(heavyFirst > 250, `heavy first ${heavyFirst} of 300`);
    assert.ok(heavyFirst < 300, 'the light item should win sometimes too');
  });

  test('sights are far more likely than shops', () => {
    const sight = interestWeight({ category: 'historic', imageUrl: null, website: null });
    const shop = interestWeight({ category: 'shopping', imageUrl: null, website: null });
    assert.ok(sight > shop * 5);
  });

  test('every item is kept', () => {
    const shuffled = weightedShuffle([1, 2, 3, 4, 5], () => 1, seeded(7));
    assert.deepEqual([...shuffled].sort(), [1, 2, 3, 4, 5]);
  });
});

describe('around me: building a trip', () => {
  test('a round trip includes the drive back', () => {
    // 0 -> 10 km -> 0 = 20 km
    assert.equal(legsCost([1], matrix, true)?.meters, 20000);
    // one-way stops at the place: 10 km
    assert.equal(legsCost([1], matrix, false)?.meters, 10000);
  });

  test('stays inside the distance limit', () => {
    // 50 km round trip. The 30 km place alone needs 60 km, so it is skipped.
    const tour = buildTour(matrix, noVisit, categories, [3, 2, 1], { ...baseOptions, maxMeters: 50000 });
    assert.deepEqual([...tour].sort(), [1, 2]);
    assert.ok(legsCost(tour, matrix, true)!.meters <= 50000);
  });

  test('one-way trips do not pay for the way back', () => {
    const tour = buildTour(matrix, noVisit, categories, [1, 2, 3], { ...baseOptions, roundTrip: false, maxMeters: 30000 });
    assert.deepEqual(tour, [1, 2, 3]); // 0 -> 10 -> 20 -> 30 is exactly 30 km
  });

  test('places are put in a sensible driving order, not the order they were picked', () => {
    const tour = buildTour(matrix, noVisit, categories, [3, 1, 2], { ...baseOptions, roundTrip: false });
    assert.deepEqual(tour, [1, 2, 3]);
  });

  test('stays inside the time limit, counting time spent at the places', () => {
    const visit = [0, 1800, 1800, 1800]; // 30 minutes at each place
    // 2 hours. One place: 2000 s driving + 1800 s visiting = 3800 s. Two places: 4000 + 3600 = 7600 s (too long).
    const tour = buildTour(matrix, visit, categories, [1, 2, 3], { ...baseOptions, maxSeconds: 7200 });
    assert.equal(tour.length, 1);
  });

  test('never more than the allowed number per category, and never too many stops', () => {
    const sameKind = ['', 'x', 'x', 'x'];
    const capped = buildTour(matrix, noVisit, sameKind, [1, 2, 3], baseOptions);
    assert.equal(capped.length, 2);
    const limited = buildTour(matrix, noVisit, categories, [1, 2, 3], { ...baseOptions, maxStops: 1 });
    assert.equal(limited.length, 1);
  });

  test('a place the roads cannot reach is skipped', () => {
    const broken: RoadMatrix = {
      meters: matrix.meters.map((row, i) => row.map((value, j) => (i === 2 || j === 2 ? null : value))),
      seconds: matrix.seconds.map((row, i) => row.map((value, j) => (i === 2 || j === 2 ? null : value))),
    };
    const tour = buildTour(broken, noVisit, categories, [1, 2, 3], baseOptions);
    assert.ok(!tour.includes(2));
  });

  test('the search area is sized from the limits, and kept sensible', () => {
    // 100 km round trip: 50 km each way, roads about 1.3x straight lines
    assert.ok(Math.abs(searchRadiusKm(true, 100, null) - 38.5) < 1 === false); // capped at 25 km
    assert.equal(searchRadiusKm(true, 100, null), 25);
    assert.ok(searchRadiusKm(true, 10, null) < 4);
    assert.equal(searchRadiusKm(true, 2, null), 2); // never smaller than 2 km
  });
});

describe('along a route: choosing stops', () => {
  const make = (routeKm: number, detourKm: number, detourMin: number, visitMin = 30, category = 'x') => ({
    routeKm, detourKm, detourMin, visitMin, category,
  });

  test('the detours add up to no more than the spare distance', () => {
    // 360 km trip, 400 km allowed: 40 km spare
    const candidates = [make(10, 15, 10), make(40, 15, 10, 30, 'y'), make(80, 15, 10, 30, 'z'), make(120, 15, 10, 30, 'w')];
    const chosen = chooseRouteStops(candidates, 40, null, { maxStops: 5, minGapKm: 8, maxPerCategory: 2 });
    assert.equal(chosen.length, 2); // 15 + 15 = 30; a third would make 45 > 40
    assert.ok(chosen.reduce((sum, stop) => sum + stop.detourKm, 0) <= 40);
  });

  test('the time budget counts detour driving AND time at the place', () => {
    const candidates = [make(10, 1, 5, 40), make(50, 1, 5, 40, 'y')];
    // 60 minutes spare: one stop costs 45 min, two would cost 90
    const chosen = chooseRouteStops(candidates, null, 60, { maxStops: 5, minGapKm: 8, maxPerCategory: 2 });
    assert.equal(chosen.length, 1);
  });

  test('stops are spread out along the route', () => {
    const candidates = [make(10, 1, 1), make(14, 1, 1, 30, 'y'), make(40, 1, 1, 30, 'z')];
    const chosen = chooseRouteStops(candidates, 100, 1000, { maxStops: 5, minGapKm: 8, maxPerCategory: 2 });
    assert.deepEqual(chosen.map((stop) => stop.routeKm), [10, 40]); // 14 is too close to 10
  });

  test('results come back in driving order', () => {
    const candidates = [make(90, 1, 1, 30, 'a'), make(20, 1, 1, 30, 'b'), make(55, 1, 1, 30, 'c')];
    const chosen = chooseRouteStops(candidates, 100, 1000, { maxStops: 5, minGapKm: 8, maxPerCategory: 2 });
    assert.deepEqual(chosen.map((stop) => stop.routeKm), [20, 55, 90]);
  });

  test('no limit (null) means that limit is ignored', () => {
    const chosen = chooseRouteStops([make(10, 500, 500)], null, null, { maxStops: 5, minGapKm: 8, maxPerCategory: 2 });
    assert.equal(chosen.length, 1);
  });
});

// ======================= Part 2: the whole thing against fake servers =======================
