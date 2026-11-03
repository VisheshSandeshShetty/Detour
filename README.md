<div align="center">

# 🧭 Detour

### Discover somewhere new. Make the journey worth it.

**Find interesting places around you, discover worthwhile stops along your route, or let Detour surprise you with a trip you hadn't planned.**

[![Latest Release](https://img.shields.io/github/v/release/VisheshSandeshShetty/Detour?display_name=tag&label=latest%20release)](https://github.com/VisheshSandeshShetty/Detour/releases/latest)
[![GitHub](https://img.shields.io/badge/GitHub-VisheshSandeshShetty%2FDetour-181717?logo=github)](https://github.com/VisheshSandeshShetty/Detour)

</div>

---

## The idea

Most navigation apps are built to get you from **A to B**. Detour helps you discover what is worth seeing **between A and B**.

Plan a drive such as *Manipal → Goa*. Detour finds places near the actual driving route and helps you understand the cost of stopping at each one:

| Measure | What it means |
|---|---|
| **Distance from route** | Straight-line distance between the attraction and the route |
| **Extra distance** | Additional road distance required to visit the attraction and rejoin the route |
| **Extra driving time** | Estimated additional time for that detour |

The figures above are concepts, not fixed examples. Detour calculates the values from the route and available routing data.

> **The central idea: corridor-based route discovery.** A place should be near the road you are actually taking—not merely inside a large rectangle around your journey.

---

## ✨ What you can do with Detour

### 🗺️ Explore Around Me

Discover places around your current location or search for another starting point.

- Use browser geolocation or search for a place manually.
- Explore results on an interactive map and in a place list.
- Search across a configurable radius, from **0.5 km to 100 km**.
- Filter and sort results to narrow down what you want to visit.
- Select a place from the list or map and see the corresponding selection reflected in the other view.
- View real place photos when relevant images can be found.

### 🚗 Plan Along a Route

Enter an origin and destination to find attractions along the complete driving route.

- Search for locations with coordinate-based autocomplete.
- Choose a corridor radius of **5, 10, 20 or 30 km**.
- See the route, origin, destination and discovered attractions together.
- Compare distance from the route, extra driving distance and extra driving time.
- Sort and filter the discovered places without repeating the external place search.
- Select attractions and add them to an ordered trip itinerary.
- Recalculate the route when the selected stops or their order changes.
- Open the itinerary in Google Maps for navigation.

### 🎲 Surprise Me

Not sure where to go? Let Detour create a trip.

- Generate a trip around a starting point or current location.
- Choose a round trip or one-way trip.
- Set a time limit, a distance limit, or both.
- Narrow suggestions with interest/theme filters.
- Review the generated stops and route on the map.
- Roll again for a different set of places.
- Save the generated itinerary and return to it later.

### 🛣️ Surprise Me Along This Route

Already know where you're going, but want to make the drive more interesting?

- Generate unexpected stops along an origin-to-destination route.
- Set an overall time and/or distance budget.
- Apply theme filters and exclude places already shown.
- Recheck the resulting multi-stop route against the supplied limits.

### 📌 Saved Places and Saved Trips

Your favourites and your itineraries are different things, so Detour stores them separately.

**Saved Attractions**
- Keep a personal collection of places you want to revisit.
- Remove a saved attraction without affecting your trips.

**Saved Trips**
- Save planned journeys and Surprise Me itineraries.
- Preserve the ordered stops, route geometry, endpoints, trip totals and relevant trip settings.
- Reopen a saved trip with its original itinerary rather than generating a new surprise.
- Edit and save a trip without creating a duplicate entry.
- Rename or delete saved trips.
- Duplicate saves of the same itinerary are detected.

### 📷 Place Photos and Details

Detour aims to show photographs of the actual place—not random category images.

Photo discovery checks available OpenStreetMap image information, linked Wikidata images and Wikimedia Commons results. Candidate photos are checked for relevance before being displayed. Where attribution information is available, it is shown with the photo.

- Relevant photos when available.
- Clear empty/unavailable states when no suitable photo can be found.
- Place information and coordinates.
- Links to open a place or itinerary in Google Maps.

**No fabricated ratings:** OpenStreetMap does not provide a universal ratings dataset, so Detour does not invent ratings.

### 👤 Accounts

- Register, log in and log out.
- Save personal attractions and trips.
- Keep saved data scoped to the authenticated account.

---

## 🧠 How route discovery works

The route-planning pipeline combines routing, geographic search and geometry calculations.

```text
Origin + Destination
        │
        ▼
      OSRM ───────────────► Driving route + route geometry
        │
        ▼
    Overpass API ─────────► Candidate places near the route
        │
        ▼
     Turf.js ─────────────► Distance from each place to the route
        │
        ▼
  Detour calculation ────► Extra road distance + extra driving time
        │
        ▼
  Filter + rank results ─► Attractions distributed along the journey
        │
        ▼
     React + Leaflet ────► Interactive list, map and itinerary
```

### 1. Get the real driving route

The backend asks **OSRM** for a driving route between the selected origin and destination. The route geometry is used as the basis for discovery.

### 2. Find candidate places

The backend queries **Overpass API** for OpenStreetMap places around the route corridor. This is a first-pass geographic search, not the final distance check.

### 3. Measure distance to the road

**Turf.js** measures how far each candidate is from the actual route line. This matters because a winding route can have a large bounding box containing places that are nowhere near the road.

### 4. Estimate the real detour

For each candidate, Detour evaluates road travel to the place and back to the original route:

```text
Extra distance =
  road distance (route point before → attraction)
+ road distance (attraction → route point after)
- road distance (route point before → route point after)
```

This estimates the additional driving distance rather than treating straight-line distance as the detour.

### 5. Present useful results

The application removes duplicates, calculates the relevant route metrics and presents the results across the journey. If a routing service cannot calculate a detour, Detour should show that the value is unavailable rather than inventing a number.

---

## 🧱 Technology

| Layer | Technology | Responsibility |
|---|---|---|
| Frontend | React 18, TypeScript | Application UI and state |
| Build tooling | Vite | Development server and production build |
| Styling | Tailwind CSS | Responsive interface and design system |
| Maps | Leaflet, React Leaflet | Interactive maps, routes and markers |
| Backend | Node.js, Express 5, TypeScript | API and application services |
| Validation | Zod | Request and input validation |
| Database | PostgreSQL | Users, favourites, journeys and saved trips |
| ORM | Prisma | Typed database access and migrations |
| Routing | OSRM | Driving routes, distance and duration |
| Place discovery | OpenStreetMap, Overpass API | Nearby places and route-corridor candidates |
| Geocoding | Photon | Location search and autocomplete |
| Geometry | Turf.js | Geographic distance and route calculations |
| Place imagery | OpenStreetMap tags, Wikidata, Wikimedia Commons | Relevant place-photo discovery |
| Authentication | bcryptjs, JSON Web Tokens, HTTP-only cookies | Account authentication |

### External services

Detour uses public/community services and does not require Google Maps or Google Places API keys.

- **OSRM** — driving routes and road-distance calculations.
- **Overpass API** — OpenStreetMap place data.
- **Photon** — location autocomplete and geocoding.
- **OpenStreetMap** — map data and map tiles.
- **Wikidata / Wikimedia Commons** — place-image discovery where available.
- **Google Maps** — opened through navigation links; it is not used as the application's data API.

Public endpoints have usage limits and no uptime guarantee. They are suitable for development and light use, not an unlimited production workload.

---

## 🗂️ Project structure

```text
Detour/
├── package.json
├── package-lock.json
├── README.md
│
├── client/
│   ├── public/
│   └── src/
│       ├── components/       Reusable UI, maps, cards, filters and navigation
│       ├── context/          Authentication and active-trip state
│       ├── lib/              API client, trip logic, formatting and helpers
│       ├── pages/            Explore, planner, results, details, saved, profile, auth
│       ├── App.tsx
│       └── main.tsx
│
└── server/
    ├── prisma/
    │   ├── migrations/       Database migration history
    │   └── schema.prisma
    └── src/
        ├── lib/              Prisma, caching, HTTP helpers and validation
        ├── middleware/       Authentication and error handling
        ├── routes/           REST API route handlers
        ├── services/         Routing, places, photos, trips and discovery logic
        ├── tests/            Backend automated tests
        ├── app.ts
        └── index.ts
```

---

## 🚀 Getting started

### Prerequisites

Install the following before running the project:

- **Node.js 20 or later**
- **npm**
- **PostgreSQL 14 or later**

### 1. Install dependencies

From the project root:

```bash
npm run install:all
```

This installs the root, backend and frontend dependencies.

### 2. Create the PostgreSQL database

Create a database named `detour`:

```bash
createdb detour
```

Alternatively, using `psql`:

```sql
CREATE DATABASE detour;
```

### 3. Configure environment variables

Copy the example environment file:

```bash
cp server/.env.example server/.env
```

Edit `server/.env` and set at least:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/detour?schema=public"
JWT_SECRET="your-long-random-secret"
```

Generate a secure JWT secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Set `CONTACT_EMAIL` to a real contact email for requests to OpenStreetMap community services.

> **Important:** Never commit `server/.env`. It contains local credentials. Commit `.env.example` only, with placeholders.

### 4. Apply database migrations

From the project root:

```bash
npm run db:deploy
```

Generate the Prisma Client from the server directory:

```bash
cd server
npx prisma generate
cd ..
```

### 5. Start the application

From the project root:

```bash
npm run dev
```

The root development command starts both applications:

| Application | Local address |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:4000 |
| Health check | http://localhost:4000/api/health |

Open **http://localhost:5173** in your browser.

### Run frontend and backend separately

If you prefer separate terminals:

```bash
# Terminal 1 — backend
npm run dev --prefix server
```

```bash
# Terminal 2 — frontend
npm run dev --prefix client
```

---

## 🧪 Build and tests

Run these commands from the project root.

### Production build

```bash
npm run build
```

This generates the Prisma Client, compiles the backend TypeScript and type-checks/builds the frontend with Vite.

### Backend tests

```bash
npm test
```

### Frontend tests

```bash
npm test --prefix client
```

### Type-check each application

```bash
npm run typecheck --prefix server
npm run typecheck --prefix client
```

### Check external services

From the server directory:

```bash
npm run check:services
```

This checks connectivity to the configured routing, place-search and geocoding services.

### Verification snapshot

During the latest local verification recorded for this project:

- **107 backend tests passed.**
- **11 frontend tests passed.**
- **118 tests passed in total.**
- The full production build completed successfully for both backend and frontend.
- Prisma Client generation and schema validation succeeded.
- PostgreSQL migrations were up to date, with no pending migrations.

**Test caveat:** The database-dependent API integration test was skipped in that test run because `DATABASE_URL` was not available to the test process. The database connection and migrations were subsequently verified separately. Run the tests again with a dedicated test database if you want to verify the full account/saved-data API integration path.

---

## ⚙️ Environment variables

Backend configuration is read from `server/.env`. See [`server/.env.example`](server/.env.example).

| Variable | Purpose | Default / notes |
|---|---|---|
| `PORT` | Backend port | `4000` |
| `NODE_ENV` | Runtime environment | `development` |
| `CLIENT_ORIGIN` | Frontend origin for CORS | `http://localhost:5173` |
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `JWT_SECRET` | Secret used to sign authentication tokens | Required; use a long random value |
| `OSRM_URL` | OSRM routing service base URL | Public OSRM demo endpoint |
| `PHOTON_URL` | Photon geocoding service base URL | Public Photon endpoint |
| `OVERPASS_URLS` | Optional comma-separated Overpass endpoint list | Built-in public mirror list if omitted |
| `CONTACT_EMAIL` | Contact identity in the service User-Agent | Recommended |
| `MAX_ROUTE_KM` | Maximum supported route length | `1200` |
| `OSRM_DELAY_MS` | Delay between OSRM request batches | `500` |
| `TILE_CACHE_FILE` | Persistent map-tile cache file | System temporary directory by default |

Optional frontend configuration may be placed in `client/.env` where supported by `client/.env.example`.

---

## 🔌 API overview

All API routes are mounted under `/api`. Successful responses use a `data` property; errors use an `error.message` property.

### Health and authentication

| Method | Endpoint | Authentication | Purpose |
|---|---|---:|---|
| `GET` | `/api/health` | No | API health check |
| `POST` | `/auth/register` | No | Create an account |
| `POST` | `/auth/login` | No | Log in |
| `POST` | `/auth/logout` | No | Clear the login cookie |
| `GET` | `/auth/me` | Yes | Get the current user |

### Location and places

| Method | Endpoint | Authentication | Purpose |
|---|---|---:|---|
| `GET` | `/geocode?q=` | No | Search locations |
| `GET` | `/places/nearby?lat=&lon=&radius=` | No | Find places around coordinates |
| `GET` | `/places/progress/:id` | No | Read nearby-search progress |
| `GET` | `/places/:id` | No | Get place details |
| `GET` | `/places/:id/photos?name=&lat=&lon=` | No | Find relevant place photos |

### Journey planning

| Method | Endpoint | Authentication | Purpose |
|---|---|---:|---|
| `POST` | `/journeys/plan` | No | Discover attractions along a route |
| `POST` | `/journeys/route` | No | Calculate a route through ordered stops |
| `POST` | `/journeys` | Yes | Save a journey to journey history |
| `GET` | `/journeys` | Yes | List journey history |
| `GET` | `/journeys/:id` | Yes | Get one saved journey |
| `GET` | `/journeys/:id/attractions` | Yes | Re-run attraction discovery for a saved journey |
| `DELETE` | `/journeys/:id` | Yes | Delete a saved journey |

### Saved attractions and trips

| Method | Endpoint | Authentication | Purpose |
|---|---|---:|---|
| `POST` | `/saved-places` | Yes | Save an attraction |
| `GET` | `/saved-places` | Yes | List saved attractions |
| `DELETE` | `/saved-places/:id` | Yes | Remove a saved attraction |
| `POST` | `/saved-trips` | Yes | Save a complete trip |
| `GET` | `/saved-trips` | Yes | List saved trips |
| `GET` | `/saved-trips/:id` | Yes | Load a complete saved trip |
| `PUT` | `/saved-trips/:id` | Yes | Update an itinerary in place |
| `PATCH` | `/saved-trips/:id` | Yes | Rename a saved trip |
| `DELETE` | `/saved-trips/:id` | Yes | Delete a saved trip |

### Surprise Me

| Method | Endpoint | Authentication | Purpose |
|---|---|---:|---|
| `POST` | `/surprise/around` | No | Generate a trip around a starting point |
| `POST` | `/surprise/route` | No | Generate stops along a route |

The API validates incoming data on the server. Authentication is enforced on personal-data endpoints; records are queried using the authenticated user ID.

---

## 🔐 Security notes

- Passwords are hashed with **bcryptjs**.
- Authentication uses a signed JSON Web Token stored in an **HTTP-only cookie**.
- Personal saved-data endpoints require authentication.
- Database queries for personal records are scoped to the authenticated user.
- Request payloads are validated with **Zod**.
- Security headers are configured with **Helmet**.
- Authentication and expensive discovery endpoints use rate limits.
- Keep `.env` files and real secrets out of Git.

---

## ⚠️ Data quality and known limitations

Detour depends on public geographic data and community-run services. Keep these constraints in mind:

- **OpenStreetMap coverage varies.** Some places are missing, unnamed or incompletely tagged.
- **Photos are not guaranteed.** If no relevant photo can be verified, the interface should show that no suitable image was found rather than use an unrelated placeholder.
- **Ratings are not supplied by OpenStreetMap.** Detour does not manufacture ratings.
- **Public Overpass, OSRM, Photon and tile services can be slow, rate-limited or temporarily unavailable.**
- **Detour estimates additional driving distance and time.** Actual traffic, road closures, access restrictions and route choices can change the real journey.
- **Surprise Me visit durations are estimates**, not confirmed opening hours or reservation times.
- **Browser geolocation requires permission** and may be unavailable; manual location search is the alternative.
- Public endpoints are intended for reasonable development/light usage. A public demo service is not a production-scale infrastructure guarantee.

---

## 🛠️ Troubleshooting

### The map loads, but places do not appear

Place discovery depends on Overpass API. Public Overpass mirrors can time out or reject requests.

1. From `server`, run:

   ```bash
   npm run check:services
   ```

2. Check the Overpass endpoints configured in `server/.env`.
3. Set `CONTACT_EMAIL` to a real contact email.
4. Restart the backend after changing environment variables.
5. If one public mirror is unavailable, configure another supported Overpass mirror in `OVERPASS_URLS`.

The application can only show places returned by the available source services.

### Prisma cannot connect to PostgreSQL

- Confirm PostgreSQL is running.
- Confirm the `detour` database exists.
- Check the username, password, host, port and database name in `DATABASE_URL`.
- Run the migration command from the project root:

  ```bash
  npm run db:deploy
  ```

### The frontend cannot reach the backend

- Confirm the backend is running on port `4000`.
- Confirm the frontend is running on port `5173`.
- Check `CLIENT_ORIGIN` in `server/.env`.
- Restart the backend after editing environment variables.

### Photos are missing

Photo discovery depends on OpenStreetMap tags, Wikidata and Wikimedia Commons. Some places simply do not have a suitable, verifiable image. A missing photo does not necessarily mean the photo feature is broken.

---

## 🤝 Contributing

Contributions and improvements are welcome.

1. Fork the repository.
2. Create a branch for your change.
3. Make the change and add/update tests where appropriate.
4. Run the backend and frontend tests and the production build.
5. Open a pull request describing the change.

Please do not commit `node_modules`, build output, `.env` files or private credentials.

---

<div align="center">

### Find your route. Discover the detour.

**The best part of a journey might be the place you didn't plan to stop.** 🏔️

</div>
