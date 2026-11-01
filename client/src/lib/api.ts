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
  SurpriseResult,
  User,
} from '../types';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
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

  let json: { data?: T; error?: { message?: string } } | null = null;
  try {
    json = await response.json();
  } catch {
    // the server did not send JSON
  }

  if (!response.ok) {
    throw new ApiError(json?.error?.message ?? `Something went wrong (error ${response.status}).`, response.status);
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
  nearby: (latitude: number, longitude: number, radiusKm: number, signal?: AbortSignal) =>
    request<NearbyResponse>(`/places/nearby?lat=${latitude}&lon=${longitude}&radius=${radiusKm}`, { signal }),
  placeDetails: (id: string, signal?: AbortSignal) =>
    request<{ place: PlaceDetails }>(`/places/${encodeURIComponent(id)}`, { signal }).then((data) => data.place),

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

  // ----- surprise me -----
  surpriseSettings: () => request<{ breakMin: number }>('/surprise/settings'),
  surpriseAround: (
    body: { start: NamedLocation; tripType: 'roundtrip' | 'oneway'; timeMin: number | null; maxKm: number | null },
    signal?: AbortSignal
  ) => request<SurpriseResult>('/surprise/around', { method: 'POST', body, signal }),
  surpriseRoute: (
    body: {
      origin: NamedLocation;
      destination: NamedLocation;
      radiusKm: number;
      totalMin: number | null;
      maxTotalKm: number | null;
      breakMin?: number;
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
