# Detour

**Discover somewhere new.** Detour finds interesting places around you, and along your whole road trip, without sending you ridiculously out of your way.

Its main idea is **corridor-based route discovery**. Enter *Manipal → Goa* and Detour finds attractions along the entire driving route, then tells you for every place:

```
2.3 km from route      <- straight-line distance from the road
+8.5 km detour         <- extra kilometres you would actually drive
+14 min                <- extra driving time
```

(Those numbers are only an illustration. Real values are calculated for every place.)

---

## Honest status (read this first)

This project was written in an environment with **no access to the npm registry**, so the code could not be installed, compiled, or run as a whole. Here is exactly what has and has not been checked:

| Check | Result |
|---|---|
| Corridor, detour, Overpass-parsing and journey-planner logic | **55 automated logic tests pass** (corridor, detour, Overpass, planner, Surprise Me), using fake local OSRM/Overpass servers and a stand-in for Turf.js |
| Database migration SQL | **Applied successfully** to a real PostgreSQL 16 (all 5 tables, keys and constraints created) |
| Syntax of every `.ts` / `.tsx` file | **Checked, no errors** |
| Surprise Me **frontend** (tab, popup, result list) | Written and syntax-checked only. **Never compiled or seen in a browser** |
| `npm install`, `tsc` type-check, `vite build`, Prisma client generation | **NOT run**. Expect to fix a few small type errors on first compile |
| Real OSRM / Overpass / Photon / OpenStreetMap tiles | **NOT contacted**. Every external call is real code, but unproven against the live services |
| Login, saved places, journey history against a database | **NOT run** (the test exists in `server/src/tests/api.test.ts`, see below) |
| Browser rendering, map interaction, responsive layout | **NOT seen in a browser** |

So: the design and logic are verified, the glue is not. Follow "First run" below and fix whatever the compiler reports.

---

## Features

- **Three main tabs**: *Around me* (`/`), *Plan a route* (`/journey`), *Surprise me* (`/surprise`).
- **Around me** (`/`): hero, geolocation with a manual-search fallback, interactive Leaflet map, category / distance filters, sorting. Cards and map markers highlight each other.
- **Journey Planner** (`/journey`): debounced location autocomplete (real coordinates), swap button, corridor radius of 5 / 10 / 20 / 30 km.
- **Journey Results** (`/journey/:id`): split screen (list left, big map right, bottom sheet on phones). Route, origin and destination markers, attraction markers, synced selection, sorting (4 ways), filtering (category, max extra distance, max extra time, name search). Filters work on downloaded results and never call external APIs again.
- **Surprise me** (`/surprise`): enter time (hours) and/or max distance, round trip or one way, starting from your location or any place. Detour picks a few random places (weighted towards sights, at most 5 stops and 2 per category) and orders them by real driving distance. Shows each stop, estimated visit time, the whole trip on the map, *Shuffle again*, and *Open full trip in Google Maps*.
- **Surprise Me Along This Route** (card at the bottom of the route results): enter total trip hours and/or total km. Example: Mangalore to Bangalore is about 360 km; enter 400 km and Detour picks random stops whose detours keep the whole trip within about 400 km. The final trip is re-checked with a real multi-stop route, and stops are dropped until it fits.
- **Reserved break**: for route trips, 90 minutes is subtracted from your total time for rest, food and fuel. It is shown as a *reserved break*, never as exploration time. Change the default with `SURPRISE_BREAK_MIN`.
- **Place Details** (`/places/:id`): photo (only if OpenStreetMap has one), Wikipedia description when linked, opening hours, website, phone, route numbers, navigation link, save button.
- **Accounts**: register, login, logout (bcrypt hashing, JWT in an httpOnly cookie).
- **Saved places** (`/saved`) and **journey history** (`/profile`). Users can only ever see their own data.

Nothing is fabricated: places come from OpenStreetMap, photos only if tagged, and **ratings were removed from the interface** (OpenStreetMap has none). Every place has an *Open in Google Maps* button instead, where Google's own rating and photos are shown.

## Technology

| Part | Tools |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, React Router, Leaflet + React Leaflet, Lucide icons |
| Backend | Node.js, Express 5, TypeScript, Zod (validation), bcryptjs, jsonwebtoken, helmet, express-rate-limit |
| Database | PostgreSQL + Prisma |
| Services | OSRM (routing), Overpass API (places), Photon (search), Wikipedia (descriptions), OpenStreetMap (tiles), Turf.js (geometry) |

## How it works

```
Browser (React)  --/api-->  Express server  --> OSRM      driving route + travel times
                                            --> Overpass  places near the route
                                            --> Photon    location search
                                            --> Wikipedia place descriptions
                                            --> PostgreSQL (users, saved places, journeys)
```

**Planning a journey** (`server/src/services/journeyPlanner.ts`):

