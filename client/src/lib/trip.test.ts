// Logic tests for the trip helpers. Run with:  npm test   (inside client/)
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { toggleStop, moveStop } from '../context/activeTripLogic';
import { buildNavigation } from './googleMaps';
import { buildListSections, estimateRoute, mergeWithStops, stopNumbers, tripTotals } from './trip';
import type { Place } from '../types';

const place = (id: string, extra: Partial<Place> = {}): Place => ({
  id, name: `Place ${id}`, category: 'attraction', latitude: 13 + Number(id.replace(/\D/g, '')) / 100, longitude: 74.8,
  description: null, rating: null, imageUrl: null, openingHours: null, website: null, ...extra,
});
const A = place('node-1'), B = place('node-2'), C = place('node-3'), D = place('node-4'), E = place('node-5');
const all = [A, B, C, D, E];
const arrange = (list: Place[]) => [...list].sort((a, b) => a.name.localeCompare(b.name));

describe('selection: list order and numbering (Test A)', () => {
  test('added stops move to the top in itinerary order and get numbers 1, 2, 3', () => {
    let stops: Place[] = [];
    for (const p of [D, B, E]) stops = toggleStop(stops, p);
    const { selected, others } = buildListSections(all, stops, arrange);
    assert.deepEqual(selected.map((p) => p.id), ['node-4', 'node-2', 'node-5']);
    assert.deepEqual(others.map((p) => p.id), ['node-1', 'node-3']);
    assert.deepEqual(stopNumbers(stops), { 'node-4': 1, 'node-2': 2, 'node-5': 3 });
  });

  test('removing the second stop renumbers the rest and returns it to the ordinary list', () => {
    let stops = [D, B, E] as Place[];
    stops = toggleStop(stops, B);
    const { selected, others } = buildListSections(all, stops, arrange);
    assert.deepEqual(stopNumbers(stops), { 'node-4': 1, 'node-5': 2 });
    assert.ok(others.some((p) => p.id === 'node-2'));
    assert.ok(!selected.some((p) => p.id === 'node-2'));
  });

  test('adding the same place twice never duplicates it', () => {
    const once = toggleStop([], A);
    assert.equal(once.length, 1);
    assert.equal(toggleStop(once, A).length, 0); // second click removes it
    const merged = mergeWithStops([A, A], [A, A]);
    assert.equal(merged.length, 1);
    assert.equal(buildListSections([A], [A, A], arrange).selected.length, 1);
  });

  test('filters and sorting never hide selected stops', () => {
    const hideEverything = () => [] as Place[];
    const { selected } = buildListSections(all, [C, A], hideEverything);
    assert.deepEqual(selected.map((p) => p.id), ['node-3', 'node-1']);
  });

  test('reordering a stop changes the numbers', () => {
    const stops = moveStop([A, B, C], 'node-3', -1);
    assert.deepEqual(stops.map((s) => s.id), ['node-1', 'node-3', 'node-2']);
    assert.deepEqual(moveStop([A, B], 'node-1', -1).map((s) => s.id), ['node-1', 'node-2']); // already first
  });
});

describe('restoring a saved trip (Test C)', () => {
  test('saved stops stay visible and on top even when a fresh discovery does not return them', () => {
    const saved = [place('node-77', { name: 'Saved only' }), B];
    const discovered = [A, B, C]; // node-77 is missing from the new search
    const { selected, others } = buildListSections(discovered, saved, arrange);
    assert.deepEqual(selected.map((p) => p.id), ['node-77', 'node-2']);
    assert.deepEqual(others.map((p) => p.id), ['node-1', 'node-3']);
    assert.deepEqual(stopNumbers(saved), { 'node-77': 1, 'node-2': 2 });
  });

  test('saved data wins over a fresh discovery of the same place', () => {
    const merged = mergeWithStops([place('node-2', { name: 'Old name' })], [place('node-2', { name: 'Saved name' })]);
    assert.equal(merged[0].name, 'Saved name');
  });
});

describe('Navigate uses the CURRENT itinerary (Tests B and E)', () => {
  const start = { latitude: 12.9, longitude: 74.8, name: 'A' };
  const end = { latitude: 15.4, longitude: 73.8, name: 'B' };

  test('no stops: origin and destination only', () => {
    const nav = buildNavigation(start, [], end);
    assert.equal(nav.legs.length, 1);
    const url = new URL(nav.legs[0].url);
    assert.equal(url.searchParams.get('origin'), '12.900000,74.800000');
    assert.equal(url.searchParams.get('destination'), '15.400000,73.800000');
    assert.equal(url.searchParams.get('waypoints'), null);
  });

  test('three stops appear in order; removing one updates the link', () => {
    const stops = [A, B, C];
    const waypoints = (s: Place[]) => new URL(buildNavigation(start, s, end).legs[0].url).searchParams.get('waypoints');
    assert.equal(waypoints(stops), [A, B, C].map((p) => `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`).join('|'));
    assert.equal(waypoints(stops.filter((s) => s.id !== 'node-2')), [A, C].map((p) => `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`).join('|'));
  });
});

describe('totals', () => {
  test('journeys count driving only; surprise trips add each visit exactly once', () => {
    const route = { distanceKm: 100, durationMin: 120 };
    const stops = [{ ...A, visitMin: 30 }, { ...B, visitMin: 60 }];
    assert.equal(tripTotals(route, stops, 'journey').totalMin, 120);
    assert.equal(tripTotals(route, stops, 'surprise-route').totalMin, 210);
    assert.equal(tripTotals(route, [...stops, stops[0]], 'surprise-route').totalMin, 210); // duplicate ignored
  });
  test('fallback estimate adds each stop detour', () => {
    const r = estimateRoute({ distanceKm: 100, durationMin: 120 }, [place('node-1', { detourDistanceKm: 4, detourDurationMin: 6 })]);
    assert.deepEqual(r, { distanceKm: 104, durationMin: 126 });
  });
});
