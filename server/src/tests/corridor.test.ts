// Tests for the corridor maths. Run with:  npm test   (inside the server folder)
// These need no database and no internet.

process.env.JWT_SECRET ??= 'test-secret-test-secret';

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildRouteIndex,
  filterByCorridor,
  measureDistanceToRoute,
  pickAlongWholeRoute,
  pointAtKm,
  splitRoute,
} from '../services/corridor';

// An L-shaped route: 1 degree north (~111 km), then 1 degree east (~108 km).
// Its bounding box is huge, but the road itself only covers the two edges of that box.
const lShape = [
  [74.0, 13.0],
  [74.0, 14.0],
  [75.0, 14.0],
];

test('a point close to the road is inside the corridor, with the right distance', () => {
  const index = buildRouteIndex(lShape);
  // 0.05 degrees of longitude at latitude 13.5 is about 5.4 km
  const measure = measureDistanceToRoute(index, [74.05, 13.5], 10);
  assert.ok(measure, 'should find the road');
  assert.ok(Math.abs(measure.distanceKm - 5.4) < 0.3, `expected about 5.4 km, got ${measure.distanceKm}`);
  // halfway up the first leg of the L
  assert.ok(Math.abs(measure.alongKm - 55.6) < 1, `expected about 55.6 km along, got ${measure.alongKm}`);
});

test('a point inside the bounding box but far from the road is rejected', () => {
  const index = buildRouteIndex(lShape);
  const insideBox: [number, number] = [74.8, 13.2]; // inside the L's bounding box, ~80 km from the road
  const places = [
    { latitude: 13.5, longitude: 74.05 }, // near the road
    { latitude: insideBox[1], longitude: insideBox[0] }, // inside the box, far from the road
    { latitude: 20, longitude: 80 }, // nowhere near
  ];
  const kept = filterByCorridor(index, places, 20);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].latitude, 13.5);
});

test('a bigger corridor radius keeps more places', () => {
  const index = buildRouteIndex(lShape);
  const places = [{ latitude: 13.5, longitude: 74.2 }]; // about 21.7 km from the road
  assert.equal(filterByCorridor(index, places, 20).length, 0);
  assert.equal(filterByCorridor(index, places, 30).length, 1);
});

test('pointAtKm returns a spot on the route', () => {
  const index = buildRouteIndex(lShape);
  const [lon, lat] = pointAtKm(index, 55.6);
  assert.ok(Math.abs(lon - 74.0) < 0.001);
  assert.ok(Math.abs(lat - 13.5) < 0.01);
  // beyond the end clamps to the destination
  const [endLon, endLat] = pointAtKm(index, 100000);
  assert.ok(Math.abs(endLon - 75.0) < 0.001 && Math.abs(endLat - 14.0) < 0.001);
});

test('a long route is split into pieces that cover its whole length', () => {
  const coordinates = Array.from({ length: 200 }, (_, i) => [74 + i * 0.01, 13]);
  const index = buildRouteIndex(coordinates);
  assert.ok(index.pieces.length > 1);
  const last = index.pieces[index.pieces.length - 1];
  assert.ok(last.startKm < index.lengthKm);
  // a point near the far end still finds the road
  const measure = measureDistanceToRoute(index, [75.9, 13.02], 10);
  assert.ok(measure && measure.distanceKm < 3);
});

test('pickAlongWholeRoute takes places from every stretch, not just one town', () => {
  // 100 great places bunched in the first 10 km of a 100 km route, plus 10 weaker ones spread along it
  const bunched = Array.from({ length: 100 }, (_, i) => ({ id: `a${i}`, score: 100, routeKm: i / 10 }));
  const spread = Array.from({ length: 10 }, (_, i) => ({ id: `b${i}`, score: 1, routeKm: 5 + i * 10 }));
  const chosen = pickAlongWholeRoute([...bunched, ...spread], 100, 30);

  assert.equal(chosen.length, 30);
  const stretchesCovered = new Set(chosen.map((place) => Math.floor(place.routeKm / 10)));
  assert.ok(stretchesCovered.size >= 8, `expected places from most stretches, got ${stretchesCovered.size}`);
});

test('a long route is split into stretches that join up with no gaps', () => {
  // 9 degrees of latitude is about 1000 km, with a point every 0.1 degree (about 11 km)
  const coordinates = Array.from({ length: 91 }, (_, i) => [74, 13 + i * 0.1]);
  const stretches = splitRoute(coordinates, 200);

  assert.ok(stretches.length >= 4 && stretches.length <= 6, `expected about 5 stretches, got ${stretches.length}`);
  assert.deepEqual(stretches[0][0], coordinates[0]);
  assert.deepEqual(stretches[stretches.length - 1].at(-1), coordinates[90]);
  for (let i = 1; i < stretches.length; i++) {
    // each stretch starts exactly where the previous one ended
    assert.deepEqual(stretches[i][0], stretches[i - 1].at(-1));
  }
});

test('a short route stays in one stretch', () => {
  const stretches = splitRoute([[74, 13], [74, 13.5], [74, 14]], 200);
  assert.equal(stretches.length, 1);
  assert.equal(stretches[0].length, 3);
});

test('pickAlongWholeRoute returns everything when there are few places', () => {
  const places = [{ score: 1, routeKm: 1 }, { score: 2, routeKm: 50 }];
  assert.equal(pickAlongWholeRoute(places, 100, 75).length, 2);
});
