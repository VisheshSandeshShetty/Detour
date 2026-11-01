// One place in a results list. Used on Explore, Journey Results and Saved Places.

import { Check, ExternalLink, Heart, MapPin, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CATEGORY_INFO } from '../lib/categories';
import { formatKm, googleMapsUrl } from '../lib/format';
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
  onToggleTrip?: (place: Place) => void;
  // Page to return to from the details page
  fromPath?: string;
}

export function PlaceImage({ place, className = '' }: { place: Place; className?: string }) {
  const [failed, setFailed] = useState(false);
  const info = CATEGORY_INFO[place.category];
  const Icon = info.icon;

  if (place.imageUrl && !failed) {
    return (
      <img
        src={place.imageUrl}
        alt={place.name}
        loading="lazy"
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

export default function PlaceCard({
  place,
  selected = false,
  onSelect,
  saved,
  onToggleSave,
  inTrip,
  onToggleTrip,
  fromPath,
}: PlaceCardProps) {
  const info = CATEGORY_INFO[place.category];

  return (
    <article
      id={`card-${place.id}`}
      onClick={() => onSelect?.(place.id)}
      className={`card group flex cursor-pointer gap-3 p-3 transition duration-150 hover:shadow-lift ${
        selected ? 'border-forest-700 ring-2 ring-forest-700/25' : 'hover:border-forest-200'
      }`}
    >
      <PlaceImage place={place} className="h-24 w-24 shrink-0 rounded-xl" />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-sm font-bold leading-snug">{place.name}</h3>
          <div className="flex shrink-0 items-center gap-1">
            {onToggleTrip && (
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleTrip(place);
                }}
                className={`flex h-7 w-7 items-center justify-center rounded-full border transition ${
                  inTrip ? 'border-forest-800 bg-forest-800 text-white' : 'border-line text-muted hover:border-forest-400 hover:text-forest-800'
                }`}
                aria-label={inTrip ? 'Remove from my trip' : 'Add to my trip'}
                title={inTrip ? 'In your trip' : 'Add to my trip'}
              >
                {inTrip ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              </button>
            )}
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
        </div>
      </div>
    </article>
  );
}
