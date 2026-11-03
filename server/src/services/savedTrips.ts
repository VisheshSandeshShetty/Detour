// Saved trips: validation helpers and the shape sent to the app.
// The database calls live in routes/savedTrips.ts; everything here is pure so it can be tested.

import { createHash } from 'node:crypto';
import type { SaveTripInput } from '../lib/schemas';

const r5 = (n: number) => n.toFixed(5);

// Same kind + same start + same end + same ordered stops = the same trip
export function tripFingerprint(input: Pick<SaveTripInput, 'kind' | 'origin' | 'destination' | 'stops'>): string {
  const text = [
    input.kind,
    `${r5(input.origin.latitude)},${r5(input.origin.longitude)}`,
    `${r5(input.destination.latitude)},${r5(input.destination.longitude)}`,
    ...input.stops.map((stop) => stop.id),
  ].join('|');
  return createHash('sha256').update(text).digest('hex').slice(0, 40);
}

export function defaultTripName(input: Pick<SaveTripInput, 'kind' | 'origin' | 'destination'>): string {
  const same = input.origin.name === input.destination.name;
  if (input.kind === 'surprise-around') return `Surprise trip from ${input.origin.name}`;
  if (input.kind === 'surprise-route') return `Surprise: ${input.origin.name} → ${input.destination.name}`;
  return same ? input.origin.name : `${input.origin.name} → ${input.destination.name}`;
}

export interface TripStop {
  id: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  [key: string]: unknown;
}


// A one-way "around me" trip ends AT its last stop, so that stop is the destination, not a waypoint
export function viaStops<T>(kind: string, settings: Record<string, unknown> | null, stops: T[]): T[] {
  return kind === 'surprise-around' && settings?.tripType === 'oneway' && stops.length > 0 ? stops.slice(0, -1) : stops;
}

