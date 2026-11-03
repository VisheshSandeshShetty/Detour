// /api/places/*  : nearby search and place details (both public, no login needed)

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { findNearbyPlaces } from '../services/nearby';
import { getCachedOsmTags, getOsmTagsQuickly, getPlaceDetails, parseOsmId } from '../services/places';
import { getPhotos } from '../services/photos';

const router = Router();

const nearbySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().min(0.5, 'Radius must be at least 0.5 km').max(100, 'Radius can be at most 100 km').default(5), // kilometres
});

// Progress of searches that are running, so the page can show "sections searched 3 of 9".
// The browser makes up a random id, sends it with the search and asks for it every second.
const progress = new Map<string, { done: number; total: number; at: number }>();
const PROGRESS_ID = /^[a-zA-Z0-9-]{8,64}$/;

router.get('/progress/:id', (req, res) => {
  const entry = progress.get(String(req.params.id));
  res.json({ data: entry ? { done: entry.done, total: entry.total } : { done: 0, total: 0 } });
});

// GET /api/places/nearby?lat=13.35&lon=74.78&radius=5&rid=<random id>
router.get('/nearby', async (req, res) => {
  const { lat, lon, radius } = nearbySchema.parse(req.query);
  const rid = typeof req.query.rid === 'string' && PROGRESS_ID.test(req.query.rid) ? req.query.rid : null;
  if (rid) {
    // forget old entries so the map cannot grow forever
    for (const [key, value] of progress) if (Date.now() - value.at > 5 * 60 * 1000) progress.delete(key);
  }
  let result;
  try {
    result = await findNearbyPlaces(lat, lon, radius, undefined, rid ? (done, total) => progress.set(rid, { done, total, at: Date.now() }) : undefined);
  } finally {
    if (rid) setTimeout(() => progress.delete(rid), 10000).unref?.();
  }
  res.json({ data: { center: { latitude: lat, longitude: lon }, radiusKm: radius, ...result } });
});

// GET /api/places/node-123456/photos?name=...&lat=..&lon=..&near=Lighthouse,Fort
// Real photographs only. Answers { status: 'ok' | 'none' | 'unavailable', photos, searched }.
const photosLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 800,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { message: 'Too many photo requests. Please wait a few minutes.' } },
});
const photosQuery = z.object({
  name: z.string().trim().min(1).max(200),
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  near: z.string().max(400).optional(),
  light: z.string().optional(),
});

router.get('/:id/photos', photosLimiter, async (req, res) => {
  const id = String(req.params.id);
  parseOsmId(id);
  const q = photosQuery.parse(req.query);
  const light = q.light === '1';
  const tags = light ? getCachedOsmTags(id) : await getOsmTagsQuickly(id);
  const result = await getPhotos({
    id: light ? `${id}:light` : id, // list-card searches are cached separately from the full page search
    name: tags['name:en'] ?? tags.name ?? q.name,
    latitude: q.lat,
    longitude: q.lon,
    tags,
    nearbyNames: q.near ? q.near.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 3) : [],
  });
  res.json({ data: result });
});

// GET /api/places/node-123456
router.get('/:id', async (req, res) => {
  const place = await getPlaceDetails(String(req.params.id));
  res.json({ data: { place } });
});

export default router;
