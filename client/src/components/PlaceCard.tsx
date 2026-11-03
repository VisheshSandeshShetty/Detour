// One place in a results list. Used on Explore, Journey Results and Saved Places.

import { ArrowDown, ArrowUp, Check, ExternalLink, Heart, MapPin, Navigation, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { CATEGORY_INFO } from '../lib/categories';
import { directionsUrl, formatKm, googleMapsUrl } from '../lib/format';
import type { Place } from '../types';
import DetourStats from './DetourStats';

interface PlaceCardProps {
  place: Place;
  selected?: boolean;
  onSelect?: (placeId: string) => void;
  saved: boolean;
  onToggleSave: (place: Place) => void;
  // Journey results only: "add to my trip" button
  inTrip?: boolean;
  tripNumber?: number; // position in the trip (1 = first stop)
  onToggleTrip?: (place: Place) => void;
  // Reorder a selected stop
  onMove?: (direction: -1 | 1) => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  // Saved page: a Navigate button that opens directions to this place
  showNavigate?: boolean;
  // Page to return to from the details page
  fromPath?: string;
}

export function PlaceImage({ place, className = '' }: { place: Place; className?: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const info = CATEGORY_INFO[place.category];
  const Icon = info.icon;

  // A new picture gets a fresh start; a picture that has not appeared after 8 seconds is given up on
  // (the category icon shows instead), so a slow or dead image host never leaves an empty box.
  useEffect(() => {
    setFailed(false);
    setLoaded(false);
    if (!place.imageUrl) return;
    const timer = setTimeout(() => setFailed(true), 8000);
    return () => clearTimeout(timer);
  }, [place.imageUrl]);

  if (place.imageUrl && (!failed || loaded)) {
    return (
      <img
        src={place.imageUrl}
        alt={place.name}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={`object-cover ${className}`}
      />
    );
  }
  // No photo in OpenStreetMap: show the category icon instead of a made-up picture
  return (
    <div
      className={`flex items-center justify-center ${className}`}
      style={{ backgroundColor: `${info.color}1f`, color: info.color }}
      aria-hidden="true"
    >
      <Icon className="h-8 w-8" />
    </div>
  );
}

const PHOTO_CATEGORIES = new Set(['attraction', 'nature', 'historic', 'park']);

// The card picture: the place's own image, else a real photo found once the card is on screen
function CardPhoto({ place }: { place: Place }) {
  const ref = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(place.imageUrl);

  useEffect(() => {
    setUrl(place.imageUrl);
    if (place.imageUrl || !PHOTO_CATEGORIES.has(place.category) || !ref.current) return;
    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        observer.disconnect();
        api.cardPhoto(place).then((found) => { if (!cancelled && found) setUrl(found); }).catch(() => undefined);
      },
      { rootMargin: '200px' }
    );
    observer.observe(ref.current);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place.id]);

  return (
    <div ref={ref} className="shrink-0">
      <PlaceImage place={{ ...place, imageUrl: url }} className="h-24 w-24 rounded-xl" />
    </div>
  );
}

export default function PlaceCard({
  place,
  selected = false,
  onSelect,
  saved,
  onToggleSave,
  inTrip,
  tripNumber,
  onToggleTrip,
  onMove,
  canMoveUp,
  canMoveDown,
  showNavigate,
  fromPath,
}: PlaceCardProps) {
  const info = CATEGORY_INFO[place.category];

  return (
    <article
      id={`card-${place.id}`}
      onClick={() => onSelect?.(place.id)}
      onPointerEnter={() => api.prefetchPhotos(place)}
      data-in-trip={inTrip ? 'true' : 'false'}
      className={`card group flex cursor-pointer gap-3 p-3 transition duration-150 hover:shadow-lift ${
        inTrip ? 'border-amber-500 bg-amber-50/70 ring-1 ring-amber-400/50' : ''
      } ${selected ? 'border-forest-700 ring-2 ring-forest-700/25' : inTrip ? '' : 'hover:border-forest-200'}`}
    >
      <CardPhoto place={place} />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-sm font-bold leading-snug">{place.name}</h3>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={(event) => {
                event.stopPropagation();
                onToggleSave(place);
              }}
              className={`flex h-7 w-7 items-center justify-center rounded-full border transition ${
                saved ? 'border-red-200 bg-red-50 text-red-600' : 'border-line text-muted hover:border-red-200 hover:text-red-600'
              }`}
              aria-label={saved ? 'Remove from saved places' : 'Save place'}
              aria-pressed={saved}
              title={saved ? 'Saved' : 'Save'}
            >
              <Heart className={`h-3.5 w-3.5 ${saved ? 'fill-current' : ''}`} />
            </button>
          </div>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-2">
          {inTrip && (
            <span className="badge bg-amber-600 text-white" data-testid="added-badge">
              <Check className="h-3 w-3" /> Added to Trip{tripNumber ? ` · Stop ${tripNumber}` : ''}
            </span>
          )}
          <span className="badge" style={{ backgroundColor: `${info.color}1f`, color: info.color }}>
            {info.label}
          </span>
        </div>

        <div className="mt-auto pt-2">
          {place.distanceFromRouteKm !== undefined ? (
            <DetourStats place={place} />
          ) : place.distanceKm !== undefined ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <MapPin className="h-3.5 w-3.5" /> {formatKm(place.distanceKm)} away
            </span>
          ) : null}
        </div>

        {onToggleTrip && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              onToggleTrip(place);
            }}
            className={`mt-2 inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition ${
              inTrip ? 'border-amber-600 bg-white text-amber-800 hover:bg-amber-100' : 'border-forest-700 bg-forest-800 text-white hover:bg-forest-900'
            }`}
            aria-label={inTrip ? `Remove ${place.name} from trip` : `Add ${place.name} to trip`}
            data-testid={inTrip ? 'remove-from-trip' : 'add-to-trip'}
          >
            {inTrip ? <><X className="h-3.5 w-3.5" /> Remove from Trip</> : <><Plus className="h-3.5 w-3.5" /> Add to Trip</>}
          </button>
        )}

        {inTrip && onMove && (
          <div className="mt-1.5 flex gap-1.5">
            <button
              onClick={(event) => { event.stopPropagation(); onMove(-1); }}
              disabled={!canMoveUp}
              className="rounded-full border border-line p-1 text-muted hover:border-forest-400 disabled:opacity-30"
              aria-label={`Move ${place.name} earlier in the trip`}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={(event) => { event.stopPropagation(); onMove(1); }}
              disabled={!canMoveDown}
              className="rounded-full border border-line p-1 text-muted hover:border-forest-400 disabled:opacity-30"
              aria-label={`Move ${place.name} later in the trip`}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold">
          <Link
            to={`/places/${place.id}`}
            state={{ place, from: fromPath }}
            onClick={(event) => event.stopPropagation()}
            className="text-forest-700 hover:text-forest-900 hover:underline"
          >
            View details →
          </Link>
          <a
            href={googleMapsUrl(place.name, place.latitude, place.longitude)}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="inline-flex items-center gap-1 text-muted hover:text-forest-800 hover:underline"
            title="Open in Google Maps to see its Google rating and reviews"
          >
            <ExternalLink className="h-3 w-3" /> Google Maps
          </a>
          {showNavigate && (
            <a
              href={directionsUrl(place.latitude, place.longitude)}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-full bg-forest-800 px-2.5 py-0.5 text-white hover:bg-forest-900"
              data-testid="navigate-place"
            >
              <Navigation className="h-3 w-3" /> Navigate
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
