// Tests for saved-trip logic that needs no database: fingerprints (no duplicates), the response
// shape, Google Maps links (ordered stops, waypoint limit), request validation, and that the browser
// copy of the Google Maps helper is identical to the server copy.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { buildDirectionsUrl, buildNavigation, MAX_WAYPOINTS } from '../lib/googleMaps';
import { saveTripSchema } from '../lib/schemas';
import { tripFingerprint, viaStops } from '../services/savedTrips';

const origin = { name: 'Mangalore', latitude: 12.9, longitude: 74.8 };
const destination = { name: 'Goa', latitude: 15.4, longitude: 73.8 };
const stop = (n: number) => ({ id: `node-${n}`, name: `Stop ${n}`, category: 'attraction' as const, latitude: 13 + n / 100, longitude: 74.5 });
const body = (stops: ReturnType<typeof stop>[], extra: Record<string, unknown> = {}) => ({
  kind: 'journey' as const, origin, destination, radiusKm: 10, totalDistanceKm: 338, totalDurationMin: 306, stops, ...extra,
});

describe('trip fingerprint (prevents duplicate saves)', () => {
  test('same trip -> same fingerprint; different order or stops -> different', () => {
    const a = saveTripSchema.parse(body([stop(1), stop(2)]));
    assert.equal(tripFingerprint(a), tripFingerprint(saveTripSchema.parse(body([stop(1), stop(2)]))));
    assert.notEqual(tripFingerprint(a), tripFingerprint(saveTripSchema.parse(body([stop(2), stop(1)]))));
    assert.notEqual(tripFingerprint(a), tripFingerprint(saveTripSchema.parse(body([stop(1)]))));
    assert.notEqual(tripFingerprint(a), tripFingerprint(saveTripSchema.parse(body([stop(1), stop(2)], { kind: 'surprise-route' }))));
  });
});

describe('request validation', () => {
  test('keeps stop order, drops unknown fields, and rejects bad data', () => {
    const parsed = saveTripSchema.parse(body([stop(3), stop(1)]));
    assert.deepEqual(parsed.stops.map((s) => s.id), ['node-3', 'node-1']);
    assert.throws(() => saveTripSchema.parse(body([{ ...stop(1), id: 'not-an-id' }])));
    assert.throws(() => saveTripSchema.parse({ ...body([]), kind: 'something-else' }));
    assert.throws(() => saveTripSchema.parse({ ...body([]), origin: { name: '', latitude: 1, longitude: 1 } }));
  });
});

describe('Google Maps links', () => {
  test('origin, destination and ordered waypoints, properly encoded, driving mode', () => {
    const nav = buildNavigation(origin, [stop(2), stop(1), stop(3)], destination);
    assert.equal(nav.split, false);
    const url = new URL(nav.legs[0].url);
    assert.equal(url.origin + url.pathname, 'https://www.google.com/maps/dir/');
    assert.equal(url.searchParams.get('travelmode'), 'driving');
    assert.equal(url.searchParams.get('origin'), '12.900000,74.800000');
    assert.equal(url.searchParams.get('destination'), '15.400000,73.800000');
    assert.equal(url.searchParams.get('waypoints'), [stop(2), stop(1), stop(3)].map((p) => `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`).join('|'));
    assert.ok(nav.legs[0].url.includes('%2C') && nav.legs[0].url.includes('%7C'), 'commas and pipes are URL-encoded');
  });

  test('no stops: plain origin to destination link', () => {
    const nav = buildNavigation(origin, [], destination);
    assert.equal(new URL(nav.legs[0].url).searchParams.get('waypoints'), null);
  });

  test('more than 9 stops are split into ordered, connected parts; none is dropped', () => {
    const stops = Array.from({ length: 23 }, (_, i) => stop(i + 1));
    const nav = buildNavigation(origin, stops, destination);
    assert.equal(nav.split, true);
    assert.ok(nav.legs.every((leg) => (new URL(leg.url).searchParams.get('waypoints') ?? '').split('|').filter(Boolean).length <= MAX_WAYPOINTS));
    // every stop appears exactly once, in order, either as a waypoint or as the point where two parts join
    const visited: string[] = [];
    nav.legs.forEach((leg, i) => {
      const u = new URL(leg.url);
      if (i === 0) visited.push(u.searchParams.get('origin')!);
      visited.push(...(u.searchParams.get('waypoints') ?? '').split('|').filter(Boolean), u.searchParams.get('destination')!);
    });
    const expected = [origin, ...stops, destination].map((p) => `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`);
    assert.deepEqual(visited, expected);
    // each part starts where the previous one ended
    for (let i = 1; i < nav.legs.length; i++) {
      assert.equal(new URL(nav.legs[i].url).searchParams.get('origin'), new URL(nav.legs[i - 1].url).searchParams.get('destination'));
    }
    assert.equal(nav.legs.reduce((n, l) => n + l.stopCount, 0) + nav.legs.length - 1 + 0, stops.length);
  });

  test('directions to one attraction use its coordinates', () => {
    const url = new URL(buildDirectionsUrl(stop(5)));
    assert.equal(url.searchParams.get('destination'), '13.050000,74.500000');
  });

  test('a one-way surprise trip ends at its last stop (it is not also a waypoint)', () => {
    const stops = [stop(1), stop(2), stop(3)];
    assert.deepEqual(viaStops('surprise-around', { tripType: 'oneway' }, stops).map((s) => s.id), ['node-1', 'node-2']);
    assert.equal(viaStops('surprise-around', { tripType: 'roundtrip' }, stops).length, 3);
    assert.equal(viaStops('journey', null, stops).length, 3);
  });

  test('the browser copy of the helper is identical to the server copy', () => {
    const server = readFileSync(path.join(__dirname, '../lib/googleMaps.ts'), 'utf8');
    const client = readFileSync(path.join(__dirname, '../../../client/src/lib/googleMaps.ts'), 'utf8');
    assert.equal(client, server);
  });
});
