// Shows a Surprise Me result as a list: summary numbers, then the numbered stops.
// Used by the Surprise tab and by the along-a-route view, so both look the same.

import { Clock, ExternalLink, Pause, Route, Shuffle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CATEGORY_INFO } from '../lib/categories';
import { formatDuration, formatKm, googleMapsTripUrl, googleMapsUrl } from '../lib/format';
import type { SurpriseResult, SurpriseStop } from '../types';
import { ErrorBanner } from './ui';

interface SurpriseTripProps {
  result: SurpriseResult;
  selectedId: string | null;
  onSelect: (placeId: string) => void;
  onShuffle: () => void;
  shuffling: boolean;
  fromPath: string;
}

function StopCard({ stop, selected, onSelect, fromPath }: { stop: SurpriseStop; selected: boolean; onSelect: () => void; fromPath: string }) {
  const info = CATEGORY_INFO[stop.category];
  const Icon = info.icon;
  return (
    <li
      id={`card-${stop.id}`}
      className={`card flex gap-3 p-3 transition ${selected ? 'ring-2 ring-forest-400' : ''}`}
    >
      <button
        onClick={onSelect}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forest-800 text-sm font-extrabold text-white"
        aria-label={`Show stop ${stop.stopNumber} on the map`}
      >
        {stop.stopNumber}
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold leading-tight">{stop.name}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
          <Icon className="h-3.5 w-3.5" style={{ color: info.color }} /> {info.label}
        </p>
        <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
          {stop.legDistanceKm !== undefined && stop.legDurationMin !== undefined && (
            <span>
              Drive here: {formatKm(stop.legDistanceKm)} · {formatDuration(stop.legDurationMin)}
            </span>
          )}
          {stop.detourDistanceKm != null && stop.detourDurationMin != null && (
            <span>
              Detour: +{formatKm(stop.detourDistanceKm)} · +{formatDuration(stop.detourDurationMin)}
            </span>
          )}
          <span>Estimated visit time: ~{formatDuration(stop.visitMin)}</span>
        </p>
        <div className="mt-2 flex gap-2">
          <Link to={`/places/${stop.id}`} state={{ place: stop, from: fromPath }} className="btn-secondary btn-sm">
            Details
          </Link>
          <a
            href={googleMapsUrl(stop.name, stop.latitude, stop.longitude)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary btn-sm"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Google Maps
          </a>
        </div>
      </div>
    </li>
  );
}

export default function SurpriseTrip({ result, selectedId, onSelect, onShuffle, shuffling, fromPath }: SurpriseTripProps) {
  const { summary, stops } = result;
  const end = result.destination ?? result.start;
  // A one-way "around me" trip ends at its last stop, so that stop is the destination, not a waypoint
  const endsAtLastStop = result.tripType === 'oneway' && stops.length > 0;
  const tripUrl = endsAtLastStop
    ? googleMapsTripUrl(result.start, stops.slice(0, -1), stops[stops.length - 1])
    : googleMapsTripUrl(result.start, stops, end);

  return (
    <div className="space-y-3">
      <div className="card space-y-2 p-4">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-forest-800">Your surprise trip</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <div>
            <dt className="text-xs text-muted">Driving</dt>
            <dd className="font-bold">
              {formatKm(summary.drivingKm)} · {formatDuration(summary.drivingMin)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Estimated time at places</dt>
            <dd className="font-bold">~{formatDuration(summary.visitMin)}</dd>
          </div>
          {summary.breakMin > 0 && (
            <div className="col-span-2">
              <dt className="flex items-center gap-1 text-xs text-muted">
                <Pause className="h-3 w-3" /> Reserved break (rest, food, fuel — not exploration time)
              </dt>
              <dd className="font-bold">{formatDuration(summary.breakMin)}</dd>
            </div>
          )}
          <div className="col-span-2 border-t border-line pt-1.5">
            <dt className="flex items-center gap-1 text-xs text-muted">
              <Clock className="h-3 w-3" /> Total trip time
            </dt>
            <dd className="font-bold">{formatDuration(summary.totalMin)}</dd>
          </div>
          {summary.directKm !== undefined && summary.directMin !== undefined && (
            <div className="col-span-2 text-xs text-muted">
              <Route className="mr-1 inline h-3 w-3" />
              Without surprises: {formatKm(summary.directKm)} · {formatDuration(summary.directMin)}
            </div>
          )}
        </dl>
        <p className="text-xs text-muted">Visit times are rough estimates per type of place, not exact.</p>
      </div>

      {result.warnings.map((warning) => (
        <ErrorBanner key={warning} tone="warning" message={warning} />
      ))}

      <ol className="space-y-2.5">
        {stops.map((stop) => (
          <StopCard
            key={stop.id}
            stop={stop}
            selected={stop.id === selectedId}
            onSelect={() => onSelect(stop.id)}
            fromPath={fromPath}
          />
        ))}
      </ol>

      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={onShuffle} disabled={shuffling}>
          <Shuffle className="h-4 w-4" /> {shuffling ? 'Shuffling…' : 'Shuffle again'}
        </button>
        <a href={tripUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary">
          <ExternalLink className="h-4 w-4" /> Open full trip in Google Maps
        </a>
      </div>
    </div>
  );
}
