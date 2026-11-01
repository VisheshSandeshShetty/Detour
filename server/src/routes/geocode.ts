// /api/geocode?q=manipal : location autocomplete (public)

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { searchLocations } from '../services/geocode';

const router = Router();

// The browser already waits for the user to stop typing; this is a second safety net
const geocodeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { message: 'Too many searches. Please slow down a little.' } },
});

const querySchema = z.object({
  q: z.string().trim().min(2, 'Type at least 2 characters').max(100),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lon: z.coerce.number().min(-180).max(180).optional(),
});

router.get('/', geocodeLimiter, async (req, res) => {
  const { q, lat, lon } = querySchema.parse(req.query);
  const bias = lat !== undefined && lon !== undefined ? { latitude: lat, longitude: lon } : undefined;
  const results = await searchLocations(q, bias);
  res.json({ data: { results } });
});

export default router;
