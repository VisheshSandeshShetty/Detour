// Pure list operations for the active trip (kept free of React so they can be unit-tested).
import type { TripStop } from '../types';

// Add the place at the end, or remove it if it is already there. Never creates duplicates.
export function toggleStop(stops: TripStop[], place: TripStop): TripStop[] {
  return stops.some((s) => s.id === place.id) ? stops.filter((s) => s.id !== place.id) : [...stops, place];
}

export function moveStop(stops: TripStop[], placeId: string, direction: -1 | 1): TripStop[] {
  const index = stops.findIndex((s) => s.id === placeId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= stops.length) return stops;
  const next = [...stops];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
