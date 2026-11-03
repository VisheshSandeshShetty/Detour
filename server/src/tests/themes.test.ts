// Tests for the Surprise Me category filter and Roll Again exclusions (pure logic, no network).

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { THEME_KEYS, THEME_LABELS, detectThemes, matchesThemes } from '../lib/themes';
import { applyPoolFilters } from '../services/surprise';

describe('detecting themes from OpenStreetMap tags', () => {
  test('each theme is recognised from its own tags', () => {
    assert.deepEqual(detectThemes({ natural: 'beach' }), ['beach']);
    assert.deepEqual(detectThemes({ waterway: 'waterfall' }), ['waterfall']);
    assert.deepEqual(detectThemes({ tourism: 'viewpoint' }), ['viewpoint']);
    assert.deepEqual(detectThemes({ natural: 'peak' }), ['hill']);
    assert.deepEqual(detectThemes({ natural: 'cave_entrance' }), ['cave']);
    assert.deepEqual(detectThemes({ tourism: 'museum' }), ['museum']);
    assert.deepEqual(detectThemes({ amenity: 'place_of_worship', wikidata: 'Q1' }), ['temple']);
    assert.deepEqual(detectThemes({ leisure: 'nature_reserve' }), ['park']);
    assert.deepEqual(detectThemes({ tourism: 'theme_park' }), ['adventure']);
    assert.deepEqual(detectThemes({ aerialway: 'zip_line' }), ['adventure']);
    assert.deepEqual(detectThemes({ tourism: 'attraction' }), ['other']);
  });

  test('a place can have several themes (a fort is a historical place, a monument is both)', () => {
    assert.deepEqual(detectThemes({ historic: 'fort' }), ['historic']);
    assert.deepEqual(detectThemes({ historic: 'monument' }).sort(), ['historic', 'landmark']);
  });

  test('restaurants, cafes and shops have no theme, so they never match a theme filter', () => {
    assert.deepEqual(detectThemes({ amenity: 'cafe' }), []);
    assert.deepEqual(detectThemes({ shop: 'mall' }), []);
    assert.equal(matchesThemes({ themes: [] }, ['other']), false);
  });

  test('every theme has a label', () => {
    for (const key of THEME_KEYS) assert.ok(THEME_LABELS[key].length > 3);
  });
});

describe('matching a filter', () => {
  const beach = { id: 'node-1', themes: ['beach'] as const };
  const fall = { id: 'node-2', themes: ['waterfall', 'park'] as const };

  test('no filter means everything matches', () => {
    assert.equal(matchesThemes(beach as never, undefined), true);
    assert.equal(matchesThemes(beach as never, []), true);
  });
  test('several selected themes: a place needs at least one', () => {
    assert.equal(matchesThemes(fall as never, ['beach', 'waterfall']), true);
    assert.equal(matchesThemes(beach as never, ['waterfall', 'cave']), false);
  });
});

describe('pool filters: kinds of place and Roll Again', () => {
  const places = [
    { id: 'node-1', themes: ['beach' as const] },
    { id: 'node-2', themes: ['beach' as const] },
    { id: 'node-3', themes: ['waterfall' as const] },
    { id: 'node-4', themes: [] },
  ];
  const reason = (fn: () => unknown) => {
    try {
      fn();
    } catch (error) {
      return (error as { details?: { reason?: string } }).details?.reason;
    }
    return undefined;
  };

  test('only places of the chosen kinds stay, nothing unrelated sneaks in', () => {
    assert.deepEqual(applyPoolFilters(places, { themes: ['beach'] }).map((p) => p.id), ['node-1', 'node-2']);
    assert.deepEqual(applyPoolFilters(places, { themes: ['beach', 'waterfall'] }).map((p) => p.id), ['node-1', 'node-2', 'node-3']);
  });

  test('no filter keeps everything, including places without a theme', () => {
    assert.equal(applyPoolFilters(places, {}).length, 4);
  });

  test('places already shown are left out', () => {
    assert.deepEqual(applyPoolFilters(places, { themes: ['beach'], excludeIds: ['node-1'] }).map((p) => p.id), ['node-2']);
  });

  test('a kind with nothing nearby says "no-match"', () => {
    assert.equal(reason(() => applyPoolFilters(places, { themes: ['cave'] })), 'no-match');
  });

  test('when everything matching was already shown it says "exhausted"', () => {
    assert.equal(reason(() => applyPoolFilters(places, { themes: ['beach'], excludeIds: ['node-1', 'node-2'] })), 'exhausted');
    assert.equal(reason(() => applyPoolFilters(places, { excludeIds: ['node-1', 'node-2', 'node-3', 'node-4'] })), 'exhausted');
  });
});
