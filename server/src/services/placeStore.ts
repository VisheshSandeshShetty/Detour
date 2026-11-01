// Reading and writing the Place table.
// A place is only stored when a user saves it or adds it to a saved journey.

import type { Place, Prisma, PrismaClient } from '@prisma/client';
import type { CategoryKey } from '../lib/categories';
import type { PlaceInput } from '../lib/schemas';
import type { PlaceDTO } from '../types';

// Works with the normal client AND inside a transaction
type Db = PrismaClient | Prisma.TransactionClient;

// Creates the place, or refreshes it if we already stored it.
export function upsertPlace(db: Db, input: PlaceInput): Promise<Place> {
  const data = {
    name: input.name,
    category: input.category,
    latitude: input.latitude,
    longitude: input.longitude,
    description: input.description ?? null,
    rating: input.rating ?? null,
    imageUrl: input.imageUrl ?? null,
  };
  return db.place.upsert({
    where: { providerId: input.id },
    create: { providerId: input.id, ...data },
    update: data,
  });
}

// Database row -> the shape the frontend uses
export function placeRowToDTO(place: Place): PlaceDTO {
  return {
    id: place.providerId,
    name: place.name,
    category: place.category as CategoryKey,
    latitude: place.latitude,
    longitude: place.longitude,
    description: place.description,
    rating: place.rating,
    imageUrl: place.imageUrl,
    openingHours: null,
    website: null,
  };
}
