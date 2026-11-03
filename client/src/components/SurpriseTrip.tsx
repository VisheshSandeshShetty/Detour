// Shows a Surprise Me result as a list: summary numbers, then the numbered stops.
// Used by the Surprise tab and by the along-a-route view, so both look the same.

import { BookmarkCheck, Bookmark, ChevronLeft, ChevronRight, Clock, Dices, ExternalLink, Loader2, RotateCcw, Route } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CATEGORY_INFO } from '../lib/categories';
import { formatDuration, formatKm, googleMapsUrl } from '../lib/format';
import { tripEnds } from '../lib/trip';
import type { Failure } from '../lib/useSurpriseSession';
import type { SurpriseResult, SurpriseStop } from '../types';
import NavigateButton from './NavigateButton';
import { ErrorBanner } from './ui';

interface SurpriseTripProps {
  result: SurpriseResult;
  selectedId: string | null;
  onSelect: (placeId: string) => void;
  onRoll: () => void; // Roll Again: a different recommendation, same filters
  rolling: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  failure: Failure | null;
  onStartOver: () => void; // forget what was shown and roll from the full list again
  rollKey: number; // changes with every new recommendation so the reveal animation replays
  fromPath: string;
  // Saving this exact trip. savedTripId is set once it has been saved.
  onSave?: () => void;
  saving?: boolean;
  savedTripId?: number | null;
  saveError?: string | null;
}

function StopCard({ stop, selected, onSelect, fromPath, delayMs }: { stop: SurpriseStop; selected: boolean; onSelect: () => void; fromPath: string; delayMs: number }) {
  const info = CATEGORY_INFO[stop.category];
  const Icon = info.icon;
  return (
    <li
      id={`card-${stop.id}`}
      className={`card detour-reveal flex gap-3 p-3 transition ${selected ? 'ring-2 ring-forest-400' : ''}`}
      style={{ animationDelay: `${delayMs}ms` }}
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

export default function SurpriseTrip({ result, selectedId, onSelect, onRoll, rolling, canGoBack, canGoForward, onBack, onForward, failure, onStartOver, rollKey, fromPath, onSave, saving, savedTripId, saveError }: SurpriseTripProps) {
  const { summary, stops } = result;
  const { via, end } = tripEnds(
    result.mode === 'route' ? 'surprise-route' : 'surprise-around',
    { tripType: result.tripType },
    result.start,
    result.destination ?? result.start,
    stops
  );

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

      {failure && failure.reason === 'exhausted' && (
        <div className="card space-y-2 border-forest-200 bg-forest-50 p-4">
          <p className="text-sm font-bold">That&rsquo;s everything!</p>
          <p className="text-sm text-muted">{failure.message}</p>
          <button className="btn-primary btn-sm" onClick={onStartOver}>
            <RotateCcw className="h-3.5 w-3.5" /> Start over
          </button>
        </div>
      )}
      {failure && failure.reason !== 'exhausted' && <ErrorBanner message={failure.message} />}

      {/* key={rollKey}: a new recommendation replays the reveal animation */}
      <ol key={rollKey} className={`space-y-2.5 ${rolling ? 'detour-fade-out' : ''}`} aria-busy={rolling}>
        {stops.map((stop, i) => (
          <StopCard
            key={stop.id}
            stop={stop}
            selected={stop.id === selectedId}
            onSelect={() => onSelect(stop.id)}
            fromPath={fromPath}
            delayMs={i * 110}
          />
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-secondary px-2.5" onClick={onBack} disabled={!canGoBack || rolling} aria-label="Previous recommendation" title="Previous recommendation">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button className="btn-primary flex-1" onClick={onRoll} disabled={rolling}>
          <Dices className={`h-4 w-4 ${rolling ? 'detour-rolling' : ''}`} /> {rolling ? 'Rolling…' : 'Roll Again'}
        </button>
        <button className="btn-secondary px-2.5" onClick={onForward} disabled={!canGoForward || rolling} aria-label="Next recommendation" title="Next recommendation">
          <ChevronRight className="h-4 w-4" />
        </button>
        <div className="flex w-full gap-2">
          <NavigateButton start={result.start} stops={via} end={end} label="Navigate" className="btn-primary flex-1 justify-center" />
          {onSave && (
            savedTripId ? (
              <Link to={`/trip/${savedTripId}`} className="btn-secondary flex-1 justify-center" data-testid="open-saved-trip">
                <BookmarkCheck className="h-4 w-4" /> Saved · Open Trip
              </Link>
            ) : (
              <button className="btn-secondary flex-1 justify-center" onClick={onSave} disabled={saving} data-testid="save-trip">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bookmark className="h-4 w-4" />} Save Trip
              </button>
            )
          )}
        </div>
        {saveError && <div className="w-full"><ErrorBanner message={saveError} /></div>}
      </div>
      <p className="text-xs text-muted">Roll Again keeps your filters and skips places you have already seen.</p>
    </div>
  );
}
