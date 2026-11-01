// "/places/:id"  Place Details.
//
// If the user arrived from a card or map popup we already know the basics (and, for journeys,
// the detour numbers), so the page appears instantly. Meanwhile we ask the server for the full
// details (opening hours, Wikipedia description ...).

import {
  ArrowLeft,
  Clock,
  ExternalLink,
  Globe,
  Heart,
  ImageOff,
  MapPin,
  Navigation,
  Phone,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import DetourStats from '../components/DetourStats';
import MapView from '../components/MapView';
import { PlaceImage } from '../components/PlaceCard';
import { Spinner, ErrorBanner } from '../components/ui';
import { useSavedPlaces } from '../context/SavedPlacesContext';
import { api, errorMessage, isAbort } from '../lib/api';
import { CATEGORY_INFO } from '../lib/categories';
import { directionsUrl, googleMapsUrl, openStreetMapUrl } from '../lib/format';
import type { Place, PlaceDetails } from '../types';

interface LinkState {
  place?: Place;
  from?: string;
}

export default function PlaceDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { isSaved, toggleSave } = useSavedPlaces();
  const state = (location.state as LinkState | null) ?? {};

  // The route numbers only exist when the user came from a journey
  const fromJourney = state.place && state.place.id === id ? state.place : null;

  const [details, setDetails] = useState<PlaceDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setError(null);
    setDetails(null);
    api
      .placeDetails(id, controller.signal)
      .then(setDetails)
      .catch((e) => {
        if (!isAbort(e)) setError(errorMessage(e));
      });
    return () => controller.abort();
  }, [id, attempt]);

  // Best information we have right now: full details if loaded, otherwise what the card gave us
  const place: Place | null = details ?? fromJourney;
  const detailsLoaded = details !== null;

  function goBack() {
    if (state.from) navigate(state.from);
    else navigate(-1);
  }

  if (!place) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24">
        {error ? (
          <div className="space-y-4">
            <ErrorBanner message={error} onRetry={() => setAttempt((n) => n + 1)} />
            <Link to="/" className="btn-secondary">Back to Explore</Link>
          </div>
        ) : (
          <Spinner label="Loading place..." />
        )}
      </div>
    );
  }

  const info = CATEGORY_INFO[place.category];
  const Icon = info.icon;
  // Route numbers: from the full details if present, otherwise from the card we came from
  const routeSource: Place = { ...place, ...(fromJourney ?? {}) };
  const saved = isSaved(place.id);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <button onClick={goBack} className="btn-ghost btn-sm mb-5 -ml-3">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        {/* ----- Left: photo, title, description ----- */}
        <div>
          <div className="card overflow-hidden">
            {place.imageUrl ? (
              <PlaceImage place={place} className="h-64 w-full sm:h-80" />
            ) : (
              <div className="flex h-48 flex-col items-center justify-center gap-2 sm:h-60" style={{ backgroundColor: `${info.color}1f`, color: info.color }}>
                <Icon className="h-12 w-12" />
                <span className="flex items-center gap-1.5 text-xs font-semibold opacity-80">
                  <ImageOff className="h-3.5 w-3.5" /> No photo available on OpenStreetMap
                </span>
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <span className="badge" style={{ backgroundColor: `${info.color}1f`, color: info.color }}>
              <Icon className="h-3.5 w-3.5" /> {info.label}
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">{place.name}</h1>

          <div className="mt-5 text-[15px] leading-relaxed">
            {!detailsLoaded && !error && <Spinner label="Loading details..." className="justify-start" />}
            {error && !detailsLoaded && <ErrorBanner tone="warning" message={error} onRetry={() => setAttempt((n) => n + 1)} />}
            {detailsLoaded && (
              <>
                {details.description ? (
                  <>
                    <p>{details.description}</p>
                    <p className="mt-2 text-xs text-muted">
                      {details.descriptionSource === 'wikipedia' ? (
                        <>
                          From Wikipedia
                          {details.wikipediaUrl && (
                            <> · <a className="underline" href={details.wikipediaUrl} target="_blank" rel="noreferrer">read more</a></>
                          )}
                        </>
                      ) : (
                        'From OpenStreetMap'
                      )}
                    </p>
                  </>
                ) : (
                  <p className="text-muted">No description is available for this place on OpenStreetMap.</p>
                )}
              </>
            )}
          </div>
        </div>

        {/* ----- Right: actions, route numbers, facts, map ----- */}
        <div className="space-y-5">
          <div className="flex gap-3">
            <button
              onClick={() => toggleSave(place)}
              className={saved ? 'btn-secondary flex-1 border-red-200 bg-red-50 text-red-700' : 'btn-primary flex-1'}
              aria-pressed={saved}
            >
              <Heart className={`h-4 w-4 ${saved ? 'fill-current' : ''}`} />
              {saved ? 'Saved to favourites' : 'Save to favourites'}
            </button>
            <a href={directionsUrl(place.latitude, place.longitude)} target="_blank" rel="noreferrer" className="btn-secondary">
              <Navigation className="h-4 w-4" /> Navigate
            </a>
          </div>
          <a
            href={googleMapsUrl(place.name, place.latitude, place.longitude)}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary w-full"
          >
            <ExternalLink className="h-4 w-4" /> Open in Google Maps (Google rating and reviews)
          </a>

          {routeSource.distanceFromRouteKm !== undefined && (
            <div className="card p-5">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">On your journey</h2>
              <DetourStats place={routeSource} size="lg" />
              <p className="mt-3 text-xs text-muted">
                "From route" is the straight-line distance to the road. The detour is the extra driving it takes to visit and rejoin the route.
              </p>
            </div>
          )}

          <div className="card divide-y divide-line">
            <div className="flex gap-3 p-4">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-forest-700" />
              <div className="min-w-0 text-sm">
                <p className="font-semibold">Location</p>
                {details?.address && <p className="text-muted">{details.address}</p>}
                <p className="text-muted">{place.latitude.toFixed(5)}, {place.longitude.toFixed(5)}</p>
                <a href={openStreetMapUrl(place.latitude, place.longitude)} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-forest-700 hover:underline">
                  View on OpenStreetMap <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            <div className="flex gap-3 p-4">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-forest-700" />
              <div className="text-sm">
                <p className="font-semibold">Opening hours</p>
                <p className="whitespace-pre-line text-muted">
                  {place.openingHours ? place.openingHours.replace(/;\s*/g, '\n') : detailsLoaded ? 'Not available' : 'Loading...'}
                </p>
              </div>
            </div>

            {place.website && (
              <div className="flex gap-3 p-4">
                <Globe className="mt-0.5 h-4 w-4 shrink-0 text-forest-700" />
                <div className="min-w-0 text-sm">
                  <p className="font-semibold">Website</p>
                  <a href={place.website} target="_blank" rel="noreferrer" className="block truncate text-forest-700 hover:underline">
                    {place.website.replace(/^https?:\/\//, '')}
                  </a>
                </div>
              </div>
            )}

            {details?.phone && (
              <div className="flex gap-3 p-4">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-forest-700" />
                <div className="text-sm">
                  <p className="font-semibold">Phone</p>
                  <a href={`tel:${details.phone}`} className="text-forest-700 hover:underline">{details.phone}</a>
                </div>
              </div>
            )}
          </div>

          <div className="card h-64 overflow-hidden">
            <div className="isolate h-full">
              <MapView places={[place]} selectedId={null} onSelect={() => undefined} center={[place.latitude, place.longitude]} fitKey={place.id} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
