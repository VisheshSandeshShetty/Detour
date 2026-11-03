// Database <-> API mapping for saved trips (needs the Prisma client).
import { Prisma, type SavedTrip } from '@prisma/client';
import { buildNavigation } from '../lib/googleMaps';
import type { SaveTripInput } from '../lib/schemas';
import { viaStops, type TripStop } from './savedTrips';

// Turns a validated request body into database columns (used by both create and update)
export function tripColumns(input: SaveTripInput) {
  return {
    originName: input.origin.name,
    originLatitude: input.origin.latitude,
    originLongitude: input.origin.longitude,
    destinationName: input.destination.name,
    destinationLatitude: input.destination.latitude,
    destinationLongitude: input.destination.longitude,
    corridorRadius: input.radiusKm ?? null,
    totalDistanceKm: input.totalDistanceKm,
    totalDurationMin: input.totalDurationMin,
    drivingDistanceKm: input.drivingDistanceKm ?? input.totalDistanceKm,
    drivingDurationMin: input.drivingDurationMin ?? input.totalDurationMin,
    stops: input.stops as Prisma.InputJsonValue,
    geometry: input.geometry ?? Prisma.JsonNull,
    settings: (input.settings ?? Prisma.JsonNull) as Prisma.InputJsonValue,
  };
}

export function toTripResponse(trip: SavedTrip) {
  const stops = (Array.isArray(trip.stops) ? trip.stops : []) as unknown as TripStop[];
  const origin = { name: trip.originName, latitude: trip.originLatitude, longitude: trip.originLongitude };
  const destination = { name: trip.destinationName, latitude: trip.destinationLatitude, longitude: trip.destinationLongitude };
  return {
    id: trip.id,
    name: trip.name,
    kind: trip.kind as 'journey' | 'surprise-route' | 'surprise-around',
    origin,
    destination,
    radiusKm: trip.corridorRadius,
    totalDistanceKm: trip.totalDistanceKm,
    totalDurationMin: trip.totalDurationMin,
    drivingDistanceKm: trip.drivingDistanceKm,
    drivingDurationMin: trip.drivingDurationMin,
    geometry: (trip.geometry as number[][] | null) ?? null,
    stops,
    settings: (trip.settings as Record<string, unknown> | null) ?? null,
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt,
    stopCount: stops.length,
    navigation: buildNavigation(origin, viaStops(trip.kind, trip.settings as Record<string, unknown> | null, stops), destination),
  };
}
