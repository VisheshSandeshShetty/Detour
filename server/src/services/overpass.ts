// Overpass API = a read-only search engine for OpenStreetMap data.
// We use it to find points of interest (museums, viewpoints, forts, cafes ...).
//
// Overpass is a free community service, so we keep queries small, try backup servers,
// and cache results in the callers.

import { config } from '../config';
import { AppError } from '../lib/errors';
import fs from 'node:fs';
import path from 'node:path';
import { cacheGet, cacheSet } from '../lib/cache';
import { detectThemes } from '../lib/themes';
import { DEMO_PLACES, DEMO_WARNING } from './demoPlaces';
import { fetchJson, sleep } from '../lib/http';
import type { CategoryKey } from '../lib/categories';
import type { Candidate } from '../types';

export type SearchMode = 'nearby' | 'journey';

// ---------------------------------------------------------------------------------------
// 1. Building the query
// ---------------------------------------------------------------------------------------

// Each string is an OpenStreetMap tag filter. A place must match one of them AND have a name.
// "core" = sightseeing categories, "amenities" = restaurants/cafes and shops (there are MANY of
// these, so they get their own query and their own result limit).
//
// In "journey" mode we are stricter, otherwise a 300 km route would return every tea stall.
function getFilters(group: 'core' | 'amenities', mode: SearchMode): string[] {
  if (group === 'core') {
    const filters = [
      // Tourist attractions
      '["tourism"~"^(attraction|museum|gallery|zoo|aquarium)$"]',
      // Nature & viewpoints
      '["tourism"="viewpoint"]',
      '["natural"~"^(peak|beach|cave_entrance|hot_spring)$"]',
      '["waterway"="waterfall"]',
      // Historical places (temples/mosques/churches only when they are notable: have a Wikidata entry)
      '["historic"~"^(monument|castle|fort|ruins|archaeological_site|memorial|palace|city_gate)$"]',
      '["amenity"="place_of_worship"]["wikidata"]',
      // Parks
      '["leisure"="nature_reserve"]',
      '["boundary"="national_park"]',
      // Entertainment
      '["tourism"="theme_park"]',
      '["leisure"="water_park"]',
      // Adventure and activities
      '["aerialway"="zip_line"]',
      '["sport"~"^(climbing|canoe|kayak|scuba_diving|paragliding|surfing|rafting|diving)$"]',
    ];
    if (mode === 'nearby') {
      filters.push('["leisure"~"^(park|garden)$"]', '["amenity"~"^(cinema|theatre)$"]');
    } else {
      // Along a long route, only list parks and gardens that are notable
      filters.push('["leisure"~"^(park|garden)$"]["wikidata"]');
    }
    return filters;
  }

  // amenities
  if (mode === 'nearby') {
    return ['["amenity"~"^(restaurant|cafe)$"]', '["shop"="mall"]', '["amenity"="marketplace"]'];
  }
  // Journey: only restaurants/cafes that have a website (a rough "this is a proper place" test)
  return [
    '["amenity"~"^(restaurant|cafe)$"]["website"]',
    '["amenity"~"^(restaurant|cafe)$"]["contact:website"]',
    '["shop"="mall"]',
  ];
}

// `area` is either an "around a point" or an "around a line" filter:
//   (around:5000,13.35,74.78)             -> within 5 km of a point
//   (around:10000,lat1,lon1,lat2,lon2,..) -> within 10 km of a polyline (our route!)
function buildQuery(area: string, filters: string[], limit: number): string {
  const lines = filters.map((filter) => `  nwr${filter}["name"]${area};`).join('\n');
  return `[out:json][timeout:90];\n(\n${lines}\n);\nout center ${limit};`;
}

// ---------------------------------------------------------------------------------------
// 2. Running the query (with backup servers and error handling)
// ---------------------------------------------------------------------------------------

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
  remark?: string;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// A server that just failed is tried LAST for the next two minutes, so one dead mirror does not
// cost every request a full timeout.
const lastFailure = new Map<string, number>();
const AVOID_FAILED_MS = 2 * 60 * 1000;

function serversInOrder(): string[] {
  const now = Date.now();
  const recentlyFailed = (url: string) => now - (lastFailure.get(url) ?? 0) < AVOID_FAILED_MS;
  return [...config.overpassUrls].sort((a, b) => Number(recentlyFailed(a)) - Number(recentlyFailed(b)));
}

