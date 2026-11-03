// "/places/:id"  Place Details.
//
// Deliberately simple: photo, name, category, coordinates, favourites, Add to Trip, Navigate,
// Open in Google Maps, location info, opening hours and a map. If the user arrived from a card or map
// popup we already know the basics, so the page appears instantly; the server adds the opening hours.

import {
  ArrowLeft,
  Check,
  Clock,
  ExternalLink,
  Globe,
  Heart,
  MapPin,
  Navigation,
  Phone,
  Plus,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import DetourStats from '../components/DetourStats';
import MapView from '../components/MapView';
import PlacePhotos from '../components/PlacePhotos';
import { Spinner, ErrorBanner } from '../components/ui';
import { useActiveTrip } from '../context/ActiveTripContext';
import { useSavedPlaces } from '../context/SavedPlacesContext';
import { api, isAbort } from '../lib/api';
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
  const activeTrip = useActiveTrip();

  // The route numbers only exist when the user came from a journey
  const fromJourney = state.place && state.place.id === id ? state.place : null;

  const [details, setDetails] = useState<PlaceDetails | null>(null);
  const [settled, setSettled] = useState(false); // the details request is finished (worked or not)
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000); // never wait forever
    setFailed(false);
    setSettled(false);
    setDetails(null);
    api
      .placeDetails(id, controller.signal)
      .then(setDetails)
      .catch((e) => {
        if (controller.signal.aborted && !isAbort(e)) return;
        setFailed(true);
      })
      .finally(() => {
        clearTimeout(timer);
        setSettled(true);
      });
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [id, attempt]);

  // Best information we have right now: full details if loaded, otherwise what the card gave us
  const place: Place | null = details ?? fromJourney;

  function goBack() {
    // resume: true keeps the trip that was being edited
    if (state.from) navigate(state.from, { state: { resume: true } });
    else navigate(-1);
  }

  if (!place) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24">
        {settled && failed ? (
          <div className="space-y-4">
            <ErrorBanner message="This place could not be loaded right now." onRetry={() => setAttempt((n) => n + 1)} />
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
  const canEditTrip = Boolean(state.from) && activeTrip.key === state.from;
  const inTrip = activeTrip.has(place.id);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <button onClick={goBack} className="btn-ghost btn-sm mb-5 -ml-3">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        {/* ----- Left: photo, title, description ----- */}
        <div>
          <div className="card overflow-hidden">
            <PlacePhotos place={place} ready />
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <span className="badge" style={{ backgroundColor: `${info.color}1f`, color: info.color }}>
              <Icon className="h-3.5 w-3.5" /> {info.label}
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">{place.name}</h1>

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
            <a href={directionsUrl(place.latitude, place.longitude)} target="_blank" rel="noreferrer" className="btn-secondary" data-testid="navigate-place">
              <Navigation className="h-4 w-4" /> Navigate
            </a>
          </div>
          {/* Add to Trip works from here when this page was opened from a journey */}
          {canEditTrip && (
            <button
              onClick={() => activeTrip.toggle(state.from as string, place)}
              className={inTrip ? 'btn-secondary w-full border-amber-600 text-amber-800' : 'btn-secondary w-full'}
              aria-pressed={inTrip}
              data-testid={inTrip ? 'remove-from-trip' : 'add-to-trip'}
            >
              {inTrip ? <><Check className="h-4 w-4" /> Added to Trip (Stop {activeTrip.stops.findIndex((s) => s.id === place.id) + 1}) · Remove</> : <><Plus className="h-4 w-4" /> Add to Trip</>}
            </button>
          )}
          <a
            href={googleMapsUrl(place.name, place.latitude, place.longitude)}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary w-full"
          >
            <ExternalLink className="h-4 w-4" /> Open in Google Maps
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
                  {place.openingHours ? place.openingHours.replace(/;\s*/g, '\n') : settled ? 'Opening hours unavailable' : 'Loading…'}
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
