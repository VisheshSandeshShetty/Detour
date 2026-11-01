// "/"  Nearby Explorer: the landing page.
// Hero on top, then a map + list of interesting places around the user.

import { Compass, LocateFixed, MapPin, Navigation, Route, SearchX, Split, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import CategoryChips from '../components/CategoryChips';
import LocationSearch from '../components/LocationSearch';
import MapView from '../components/MapView';
import PlaceCard from '../components/PlaceCard';
import { CardSkeletons, EmptyState, ErrorBanner } from '../components/ui';
import { useSavedPlaces } from '../context/SavedPlacesContext';
import { api, errorMessage, isAbort } from '../lib/api';
import { filterNearby } from '../lib/filters';
import type { CategoryKey, NamedLocation, Place } from '../types';

type GeoStatus = 'idle' | 'locating' | 'denied' | 'unavailable' | 'ready';
type LoadStatus = 'idle' | 'loading' | 'error' | 'ready';

interface SearchCenter {
  latitude: number;
  longitude: number;
  label: string;
  isUser: boolean; // true = real GPS position, false = a place the user searched for
}

const RADIUS_OPTIONS = [1, 5, 10, 25, 50, 100];
const MIN_RADIUS_KM = 0.5;
const MAX_RADIUS_KM = 100;

export default function Explore() {
  const { isSaved, toggleSave } = useSavedPlaces();
  const sectionRef = useRef<HTMLElement>(null);

  // Where are we looking?
  const [geoStatus, setGeoStatus] = useState<GeoStatus>('idle');
  const [center, setCenter] = useState<SearchCenter | null>(null);
  const [searchText, setSearchText] = useState('');
  const [searchLocation, setSearchLocation] = useState<NamedLocation | null>(null);

  // What did we find?
  const [radiusKm, setRadiusKm] = useState(5); // the radius currently searched
  const [radiusText, setRadiusText] = useState('5'); // what is typed in the box

  // Check what was typed. A valid value starts a new search 600 ms after typing stops.
  const typedRadius = Number(radiusText);
  const radiusError =
    radiusText.trim() === '' || !Number.isFinite(typedRadius)
      ? 'Enter a number of kilometres.'
      : typedRadius < MIN_RADIUS_KM || typedRadius > MAX_RADIUS_KM
        ? `Radius must be between ${MIN_RADIUS_KM} and ${MAX_RADIUS_KM} km.`
        : null;
  useEffect(() => {
    if (radiusError) return;
    const timer = setTimeout(() => setRadiusKm(typedRadius), 600);
    return () => clearTimeout(timer);
  }, [radiusText]); // eslint-disable-line react-hooks/exhaustive-deps
  const [places, setPlaces] = useState<Place[]>([]);
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  // What does the user want to see?
  const [categories, setCategories] = useState<CategoryKey[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ---- 1. Ask the browser for the user's location ----
  function locateUser() {
    if (!navigator.geolocation) {
      setGeoStatus('unavailable');
      return;
    }
    setGeoStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCenter({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          label: 'Your location',
          isUser: true,
        });
        setGeoStatus('ready');
      },
      (positionError) => {
        // code 1 = the user clicked "Block". Anything else = GPS problem or timeout.
        setGeoStatus(positionError.code === 1 ? 'denied' : 'unavailable');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }

  useEffect(() => {
    locateUser();
  }, []);

  // ---- 2. The user picked a place by typing (the fallback when location is blocked) ----
  useEffect(() => {
    if (!searchLocation) return;
    setCenter({
      latitude: searchLocation.latitude,
      longitude: searchLocation.longitude,
      label: searchLocation.name,
      isUser: false,
    });
    setGeoStatus('ready');
  }, [searchLocation]);

  // ---- 3. Load places whenever the centre or the radius changes ----
  useEffect(() => {
    if (!center) return;
    const controller = new AbortController();
    setStatus('loading');
    setSelectedId(null);

    api
      .nearby(center.latitude, center.longitude, radiusKm, controller.signal)
      .then((data) => {
        setPlaces(data.places);
        setWarning(data.warning);
        setStatus('ready');
      })
      .catch((e) => {
        if (isAbort(e)) return;
        setError(errorMessage(e));
        setStatus('error');
      });
    return () => controller.abort();
  }, [center, radiusKm, reloadCount]);

  // ---- 4. Filter and sort in the browser (no new requests) ----
  const visiblePlaces = useMemo(() => filterNearby(places, categories), [places, categories]);
  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<CategoryKey, number>> = {};
    for (const place of places) counts[place.category] = (counts[place.category] ?? 0) + 1;
    return counts;
  }, [places]);

  // When a marker is clicked, scroll its card into view in the list
  useEffect(() => {
    if (selectedId) document.getElementById(`card-${selectedId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId]);

  function scrollToNearby() {
    sectionRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (!center && geoStatus !== 'locating') locateUser();
  }

  const mapCenter: [number, number] | undefined = center ? [center.latitude, center.longitude] : undefined;

  return (
    <>
      {/* ---------------- Hero ---------------- */}
      <section className="relative overflow-hidden border-b border-line">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 md:py-20 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <span className="badge mb-5">
              <Sparkles className="h-3.5 w-3.5" /> Road trips, rediscovered
            </span>
            <h1 className="text-4xl font-extrabold leading-[1.05] sm:text-5xl lg:text-6xl">
              Discover <span className="text-forest-700">somewhere new.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              Find interesting places around you or along your next journey.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button onClick={scrollToNearby} className="btn-primary px-5 py-3">
                <Navigation className="h-4 w-4" /> Explore Nearby
              </button>
              <Link to="/journey" className="btn-secondary px-5 py-3">
                <Route className="h-4 w-4" /> Plan a Journey
              </Link>
              <Link to="/surprise" className="btn-secondary px-5 py-3">
                <Sparkles className="h-4 w-4" /> Surprise Me
              </Link>
            </div>

            <dl className="mt-10 grid max-w-xl grid-cols-1 gap-4 text-sm sm:grid-cols-3">
              {[
                { icon: Route, title: 'Whole-route search', text: 'Places along the entire road, not just the ends.' },
                { icon: Split, title: 'True detour cost', text: 'Extra kilometres and minutes, from real roads.' },
                { icon: MapPin, title: 'Open map data', text: 'Built on OpenStreetMap. Nothing made up.' },
              ].map(({ icon: Icon, title, text }) => (
                <div key={title}>
                  <dt className="flex items-center gap-2 font-bold">
                    <Icon className="h-4 w-4 text-forest-700" /> {title}
                  </dt>
                  <dd className="mt-1 text-muted">{text}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* A decorative sketch of the idea: a route with places along it (no real data) */}
          <div className="hidden lg:block" aria-hidden="true">
            <svg viewBox="0 0 460 340" className="w-full">
              <rect x="0" y="0" width="460" height="340" rx="28" fill="#eef4f0" />
              <g fill="none" stroke="#dbe8df" strokeWidth="1.5">
                <path d="M-10 250 C 90 200, 140 290, 260 230 S 420 150, 480 190" />
                <path d="M-10 280 C 100 230, 150 320, 270 260 S 420 180, 480 220" />
                <path d="M-10 310 C 110 260, 160 350, 280 290 S 430 210, 480 250" />
                <path d="M-10 90 C 80 60, 160 120, 250 80 S 400 40, 480 70" />
                <path d="M-10 120 C 90 90, 170 150, 260 110 S 410 70, 480 100" />
              </g>
              <path d="M60 270 C 140 130, 220 290, 300 170 S 390 90, 410 70" fill="none" stroke="#fff" strokeWidth="14" strokeLinecap="round" />
              <path d="M60 270 C 140 130, 220 290, 300 170 S 390 90, 410 70" fill="none" stroke="#1f4a3a" strokeWidth="6" strokeLinecap="round" strokeDasharray="1 0" />
              {[[150, 190, '#a4663c'], [225, 215, '#2f7f86'], [320, 150, '#c2873a']].map(([x, y, color]) => (
                <g key={String(x)} transform={`translate(${x} ${y})`}>
                  <path d="M0 0 C -14 -20 -14 -40 0 -40 C 14 -40 14 -20 0 0 Z" fill={String(color)} stroke="#fff" strokeWidth="3" />
                  <circle cx="0" cy="-28" r="5" fill="#fff" />
                </g>
              ))}
              <circle cx="60" cy="270" r="14" fill="#1c2421" stroke="#fff" strokeWidth="4" />
              <text x="60" y="275" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="800">A</text>
              <circle cx="410" cy="70" r="14" fill="#1f4a3a" stroke="#fff" strokeWidth="4" />
              <text x="410" y="75" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="800">B</text>
            </svg>
          </div>
        </div>
      </section>

      {/* ---------------- Nearby discovery ---------------- */}
      <section ref={sectionRef} id="nearby" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-10 sm:px-6">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-extrabold">Around you</h2>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
              <LocateFixed className="h-4 w-4" />
              {geoStatus === 'locating' && 'Finding your location...'}
              {geoStatus === 'ready' && center && (
                <>
                  Showing places near <strong className="text-ink">{center.label}</strong>
                </>
              )}
              {(geoStatus === 'denied' || geoStatus === 'unavailable' || geoStatus === 'idle') && !center &&
                'Choose a place to start exploring.'}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="sm:w-72">
              <LocationSearch
                placeholder="Search another place"
                text={searchText}
                onTextChange={setSearchText}
                location={searchLocation}
                onLocationChange={setSearchLocation}
                icon={<Compass className="h-4 w-4" />}
              />
            </div>
            <button onClick={locateUser} className="btn-secondary" disabled={geoStatus === 'locating'}>
              <LocateFixed className="h-4 w-4" /> Use my location
            </button>
          </div>
        </div>

        {geoStatus === 'denied' && (
          <div className="mb-5">
            <ErrorBanner
              tone="warning"
              message="Location access is blocked, so Detour does not know where you are. Search for a place above to explore, or allow location in your browser settings and press Use my location."
            />
          </div>
        )}
        {geoStatus === 'unavailable' && !center && (
          <div className="mb-5">
            <ErrorBanner tone="warning" message="Your location could not be found. Search for a place above to start exploring." />
          </div>
        )}

        {/* Filters */}
        <div className="mb-4 space-y-3">
          <CategoryChips selected={categories} onChange={setCategories} counts={categoryCounts} />
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="radius-input" className="text-muted">Within</label>
              <input
                id="radius-input"
                className={`input w-24 py-1.5 ${radiusError ? 'input-error' : ''}`}
                type="number"
                inputMode="decimal"
                min={MIN_RADIUS_KM}
                max={MAX_RADIUS_KM}
                step="0.5"
                value={radiusText}
                onChange={(e) => setRadiusText(e.target.value)}
                aria-invalid={radiusError !== null}
                aria-describedby="radius-help"
              />
              <span className="text-muted">km</span>
              {RADIUS_OPTIONS.map((km) => (
                <button
                  key={km}
                  type="button"
                  onClick={() => setRadiusText(String(km))}
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${radiusKm === km ? 'border-forest-500 bg-forest-50 text-forest-800' : 'border-line text-muted hover:border-forest-300'}`}
                >
                  {km}
                </button>
              ))}
            </div>
            <p id="radius-help" className={`w-full text-xs ${radiusError ? 'text-red-600' : 'text-muted'}`}>
              {radiusError ?? `Searching within ${radiusKm} km. Allowed: ${MIN_RADIUS_KM} to ${MAX_RADIUS_KM} km.${radiusKm > 30 ? ' Large areas show only notable places and take longer.' : ''}`}
            </p>
            {status === 'ready' && (
              <span className="ml-auto text-muted">
                {visiblePlaces.length} {visiblePlaces.length === 1 ? 'place' : 'places'}
              </span>
            )}
          </div>
        </div>

        {warning && (
          <div className="mb-4">
            <ErrorBanner tone="warning" message={warning} />
          </div>
        )}

        {/* Map on top for phones, list + map side by side on larger screens */}
        <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
          <div className="order-2 h-[640px] overflow-y-auto pr-1 lg:order-1">
            {status === 'loading' && (
              <>
                <p className="mb-3 text-sm text-muted">
                  Searching {radiusKm} km around {center?.label ?? 'you'}... {radiusKm > 10 ? 'Larger areas are searched section by section and can take up to a minute.' : ''}
                </p>
                <CardSkeletons />
              </>
            )}
            {status === 'error' && <ErrorBanner message={error} onRetry={() => setReloadCount((n) => n + 1)} />}
            {status === 'idle' && (
              <EmptyState
                icon={MapPin}
                title="Pick a starting point"
                text="Allow location access or search for a place to see what is nearby."
              />
            )}
            {status === 'ready' && visiblePlaces.length === 0 && (
              <EmptyState
                icon={SearchX}
                title="No places match"
                text={
                  places.length === 0
                    ? 'OpenStreetMap has no matching places here. Try a larger radius or another location.'
                    : 'Try removing a filter to see more places.'
                }
                action={
                  categories.length > 0 ? (
                    <button className="btn-secondary btn-sm" onClick={() => setCategories([])}>
                      Clear filters
                    </button>
                  ) : undefined
                }
              />
            )}
            {status === 'ready' && visiblePlaces.length > 0 && (
              <div className="space-y-3">
                {visiblePlaces.map((place) => (
                  <PlaceCard
                    key={place.id}
                    place={place}
                    selected={place.id === selectedId}
                    onSelect={setSelectedId}
                    saved={isSaved(place.id)}
                    onToggleSave={toggleSave}
                    fromPath="/"
                  />
                ))}
              </div>
            )}
          </div>

          <div className="card order-1 h-[360px] overflow-hidden lg:order-2 lg:h-[640px]">
            <div className="isolate h-full">
              <MapView
                places={status === 'ready' ? visiblePlaces : []}
                selectedId={selectedId}
                onSelect={setSelectedId}
                center={mapCenter}
                fitKey={center ? `${center.latitude},${center.longitude}` : 'none'}
                userLocation={center?.isUser ? center : undefined}
                fromPath="/"
              />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
