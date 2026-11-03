// /api/surprise/*  : Surprise Me (public, nothing is saved)
//
//   POST /around     random trip around a starting point
//   POST /route      random stops along a planned route, inside a time/distance budget

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { surpriseAroundSchema, surpriseRouteSchema } from '../lib/schemas';
import { surpriseAround, surpriseRoute } from '../services/surprise';

const router = Router();

// Each request calls OSRM and Overpass for us, so limit it: 60 per 15 minutes per IP
const surpriseLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { message: 'You have used Surprise Me a lot. Please wait a few minutes and try again.' } },
});

router.post('/around', surpriseLimiter, async (req, res) => {
  const body = surpriseAroundSchema.parse(req.body);
  const result = await surpriseAround({
    start: body.start,
    tripType: body.tripType,
    timeMin: body.timeMin ?? null,
    maxKm: body.maxKm ?? null,
    themes: body.themes,
    excludeIds: body.excludeIds,
  });
  res.json({ data: result });
});

router.post('/route', surpriseLimiter, async (req, res) => {
  const body = surpriseRouteSchema.parse(req.body);
  const result = await surpriseRoute({
    origin: body.origin,
    destination: body.destination,
    radiusKm: body.radiusKm,
    maxTotalKm: body.maxTotalKm ?? null,
    totalMin: body.totalMin ?? null,
    themes: body.themes,
    excludeIds: body.excludeIds,
  });
  res.json({ data: result });
});

export default router;
