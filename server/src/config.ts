// Reads settings from environment variables (see .env.example).
// Everything else in the server imports `config` instead of touching process.env directly.

import 'dotenv/config';

function numberFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 && process.env[name] !== undefined ? value : fallback;
}

const jwtSecret = process.env.JWT_SECRET ?? '';
if (jwtSecret.length < 16) {
  throw new Error(
    'JWT_SECRET is missing or too short. Copy server/.env.example to server/.env and set a long random JWT_SECRET.'
  );
}

export const config = {
  port: numberFromEnv('PORT', 4000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  jwtSecret,

  osrmUrl: (process.env.OSRM_URL ?? 'https://router.project-osrm.org').replace(/\/+$/, ''),
  // Tried in order. If one is busy, blocked or down, the next one is used.
  overpassUrls: (
    process.env.OVERPASS_URLS ??
    'https://overpass.openstreetmap.fr/api/interpreter,https://overpass-api.de/api/interpreter,https://overpass.private.coffee/api/interpreter,https://overpass.kumi.systems/api/interpreter'
  )
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean),
  photonUrl: (process.env.PHOTON_URL ?? 'https://photon.komoot.io').replace(/\/+$/, ''),
  // Overpass asks every app to identify itself with a unique User-Agent. Set CONTACT_EMAIL in .env.
  userAgent: process.env.CONTACT_EMAIL
    ? `Detour/1.0 (college project; contact: ${process.env.CONTACT_EMAIL})`
    : 'Detour/1.0 (college project)',

  maxRouteKm: numberFromEnv('MAX_ROUTE_KM', 1200),

  // Surprise Me: minutes reserved for rest, food and fuel on a route trip. NOT sightseeing time.
  // Change the default here (or with SURPRISE_BREAK_MIN in .env). Requests may override it.
  surpriseBreakMin: numberFromEnv('SURPRISE_BREAK_MIN', 90),
  osrmDelayMs: numberFromEnv('OSRM_DELAY_MS', 500),
};
