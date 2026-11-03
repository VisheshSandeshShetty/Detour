// /api/saved-trips/*  : complete saved trips (login required for everything here)
//
//   POST   /       save a trip. Saving the same trip twice returns the first save (alreadySaved: true)
//   GET    /       my saved trips, newest first
//   GET    /:id    one of my trips, complete
//   PATCH  /:id    rename one of my trips
//   DELETE /:id    delete one of my trips
//
// A trip belongs to the user who saved it. Every query filters by userId, so another user's id
// answers "not found" and nobody can view, change or delete someone else's trip.

import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { idParamSchema, renameTripSchema, saveTripSchema } from '../lib/schemas';
import { currentUserId, requireAuth } from '../middleware/auth';
import { defaultTripName, tripFingerprint } from '../services/savedTrips';
import { toTripResponse, tripColumns } from '../services/savedTripMapper';

const router = Router();
router.use(requireAuth);

const MAX_TRIPS_PER_USER = 200;

router.post('/', async (req, res) => {
  const userId = currentUserId(req);
  const input = saveTripSchema.parse(req.body);
  if (input.stops.length === 0 && input.kind !== 'journey') {
    throw new AppError(422, 'This trip has no stops, so there is nothing to save.');
  }
  const fingerprint = tripFingerprint(input);

  const existing = await prisma.savedTrip.findUnique({ where: { userId_fingerprint: { userId, fingerprint } } });
  if (existing) {
    res.status(200).json({ data: { trip: toTripResponse(existing), alreadySaved: true } });
    return;
  }
  if ((await prisma.savedTrip.count({ where: { userId } })) >= MAX_TRIPS_PER_USER) {
    throw new AppError(422, 'You have reached the limit of 200 saved trips. Delete one to save a new trip.');
  }

  const data: Prisma.SavedTripUncheckedCreateInput = {
    userId,
    name: input.name ?? defaultTripName(input),
    kind: input.kind,
    fingerprint,
    ...tripColumns(input),
  };
  try {
    const trip = await prisma.savedTrip.create({ data });
    res.status(201).json({ data: { trip: toTripResponse(trip), alreadySaved: false } });
  } catch (error) {
    // Two clicks arrived at the same moment: the second one hits the unique rule. Return the first.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const trip = await prisma.savedTrip.findUnique({ where: { userId_fingerprint: { userId, fingerprint } } });
      if (trip) {
        res.status(200).json({ data: { trip: toTripResponse(trip), alreadySaved: true } });
        return;
      }
    }
    throw error;
  }
});

router.get('/', async (req, res) => {
  const trips = await prisma.savedTrip.findMany({
    where: { userId: currentUserId(req) },
    orderBy: { createdAt: 'desc' },
  });
  // The list leaves out the long route line; "Open Trip" loads the complete trip
  res.json({ data: { trips: trips.map((trip) => ({ ...toTripResponse(trip), geometry: null })) } });
});

router.get('/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const trip = await prisma.savedTrip.findFirst({ where: { id, userId: currentUserId(req) } });
  if (!trip) throw new AppError(404, 'We could not find that trip.');
  res.json({ data: { trip: toTripResponse(trip) } });
});

// PUT /api/saved-trips/:id  save the edited version of MY trip. Same id, same createdAt, new updatedAt.
// Everything happens in one transaction: either the whole new itinerary is stored, or nothing changes.
router.put('/:id', async (req, res) => {
  const userId = currentUserId(req);
  const { id } = idParamSchema.parse(req.params);
  const input = saveTripSchema.parse(req.body);
  const fingerprint = tripFingerprint(input);

  const trip = await prisma.$transaction(async (tx) => {
    const mine = await tx.savedTrip.findFirst({ where: { id, userId } });
    if (!mine) throw new AppError(404, 'We could not find that trip.');
    // Another of my trips with exactly the same stops would clash with the "no duplicates" rule
    const clash = await tx.savedTrip.findFirst({ where: { userId, fingerprint, NOT: { id } } });
    if (clash) throw new AppError(409, `You already have a saved trip with exactly these stops ("${clash.name}").`);
    return tx.savedTrip.update({
      where: { id },
      data: { name: input.name ?? mine.name, kind: mine.kind, fingerprint, ...tripColumns(input) },
    });
  });
  res.json({ data: { trip: toTripResponse(trip) } });
});

router.patch('/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const { name } = renameTripSchema.parse(req.body);
  const result = await prisma.savedTrip.updateMany({ where: { id, userId: currentUserId(req) }, data: { name } });
  if (result.count === 0) throw new AppError(404, 'We could not find that trip.');
  const trip = await prisma.savedTrip.findFirst({ where: { id, userId: currentUserId(req) } });
  if (!trip) throw new AppError(404, 'We could not find that trip.');
  res.json({ data: { trip: toTripResponse(trip) } });
});

router.delete('/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const result = await prisma.savedTrip.deleteMany({ where: { id, userId: currentUserId(req) } });
  if (result.count === 0) throw new AppError(404, 'We could not find that trip.');
  res.json({ data: { message: 'Trip deleted.' } });
});

export default router;
