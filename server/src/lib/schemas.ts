// Input validation rules (zod). Every request body or query string is checked against one of
// these before we use it. If the check fails, zod throws and the error handler answers 400.

import { z } from 'zod';
import { CATEGORIES } from './categories';

export const RADIUS_OPTIONS = [5, 10, 20, 30];

const latitude = z.number({ invalid_type_error: 'Latitude must be a number' }).min(-90).max(90);
const longitude = z.number({ invalid_type_error: 'Longitude must be a number' }).min(-180).max(180);

export const locationSchema = z.object({
  name: z.string().trim().min(1, 'Location name is required').max(200),
  latitude,
  longitude,
});

export const radiusSchema = z
  .number({ invalid_type_error: 'Corridor radius must be a number' })
  .refine((value) => RADIUS_OPTIONS.includes(value), {
    message: `Corridor radius must be one of ${RADIUS_OPTIONS.join(', ')} km`,
  });

export const planSchema = z.object({
  origin: locationSchema,
  destination: locationSchema,
  radiusKm: radiusSchema,
});

// ---------------- Surprise Me ----------------
// Time is in minutes, distance in km. null/missing means "no limit of that kind".
const surpriseTime = z
  .number({ invalid_type_error: 'Time must be a number' })
  .min(15, 'Time must be at least 15 minutes')
  .max(24 * 60, 'Time can be at most 24 hours')
  .nullable()
  .optional();

const surpriseBreak = z.number().min(0, 'Break cannot be negative').max(240, 'Break can be at most 4 hours').optional();

export const surpriseAroundSchema = z
  .object({
    start: locationSchema,
    tripType: z.enum(['roundtrip', 'oneway']),
    timeMin: surpriseTime,
    maxKm: z
      .number({ invalid_type_error: 'Distance must be a number' })
      .min(2, 'Distance must be at least 2 km')
      .max(200, 'For more than 200 km use Plan a route')
      .nullable()
      .optional(),
    breakMin: surpriseBreak,
  })
  .refine((data) => data.timeMin != null || data.maxKm != null, {
    message: 'Enter a time, a distance, or both.',
  });

export const surpriseRouteSchema = z
  .object({
    origin: locationSchema,
    destination: locationSchema,
    radiusKm: radiusSchema,
    totalMin: surpriseTime,
    maxTotalKm: z
      .number({ invalid_type_error: 'Distance must be a number' })
      .min(2, 'Distance must be at least 2 km')
      .max(5000, 'Distance is too large')
      .nullable()
      .optional(),
    breakMin: surpriseBreak,
  })
  .refine((data) => data.totalMin != null || data.maxTotalKm != null, {
    message: 'Enter a time, a distance, or both.',
  });

// A place sent by the frontend when saving it or adding it to a journey
export const placeInputSchema = z.object({
  id: z.string().regex(/^(node|way|relation)-\d+$/, 'Invalid place id'),
  name: z.string().trim().min(1).max(200),
  category: z.enum(CATEGORIES),
  latitude,
  longitude,
  description: z.string().max(3000).nullable().optional(),
  rating: z.number().min(0).max(5).nullable().optional(),
  imageUrl: z.string().url().max(1000).nullable().optional(),
});

export type PlaceInput = z.infer<typeof placeInputSchema>;

export const saveJourneySchema = z.object({
  origin: locationSchema,
  destination: locationSchema,
  radiusKm: radiusSchema,
  totalDistanceKm: z.number().positive().max(10000),
  durationMin: z.number().positive().max(100000),
  stops: z.array(placeInputSchema).max(30).default([]),
});

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive('Invalid id'),
});
