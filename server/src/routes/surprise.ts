// /api/surprise/*  : Surprise Me (public, nothing is saved)
//
//   GET  /settings   the reserved-break default, so the app shows the same number as the server uses
//   POST /around     random trip around a starting point
//   POST /route      random stops along a planned route, inside a time/distance budget

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config';
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

router.get('/settings', (_req, res) => {
  res.json({ data: { breakMin: config.surpriseBreakMin } });
});

router.post('/around', surpriseLimiter, async (req, res) => {
  const body = surpriseAroundSchema.parse(req.body);
  const result = await surpriseAround({
    start: body.start,
    tripType: body.tripType,
    timeMin: body.timeMin ?? null,
    maxKm: body.maxKm ?? null,
    breakMin: body.breakMin,
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
    breakMin: body.breakMin ?? config.surpriseBreakMin,
  });
  res.json({ data: result });
});

export default router;
