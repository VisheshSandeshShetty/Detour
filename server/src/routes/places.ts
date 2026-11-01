// /api/places/*  : nearby search and place details (both public, no login needed)

import { Router } from 'express';
import { z } from 'zod';
import { findNearbyPlaces } from '../services/nearby';
import { getPlaceDetails } from '../services/places';

const router = Router();

const nearbySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().min(0.5, 'Radius must be at least 0.5 km').max(100, 'Radius can be at most 100 km').default(5), // kilometres
});

// GET /api/places/nearby?lat=13.35&lon=74.78&radius=5
router.get('/nearby', async (req, res) => {
  const { lat, lon, radius } = nearbySchema.parse(req.query);
  const result = await findNearbyPlaces(lat, lon, radius);
  res.json({ data: { center: { latitude: lat, longitude: lon }, radiusKm: radius, ...result } });
});

// GET /api/places/node-123456
router.get('/:id', async (req, res) => {
  const place = await getPlaceDetails(String(req.params.id));
  res.json({ data: { place } });
});

export default router;
