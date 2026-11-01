// /api/journeys/*
//
//   POST   /plan              plan a journey (public, nothing is saved)
//   GET    /:id/attractions   re-run the plan for one of MY saved journeys
//   POST   /                  save a journey (login required)
//   GET    /                  my saved journeys (journey history)
//   GET    /:id               one of my saved journeys, with its stops
//   DELETE /:id               delete one of my saved journeys

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { idParamSchema, planSchema, saveJourneySchema } from '../lib/schemas';
import { currentUserId, requireAuth } from '../middleware/auth';
import { planJourney } from '../services/journeyPlanner';
import { placeRowToDTO, upsertPlace } from '../services/placeStore';

const router = Router();

// Planning calls OSRM and Overpass for us, so limit it: 40 plans per 15 minutes per IP
const planLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { message: 'You have planned a lot of journeys. Please wait a few minutes and try again.' } },
});

// Finds a journey, but ONLY if it belongs to the logged-in user.
// If it belongs to someone else we answer "not found", so nobody can probe other users' ids.
async function findMyJourney(userId: number, journeyId: number) {
  const journey = await prisma.journey.findFirst({
    where: { id: journeyId, userId },
    include: { stops: { include: { place: true }, orderBy: { stopOrder: 'asc' } } },
  });
  if (!journey) throw new AppError(404, 'We could not find that journey.');
  return journey;
}

router.post('/plan', planLimiter, async (req, res) => {
  const { origin, destination, radiusKm } = planSchema.parse(req.body);
  const plan = await planJourney({ origin, destination, radiusKm });
  res.json({ data: plan });
});

router.get('/:id/attractions', requireAuth, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const journey = await findMyJourney(currentUserId(req), id);

  const plan = await planJourney({
    origin: { name: journey.originName, latitude: journey.originLatitude, longitude: journey.originLongitude },
    destination: {
      name: journey.destinationName,
      latitude: journey.destinationLatitude,
      longitude: journey.destinationLongitude,
    },
    radiusKm: journey.corridorRadius,
  });
  res.json({ data: plan });
});

router.post('/', requireAuth, async (req, res) => {
  const userId = currentUserId(req);
  const input = saveJourneySchema.parse(req.body);

  // The same place twice would break the unique rule, so keep the first of each
  const uniqueStops = input.stops.filter((stop, index) => input.stops.findIndex((s) => s.id === stop.id) === index);

  // A transaction means "all or nothing": if saving a stop fails, the journey is not saved either
  const journeyId = await prisma.$transaction(async (tx) => {
    const journey = await tx.journey.create({
      data: {
        userId,
        originName: input.origin.name,
        destinationName: input.destination.name,
        originLatitude: input.origin.latitude,
        originLongitude: input.origin.longitude,
        destinationLatitude: input.destination.latitude,
        destinationLongitude: input.destination.longitude,
        corridorRadius: input.radiusKm,
        totalDistance: input.totalDistanceKm,
        estimatedDuration: input.durationMin,
      },
    });

    for (let i = 0; i < uniqueStops.length; i++) {
      const place = await upsertPlace(tx, uniqueStops[i]);
      await tx.journeyStop.create({ data: { journeyId: journey.id, placeId: place.id, stopOrder: i + 1 } });
    }
    return journey.id;
  });

  const saved = await findMyJourney(userId, journeyId);
  res.status(201).json({ data: { journey: toJourneyResponse(saved) } });
});

router.get('/', requireAuth, async (req, res) => {
  const journeys = await prisma.journey.findMany({
    where: { userId: currentUserId(req) },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { stops: true } } },
  });
  res.json({
    data: {
      journeys: journeys.map((journey) => ({
        id: journey.id,
        originName: journey.originName,
        destinationName: journey.destinationName,
        corridorRadius: journey.corridorRadius,
        totalDistance: journey.totalDistance,
        estimatedDuration: journey.estimatedDuration,
        createdAt: journey.createdAt,
        stopCount: journey._count.stops,
      })),
    },
  });
});

router.get('/:id', requireAuth, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const journey = await findMyJourney(currentUserId(req), id);
  res.json({ data: { journey: toJourneyResponse(journey) } });
});

router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  // deleteMany with userId in the filter = "delete only if it is mine"
  const result = await prisma.journey.deleteMany({ where: { id, userId: currentUserId(req) } });
  if (result.count === 0) throw new AppError(404, 'We could not find that journey.');
  res.json({ data: { message: 'Journey deleted.' } });
});

type JourneyWithStops = Awaited<ReturnType<typeof findMyJourney>>;

function toJourneyResponse(journey: JourneyWithStops) {
  return {
    id: journey.id,
    origin: { name: journey.originName, latitude: journey.originLatitude, longitude: journey.originLongitude },
    destination: {
      name: journey.destinationName,
      latitude: journey.destinationLatitude,
      longitude: journey.destinationLongitude,
    },
    radiusKm: journey.corridorRadius,
    totalDistanceKm: journey.totalDistance,
    durationMin: journey.estimatedDuration,
    createdAt: journey.createdAt,
    stops: journey.stops.map((stop) => ({ stopOrder: stop.stopOrder, place: placeRowToDTO(stop.place) })),
  };
}

export default router;
