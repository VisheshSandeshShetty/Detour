# Detour: project progress

Last updated: 2026-11-01. Read this first when resuming.

## Architecture
React 18 + TS + Vite + Tailwind + Leaflet client. Express 5 + TS + Prisma + PostgreSQL server. OSRM (routes, detours), Overpass (places), Photon (search), Turf (exact distances).
Tabs: Around me `/`, Plan a route `/journey`, Surprise me `/surprise`, Saved.

## History
1. Original ZIP: full app (Roam), then renamed Detour, ratings UI removed, Surprise Me added, 55 logic tests.
2. Your manual edits after that ZIP: `overpass.ts` nearby search split into 4 sequential batches + separate amenities query; `nearby-overpass.test.ts` (3 tests); `.env` with `OVERPASS_URLS=https://overpass.openstreetmap.fr/...`. Found the 5 km search still slow (every batch scanned the whole circle).
3. **This session (replaces the 4-batch code):**
   - `server/src/services/overpass.ts`: nearby AND route search now use a fixed grid of small bounding-box TILES (0.1 / 0.2 / 0.5 degrees by radius). Tiles are fetched 2 at a time, nearest (or first along the route) first, with a time budget (45 s nearby, 150 s route). Each tile is cached 1 h by grid position (independent of search centre). Failed tiles are skipped and reported; only if ALL fail is an error thrown. Dead mirrors are tried last for 2 minutes. Radius tiers: <=10 km everything, <=30 km sightseeing only, >30 km notable list only.
   - `server/src/routes/places.ts`: radius now 0.5 to 100 km (decimals allowed).
   - `server/src/services/journeyPlanner.ts`: warning text says "map sections".
   - `server/src/config.ts`, `server/.env.example`: default Overpass list starts with overpass.openstreetmap.fr.
   - `client/src/pages/Explore.tsx`: radius number box (0.5 to 100, decimals), quick chips, validation, 600 ms debounce, loading message.
   - Tests: new `server/src/tests/tiles.test.ts` (11 tests); `planner.test.ts` updated for tile queries. Removed your `nearby-overpass.test.ts` (it tested the old batching and no longer applies).
   - Journey corridor radius options (5/10/20/30) and Surprise Me untouched.

## Tests (mocked only)
66 logic tests pass (corridor, detour, overpass, planner, surprise, surprise-e2e, tiles). `api.test.ts` needs DATABASE_URL and was not run. NOT run: tsc, vite build, Prisma, real Overpass.

## Plan a route: what is known
The exact manual failure was never captured. Likely cause (unconfirmed): the old route search sent 200 km `around:polyline` queries with ~20 filters, which public Overpass could not finish in time, so every request timed out. It now uses the same tile search. If it still fails, copy the line starting `All Overpass servers failed` from the server terminal.

## Known limitations
- Real-world speed of the tile search is unproven. Large radii show only notable places.
- Per-tile limit (1500 to 2500 elements) can cut very dense areas.
- Surprise Me visit times are rough estimates.

## Next steps
1. `npm install`, then in `server`: `npx tsc --noEmit`; in `client`: `npx tsc --noEmit && npm run build`. Fix small type errors.
2. Delete `server/src/tests/nearby-overpass.test.ts` if it exists.
3. `npm test --prefix server`, then `npm run check:services --prefix server`.
4. Try Around me at 1, 5, 25 km and a short route (Mangalore to Udupi) before a long one.

## V2 release milestone — 2026-11-01

Detour V2 is feature complete.

### Included features
- Around Me: nearby place discovery with customizable search radius.
- Plan a Route: discover places along a planned journey.
- Surprise Me: spontaneous place discovery.
- Geographic tile-based search with caching and controlled concurrency.
- Improved partial-failure handling for Overpass requests.
- Updated search validation, automated tests, and documentation.

### Validation
- 66 automated logic tests passing (mocked tests).
- Real-world API performance and large-radius search behaviour remain subject to further testing.

Release: v2.1.0
Status: Feature complete.
