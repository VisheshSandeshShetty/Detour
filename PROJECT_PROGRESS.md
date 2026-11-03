# Detour: project progress

Last updated: 2026-11-01 (late evening). Read this first when resuming.

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

4. **Upgrades added after the app worked on your machine:**
   - Disk tile cache (`overpass.ts`, `config.ts` `tileCacheFile`, default in the system temp folder, `TILE_CACHE_FILE=` empty turns it off). Survives restarts; tiles expire after 7 days; at most 300 tiles kept.
   - Built-in DEMO fallback (`services/demoPlaces.ts`): if every Overpass server fails, 23 well-known Mangalore/Udupi/Manipal-area places are shown with a clear "DEMO" warning. Coordinates are approximate and not checked against OpenStreetMap. Only used when it has places within the search radius or near the route.
   - Loading progress for Around me ("Map sections searched 3 of 9"): `routes/places.ts` (`GET /api/places/progress/:id`, `rid` query), `services/nearby.ts`, `Explore.tsx`, `lib/api.ts`.
   - Surprise along a route can now be saved (the Save button saves the Surprise stops while a surprise trip is shown): `JourneyResults.tsx`.
   - Copy-link button on journey results (opens the same route for anyone): `JourneyResults.tsx`.
   - `lib/http.ts`: IPv4-first DNS (fixes WSL "Network error") and real error reasons in messages.
   - Tests: `tilecache.test.ts` (2), more in `tiles.test.ts`; setup.mjs disables the disk cache in tests. 71 tests pass (mocked).

5. **Place Intelligence (all free sources, no keys):**
   - Server `server/src/services/intelligence/` (types, photos, knowledge, climate, rating, facts, index). Endpoint `GET /api/places/:id/intelligence/:section` with section = photos | knowledge | climate | facts | rating. Each section is cached, fails on its own, and returns status ok / unavailable / error plus sources, licence and retrieval time.
   - Photos: Wikimedia Commons only, and only images explicitly linked to the place (OSM `wikimedia_commons` tag, Wikidata image and Commons category, Wikipedia lead image). Never "photos near these coordinates". Author and licence shown.
   - Best time / safety / highlights: sentences quoted word for word from the place's Wikipedia article, labelled "Wikipedia, not official". No rephrasing, nothing invented.
   - Climate: Open-Meteo archive statistics (rain and highs per month, 2021 to 2023 average, wet months >= 200 mm) plus today's sunrise and sunset calculated locally. Labelled as data, not advice. Waterfalls, beaches and viewpoints also get one clearly labelled "general, not about this place" hint.
   - Before you visit: fee, hours, access, wheelchair, lifeguard etc. from OpenStreetMap tags, labelled community.
   - Ratings: Google Places adapter exists but is OFF. It only runs if `GOOGLE_PLACES_API_KEY` is set on the server (needs a Google Cloud billing account). Without it the page says "not available". Never invented. No review summaries are generated; only Google's own quotes would be shown.
   - Client: `components/PlaceIntelligence.tsx`, used at the bottom of `pages/PlaceDetails.tsx` ("Is it worth visiting?"), loads after the basic page. Also touched: `types.ts`, `lib/api.ts`, `server/src/routes/places.ts`, `server/src/config.ts`, `.env.example`.
   - Tests: `intelligence.test.ts` (16, fake providers). Total 87 mocked tests pass. Not tested against the real Wikimedia/Wikipedia/Open-Meteo services, and the client was never compiled.
   - Works from every list (Around me, Plan a route, Surprise me) because they all link to the same place page. Built-in demo places (ids node-99...) have no OSM record, so they show "unavailable".

6. **Surprise Me: Roll Again + category filter (2026-11-02):**
   - Server: `lib/themes.ts` (12 themes detected from OSM tags: landmark, beach, waterfall, viewpoint, hill, park, historic, temple, museum, adventure, cave, other). Places now carry `themes`. Overpass queries gained zip-line and adventure-sport filters; tile cache keys are now `tile:v2:` (old cached tiles are ignored).
   - `services/surprise.ts`: `applyPoolFilters` filters by themes inside the real picking logic (Around me AND along a route), then removes `excludeIds` (places already shown). Errors carry `details.reason`: `no-match` (nothing of that kind within reach) or `exhausted` (all matching places already shown). With a filter on, the "max 2 per category" variety rule is relaxed.
   - `lib/schemas.ts`, `routes/surprise.ts`: accept `themes` and `excludeIds`.
   - Client: `lib/themes.ts`, `components/SurpriseFilter.tsx` (Filter button with count badge, popover on desktop, bottom sheet on phones, Select all / Clear all, chips under the button), `lib/useSurpriseSession.ts` (history, seen ids, back/forward, min 600 ms roll), `SurpriseTrip.tsx` (Roll Again, back/forward arrows, exhausted card with Start over, reveal animation), `Surprise.tsx`, `SurpriseRouteModal.tsx`, `JourneyResults.tsx`, `lib/api.ts` (ApiError.reason), `index.css` (animations, reduced-motion safe).
   - No filter selected = a mix of everything, as before (stated on screen).
   - Tests: `themes.test.ts` (new) plus 4 end-to-end cases in `surprise-e2e.test.ts`. 102 mocked tests pass. Client never compiled.
   - Limits: "Hills and peaks" = natural=peak (real "hill stations" are rarely tagged in OpenStreetMap). "Temples" only includes places of worship that have a Wikidata entry (notable ones). Along a route, filters apply to the best ~75 places found along the road, so a rare kind may return "no match".