1. **OSRM** returns the real driving route as a GeoJSON line.
2. **Overpass** returns named places within the radius of the route line (a rough first cut).
3. **Turf.js** measures each place's exact shortest distance to the road (`corridor.ts`). A bounding box alone is never used as the corridor, because a winding road has a huge box full of places nowhere near it. Places are checked against small pieces of the route for speed.
4. Duplicates are removed (same OpenStreetMap id, or same name at the same spot).
5. If there are more than 75 places, the best are chosen **from every stretch of the route** (so you do not get 75 places all in the first town).
6. **Detours** (`detour.ts`): for each place we pick a spot on the route just before it and just after it, then:
   `extra distance = road(before → place) + road(place → after) − road(before → after)`
   Using spots on the original route means visiting a place can never change the rest of your journey. One OSRM "table" request answers 25 places at once. If OSRM fails, the place shows **"Detour unavailable"** instead of a guess.

## Folder structure

```
detour/
├── package.json              scripts to run both apps
├── README.md
├── client/                   React app (Vite)
│   ├── src/
│   │   ├── pages/            Explore, JourneyPlanner, JourneyResults, PlaceDetails, Saved, Profile, Auth
│   │   ├── components/       MapView, PlaceCard, LocationSearch, CategoryChips, DetourStats, Navbar ...
│   │   ├── context/          AuthContext, SavedPlacesContext
│   │   └── lib/              api.ts (all server calls), filters.ts, format.ts, categories.ts
│   └── tailwind.config.js    colours, fonts (the design system)
└── server/
    ├── prisma/               schema.prisma + migrations
    └── src/
        ├── routes/           auth, places, geocode, journeys, savedPlaces
        ├── services/         osrm, overpass, corridor, detour, journeyPlanner, places, geocode
        ├── middleware/       auth (login check), errorHandler
        ├── lib/              cache, http, schemas (validation), errors
        └── tests/            55 logic tests + a database API test
```

## First run

You need **Node.js 20+** and **PostgreSQL 14+**.

```bash
# 1. Install everything (root, server and client)
npm run install:all

# 2. Create the database
createdb detour            # or:  psql -U postgres -c "CREATE DATABASE detour;"

# 3. Configure the server
cp server/.env.example server/.env
#    Edit server/.env: set DATABASE_URL (your Postgres user/password)
#    and JWT_SECRET. Generate a secret with:
#    node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 4. Create the tables
cd server
npx prisma migrate deploy      # applies the included migration
npx prisma generate            # creates the typed database client
cd ..

# 5. Start both servers (backend on :4000, frontend on :5173)
npm run dev
```

Open **http://localhost:5173**.

To start them separately:

```bash
npm run dev --prefix server    # backend  -> http://localhost:4000
npm run dev --prefix client    # frontend -> http://localhost:5173
```

> **If `prisma migrate dev` complains about "drift"**: the included migration was written by hand to match `schema.prisma`, not generated by Prisma. Using `migrate deploy` as above avoids the check. If you would rather let Prisma generate its own migration, delete the folder `server/prisma/migrations/20261031000000_init`, then run `npx prisma migrate dev --name init` against an empty database.

### Checking the build

```bash
npm run typecheck --prefix server     # TypeScript check, backend
npm run typecheck --prefix client     # TypeScript check, frontend
npm run build                         # production build of both
npm test                              # backend tests (no database or internet needed)
```

To also run the database test (use a throw-away database, it creates and deletes its own users):

```bash
createdb detour_test
cd server
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/detour_test" npx prisma migrate deploy
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/detour_test" npm test
```

### Production (one server)

```bash
npm run build
NODE_ENV=production npm start --prefix server
```

In production mode the Express server also serves the built React app from `client/dist`, so everything runs on one port.

## Environment variables

All in `server/.env` (see `server/.env.example`). No API keys are needed.

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Long random string used to sign login tokens (**required**, the server refuses to start without it) |
| `PORT` | Server port (default 4000) |
| `CLIENT_ORIGIN` | Frontend address for CORS (default `http://localhost:5173`) |
| `OSRM_URL` | Routing server (default: public OSRM demo server) |
| `OVERPASS_URLS` | Comma-separated Overpass servers, tried in order |
| `PHOTON_URL` | Geocoder (default: public Photon) |
| `CONTACT_EMAIL` | Put your email here. It is sent in the User-Agent, as OpenStreetMap services ask |
| `MAX_ROUTE_KM` | Longest journey allowed (default 1200) |
| `SURPRISE_BREAK_MIN` | Reserved break for Surprise Me along a route, in minutes (default 90) |
| `OSRM_DELAY_MS` | Pause between detour batches (default 500) |

Optional `client/.env`: `VITE_API_URL`, `VITE_TILE_URL` (see `client/.env.example`).

## API

All responses are `{ "data": ... }` on success or `{ "error": { "message": "..." } }` on failure.  
"Login" means the `detour_token` cookie set by register/login.