// If a server has not answered after this long, the next one is started too (the first keeps running).
// A dead or slow mirror then costs 6 seconds instead of its whole timeout. A server that FAILS
// fast hands over to the next one immediately.
const HEDGE_MS = 6000;

export async function runOverpass(query: string, timeoutMs = 60000): Promise<OverpassElement[]> {
  const problems: string[] = [];
  const order = serversInOrder();

  async function ask(url: string): Promise<OverpassElement[]> {
    const data = await fetchJson<OverpassResponse>(url, {
      method: 'POST',
      // Accept: */*  (not "application/json"). Some Overpass servers answer HTTP 406 Not Acceptable
      // when a client asks for a specific type. The query itself already says [out:json].
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: '*/*' },
      body: `data=${encodeURIComponent(query)}`,
      timeoutMs,
    });
    // Overpass sometimes answers HTTP 200 but says in "remark" that the query ran out of time/memory
    if (data.remark && /timed out|out of memory|runtime error/i.test(data.remark)) throw new Error(data.remark);
    return data.elements ?? [];
  }

  const elements = await new Promise<OverpassElement[] | null>((resolve) => {
    let next = 0;
    let running = 0;
    let settled = false;
    const timers: NodeJS.Timeout[] = [];
    const finish = (value: OverpassElement[] | null) => {
      if (settled) return;
      settled = true;
      timers.forEach(clearTimeout);
      resolve(value);
    };
    const launch = () => {
      if (settled || next >= order.length) return;
      const url = order[next++];
      running++;
      const hedge = setTimeout(launch, HEDGE_MS);
      timers.push(hedge);
      ask(url).then(
        (result) => {
          lastFailure.delete(url);
          finish(result);
        },
        (error) => {
          lastFailure.set(url, Date.now());
          problems.push(`${hostOf(url)}: ${error instanceof Error ? error.message : 'failed'}`);
          running--;
          clearTimeout(hedge);
          if (settled) return;
          if (next < order.length) launch();
          else if (running === 0) finish(null);
        }
      );
    };
    launch();
  });
  if (elements) return elements;

  // This line is the first thing to look at in the server terminal when places do not load
  console.error('All Overpass servers failed ->', problems.join(' | '));

  const refused = problems.some((problem) => /HTTP (406|429)/.test(problem));
  throw new AppError(
    503,
    refused
      ? 'The places service (Overpass) is refusing requests right now (rate limit). Wait about 30 seconds and try again.'
      : 'The places service (Overpass) is busy or timed out. Please wait a minute and try again.',
    problems
  );
}

// ---------------------------------------------------------------------------------------
// 3. Turning raw OpenStreetMap elements into our own Candidate objects
// ---------------------------------------------------------------------------------------

const HISTORIC_VALUES = [
  'monument', 'castle', 'fort', 'ruins', 'archaeological_site', 'memorial', 'palace', 'city_gate',
];

// Decides which of our 7 categories an element belongs to. The order matters:
// the first rule that matches wins.
export function detectCategory(tags: Record<string, string>): CategoryKey | null {
  if (
    tags.tourism === 'theme_park' ||
    tags.leisure === 'water_park' ||
    tags.aerialway === 'zip_line' ||
    typeof tags.sport === 'string' && /^(climbing|canoe|kayak|scuba_diving|paragliding|surfing|rafting|diving)$/.test(tags.sport) ||
    tags.amenity === 'cinema' ||
    tags.amenity === 'theatre'
  ) {
    return 'entertainment';
  }
  if (
    tags.tourism === 'viewpoint' ||
    tags.waterway === 'waterfall' ||
    ['peak', 'beach', 'cave_entrance', 'hot_spring'].includes(tags.natural)
  ) {
    return 'nature';
  }
  if (HISTORIC_VALUES.includes(tags.historic) || tags.amenity === 'place_of_worship') return 'historic';
  if (['park', 'garden', 'nature_reserve'].includes(tags.leisure) || tags.boundary === 'national_park') {
    return 'park';
  }
  if (tags.amenity === 'restaurant' || tags.amenity === 'cafe') return 'food';
  if (tags.shop === 'mall' || tags.amenity === 'marketplace') return 'shopping';
  if (['attraction', 'museum', 'gallery', 'zoo', 'aquarium'].includes(tags.tourism)) return 'attraction';
  return null;
}

