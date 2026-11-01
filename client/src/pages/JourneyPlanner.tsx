// "/journey"  Journey Planner: choose where from, where to, and how wide the corridor is.
// Submitting opens the results page, which does the actual planning.

import { ArrowLeftRight, Clock, MapPin, Navigation, Route } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import LocationSearch from '../components/LocationSearch';
import { ErrorBanner } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { formatDate, formatDuration, formatKm } from '../lib/format';
import type { JourneySummary, NamedLocation } from '../types';

const RADIUS_CHOICES = [5, 10, 20, 30];

// The results page can send the user back here to tweak a journey
interface PrefillState {
  origin?: NamedLocation;
  destination?: NamedLocation;
  radiusKm?: number;
}

export default function JourneyPlanner() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const prefill = (location.state as PrefillState | null) ?? {};

  const [fromText, setFromText] = useState(prefill.origin?.name ?? '');
  const [fromLocation, setFromLocation] = useState<NamedLocation | null>(prefill.origin ?? null);
  const [toText, setToText] = useState(prefill.destination?.name ?? '');
  const [toLocation, setToLocation] = useState<NamedLocation | null>(prefill.destination ?? null);
  const [radiusKm, setRadiusKm] = useState(prefill.radiusKm ?? 10);
  const [errors, setErrors] = useState<{ from?: string; to?: string }>({});
  const [recent, setRecent] = useState<JourneySummary[]>([]);

  // Journey history for logged-in users
  useEffect(() => {
    if (!user) {
      setRecent([]);
      return;
    }
    api.listJourneys().then((journeys) => setRecent(journeys.slice(0, 4))).catch(() => setRecent([]));
  }, [user]);

  function swap() {
    setFromText(toText);
    setFromLocation(toLocation);
    setToText(fromText);
    setToLocation(fromLocation);
    setErrors({});
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    // Validate: both places must be real suggestions (so we have coordinates) and different
    const newErrors: { from?: string; to?: string } = {};
    if (!fromLocation) {
      newErrors.from = fromText.trim()
        ? 'Pick a place from the suggestions so Detour knows where it is.'
        : 'Enter where you are starting from.';
    }
    if (!toLocation) {
      newErrors.to = toText.trim()
        ? 'Pick a place from the suggestions so Detour knows where it is.'
        : 'Enter your destination.';
    }
    if (
      fromLocation &&
      toLocation &&
      Math.abs(fromLocation.latitude - toLocation.latitude) < 0.005 &&
      Math.abs(fromLocation.longitude - toLocation.longitude) < 0.005
    ) {
      newErrors.to = 'The destination is the same as the starting point.';
    }
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0 || !fromLocation || !toLocation) return;

    // The details travel in the URL, so the results page can be refreshed or shared
    const params = new URLSearchParams({
      from: fromLocation.name,
      fromLat: String(fromLocation.latitude),
      fromLon: String(fromLocation.longitude),
      to: toLocation.name,
      toLat: String(toLocation.latitude),
      toLon: String(toLocation.longitude),
      radius: String(radiusKm),
    });
    navigate(`/journey/new?${params.toString()}`);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 md:py-14">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,520px)_1fr] lg:items-start">
        <div>
          <span className="badge mb-4">
            <Route className="h-3.5 w-3.5" /> Journey Planner
          </span>
          <h1 className="text-3xl font-extrabold sm:text-4xl">Where are you headed?</h1>
          <p className="mt-3 text-muted">
            Detour finds interesting places along the whole route, and tells you how much extra driving each one costs.
          </p>

          <form onSubmit={handleSubmit} noValidate className="card mt-8 space-y-5 p-5 sm:p-6">
            <div className="relative space-y-4">
              <LocationSearch
                label="From"
                placeholder="e.g. Mangalore"
                text={fromText}
                onTextChange={setFromText}
                location={fromLocation}
                onLocationChange={setFromLocation}
                allowCurrentLocation
                invalid={!!errors.from}
              />
              {errors.from && <p className="-mt-2 text-xs text-red-600">{errors.from}</p>}

              <button
                type="button"
                onClick={swap}
                className="absolute right-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-white text-forest-800 shadow-card transition hover:bg-forest-50"
                aria-label="Swap origin and destination"
                title="Swap"
              >
                <ArrowLeftRight className="h-4 w-4 rotate-90" />
              </button>

              <LocationSearch
                label="To"
                placeholder="e.g. Mumbai"
                text={toText}
                onTextChange={setToText}
                location={toLocation}
                onLocationChange={setToLocation}
                icon={<Navigation className="h-4 w-4" />}
                invalid={!!errors.to}
              />
              {errors.to && <p className="-mt-2 text-xs text-red-600">{errors.to}</p>}
            </div>

            <fieldset>
              <legend className="label">Corridor radius</legend>
              <div className="grid grid-cols-4 gap-2">
                {RADIUS_CHOICES.map((km) => (
                  <button
                    key={km}
                    type="button"
                    onClick={() => setRadiusKm(km)}
                    aria-pressed={radiusKm === km}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                      radiusKm === km
                        ? 'border-forest-800 bg-forest-800 text-white'
                        : 'border-line bg-white text-ink hover:border-forest-300'
                    }`}
                  >
                    {km} km
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">
                How far from the road Detour looks for places. A wider corridor finds more, but some will need a longer detour.
              </p>
            </fieldset>

            <button type="submit" className="btn-primary w-full py-3">
              <Route className="h-4 w-4" /> Plan Journey
            </button>
          </form>
        </div>

        <aside className="space-y-6 lg:pt-14">
          <div className="card p-5 sm:p-6">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">How Detour reads a journey</h2>
            <ol className="mt-4 space-y-4 text-sm">
              {[
                ['Real driving route', 'We ask OSRM for the actual road route between your two places.'],
                ['A corridor around it', 'Places are kept only if their shortest distance to the road is inside your radius.'],
                ['The true cost of a stop', 'For each place we work out the extra kilometres and minutes you would drive to visit it.'],
              ].map(([title, text], index) => (
                <li key={title} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-forest-800 text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <div>
                    <p className="font-bold">{title}</p>
                    <p className="text-muted">{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {user && recent.length > 0 && (
            <div className="card p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Your recent journeys</h2>
                <Link to="/profile" className="text-xs font-semibold text-forest-700 hover:underline">
                  See all
                </Link>
              </div>
              <ul className="mt-3 divide-y divide-line">
                {recent.map((journey) => (
                  <li key={journey.id}>
                    <Link to={`/journey/${journey.id}`} className="flex items-center justify-between gap-3 py-3 hover:text-forest-800">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold">
                          {journey.originName} → {journey.destinationName}
                        </span>
                        <span className="mt-0.5 flex items-center gap-3 text-xs text-muted">
                          <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{formatKm(journey.totalDistance)}</span>
                          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{formatDuration(journey.estimatedDuration)}</span>
                          <span>{formatDate(journey.createdAt)}</span>
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {errors.from === undefined && errors.to === undefined ? null : (
            <ErrorBanner tone="warning" message="Choose both places from the suggestion lists, then press Plan Journey." />
          )}
        </aside>
      </div>
    </div>
  );
}