| Method | Path | Login | What it does |
|---|---|---|---|
| POST | `/api/auth/register` | no | Create account `{name, email, password}` (password 8-72 chars) |
| POST | `/api/auth/login` | no | Log in `{email, password}` |
| POST | `/api/auth/logout` | no | Clear the cookie |
| GET | `/api/auth/me` | yes | Current user |
| GET | `/api/geocode?q=` | no | Location autocomplete (real coordinates) |
| GET | `/api/places/nearby?lat=&lon=&radius=` | no | Places around a point (radius 0.5 to 15 km) |
| GET | `/api/places/:id` | no | Place details, e.g. `node-123456` |
| POST | `/api/journeys/plan` | no | Plan a journey `{origin, destination, radiusKm}`. Nothing is saved |
| GET | `/api/journeys/:id/attractions` | yes | Re-run the plan for one of *your* saved journeys |
| POST | `/api/journeys` | yes | Save a journey with its chosen stops |
| GET | `/api/journeys` | yes | Your journey history |
| GET | `/api/journeys/:id` | yes | One of your journeys with stops |
| DELETE | `/api/journeys/:id` | yes | Delete one of your journeys |
| GET | `/api/surprise/settings` | no | The reserved-break default |
| POST | `/api/surprise/around` | no | Random trip around a point `{start, tripType, timeMin?, maxKm?}` |
| POST | `/api/surprise/route` | no | Random stops along a route `{origin, destination, radiusKm, totalMin?, maxTotalKm?, breakMin?}` |
| POST | `/api/saved-places` | yes | Save a place |
| GET | `/api/saved-places` | yes | Your saved places |
| DELETE | `/api/saved-places/:id` | yes | Remove a saved place (`id` = `savedId`) |

Security notes: the user id always comes from the verified login cookie, never from the request. Other people's journeys and saved places answer "not found". Passwords are hashed with bcrypt (cost 12). Login/register, journey planning and search are rate limited. Input is validated with Zod on the server and checked in the forms.

## External services and their limits

These are free, shared community services. Please be gentle with them.

- **OSRM public demo server** (`router.project-osrm.org`): for light use only, no uptime promise. For heavy use host your own OSRM.
- **Overpass API** (`overpass-api.de`, with a backup server): can be slow or busy. Detour retries on a backup, shows a clear message, and still shows the route if places fail.
- **Photon** (`photon.komoot.io`): fair-use limits. Detour debounces typing (350 ms), needs 3 characters, cancels stale searches, caches answers and rate limits per IP.
- **OpenStreetMap tiles**: the public tile server is for development and light use. For a deployed site use a tile provider (set `VITE_TILE_URL`). Attribution is shown on the map and in the footer.
- Results are cached in memory (routes 1 h, journeys 30 min, nearby 10 min, details 24 h). The cache resets when the server restarts.

## If nothing shows up nearby (Overpass errors)

If *Around me* shows nothing, the places server (Overpass) is probably refusing or ignoring your requests (an HTTP 406 or a timeout). From the `server` folder run:

```bash
npm run check:services
```

It tests Overpass, OSRM and Photon with the same headers the server uses and tells you which one fails. Then:

1. In `server/.env`, delete any old `OVERPASS_URLS` line (the defaults try three servers), and set `CONTACT_EMAIL` to your real email. Overpass servers may block anonymous or generic clients.
2. Restart the server. The startup log prints the Overpass servers and User-Agent in use.
3. Still failing? Try another network (some college Wi-Fi blocks these sites), or point `OVERPASS_URLS` at another public Overpass mirror.

The exact cause of the 406 on your machine could not be confirmed from here.

## Known limitations

- **No ratings.** OpenStreetMap has none and Detour will not invent them, so ratings are not shown. Use the *Google Maps* button on a place. (The database column `rating` still exists but stays empty.)
- **Surprise Me visit times are rough estimates** per category (for example a restaurant is about an hour), not real data. "Around me" trips have no reserved break by default; only route trips do.
- **Surprise Me needs enough places nearby.** In areas with sparse OpenStreetMap data you may get fewer stops, and a clear message if nothing fits.
- **Photos are rare.** Only places that have an `image` or Wikimedia Commons tag in OpenStreetMap (or a linked Wikipedia article) get a photo. Others show a category icon.
- **Place coverage depends on OpenStreetMap.** Some regions have few tagged attractions. Detour looks for named places only.
- **Detours are estimates.** They are real road calculations between points on your route, but they assume you rejoin the route a few kilometres after the place.
- **Long, wide journeys can be slow or time out** on the public Overpass server (for example 700 km with a 30 km corridor). Try a smaller radius.
- **Public OSRM demo server** may rate limit. Affected places show "Detour unavailable" and the page offers a retry.
- Journeys of more than `MAX_ROUTE_KM` (1200 km) are refused.
- A saved journey stores its stops; opening it re-runs the search, so results can differ slightly from the day you saved it.
- Frontend and Prisma generation have not been compiled yet (see "Honest status").

## GitHub setup

```bash
cd detour
git init
git add .
git status        # check that no .env file is listed (it is in .gitignore)
git commit -m "Initial commit: Detour road-trip discovery app"
git branch -M main
git remote add origin https://github.com/<your-username>/detour.git
git push -u origin main
```

Never commit `server/.env`. Only `.env.example` files belong in the repository.
