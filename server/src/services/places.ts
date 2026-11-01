// Place details (the nearby search is in nearby.ts).

import { AppError } from '../lib/errors';
import { cacheGet, cacheSet } from '../lib/cache';
import { fetchJson } from '../lib/http';
import { prisma } from '../lib/prisma';
import type { PlaceDTO } from '../types';
import type { CategoryKey } from '../lib/categories';
import { elementToCandidate, fetchElementById, getImageUrl } from './overpass';

// ---------------------------------------------------------------------------------------
// Place details
// ---------------------------------------------------------------------------------------

export interface PlaceDetails extends PlaceDTO {
  address: string | null;
  phone: string | null;
  descriptionSource: 'wikipedia' | 'openstreetmap' | null;
  wikipediaUrl: string | null;
}

interface WikipediaSummary {
  extract?: string;
  thumbnail?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
}

// OpenStreetMap tags look like  wikipedia = "en:Murudeshwar Temple"
async function fetchWikipediaSummary(tag: string | undefined): Promise<WikipediaSummary | null> {
  if (!tag) return null;
  const separator = tag.indexOf(':');
  if (separator < 2) return null;
  const language = tag.slice(0, separator);
  const title = tag.slice(separator + 1).trim().replace(/ /g, '_');
  if (!/^[a-z-]{2,10}$/.test(language) || !title) return null;

  try {
    return await fetchJson<WikipediaSummary>(
      `https://${language}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      { timeoutMs: 8000 }
    );
  } catch {
    return null; // Wikipedia is a nice extra, never a reason to fail
  }
}

function shorten(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSentenceEnd = cut.lastIndexOf('. ');
  return lastSentenceEnd > maxLength * 0.5 ? cut.slice(0, lastSentenceEnd + 1) : `${cut.trimEnd()}…`;
}

export async function getPlaceDetails(id: string): Promise<PlaceDetails> {
  const match = /^(node|way|relation)-(\d+)$/.exec(id);
  if (!match) throw new AppError(400, 'That is not a valid place id.');
  const type = match[1] as 'node' | 'way' | 'relation';
  const osmId = Number(match[2]);

  const cacheKey = `details:${id}`;
  const cached = cacheGet<PlaceDetails>(cacheKey);
  if (cached) return cached;

  let element;
  try {
    element = await fetchElementById(type, osmId);
  } catch (error) {
    // Overpass is down. If someone saved this place we can still show what we stored.
    const saved = await prisma.place.findUnique({ where: { providerId: id } });
    if (saved) {
      return {
        id: saved.providerId,
        name: saved.name,
        category: saved.category as CategoryKey,
        latitude: saved.latitude,
        longitude: saved.longitude,
        description: saved.description,
        rating: saved.rating,
        imageUrl: saved.imageUrl,
        openingHours: null,
        website: null,
        address: null,
        phone: null,
        descriptionSource: saved.description ? 'openstreetmap' : null,
        wikipediaUrl: null,
      };
    }
    throw error;
  }

  const candidate = element ? elementToCandidate(element) : null;
  if (!element || !candidate) throw new AppError(404, 'We could not find that place.');

  const tags = element.tags ?? {};
  const wikipedia = await fetchWikipediaSummary(tags.wikipedia);

  const addressParts = [tags['addr:housename'], tags['addr:street'], tags['addr:city'], tags['addr:postcode']];
  const address = addressParts.filter(Boolean).join(', ') || null;

  const wikipediaText = wikipedia?.extract ? shorten(wikipedia.extract, 700) : null;
  const { score, ...place } = candidate;

  const details: PlaceDetails = {
    ...place,
    description: wikipediaText ?? place.description,
    descriptionSource: wikipediaText ? 'wikipedia' : place.description ? 'openstreetmap' : null,
    imageUrl: place.imageUrl ?? getImageUrl(tags) ?? wikipedia?.thumbnail?.source ?? null,
    address,
    phone: tags.phone ?? tags['contact:phone'] ?? null,
    wikipediaUrl: wikipedia?.content_urls?.desktop?.page ?? null,
  };
  cacheSet(cacheKey, details, 24 * 60 * 60);
  return details;
}
