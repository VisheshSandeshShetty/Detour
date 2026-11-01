// /api/saved-places/*  : a user's favourite places (login required for everything here)

import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { idParamSchema, placeInputSchema } from '../lib/schemas';
import { currentUserId, requireAuth } from '../middleware/auth';
import { placeRowToDTO, upsertPlace } from '../services/placeStore';

const router = Router();
router.use(requireAuth); // every route below needs a logged-in user

type SavedWithPlace = Prisma.SavedPlaceGetPayload<{ include: { place: true } }>;

function toResponse(saved: SavedWithPlace) {
  return { savedId: saved.id, savedAt: saved.createdAt, place: placeRowToDTO(saved.place) };
}

// Save a place. Saving the same place twice just returns the existing save.
router.post('/', async (req, res) => {
  const userId = currentUserId(req);
  const input = placeInputSchema.parse(req.body);

  const place = await upsertPlace(prisma, input);
  const saved = await prisma.savedPlace.upsert({
    where: { userId_placeId: { userId, placeId: place.id } },
    create: { userId, placeId: place.id },
    update: {},
    include: { place: true },
  });
  res.status(201).json({ data: { saved: toResponse(saved) } });
});

router.get('/', async (req, res) => {
  const saved = await prisma.savedPlace.findMany({
    where: { userId: currentUserId(req) },
    orderBy: { createdAt: 'desc' },
    include: { place: true },
  });
  res.json({ data: { saved: saved.map(toResponse) } });
});

// DELETE /api/saved-places/:id   (id = the savedId from the list above)
router.delete('/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  // "userId" in the filter makes sure you can only delete YOUR OWN saved places
  const result = await prisma.savedPlace.deleteMany({ where: { id, userId: currentUserId(req) } });
  if (result.count === 0) throw new AppError(404, 'We could not find that saved place.');
  res.json({ data: { message: 'Removed from saved places.' } });
});

export default router;
