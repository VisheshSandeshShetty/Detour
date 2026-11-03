// "/saved"  Two separate sections (login required, see ProtectedRoute in App.tsx):
//   Saved Attractions  places the user favourited with the heart
//   Saved Trips        complete itineraries (origin, ordered stops, destination)
// They are independent: saving or deleting a trip never touches favourites, and the other way round.

import { Bookmark, Compass, Loader2, MapPin, Route as RouteIcon, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import CategoryChips from '../components/CategoryChips';
import MapView from '../components/MapView';
import PlaceCard from '../components/PlaceCard';
import { CardSkeletons, EmptyState, ErrorBanner } from '../components/ui';
import { useSavedPlaces } from '../context/SavedPlacesContext';
import NavigateButton from '../components/NavigateButton';
import { useActiveTrip } from '../context/ActiveTripContext';
import { api, errorMessage } from '../lib/api';
import { formatDate, formatDuration, formatKm } from '../lib/format';
import { tripEnds } from '../lib/trip';
import type { CategoryKey, JourneySummary, SavedTrip } from '../types';

function SavedAttractions() {
  const { items, loading, error, isSaved, toggleSave } = useSavedPlaces();
  const [categories, setCategories] = useState<CategoryKey[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const places = useMemo(() => items.map((item) => item.place), [items]);
  const visiblePlaces = useMemo(
    () => places.filter((place) => categories.length === 0 || categories.includes(place.category)),
    [places, categories]
  );
  const counts = useMemo(() => {
    const result: Partial<Record<CategoryKey, number>> = {};
    for (const place of places) result[place.category] = (result[place.category] ?? 0) + 1;
    return result;
  }, [places]);

  useEffect(() => {
    if (selectedId) document.getElementById(`card-${selectedId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId]);

  return (
    <div>
      {error && <div className="mb-4"><ErrorBanner message={error} /></div>}

      {loading ? (
        <CardSkeletons count={3} />
      ) : places.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Bookmark}
            title="Nothing saved yet"
            text="Tap the heart on any place to keep it here."
            action={<Link to="/" className="btn-primary"><Compass className="h-4 w-4" /> Explore places</Link>}
          />
        </div>
      ) : (
        <>
          <div className="mb-4">
            <CategoryChips selected={categories} onChange={setCategories} counts={counts} />
          </div>
          <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
            <div className="order-2 space-y-3 lg:order-1 lg:max-h-[640px] lg:overflow-y-auto lg:pr-1">
              {visiblePlaces.map((place) => (
                <PlaceCard
                  key={place.id}
                  place={place}
                  selected={place.id === selectedId}
                  onSelect={setSelectedId}
                  saved={isSaved(place.id)}
                  onToggleSave={toggleSave}
                  fromPath="/saved"
                  showNavigate
                />
              ))}
            </div>
            <div className="card order-1 h-[320px] overflow-hidden lg:order-2 lg:h-[640px]">
              <div className="isolate h-full">
                <MapView
                  places={visiblePlaces}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  fitKey={`${visiblePlaces.length}-${categories.join(',')}`}
                  fromPath="/saved"
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Saved Trips
// ---------------------------------------------------------------------------------------------

const KIND_LABEL = { journey: 'Planned journey', 'surprise-route': 'Surprise along a route', 'surprise-around': 'Surprise trip' } as const;

function TripCard({ trip, onDelete }: { trip: SavedTrip; onDelete: (trip: SavedTrip) => Promise<void> }) {
  const active = useActiveTrip();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { via, end } = tripEnds(trip.kind, trip.settings, trip.origin, trip.destination, trip.stops);

  return (
    <article className="card space-y-3 p-4" data-testid="trip-card">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-forest-700">{KIND_LABEL[trip.kind]}</p>
        <h3 className="mt-0.5 text-base font-extrabold leading-snug">{trip.name}</h3>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{trip.origin.name} → {trip.kind === 'surprise-around' ? (trip.settings?.tripType === 'oneway' ? trip.destination.name : trip.origin.name) : trip.destination.name}</span>
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <div><dt className="text-xs text-muted">Stops</dt><dd className="font-bold">{trip.stopCount}</dd></div>
        <div><dt className="text-xs text-muted">Distance</dt><dd className="font-bold">{formatKm(trip.totalDistanceKm)}</dd></div>
        <div><dt className="text-xs text-muted">Total time</dt><dd className="font-bold">{formatDuration(trip.totalDurationMin)}</dd></div>
      </dl>
      <p className="text-xs text-muted">Saved {formatDate(trip.createdAt)}{trip.updatedAt !== trip.createdAt && <> · edited {formatDate(trip.updatedAt)}</>}</p>

      {confirming ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm">
          <span className="flex-1 font-semibold text-red-800">Delete this trip? Your favourites are not affected.</span>
          <button className="btn-secondary btn-sm" onClick={() => setConfirming(false)} disabled={deleting}>Cancel</button>
          <button
            className="btn-sm inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 font-bold text-white hover:bg-red-700"
            disabled={deleting}
            data-testid="confirm-delete-trip"
            onClick={async () => {
              setDeleting(true);
              await onDelete(trip);
              setDeleting(false);
            }}
          >
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {/* Open Trip: restores the complete itinerary and map, editable */}
          <Link to={`/trip/${trip.id}`} onClick={() => active.reset('', [])} className="btn-primary btn-sm" data-testid="open-trip">
            <RouteIcon className="h-3.5 w-3.5" /> Open Trip
          </Link>
          <NavigateButton start={trip.origin} stops={via} end={end} className="btn-secondary btn-sm" />
          <button className="btn-ghost btn-sm text-red-700" onClick={() => setConfirming(true)} data-testid="delete-trip">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      )}
    </article>
  );
}

function SavedTrips() {
  const [trips, setTrips] = useState<SavedTrip[] | null>(null);
  const [older, setOlder] = useState<JourneySummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const active = useActiveTrip();

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.listTrips(), api.listJourneys().catch(() => [] as JourneySummary[])])
      .then(([t, j]) => {
        if (cancelled) return;
        setTrips(t);
        setOlder(j);
      })
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  async function deleteTrip(trip: SavedTrip) {
    try {
      await api.deleteTrip(trip.id);
      setTrips((current) => (current ?? []).filter((t) => t.id !== trip.id));
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function deleteOlder(journey: JourneySummary) {
    try {
      await api.deleteJourney(journey.id);
      setOlder((current) => current.filter((j) => j.id !== journey.id));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (!trips && !error) return <CardSkeletons count={2} />;
  return (
    <div>
      {error && <div className="mb-4"><ErrorBanner message={error} /></div>}
      {trips && trips.length === 0 && older.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={RouteIcon}
            title="No saved trips yet"
            text="Plan a journey, add the places you like with Add to Trip, then press Save Trip."
            action={<Link to="/journey" className="btn-primary"><RouteIcon className="h-4 w-4" /> Plan a route</Link>}
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(trips ?? []).map((trip) => <TripCard key={trip.id} trip={trip} onDelete={deleteTrip} />)}
          {older.map((journey) => (
            <article key={`old-${journey.id}`} className="card space-y-3 p-4" data-testid="older-journey-card">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Older saved journey</p>
                <h3 className="mt-0.5 text-base font-extrabold">{journey.originName} → {journey.destinationName}</h3>
              </div>
              <p className="text-sm text-muted">{journey.stopCount} stops · {formatKm(journey.totalDistance)} · {formatDuration(journey.estimatedDuration)}</p>
              <div className="flex gap-2">
                <Link to={`/journey/${journey.id}`} onClick={() => active.reset('', [])} className="btn-primary btn-sm">Open Trip</Link>
                <button className="btn-ghost btn-sm text-red-700" onClick={() => { if (window.confirm('Delete this journey? Your favourites are not affected.')) void deleteOlder(journey); }}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The page: two tabs
// ---------------------------------------------------------------------------------------------

export default function Saved() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'trips' ? 'trips' : 'attractions';
  const tabs = [
    ['attractions', 'Saved Attractions', Bookmark],
    ['trips', 'Saved Trips', RouteIcon],
  ] as const;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-5">
        <h1 className="text-3xl font-extrabold">Saved</h1>
        <p className="mt-1 text-muted">Your favourite places, and the complete trips you have planned.</p>
      </div>
      <div className="mb-6 flex gap-2 border-b border-line" role="tablist" aria-label="Saved sections">
        {tabs.map(([key, label, Icon]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setParams(key === 'trips' ? { tab: 'trips' } : {}, { replace: true })}
            className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-bold transition ${
              tab === key ? 'border-forest-700 text-forest-900' : 'border-transparent text-muted hover:text-forest-800'
            }`}
            data-testid={`tab-${key}`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>
      {tab === 'trips' ? <SavedTrips /> : <SavedAttractions />}
    </div>
  );
}
