// The three journey numbers, shown on cards, in map popups and on the details page:
//
//   2.3 km from route      <- straight-line distance to the road
//   +8.5 km detour         <- extra kilometres you actually drive
//   +14 min                <- extra driving time
//
// If the server could not calculate the detour we say so. We never invent numbers.

import { Clock, Route, Split } from 'lucide-react';
import { formatExtraTime, formatKm } from '../lib/format';
import type { Place } from '../types';

export default function DetourStats({ place, size = 'sm' }: { place: Place; size?: 'sm' | 'lg' }) {
  if (place.distanceFromRouteKm === undefined) return null;

  const hasDetour = place.detourDistanceKm != null && place.detourDurationMin != null;
  const text = size === 'lg' ? 'text-sm' : 'text-xs';

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${text} text-muted`}>
      <span className="inline-flex items-center gap-1" title="Straight-line distance from the route">
        <Route className="h-3.5 w-3.5" /> {formatKm(place.distanceFromRouteKm)} from route
      </span>
      {hasDetour ? (
        <>
          <span className="inline-flex items-center gap-1 font-semibold text-forest-800" title="Extra driving distance">
            <Split className="h-3.5 w-3.5" /> +{formatKm(place.detourDistanceKm as number)} detour
          </span>
          <span className="inline-flex items-center gap-1 font-semibold text-forest-800" title="Extra driving time">
            <Clock className="h-3.5 w-3.5" /> {formatExtraTime(place.detourDurationMin as number)}
          </span>
        </>
      ) : (
        <span className="inline-flex items-center gap-1 font-medium text-amber-700">
          <Split className="h-3.5 w-3.5" /> Detour unavailable
        </span>
      )}
    </div>
  );
}
