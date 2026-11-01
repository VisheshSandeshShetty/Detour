// Location search and autocomplete using Photon (a free geocoder built on OpenStreetMap data).
// We call it from the server, so the browser never talks to Photon directly: that lets us cache
// answers, send a proper User-Agent, and rate limit.

import { config } from '../config';
import { AppError } from '../lib/errors';
import { cacheGet, cacheSet } from '../lib/cache';
import { fetchJson, UpstreamError } from '../lib/http';

export interface GeocodeResult {
  id: string;
  name: string; // main line, e.g. "Manipal"
  subtitle: string; // second line, e.g. "Udupi, Karnataka, India"
  label: string; // both together
  latitude: number;
  longitude: number;
}

interface PhotonFeature {
  geometry?: { coordinates?: number[] };
  properties?: {
    osm_id?: number;
    osm_type?: string;
    name?: string;
    street?: string;
    district?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
  };
}

export async function searchLocations(
  query: string,
  bias?: { latitude: number; longitude: number }
): Promise<GeocodeResult[]> {
  const cacheKey = `geocode:${query.toLowerCase()}:${bias ? `${bias.latitude.toFixed(1)},${bias.longitude.toFixed(1)}` : ''}`;
  const cached = cacheGet<GeocodeResult[]>(cacheKey);
  if (cached) return cached;

  let url = `${config.photonUrl}/api/?q=${encodeURIComponent(query)}&limit=7&lang=en`;
  if (bias) url += `&lat=${bias.latitude}&lon=${bias.longitude}`;

  let data: { features?: PhotonFeature[] };
  try {
    data = await fetchJson<{ features?: PhotonFeature[] }>(url, { timeoutMs: 10000 });
  } catch (error) {
    if (error instanceof UpstreamError && error.status === 429) {
      throw new AppError(429, 'Location search is being used too much right now. Wait a few seconds and try again.');
    }
    throw new AppError(502, 'Location search is not responding right now. Please try again in a moment.');
  }

  const results: GeocodeResult[] = [];
  const seen = new Set<string>();
  for (const feature of data.features ?? []) {
    const properties = feature.properties ?? {};
    const coordinates = feature.geometry?.coordinates;
    const name = properties.name ?? properties.street ?? properties.city;
    if (!name || !coordinates || coordinates.length < 2) continue;

    // Build the second line from the broader areas, skipping repeats of the main name
    const parts: string[] = [];
    for (const part of [properties.district, properties.city, properties.county, properties.state, properties.country]) {
      if (part && part !== name && !parts.includes(part)) parts.push(part);
    }
    const subtitle = parts.slice(0, 3).join(', ');
    const label = subtitle ? `${name}, ${subtitle}` : name;
    if (seen.has(label)) continue;
    seen.add(label);

    results.push({
      id: `${properties.osm_type ?? 'x'}-${properties.osm_id ?? label}`,
      name,
      subtitle,
      label,
      latitude: coordinates[1],
      longitude: coordinates[0],
    });
  }

  cacheSet(cacheKey, results, 60 * 60);
  return results;
}
