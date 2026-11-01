# 🏔️ Detour

### Discover more than just the destination.

Detour is a location-based travel discovery platform that helps you explore interesting places around you, find destinations along your journey, and discover somewhere unexpected.

Whether you're exploring a new city, planning a road trip, or simply looking for something to do, Detour helps you find experiences worth taking a detour for.

---

## ✨ Features

### 📍 Around Me
Explore places near your current location.

- Discover nearby attractions and points of interest.
- Customize your search radius from **0.5 km to 100 km**.
- Explore results on an interactive map.
- Efficient geographic search using tiled requests and caching.

### 🚗 Plan a Route
Make the journey part of the adventure.

- Select your starting point and destination.
- Generate a route between locations.
- Discover interesting places along the way.
- Explore potential stops without straying too far from your route.
- Adjust corridor radius to control how far from the route places can be discovered.

### 🎲 Surprise Me
For when you don't have a destination in mind.

- Discover places through spontaneous recommendations.
- Find somewhere interesting without manually searching for it.
- Explore new possibilities based on location.

---

## 🗺️ How It Works

Detour combines mapping, geocoding, routing, and geographic place discovery to deliver location-aware recommendations.

1. **Locate:** Determine the area or route the user wants to explore.
2. **Discover:** Retrieve relevant places using OpenStreetMap data.
3. **Filter:** Apply geographic distance and search-radius constraints.
4. **Display:** Present discovered places through an interactive map-based interface.

For larger searches, the backend divides geographic areas into smaller tiles. Tile-level caching and controlled concurrency help reduce repeated requests and improve search reliability.

---

## 🛠️ Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Styling | Tailwind CSS |
| Maps | Leaflet, OpenStreetMap |
| Backend | Node.js, Express 5, TypeScript |
| Database | PostgreSQL, Prisma |
| Place Discovery | Overpass API |
| Routing | OSRM |
| Geocoding | Photon |
| Testing | Automated logic tests |

---

## 🏗️ Architecture

Detour follows a client-server architecture.

```text
                 ┌──────────────────────┐
                 │      React Client    │
                 │                      │
                 │  Around Me           │
                 │  Plan a Route        │
                 │  Surprise Me         │
                 │  Interactive Map     │
                 └──────────┬───────────┘
                            │
                       HTTP Requests
                            │
                 ┌──────────▼───────────┐
                 │    Express Server    │
                 │                      │
                 │  API Routes          │
                 │  Search Services     │
                 │  Route Planning      │
                 │  Geographic Filtering│
                 │  Tile Caching        │
                 └──────┬───────┬──────┘
                        │       │
             ┌──────────▼─┐   ┌─▼─────────────┐
             │ PostgreSQL │   │ External APIs │
             │  Prisma    │   │               │
             │            │   │ Overpass      │
             └────────────┘   │ OSRM          │
                              │ Photon        │
                              └───────────────┘
```

---

## 🚀 Getting Started

### Prerequisites

Make sure you have the following installed:

- Node.js and npm
- PostgreSQL
- Git

### 1. Clone the repository

```bash
git clone https://github.com/VisheshSandeshShetty/Detour.git
cd Detour
```

### 2. Install dependencies

Install dependencies in the root, server, and client directories.

```bash
npm install

cd server
npm install

cd ../client
npm install

cd ..
```

### 3. Configure environment variables

Create your backend environment file:

```bash
cp server/.env.example server/.env
```

Update `server/.env` with your local configuration.

At minimum, configure:

- `DATABASE_URL` — PostgreSQL connection string.
- `JWT_SECRET` — A sufficiently long, randomly generated secret.
- `CLIENT_ORIGIN` — Frontend origin, typically `http://localhost:5173`.

Refer to `server/.env.example` for the complete configuration.

**Do not commit your `.env` file or expose your secrets.**

### 4. Start the application

From the project root:

```bash
npm run dev
```

The development servers run at:

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend | http://localhost:4000 |

---

## 🧪 Testing

The backend includes automated logic tests covering key functionality, including:

- Geographic tile generation and search.
- Nearby place discovery.
- Route corridor discovery.
- Detour calculations.
- Journey planning.
- Surprise Me functionality.

Run the backend test suite with:

```bash
npm test --prefix server
```

The project also includes TypeScript type-checking and build validation.

---

## 📁 Project Structure

```text
Detour/
│
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Application pages
│   │   └── ...
│   └── package.json
│
├── server/                 # Express backend
│   ├── src/
│   │   ├── routes/         # API endpoints
│   │   ├── services/       # Core application logic
│   │   ├── tests/          # Automated tests
│   │   └── ...
│   ├── prisma/             # Database schema
│   └── package.json
│
├── PROJECT_PROGRESS.md
├── package.json
└── README.md
```

---

## 🛣️ Roadmap

Potential areas for future development:

- More personalized place recommendations.
- Additional discovery filters and categories.
- Improved route and detour optimization.
- Expanded caching and search performance.
- More detailed destination information.

---

## 🌍 Data & Services

Detour uses open mapping data and external services:

- [OpenStreetMap](https://www.openstreetmap.org/) —