## 7. Photos, saved trips, navigation, Place Details (latest update)
- **Place Intelligence removed** (rating, best time, safety, before you visit). Place Details now: photo, name, category, coordinates, favourite, Add to Trip (when opened from a journey), Navigate, Open in Google Maps, location, opening hours, map. No Overpass warning there; opening hours say "Opening hours unavailable" instead of hanging.
- **Photos** (`server/src/services/photos/`): OSM `image` tag (HEAD-checked) -> Wikidata P18/P373 -> independent Wikimedia Commons search (name variants + locality + position) with relevance scoring (name must match, spelling-tolerant: Kapu~Kaup; distance check; maps/logos rejected). Shows author, licence, Commons page. "No images found" vs "temporarily unavailable". Endpoint `GET /api/places/:id/photos`.
- **Saved trips**: new table `SavedTrip` (migration `20261102000000_saved_trips`), API `/api/saved-trips` (POST, GET, GET/:id, PUT/:id edit same trip, PATCH rename, DELETE), owner-only. Stops are stored inside the trip (JSON), so trips never touch favourites. Duplicate saves return the first save. Old `Journey` rows still open (`/journey/:id`) and are listed as "Older saved journey".
- **Saved page**: two tabs, Saved Attractions (open details, Navigate, remove) and Saved Trips (Open Trip, Navigate, Delete with confirmation).
- **Itinerary**: `context/ActiveTripContext.tsx` is the single source of truth. Added stops go to the top of the list with "Added to Trip - Stop n", numbered amber markers on the map, reorder arrows, route/distance/time recalculated (`POST /api/journeys/route`). Saved trips open at `/trip/:id`, fully editable, "Save changes" updates the same trip id. Saved stops stay visible even if a fresh search does not return them.
- **Navigate**: visible button on active journey, saved trip page, Saved Trips cards, Surprise trips. Plain Google Maps URLs; more than 9 stops are split into ordered connected parts (menu explains it).
- **Surprise Me**: Save Trip + Navigate on both modes; modal has no Reserved Break (entered totals are the whole trip, visits counted once).
- Manual steps: `cd server && npx prisma migrate deploy && npx prisma generate`; `cd client && npm install` (adds tsx for tests).

## Things YOU had to do (so you never repeat them)
1. `npm install` in the root, `server` and `client`; create database `detour` in PostgreSQL; `npx prisma migrate deploy` (done).
2. `server/.env`: DATABASE_URL, JWT_SECRET, CONTACT_EMAIL=visheshshetty33@gmail.com, `MAX_ROUTE_KM=1200`. (`SURPRISE_BREAK_MIN` and `GOOGLE_PLACES_API_KEY` are no longer used; the ZIP's `.env` has them removed.) The version in the ZIP is your own and already correct. Do NOT commit it (it is in .gitignore).
3. Overpass: `OVERPASS_URLS` is no longer needed (the built-in list starts with overpass.openstreetmap.fr, the only mirror that worked for you). Leave that line out.
4. Delete `server/src/tests/nearby-overpass.test.ts` (old batching test).
5. Client type fix in `LocationSearch.tsx` line 156: `aria-expanded={Boolean(showList)}` (already in the ZIP).
6. WSL: the IPv4-first fix is now in code; no NODE_OPTIONS needed.
7. NEW: `cd server && npx prisma migrate deploy && npx prisma generate` (adds the SavedTrip table). Also remove `SURPRISE_BREAK_MIN` from your `.env` if you like (ignored now).
8. Database tests (`api.test.ts`): use a THROW-AWAY database, not your real one:
   `createdb detour_test` (or in psql: `CREATE DATABASE detour_test;`), then
   `cd server && DATABASE_URL="postgresql://postgres:RoamDev123@localhost:5432/detour_test?schema=public" npx prisma migrate deploy && DATABASE_URL="postgresql://postgres:RoamDev123@localhost:5432/detour_test?schema=public" npm test`

## Tests (mocked only)
Server: 107 logic tests pass (corridor, detour, overpass, planner, surprise, surprise-e2e, tiles, tilecache, themes, photos, savedTrips). Client: 11 logic tests pass (`client/src/lib/trip.test.ts`, run with `npm test` in client). `api.test.ts` (now includes saved-trip create/edit/ownership/favourite-independence tests) needs DATABASE_URL and was NOT run. NOT run: real tsc, vite build, Prisma generate/migrate, browser UI, real Overpass/Wikimedia.

## Plan a route: what is known
The exact manual failure was never captured. Likely cause (unconfirmed): the old route search sent 200 km `around:polyline` queries with ~20 filters, which public Overpass could not finish in time, so every request timed out. It now uses the same tile search. If it still fails, copy the line starting `All Overpass servers failed` from the server terminal.

## Known limitations
- Real-world speed of the tile search is unproven. Large radii show only notable places.
- Per-tile limit (1500 to 2500 elements) can cut very dense areas.
- Surprise Me visit times are rough estimates.

## Next steps
0. Run the manual workflow in section 7 below.
1. `npm install`, then in `server`: `npx tsc --noEmit`; in `client`: `npx tsc --noEmit && npm run build`. Fix small type errors.
2. Delete `server/src/tests/nearby-overpass.test.ts` if it exists.
3. `npm test --prefix server`, then `npm run check:services --prefix server`.
4. Try Around me at 1, 5, 25 km and a short route (Mangalore to Udupi) before a long one.
