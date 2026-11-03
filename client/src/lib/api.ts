// Every call to the Detour server goes through this file, so the rest of the app never
// has to think about fetch, cookies or error formats.
//
// The server always answers with either  { data: ... }  or  { error: { message } }.

import type {
  GeocodeResult,
  JourneyPlan,
  JourneySummary,
  NamedLocation,
  NearbyResponse,
  Place,
  PlaceDetails,
  SavedItem,
  SavedJourney,
  PhotosResult,
  RouteInfo,
  SaveTripBody,
  SavedTrip,
  SurpriseResult,
  User,
} from '../types';
import type { ThemeKey } from './themes';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
  status: number;
  reason: string | null; // machine-readable cause when the server gives one, e.g. "exhausted"
  constructor(message: string, status: number, reason: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.reason = reason;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'include', // send the login cookie
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error; // the page asked us to cancel, nothing to report
    throw new ApiError('Cannot reach the Detour server. Make sure the backend is running.', 0);
  }

  let json: { data?: T; error?: { message?: string; details?: { reason?: string } } } | null = null;
  try {
    json = await response.json();
  } catch {
    // the server did not send JSON
  }

  if (!response.ok) {
    throw new ApiError(
      json?.error?.message ?? `Something went wrong (error ${response.status}).`,
      response.status,
      typeof json?.error?.details?.reason === 'string' ? json.error.details.reason : null
    );
  }
  return json?.data as T;
}

// What the user sees when something fails
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

// A place as the server expects it when saving
function toPlaceInput(place: Place) {
  return {
    id: place.id,
    name: place.name,
    category: place.category,
    latitude: place.latitude,
    longitude: place.longitude,
    description: place.description,
    rating: place.rating,
    imageUrl: place.imageUrl,
  };
}

// Photo lookups are remembered for this visit, so a photo asked for early (hover, popup) is instant later.
// A failed or 'unavailable' answer is forgotten so the next ask tries again.
type PhotoPlace = Pick<Place, 'id' | 'name' | 'latitude' | 'longitude'>;
const photoCache = new Map<string, Promise<PhotosResult>>();

// Photos for list cards: at most 2 searches at once, remembered for this visit
const cardPhotoCache = new Map<string, Promise<string | null>>();
let cardActive = 0;
const cardQueue: (() => void)[] = [];
function waitForCardSlot(): Promise<void> {
  if (cardActive < 2) {
    cardActive++;
    return Promise.resolve();
  }
  return new Promise((resolve) => cardQueue.push(resolve));
}
function freeCardSlot() {
  const next = cardQueue.shift();
  if (next) next();
  else cardActive--;
}

