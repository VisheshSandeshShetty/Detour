// Tests for turning OpenStreetMap data into Detour places.

process.env.JWT_SECRET ??= 'test-secret-test-secret';

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectCategory, elementToCandidate, getImageUrl, removeDuplicates } from '../services/overpass';

test('categories are detected from OpenStreetMap tags', () => {
  assert.equal(detectCategory({ tourism: 'museum' }), 'attraction');
  assert.equal(detectCategory({ tourism: 'viewpoint' }), 'nature');
  assert.equal(detectCategory({ waterway: 'waterfall' }), 'nature');
  assert.equal(detectCategory({ historic: 'fort' }), 'historic');
  assert.equal(detectCategory({ amenity: 'place_of_worship', wikidata: 'Q1' }), 'historic');
  assert.equal(detectCategory({ leisure: 'park' }), 'park');
  assert.equal(detectCategory({ amenity: 'cafe' }), 'food');
  assert.equal(detectCategory({ tourism: 'theme_park' }), 'entertainment');
  assert.equal(detectCategory({ shop: 'mall' }), 'shopping');
  assert.equal(detectCategory({ highway: 'bus_stop' }), null);
});

test('an element becomes a place; ratings are never invented', () => {
  const place = elementToCandidate({
    type: 'node',
    id: 42,
    lat: 13.4,
    lon: 74.7,
    tags: { name: 'ಕೋಟೆ', 'name:en': 'Old Fort', historic: 'fort', opening_hours: 'Mo-Su 09:00-17:00' },
  });
  assert.ok(place);
  assert.equal(place.id, 'node-42');
  assert.equal(place.name, 'Old Fort'); // English name preferred
  assert.equal(place.category, 'historic');
  assert.equal(place.rating, null);
  assert.equal(place.imageUrl, null);
  assert.equal(place.openingHours, 'Mo-Su 09:00-17:00');
});

test('ways use their centre point; unnamed or unlocatable elements are skipped', () => {
  const way = elementToCandidate({
    type: 'way', id: 7, center: { lat: 13.1, lon: 74.2 }, tags: { name: 'Lake Park', leisure: 'park' },
  });
  assert.ok(way);
  assert.equal(way.latitude, 13.1);
  assert.equal(elementToCandidate({ type: 'node', id: 1, lat: 1, lon: 1, tags: { tourism: 'museum' } }), null);
  assert.equal(elementToCandidate({ type: 'way', id: 2, tags: { name: 'No location', tourism: 'museum' } }), null);
});

test('only real photos are used', () => {
  assert.equal(getImageUrl({}), null);
  assert.equal(getImageUrl({ image: 'http://insecure.example/a.jpg' }), null);
  assert.equal(getImageUrl({ image: 'https://example.com/a.jpg' }), 'https://example.com/a.jpg');
  assert.match(
    getImageUrl({ wikimedia_commons: 'File:Murudeshwar temple.jpg' }) ?? '',
    /^https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\/Murudeshwar%20temple\.jpg/
  );
  assert.equal(getImageUrl({ wikimedia_commons: 'Category:Murudeshwar' }), null);
});

test('duplicates are removed by id and by same-name-same-spot', () => {
  const base = { category: 'attraction' as const, description: null, rating: null, imageUrl: null, openingHours: null, website: null };
  const list = removeDuplicates([
    { ...base, id: 'node-1', name: 'Beach View', latitude: 13.0001, longitude: 74.0001, score: 10 },
    { ...base, id: 'node-1', name: 'Beach View', latitude: 13.0001, longitude: 74.0001, score: 10 }, // same id
    { ...base, id: 'way-9', name: 'beach view', latitude: 13.0002, longitude: 74.0002, score: 40 }, // same name and spot, better score
    { ...base, id: 'node-2', name: 'Different Place', latitude: 13.5, longitude: 74.5, score: 5 },
  ]);
  assert.equal(list.length, 2);
  assert.ok(list.some((place) => place.id === 'way-9'), 'keeps the higher scoring copy');
});
