// Place details (the nearby search is in nearby.ts).

import { AppError } from '../lib/errors';
import { cacheGet, cacheSet } from '../lib/cache';
import { prisma } from '../lib/prisma';
import type { PlaceDTO } from '../types';
import type { CategoryKey } from '../lib/categories';
import { elementToCandidate, fetchElementById } from './overpass';

// ---------------------------------------------------------------------------------------
// Place details
// ---------------------------------------------------------------------------------------

export interface PlaceDetails extends PlaceDTO {
  address: string | null;
  phone: string | null;
  descriptionSource: 'wikipedia' | 'openstreetmap' | null;
  wikipediaUrl: string | null;
}

// One OpenStreetMap lookup per place, shared by Place Details and the photo search.
// Requests that arrive while it is running wait for the same answer (no duplicate Overpass calls),
// and the answer is cached for a day.
type OsmElement = NonNullable<Awaited<ReturnType<typeof fetchElementById>>>;
const inFlight = new Map<string, Promise<OsmElement>>();

export function parseOsmId(id: string): { type: 'node' | 'way' | 'relation'; osmId: number } {
  const match = /^(node|way|relation)-(\d+)$/.exec(id);
  if (!match) throw new AppError(400, 'That is not a valid place id.');
  return { type: match[1] as 'node' | 'way' | 'relation', osmId: Number(match[2]) };
}

export async function getOsmElement(id: string): Promise<OsmElement> {
  const { type, osmId } = parseOsmId(id);
  const cacheKey = `osm-element:${id}`;
  const cached = cacheGet<OsmElement>(cacheKey);
  if (cached) return cached;
  let pending = inFlight.get(id);
  if (!pending) {
    pending = fetchElementById(type, osmId)
      .then((element) => {
        if (!element) throw new AppError(404, 'We could not find that place.');
        cacheSet(cacheKey, element, 24 * 60 * 60);
        return element;
      })
      .finally(() => inFlight.delete(id));
    inFlight.set(id, pending);
  }
  return pending;
}

// Tags only if we can get them quickly; photo search must never wait long for Overpass
export async function getOsmTagsQuickly(id: string, waitMs = 1200): Promise<Record<string, string>> {
  try {
    const element = await Promise.race([
      getOsmElement(id),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('slow')), waitMs).unref?.()),
    ]);
    return element.tags ?? {};
  } catch {
    return {};
  }
}

// Tags only if we already have them in memory (never starts a new places-service lookup)
export function getCachedOsmTags(id: string): Record<string, string> {
  return cacheGet<OsmElement>(`osm-element:${id}`)?.tags ?? {};
}

export async function getPlaceDetails(id: string): Promise<PlaceDetails> {
  parseOsmId(id);
  const cacheKey = `details:${id}`;
  const cached = cacheGet<PlaceDetails>(cacheKey);
  if (cached) return cached;

  let element;
  try {
    element = await getOsmElement(id);
  } catch (error) {
    // The places service is busy. If someone saved this place we can still show what we stored.
    const saved = await prisma.place.findUnique({ where: { providerId: id } });
    if (saved) {
      return {
        id: saved.providerId,
        name: saved.name,
        category: saved.category as CategoryKey,
        latitude: saved.latitude,
        longitude: saved.longitude,
        description: null,
        rating: null,
        imageUrl: null,
        openingHours: null,
        website: null,
        address: null,
        phone: null,
        descriptionSource: null,
        wikipediaUrl: null,
      };
    }
    throw error;
  }

  const candidate = elementToCandidate(element);
  if (!candidate) throw new AppError(404, 'We could not find that place.');
  const tags = element.tags ?? {};
  const addressParts = [tags['addr:housename'], tags['addr:street'], tags['addr:suburb'], tags['addr:city'], tags['addr:postcode']];
  const { score, ...place } = candidate;
  void score;

  const details: PlaceDetails = {
    ...place,
    description: null,
    descriptionSource: null,
    imageUrl: null, // photos come from /photos, which checks them properly
    address: addressParts.filter(Boolean).join(', ') || null,
    phone: tags.phone ?? tags['contact:phone'] ?? null,
    wikipediaUrl: null,
  };
  cacheSet(cacheKey, details, 24 * 60 * 60);
  return details;
}