// A photo, only if OpenStreetMap actually has one. We never invent images.
export function getImageUrl(tags: Record<string, string>): string | null {
  if (tags.image && /^https:\/\//i.test(tags.image)) return tags.image;
  const commons = tags.wikimedia_commons;
  if (commons && commons.startsWith('File:')) {
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(commons.slice(5))}?width=640`;
  }
  return null;
}

function getWebsite(tags: Record<string, string>): string | null {
  const url = tags.website ?? tags['contact:website'];
  return url && /^https?:\/\//i.test(url) ? url : null;
}

// How "interesting" is this place? Used to choose the best places when a route has too many.
// Places that someone bothered to link to Wikipedia/Wikidata or add a photo to are usually notable.
const CATEGORY_WEIGHT: Record<CategoryKey, number> = {
  attraction: 20, nature: 16, historic: 16, entertainment: 10, park: 8, food: 3, shopping: 3,
};

function interestScore(tags: Record<string, string>, category: CategoryKey): number {
  let score = CATEGORY_WEIGHT[category];
  if (tags.wikipedia || tags.wikidata) score += 30;
  if (getImageUrl(tags)) score += 15;
  if (getWebsite(tags)) score += 8;
  if (tags.opening_hours) score += 3;
  return score;
}

export function elementToCandidate(element: OverpassElement): Candidate | null {
  const tags = element.tags ?? {};
  // Prefer the English name, because many Indian places are tagged in Kannada, Hindi etc.
  const name = (tags['name:en'] ?? tags.name ?? '').trim();
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  if (!name || latitude === undefined || longitude === undefined) return null;

  const category = detectCategory(tags);
  if (!category) return null;

  return {
    id: `${element.type}-${element.id}`,
    name,
    category,
    latitude,
    longitude,
    description: tags['description:en'] ?? tags.description ?? null,
    rating: null, // OpenStreetMap has no ratings, and we never make one up
    imageUrl: getImageUrl(tags),
    openingHours: tags.opening_hours ?? null,
    website: getWebsite(tags),
    themes: detectThemes(tags),
    score: interestScore(tags, category),
  };
}

// The same place can appear twice (once matched by two filters, or as a node AND a building outline).
// We keep one copy: first by OpenStreetMap id, then by "same name at (almost) the same spot".
export function removeDuplicates(candidates: Candidate[]): Candidate[] {
  const byId = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const existing = byId.get(candidate.id);
    if (!existing || existing.score < candidate.score) byId.set(candidate.id, candidate);
  }

  const byNameAndSpot = new Map<string, Candidate>();
  for (const candidate of byId.values()) {
    // 3 decimals of latitude/longitude is roughly a 100 metre grid
    const key = `${candidate.name.toLowerCase()}|${candidate.latitude.toFixed(3)}|${candidate.longitude.toFixed(3)}`;
    const existing = byNameAndSpot.get(key);
    if (!existing || existing.score < candidate.score) byNameAndSpot.set(key, candidate);
  }
  return [...byNameAndSpot.values()];
}

function toCandidates(elements: OverpassElement[]): Candidate[] {
  const result: Candidate[] = [];
  for (const element of elements) {
    const candidate = elementToCandidate(element);
    if (candidate) result.push(candidate);
  }
  return result;
}

// ---------------------------------------------------------------------------------------
// 4. The two searches Detour needs
// ---------------------------------------------------------------------------------------

// ---- How the searches work (read this first) ----
//
// The slow part of Overpass is scanning a big area. An `around:` search over a whole 5 km circle
// (or a 200 km polyline) with a dozen tag filters is expensive, and the free servers time out.
//
// So we cut the map into a fixed grid of small square TILES and search one tile at a time with a
// plain bounding box, which Overpass answers much faster. Then:
//   - tiles are fetched in a polite way: 2 at a time, nearest (or first along the route) first
//   - every tile is cached by its grid position, so a later search near the same place reuses it
//     (the cache never depends on the search centre, so it cannot give wrong results)
//   - if some tiles fail or time runs out, we keep the tiles that worked and report a warning
//   - the callers still do the exact distance check, so tiles only decide what we download
//
// Bigger searches use bigger tiles and fewer filters, so a 100 km search stays possible.

type Tier = 'full' | 'sights' | 'notable' | 'journey';

interface TierInfo {
  cellDeg: number; // tile size in degrees (0.1 degree is about 11 km)
  limit: number; // max elements per tile
  filters: () => string[];
}

const TIERS: Record<Tier, TierInfo> = {
  // up to 10 km: everything, including restaurants and cafes
  full: { cellDeg: 0.1, limit: 1500, filters: () => [...getFilters('core', 'nearby'), ...getFilters('amenities', 'nearby')] },
  // 10 to 30 km: sightseeing only
  sights: { cellDeg: 0.2, limit: 2000, filters: () => getFilters('core', 'nearby') },
  // over 30 km: only the stricter "notable" list
  notable: { cellDeg: 0.5, limit: 2500, filters: () => getFilters('core', 'journey') },
  // along a route
  journey: { cellDeg: 0.5, limit: 2500, filters: () => [...getFilters('core', 'journey'), ...getFilters('amenities', 'journey')] },
};

export function tierForRadius(radiusKm: number): Tier {
  if (radiusKm <= 10) return 'full';
  if (radiusKm <= 30) return 'sights';
  return 'notable';
}

interface Tile {
  tier: Tier;
  row: number; // latitude index:  south edge = row * cellDeg
  col: number; // longitude index: west edge  = col * cellDeg
}

const TILE_CACHE_SECONDS = 60 * 60;
const TILE_TIMEOUT_MS = 25000; // per server, per tile. Tiles are small, so slow means "broken".
const TILE_CONCURRENCY = 2; // never hammer the public servers
const TILE_STAGGER_MS = 300;

const EARTH_KM = 6371;
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Distance from a point to the nearest edge/inside of a tile (0 if the point is inside it)
function distanceToTileKm(tile: Tile, lat: number, lon: number): number {
  const cell = TIERS[tile.tier].cellDeg;
  const south = tile.row * cell;
  const west = tile.col * cell;
  const nearLat = Math.min(Math.max(lat, south), south + cell);
  const nearLon = Math.min(Math.max(lon, west), west + cell);
  return haversineKm(lat, lon, nearLat, nearLon);
}

// All tiles that could contain a place within `radiusKm` of a point, closest first.
export function tilesAround(lat: number, lon: number, radiusKm: number, tier: Tier): Tile[] {
  const cell = TIERS[tier].cellDeg;
  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.max(0.05, Math.cos((lat * Math.PI) / 180)));
  const tiles: { tile: Tile; distance: number }[] = [];
  for (let row = Math.floor((lat - dLat) / cell); row <= Math.floor((lat + dLat) / cell); row++) {
    for (let col = Math.floor((lon - dLon) / cell); col <= Math.floor((lon + dLon) / cell); col++) {
      const tile = { tier, row, col };
      const distance = distanceToTileKm(tile, lat, lon);
      if (distance <= radiusKm) tiles.push({ tile, distance });
    }
  }
  return tiles.sort((a, b) => a.distance - b.distance).map((entry) => entry.tile);
}

// Tiles that a corridor (route plus radius on each side) passes through, in route order.
// `route` is [lon, lat] pairs. We sample a point every ~10 km, so every place within the corridor
// is inside a tile we pick. Extra tiles are harmless: Turf removes places outside the corridor later.
const SAMPLE_KM = 10;

// A point about every 10 km along the route ([lon, lat] pairs)
function sampleRoute(route: number[][]): number[][] {
  const samples: number[][] = [];
  let sinceLast = SAMPLE_KM;
  for (let i = 0; i < route.length; i++) {
    if (i > 0) sinceLast += haversineKm(route[i - 1][1], route[i - 1][0], route[i][1], route[i][0]);
    if (sinceLast >= SAMPLE_KM || i === route.length - 1) {
      samples.push(route[i]);
      sinceLast = 0;
    }
  }
  return samples;
}

export function tilesAlongRoute(route: number[][], radiusKm: number): Tile[] {
  const samples = sampleRoute(route);
  const reach = radiusKm + SAMPLE_KM / 2 + 1;
  const cell = TIERS.journey.cellDeg;
  const found = new Map<string, Tile>(); // Map keeps insertion order = order along the route
  for (const [lon, lat] of samples) {
    const dLat = reach / 111;
    const dLon = reach / (111 * Math.max(0.05, Math.cos((lat * Math.PI) / 180)));
    for (let row = Math.floor((lat - dLat) / cell); row <= Math.floor((lat + dLat) / cell); row++) {
      for (let col = Math.floor((lon - dLon) / cell); col <= Math.floor((lon + dLon) / cell); col++) {
        const key = `${row}:${col}`;
        if (found.has(key)) continue;
        const tile: Tile = { tier: 'journey', row, col };
        if (distanceToTileKm(tile, lat, lon) <= reach) found.set(key, tile);
      }
    }
  }
  return [...found.values()];
}

// ---- Tiles saved on disk, so a server restart does not make the next search slow again ----
const DISK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DISK_MAX_TILES = 300;
let disk: Map<string, { at: number; candidates: Candidate[] }> | null = null;
let diskTimer: ReturnType<typeof setTimeout> | null = null;

function loadDisk(): Map<string, { at: number; candidates: Candidate[] }> {
  if (disk) return disk;
  disk = new Map();
  const file = config.tileCacheFile;
  if (!file) return disk;
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, { at: number; candidates: Candidate[] }>;
    for (const [key, entry] of Object.entries(saved)) {
      if (Date.now() - entry.at < DISK_TTL_MS) disk.set(key, entry);
    }
  } catch {
    // no file yet, or it is damaged: start empty
  }
  return disk;
}

// Writes the cache file now. Called after a short delay, when the server stops, and by tests.
export function flushTileCache() {
  const file = config.tileCacheFile;
  if (diskTimer) {
    clearTimeout(diskTimer);
    diskTimer = null;
  }
  if (!file || !disk) return;
  try {
    const entries = [...disk.entries()].sort((a, b) => b[1].at - a[1].at).slice(0, DISK_MAX_TILES);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(Object.fromEntries(entries)));
    fs.renameSync(temp, file); // replace in one step, so a crash cannot leave half a file
  } catch (error) {
    console.warn('Could not save the tile cache:', error instanceof Error ? error.message : error);
  }
}

function saveDiskSoon() {
  if (!config.tileCacheFile || diskTimer) return;
  diskTimer = setTimeout(flushTileCache, 3000); // wait a moment: several tiles usually arrive together
  diskTimer.unref?.(); // never keep the server alive just for this
}
process.once('exit', flushTileCache);

async function fetchTile(tile: Tile): Promise<Candidate[]> {
  const key = `tile:v2:${tile.tier}:${tile.row}:${tile.col}`;
  const cached = cacheGet<Candidate[]>(key);
  if (cached) return cached;
  const onDisk = loadDisk().get(key);
  if (onDisk) {
    cacheSet(key, onDisk.candidates, TILE_CACHE_SECONDS);
    return onDisk.candidates;
  }

  const { cellDeg, limit, filters } = TIERS[tile.tier];
  const south = tile.row * cellDeg;
  const west = tile.col * cellDeg;
  const bbox = `(${south.toFixed(4)},${west.toFixed(4)},${(south + cellDeg).toFixed(4)},${(west + cellDeg).toFixed(4)})`;
  const query = buildQuery(bbox, filters(), limit).replace('[timeout:90]', '[timeout:25]');
  const candidates = toCandidates(await runOverpass(query, TILE_TIMEOUT_MS));
  cacheSet(key, candidates, TILE_CACHE_SECONDS);
  if (config.tileCacheFile) {
    loadDisk().set(key, { at: Date.now(), candidates });
    saveDiskSoon();
  }
  return candidates;
}

export interface TileSearchResult {
  candidates: Candidate[];
  totalTiles: number;
  failedTiles: number; // asked, but the servers could not answer
  skippedTiles: number; // never asked, because the time budget ran out
}

// Fetches tiles 2 at a time, in the order given, and stops starting new ones after `budgetMs`.
// Partial results are kept. Only if EVERY tile fails do we throw the last error.
export async function fetchTiles(
  tiles: Tile[],
  budgetMs: number,
  onProgress?: (done: number, total: number) => void
): Promise<TileSearchResult> {
  const deadline = Date.now() + budgetMs;
  const candidates: Candidate[] = [];
  let next = 0;
  let failed = 0;
  let succeeded = 0;
  let lastError: unknown = null;
  onProgress?.(0, tiles.length);

  async function worker(workerIndex: number) {
    if (workerIndex > 0) await sleep(TILE_STAGGER_MS * workerIndex);
    while (next < tiles.length && Date.now() < deadline) {
      const tile = tiles[next++];
      try {
        candidates.push(...(await fetchTile(tile)));
        succeeded++;
      } catch (error) {
        failed++;
        lastError = error;
      }
      onProgress?.(succeeded + failed, tiles.length);
      await sleep(TILE_STAGGER_MS);
    }
  }
  await Promise.all(Array.from({ length: Math.min(TILE_CONCURRENCY, tiles.length) }, (_, i) => worker(i)));

  const skipped = tiles.length - Math.min(next, tiles.length);
  if (tiles.length > 0 && succeeded === 0 && lastError) throw lastError;
  return { candidates, totalTiles: tiles.length, failedTiles: failed, skippedTiles: skipped };
}

export interface CorridorFetchResult {
  candidates: Candidate[];
  failedStretches: number; // tiles that could not be searched (name kept for the planner)
  totalStretches: number; // total tiles along the route
  demo?: boolean; // true = the built-in demo list was used because Overpass was unreachable
}

const JOURNEY_BUDGET_MS = 150000;

// Places along a route. `stretches` are pieces of the route as [lon, lat] pairs; they are joined
// again here, then the tiles along the route are searched.
export async function fetchCorridorCandidates(
  stretches: number[][][],
  radiusKm: number
): Promise<CorridorFetchResult> {
  const route = stretches.flat();
  const tiles = tilesAlongRoute(route, radiusKm);
  try {
    const result = await fetchTiles(tiles, JOURNEY_BUDGET_MS);
    return {
      candidates: result.candidates,
      failedStretches: result.failedTiles + result.skippedTiles,
      totalStretches: result.totalTiles,
    };
  } catch (error) {
    // Everything failed. If the built-in demo places lie in the tiles we needed, show them (and say so).
    const reach = radiusKm + SAMPLE_KM / 2 + 1;
    const samples = sampleRoute(route);
    const demo = DEMO_PLACES.filter((place) =>
      samples.some(([lon, lat]) => haversineKm(lat, lon, place.latitude, place.longitude) <= reach)
    );
    if (demo.length === 0) throw error;
    return { candidates: demo, failedStretches: 0, totalStretches: tiles.length, demo: true };
  }
}

const NEARBY_BUDGET_MS = 45000;

// Places around a single point (the "Around me" page, and Surprise Me).
export async function fetchNearbyCandidates(
  latitude: number,
  longitude: number,
  radiusKm: number,
  onProgress?: (done: number, total: number) => void
): Promise<{ candidates: Candidate[]; warning: string | null }> {
  const tiles = tilesAround(latitude, longitude, radiusKm, tierForRadius(radiusKm));
  try {
    const result = await fetchTiles(tiles, NEARBY_BUDGET_MS, onProgress);
    const missing = result.failedTiles + result.skippedTiles;
    const warning =
      missing > 0
        ? `Only ${result.totalTiles - missing} of ${result.totalTiles} map sections could be searched, so some places may be missing. Try again in a minute.`
        : null;
    return { candidates: result.candidates, warning };
  } catch (error) {
    // Everything failed: fall back to the demo list if it has anything within the radius
    const demo = DEMO_PLACES.filter(
      (place) => haversineKm(latitude, longitude, place.latitude, place.longitude) <= radiusKm
    );
    if (demo.length === 0) throw error;
    return { candidates: demo, warning: DEMO_WARNING };
  }
}

// A single place by id, used by the Place Details page.
export async function fetchElementById(
  type: 'node' | 'way' | 'relation',
  osmId: number
): Promise<OverpassElement | null> {
  const query = `[out:json][timeout:25];\n${type}(${osmId});\nout center;`;
  const elements = await runOverpass(query);
  return elements[0] ?? null;
}
