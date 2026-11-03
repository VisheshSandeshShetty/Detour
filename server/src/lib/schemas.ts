// Input validation rules (zod). Every request body or query string is checked against one of
// these before we use it. If the check fails, zod throws and the error handler answers 400.

import { z } from 'zod';
import { CATEGORIES } from './categories';
import { THEME_KEYS } from './themes';

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

// Which kinds of place to pick (empty or missing = anything), and places already shown this session
const surpriseThemes = z.array(z.enum(THEME_KEYS)).max(THEME_KEYS.length).optional();
const surpriseExclude = z.array(z.string().regex(/^(node|way|relation)-\d+$/, 'Invalid place id')).max(500).optional();

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
    themes: surpriseThemes,
    excludeIds: surpriseExclude,
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
    themes: surpriseThemes,
    excludeIds: surpriseExclude,
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

// ---------------- Saved trips ----------------
// A stop inside a saved trip keeps everything the screen needs to show it again.
const tripStopSchema = z
  .object({
    id: z.string().regex(/^(node|way|relation)-\d+$/, 'Invalid place id'),
    name: z.string().trim().min(1).max(200),
    category: z.enum(CATEGORIES),
    latitude,
    longitude,
    description: z.string().max(3000).nullable().optional(),
    imageUrl: z.string().max(1000).nullable().optional(),
    openingHours: z.string().max(1000).nullable().optional(),
    website: z.string().max(1000).nullable().optional(),
    visitMin: z.number().min(0).max(100000).optional(),
    detourDistanceKm: z.number().nullable().optional(),
    detourDurationMin: z.number().nullable().optional(),
    distanceFromRouteKm: z.number().optional(),
    routeKm: z.number().optional(),
    legDistanceKm: z.number().optional(),
    legDurationMin: z.number().optional(),
    themes: z.array(z.string().max(40)).max(20).optional(),
  })
  .strip();

export const saveTripSchema = z.object({
  kind: z.enum(['journey', 'surprise-route', 'surprise-around']),
  name: z.string().trim().min(1).max(120).optional(),
  origin: locationSchema,
  destination: locationSchema,
  radiusKm: z.number().int().min(1).max(100).nullable().optional(),
  totalDistanceKm: z.number().min(0).max(20000),
  totalDurationMin: z.number().min(0).max(200000),
  drivingDistanceKm: z.number().min(0).max(20000).optional(),
  drivingDurationMin: z.number().min(0).max(200000).optional(),
  geometry: z.array(z.tuple([z.number(), z.number()])).max(6000).nullable().optional(),
  stops: z.array(tripStopSchema).max(60),
  settings: z.record(z.unknown()).nullable().optional(),
});

export type SaveTripInput = z.infer<typeof saveTripSchema>;

export const renameTripSchema = z.object({ name: z.string().trim().min(1).max(120) });

export const routeThroughSchema = z.object({
  origin: locationSchema,
  destination: locationSchema,
  stops: z.array(locationSchema.pick({ latitude: true, longitude: true }).extend({ name: z.string().max(200).default('Stop') })).max(60),
});