export const api = {
  // ----- accounts -----
  register: (name: string, email: string, password: string) =>
    request<{ user: User }>('/auth/register', { method: 'POST', body: { name, email, password } }),
  login: (email: string, password: string) =>
    request<{ user: User }>('/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => request<{ message: string }>('/auth/logout', { method: 'POST' }),
  me: () => request<{ user: User }>('/auth/me'),

  // ----- search and places -----
  geocode: (query: string, signal?: AbortSignal) =>
    request<{ results: GeocodeResult[] }>(`/geocode?q=${encodeURIComponent(query)}`, { signal }).then(
      (data) => data.results
    ),
  nearby: (latitude: number, longitude: number, radiusKm: number, signal?: AbortSignal, progressId?: string) =>
    request<NearbyResponse>(
      `/places/nearby?lat=${latitude}&lon=${longitude}&radius=${radiusKm}${progressId ? `&rid=${progressId}` : ''}`,
      { signal }
    ),
  // How many map sections a running Around me search has finished
  nearbyProgress: (progressId: string, signal?: AbortSignal) =>
    request<{ done: number; total: number }>(`/places/progress/${progressId}`, { signal }),
  placeDetails: (id: string, signal?: AbortSignal) =>
    request<{ place: PlaceDetails }>(`/places/${encodeURIComponent(id)}`, { signal }).then((data) => data.place),

  // Real photographs of a place (Wikimedia Commons / OSM / Wikidata). Never generic pictures.
  placePhotos: (place: PhotoPlace): Promise<PhotosResult> => {
    const cached = photoCache.get(place.id);
    if (cached) return cached;
    const promise = request<PhotosResult>(
      `/places/${encodeURIComponent(place.id)}/photos?${new URLSearchParams({ name: place.name, lat: String(place.latitude), lon: String(place.longitude) })}`
    ).then((result) => {
      if (result.status === 'unavailable') photoCache.delete(place.id);
      return result;
    });
    promise.catch(() => photoCache.delete(place.id));
    photoCache.set(place.id, promise);
    return promise;
  },
  // Start the photo search early (e.g. on hover) so Place Details has it ready
  prefetchPhotos: (place: PhotoPlace) => {
    void api.placePhotos(place).catch(() => undefined);
  },
  // First real photo for a list card. Cheap search; returns null when there is none.
  cardPhoto: (place: PhotoPlace) => {
    const cached = cardPhotoCache.get(place.id);
    if (cached) return cached;
    const promise = (async () => {
      await waitForCardSlot();
      try {
        const result = await request<PhotosResult>(
          `/places/${encodeURIComponent(place.id)}/photos?${new URLSearchParams({ name: place.name, lat: String(place.latitude), lon: String(place.longitude), light: '1' })}`
        );
        if (result.status === 'unavailable') throw new Error('unavailable');
        return result.photos[0]?.url ?? null;
      } finally {
        freeCardSlot();
      }
    })();
    promise.catch(() => cardPhotoCache.delete(place.id)); // failures are retried next time
    cardPhotoCache.set(place.id, promise);
    return promise;
  },

  // ----- journeys -----
  planJourney: (origin: NamedLocation, destination: NamedLocation, radiusKm: number, signal?: AbortSignal) =>
    request<JourneyPlan>('/journeys/plan', { method: 'POST', body: { origin, destination, radiusKm }, signal }),
  journeyPlan: (journeyId: number, signal?: AbortSignal) =>
    request<JourneyPlan>(`/journeys/${journeyId}/attractions`, { signal }),
  saveJourney: (plan: JourneyPlan, stops: Place[]) =>
    request<{ journey: SavedJourney }>('/journeys', {
      method: 'POST',
      body: {
        origin: plan.origin,
        destination: plan.destination,
        radiusKm: plan.radiusKm,
        totalDistanceKm: plan.route.distanceKm,
        durationMin: plan.route.durationMin,
        stops: stops.map(toPlaceInput),
      },
    }).then((data) => data.journey),
  listJourneys: () => request<{ journeys: JourneySummary[] }>('/journeys').then((data) => data.journeys),
  getJourney: (journeyId: number, signal?: AbortSignal) =>
    request<{ journey: SavedJourney }>(`/journeys/${journeyId}`, { signal }).then((data) => data.journey),
  deleteJourney: (journeyId: number) => request<{ message: string }>(`/journeys/${journeyId}`, { method: 'DELETE' }),

  // The real driving route through origin, the stops in order, and destination
  routeThrough: (origin: NamedLocation, stops: Place[], destination: NamedLocation, signal?: AbortSignal) =>
    request<RouteInfo>('/journeys/route', {
      method: 'POST',
      body: { origin, destination, stops: stops.map((p) => ({ name: p.name, latitude: p.latitude, longitude: p.longitude })) },
      signal,
    }),

  // ----- saved trips -----
  listTrips: () => request<{ trips: SavedTrip[] }>('/saved-trips').then((d) => d.trips),
  getTrip: (id: number, signal?: AbortSignal) =>
    request<{ trip: SavedTrip }>(`/saved-trips/${id}`, { signal }).then((d) => d.trip),
  saveTrip: (body: SaveTripBody) =>
    request<{ trip: SavedTrip; alreadySaved: boolean }>('/saved-trips', { method: 'POST', body }),
  updateTrip: (id: number, body: SaveTripBody) =>
    request<{ trip: SavedTrip }>(`/saved-trips/${id}`, { method: 'PUT', body }).then((d) => d.trip),
  deleteTrip: (id: number) => request<{ message: string }>(`/saved-trips/${id}`, { method: 'DELETE' }),

  // ----- surprise me -----
  surpriseAround: (
    body: {
      start: NamedLocation;
      tripType: 'roundtrip' | 'oneway';
      timeMin: number | null;
      maxKm: number | null;
      themes?: ThemeKey[];
      excludeIds?: string[];
    },
    signal?: AbortSignal
  ) => request<SurpriseResult>('/surprise/around', { method: 'POST', body, signal }),
  surpriseRoute: (
    body: {
      origin: NamedLocation;
      destination: NamedLocation;
      radiusKm: number;
      totalMin: number | null;
      maxTotalKm: number | null;
      themes?: ThemeKey[];
      excludeIds?: string[];
    },
    signal?: AbortSignal
  ) => request<SurpriseResult>('/surprise/route', { method: 'POST', body, signal }),

  // ----- saved places -----
  savePlace: (place: Place) =>
    request<{ saved: SavedItem }>('/saved-places', { method: 'POST', body: toPlaceInput(place) }).then(
      (data) => data.saved
    ),
  listSaved: () => request<{ saved: SavedItem[] }>('/saved-places').then((data) => data.saved),
  removeSaved: (savedId: number) => request<{ message: string }>(`/saved-places/${savedId}`, { method: 'DELETE' }),
};
