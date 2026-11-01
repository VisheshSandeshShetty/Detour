// "/journey/:id"  Journey Results: the main screen of Detour.
//
//   - /journey/new?from=...&to=...   a journey that was just planned (not saved yet)
//   - /journey/12                    one of the user's saved journeys
//
// Layout: list + filters on the left, big map on the right (a bottom sheet on phones).
// The list and the map share one `selectedId`, so clicking either one highlights the other.

import {
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  MapPin,
  Pencil,
  Route,
  Search,
  Sparkles,
  SearchX,
  SlidersHorizontal,
  ArrowLeft,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import CategoryChips from '../components/CategoryChips';
import MapView from '../components/MapView';
import PlaceCard from '../components/PlaceCard';
import SurpriseRouteModal from '../components/SurpriseRouteModal';
import SurpriseTrip from '../components/SurpriseTrip';
import { EmptyState, ErrorBanner } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useSavedPlaces } from '../context/SavedPlacesContext';
import { ApiError, api, errorMessage, isAbort } from '../lib/api';
import {
  EMPTY_JOURNEY_FILTERS,
  JOURNEY_SORT_LABELS,
  filterAndSortJourney,
  type JourneyFilters,
  type JourneySort,
} from '../lib/filters';
import { formatDuration, formatKm } from '../lib/format';
import type { CategoryKey, JourneyPlan, NamedLocation, Place, SurpriseResult } from '../types';

type Status = 'loading' | 'error' | 'ready';

// ---- Resizable left panel (tablet and desktop) ----
const PANEL_MIN = 300;
const PANEL_MAX = 760; // the CSS also caps it at 60% of the screen width
const PANEL_DEFAULT = 400;
const PANEL_STORAGE_KEY = 'detour-panel-width';

function clampPanelWidth(width: number): number {
  const maxForScreen = Math.max(PANEL_MIN, Math.min(PANEL_MAX, window.innerWidth * 0.6));
  return Math.round(Math.min(Math.max(width, PANEL_MIN), maxForScreen));
}

// Remember the width between visits. Browser storage can be blocked, so every use is wrapped.
function loadPanelWidth(): number {
  try {
    const saved = Number(localStorage.getItem(PANEL_STORAGE_KEY));
    if (Number.isFinite(saved) && saved > 0) return clampPanelWidth(saved);
  } catch {
    // storage unavailable: use the default
  }
  return PANEL_DEFAULT;
}

function savePanelWidth(width: number) {
  try {
    localStorage.setItem(PANEL_STORAGE_KEY, String(width));
  } catch {
    // not being able to remember the width is fine
  }
}

// Reads the journey details out of the URL of a freshly planned journey. Returns null if invalid.
function readRequestFromUrl(params: URLSearchParams) {
  const origin: NamedLocation = {
    name: params.get('from') ?? '',
    latitude: Number(params.get('fromLat')),
    longitude: Number(params.get('fromLon')),
  };
  const destination: NamedLocation = {
    name: params.get('to') ?? '',
    latitude: Number(params.get('toLat')),
    longitude: Number(params.get('toLon')),
  };
  const radiusKm = Number(params.get('radius'));

  const valid = (place: NamedLocation) =>
    place.name !== '' &&
    Number.isFinite(place.latitude) && Math.abs(place.latitude) <= 90 &&
    Number.isFinite(place.longitude) && Math.abs(place.longitude) <= 180;

  if (!valid(origin) || !valid(destination) || ![5, 10, 20, 30].includes(radiusKm)) return null;
  return { origin, destination, radiusKm };
}

export default function JourneyResults() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { isSaved, toggleSave } = useSavedPlaces();

  // ---- Data from the server ----
  const [plan, setPlan] = useState<JourneyPlan | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<{ message: string; needsLogin: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0); // bump to try again
  const [savedJourneyId, setSavedJourneyId] = useState<number | null>(null);

  // ---- What the user is doing ----
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<JourneyFilters>(EMPTY_JOURNEY_FILTERS);
  const [sort, setSort] = useState<JourneySort>('extraDistance');
  const [showFilters, setShowFilters] = useState(false);
  const [tripIds, setTripIds] = useState<string[]>([]); // places added to "my trip", in order
  const [sheetOpen, setSheetOpen] = useState(false); // phone bottom sheet
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [panelWidth, setPanelWidth] = useState(loadPanelWidth);

  // ---- Surprise Me along this route ----
  const [surpriseOpen, setSurpriseOpen] = useState(false); // the popup asking for time/distance
  const [surprise, setSurprise] = useState<SurpriseResult | null>(null); // the chosen trip, if any
  const [lastLimits, setLastLimits] = useState<{ totalMin: number | null; maxTotalKm: number | null; breakMin: number } | null>(null);
  const [shuffling, setShuffling] = useState(false);
  const [shuffleError, setShuffleError] = useState<string | null>(null);
  const [surpriseCount, setSurpriseCount] = useState(0); // makes the map re-frame for each new trip

  // ---- Load the journey ----
  const query = searchParams.toString();
  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    setError(null);
    setPlan(null);
    setSelectedId(null);
    setFilters(EMPTY_JOURNEY_FILTERS);
    setSavedJourneyId(null);
    setSurprise(null);
    setLastLimits(null);

    async function load() {
      try {
        if (id === 'new') {
          const request = readRequestFromUrl(new URLSearchParams(query));
          if (!request) throw new ApiError('This journey link is incomplete. Please plan the journey again.', 400);
          setTripIds([]);
          setPlan(await api.planJourney(request.origin, request.destination, request.radiusKm, controller.signal));
        } else {
          const journeyId = Number(id);
          if (!Number.isInteger(journeyId) || journeyId <= 0) throw new ApiError('That journey link is not valid.', 404);
          const [journey, loadedPlan] = await Promise.all([
            api.getJourney(journeyId, controller.signal),
            api.journeyPlan(journeyId, controller.signal),
          ]);
          setSavedJourneyId(journey.id);
          setTripIds(journey.stops.map((stop) => stop.place.id));
          setPlan(loadedPlan);
        }
        setStatus('ready');
      } catch (e) {
        if (controller.signal.aborted || isAbort(e)) return;
        setError({ message: errorMessage(e), needsLogin: e instanceof ApiError && e.status === 401 });
        setStatus('error');
      }
    }
    load();
    return () => controller.abort();
  }, [id, query, attempt]);

  // ---- Filtering (in the browser, on the results we already have) ----
  const visiblePlaces = useMemo(
    () => (plan ? filterAndSortJourney(plan.attractions, filters, sort) : []),
    [plan, filters, sort]
  );
  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<CategoryKey, number>> = {};
    for (const place of plan?.attractions ?? []) counts[place.category] = (counts[place.category] ?? 0) + 1;
    return counts;
  }, [plan]);
  const filtersActive =
    filters.categories.length > 0 || filters.query !== '' || filters.maxExtraKm !== null ||
    filters.maxExtraMin !== null;

  // The map needs [lat, lon]; the server sends [lon, lat]
  const routeLatLng = useMemo(
    () => plan?.route.geometry.map(([lon, lat]) => [lat, lon] as [number, number]),
    [plan]
  );
  // While a surprise trip is shown, the map draws its stops and its own line (through the stops)
  const surpriseLatLng = useMemo(
    () => surprise?.geometry?.map(([lon, lat]) => [lat, lon] as [number, number]),
    [surprise]
  );
  // Changes only when a new journey arrives, so filtering never re-frames the map
  const fitKey = plan ? `${plan.origin.latitude},${plan.origin.longitude}-${plan.destination.latitude},${plan.destination.longitude}-${plan.radiusKm}-${attempt}-${surpriseCount}` : 'none';

  // ---- Selecting ----
  function selectPlace(placeId: string | null) {
    setSelectedId(placeId);
    // On a phone, fold the sheet down so the map (and the popup) is visible
    if (placeId && window.matchMedia('(max-width: 767px)').matches) setSheetOpen(false);
  }

  // Scroll the list to the selected card (handles "marker clicked" on the map)
  useEffect(() => {
    if (selectedId) document.getElementById(`card-${selectedId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId]);

  // ---- Resizing the left panel by dragging the divider ----
  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const handle = event.currentTarget;
    // Pointer capture keeps the drag working even when the mouse moves over the map
    handle.setPointerCapture(event.pointerId);

    const startX = event.clientX;
    const startWidth = panelWidth;
    let latest = startWidth;

    function onMove(moveEvent: PointerEvent) {
      latest = clampPanelWidth(startWidth + moveEvent.clientX - startX);
      setPanelWidth(latest);
    }
    function onUp(upEvent: PointerEvent) {
      handle.releasePointerCapture(upEvent.pointerId);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      savePanelWidth(latest);
    }
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  }

  // Keyboard users: arrow keys resize, Home resets
  function resizeWithKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
    let next: number | null = null;
    if (event.key === 'ArrowLeft') next = panelWidth - 24;
    else if (event.key === 'ArrowRight') next = panelWidth + 24;
    else if (event.key === 'Home') next = PANEL_DEFAULT;
    if (next === null) return;
    event.preventDefault();
    const width = clampPanelWidth(next);
    setPanelWidth(width);
    savePanelWidth(width);
  }

  function resetPanelWidth() {
    setPanelWidth(PANEL_DEFAULT);
    savePanelWidth(PANEL_DEFAULT);
  }

  // "Shuffle again": ask for another random trip with the same limits as before
  async function shuffleSurprise() {
    if (!plan || !lastLimits) {
      setSurpriseOpen(true);
      return;
    }
    setShuffling(true);
    setShuffleError(null);
    try {
      const result = await api.surpriseRoute({
        origin: plan.origin,
        destination: plan.destination,
        radiusKm: plan.radiusKm,
        ...lastLimits,
      });
      setSurprise(result);
      setSelectedId(null);
      setSurpriseCount((n) => n + 1);
    } catch (e) {
      setShuffleError(errorMessage(e));
    } finally {
      setShuffling(false);
    }
  }

  function toggleTrip(place: Place) {
    if (savedJourneyId !== null) return; // a saved journey's stops are fixed
    setTripIds((ids) => (ids.includes(place.id) ? ids.filter((x) => x !== place.id) : [...ids, place.id]));
  }

  // ---- Saving the journey ----
  async function saveJourney() {
    if (!plan) return;
    if (!user) {
      navigate('/login', { state: { from: location.pathname + location.search, message: 'Log in to save this journey.' } });
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const stops = tripIds
        .map((tripId) => plan.attractions.find((place) => place.id === tripId))
        .filter((place): place is Place => place !== undefined);
      const saved = await api.saveJourney(plan, stops);
      navigate(`/journey/${saved.id}`, { replace: true });
    } catch (e) {
      setSaveError(errorMessage(e));
      setSaving(false);
    }
  }

  // ===================== Loading and error screens =====================
  if (status === 'loading') {
    return (
      <div className="flex h-[calc(100dvh-4rem)] items-center justify-center px-4">
        <div className="card w-full max-w-md p-8 text-center">
          <svg viewBox="0 0 240 70" className="mx-auto mb-5 w-56" aria-hidden="true">
            <path d="M15 52 C 60 5, 100 70, 140 30 S 200 10, 225 18" fill="none" stroke="#dbe8df" strokeWidth="6" strokeLinecap="round" />
            <path d="M15 52 C 60 5, 100 70, 140 30 S 200 10, 225 18" fill="none" stroke="#1f4a3a" strokeWidth="3" strokeLinecap="round" className="detour-route-loading" />
            <circle cx="15" cy="52" r="7" fill="#1c2421" />
            <circle cx="225" cy="18" r="7" fill="#1f4a3a" />
          </svg>
          <h1 className="text-lg font-extrabold">Planning your journey</h1>
          <p className="mt-2 text-sm text-muted">
            Finding the route, searching for places along the whole road and working out each detour. Long journeys can take up to a minute.
          </p>
          <Loader2 className="mx-auto mt-5 h-5 w-5 animate-spin text-forest-700" />
        </div>
      </div>
    );
  }

  if (status === 'error' || !plan) {
    return (
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-lg flex-col justify-center gap-4 px-4">
        <h1 className="text-xl font-extrabold">We could not plan this journey</h1>
        <ErrorBanner message={error?.message ?? 'Something went wrong.'} />
        <div className="flex flex-wrap gap-3">
          {error?.needsLogin ? (
            <Link to="/login" state={{ from: location.pathname }} className="btn-primary">Log in</Link>
          ) : (
            <button className="btn-primary" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
          )}
          <Link to="/journey" className="btn-secondary">Back to the planner</Link>
        </div>
      </div>
    );
  }

  // ===================== The results screen =====================
  const fromPath = location.pathname + location.search;

  return (
    <div className="relative flex h-[calc(100dvh-4rem)] overflow-hidden">
      {/* ---------- Left panel (bottom sheet on phones) ---------- */}
      <aside
        style={{ '--panel-w': `${panelWidth}px` } as CSSProperties}
        className={`absolute inset-x-0 bottom-0 z-20 flex flex-col overflow-hidden rounded-t-3xl border-t border-line bg-white shadow-lift transition-[height] duration-300 md:static md:h-full md:w-[var(--panel-w)] md:max-w-[60vw] md:shrink-0 md:rounded-none md:border-t-0 md:shadow-none ${
          sheetOpen ? 'h-[72%]' : 'h-[178px]'
        }`}
      >
        {/* Phone handle */}
        <button
          className="flex w-full shrink-0 flex-col items-center gap-1 pt-2 md:hidden"
          onClick={() => setSheetOpen((open) => !open)}
          aria-label={sheetOpen ? 'Collapse the list' : 'Expand the list'}
          aria-expanded={sheetOpen}
        >
          <span className="h-1 w-10 rounded-full bg-line" />
          <span className="flex items-center gap-1 text-[11px] font-semibold text-muted">
            {sheetOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
            {visiblePlaces.length} places
          </span>
        </button>

        {/* Journey summary */}
        <div className="shrink-0 space-y-3 border-b border-line px-4 pb-3 pt-2 md:pt-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h1 className="truncate text-base font-extrabold leading-tight">
                {plan.origin.name} <span className="text-forest-600">→</span> {plan.destination.name}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <span className="inline-flex items-center gap-1"><Route className="h-3.5 w-3.5" />{formatKm(plan.route.distanceKm)}</span>
                <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatDuration(plan.route.durationMin)}</span>
                <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{plan.radiusKm} km corridor</span>
              </div>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <button
                className="btn-secondary btn-sm"
                onClick={() => navigate('/journey', { state: { origin: plan.origin, destination: plan.destination, radiusKm: plan.radiusKm } })}
                aria-label="Edit journey"
                title="Edit journey"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              {savedJourneyId === null ? (
                <button className="btn-primary btn-sm" onClick={saveJourney} disabled={saving}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bookmark className="h-3.5 w-3.5" />}
                  Save
                </button>
              ) : (
                <span className="btn-secondary btn-sm pointer-events-none text-forest-800">
                  <BookmarkCheck className="h-3.5 w-3.5" /> Saved
                </span>
              )}
            </div>
          </div>

          <p className="text-xs text-muted">
            <strong className="text-ink">{plan.attractions.length}</strong> places found along the route
            {plan.totalInCorridor > plan.attractions.length && (
              <> (the best {plan.attractions.length} of {plan.totalInCorridor} in the corridor)</>
            )}
            {tripIds.length > 0 && (
              <> · <strong className="text-forest-800">{tripIds.length}</strong> in your trip</>
            )}
          </p>

          {saveError && <ErrorBanner message={saveError} />}
          {plan.warnings.map((warning) => (
            <ErrorBanner key={warning} tone="warning" message={warning} onRetry={() => setAttempt((n) => n + 1)} />
          ))}
        </div>

        {surprise ? (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-paper/60 p-3">
            <button className="btn-ghost btn-sm" onClick={() => { setSurprise(null); setSurpriseCount((n) => n + 1); setSelectedId(null); }}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back to all places
            </button>
            <SurpriseTrip
              result={surprise}
              selectedId={selectedId}
              onSelect={selectPlace}
              onShuffle={shuffleSurprise}
              shuffling={shuffling}
              fromPath={fromPath}
            />
            {shuffleError && <ErrorBanner message={shuffleError} />}
          </div>
        ) : (
          <>
        {/* Search, sort and filters */}
        <div className="shrink-0 space-y-2.5 border-b border-line px-4 py-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                className="input py-2 pl-9"
                placeholder="Search these places"
                value={filters.query}
                onChange={(e) => setFilters({ ...filters, query: e.target.value })}
                aria-label="Search places by name"
              />
            </div>
            <button
              className={`btn-secondary px-3 ${showFilters || filtersActive ? 'border-forest-400 bg-forest-50' : ''}`}
              onClick={() => setShowFilters((open) => !open)}
              aria-expanded={showFilters}
              aria-label="Show filters"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          </div>

          <select
            className="input py-2"
            value={sort}
            onChange={(e) => setSort(e.target.value as JourneySort)}
            aria-label="Sort places"
          >
            {(Object.keys(JOURNEY_SORT_LABELS) as JourneySort[]).map((key) => (
              <option key={key} value={key}>Sort: {JOURNEY_SORT_LABELS[key]}</option>
            ))}
          </select>

          {showFilters && (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-semibold text-muted">
                Max extra distance
                <select
                  className="input mt-1 py-2 font-normal text-ink"
                  value={filters.maxExtraKm ?? ''}
                  onChange={(e) => setFilters({ ...filters, maxExtraKm: e.target.value === '' ? null : Number(e.target.value) })}
                >
                  <option value="">Any</option>
                  {[2, 5, 10, 20].map((km) => <option key={km} value={km}>{km} km</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-muted">
                Max extra time
                <select
                  className="input mt-1 py-2 font-normal text-ink"
                  value={filters.maxExtraMin ?? ''}
                  onChange={(e) => setFilters({ ...filters, maxExtraMin: e.target.value === '' ? null : Number(e.target.value) })}
                >
                  <option value="">Any</option>
                  {[5, 10, 20, 30].map((min) => <option key={min} value={min}>{min} min</option>)}
                </select>
              </label>
            </div>
          )}

          <CategoryChips
            selected={filters.categories}
            onChange={(categories) => setFilters({ ...filters, categories })}
            counts={categoryCounts}
          />
        </div>

        {/* The list of places */}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-paper/60 p-3">
          {visiblePlaces.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title={plan.attractions.length === 0 ? 'No places found along this route' : 'No places match your filters'}
              text={
                plan.attractions.length === 0
                  ? 'Try a wider corridor radius, or check that OpenStreetMap has places along this road.'
                  : 'Loosen a filter to see more places.'
              }
              action={
                filtersActive ? (
                  <button className="btn-secondary btn-sm" onClick={() => setFilters(EMPTY_JOURNEY_FILTERS)}>
                    Clear filters
                  </button>
                ) : undefined
              }
            />
          ) : (
            visiblePlaces.map((place) => (
              <PlaceCard
                key={place.id}
                place={place}
                selected={place.id === selectedId}
                onSelect={selectPlace}
                saved={isSaved(place.id)}
                onToggleSave={toggleSave}
                inTrip={tripIds.includes(place.id)}
                onToggleTrip={savedJourneyId === null ? toggleTrip : undefined}
                fromPath={fromPath}
              />
            ))
          )}
        </div>

            {/* The Surprise Me card, at the bottom of the list */}
            {(
              <div className={`${sheetOpen ? '' : 'hidden md:block'} shrink-0 border-t border-line bg-forest-50 px-4 py-3`}>
                <p className="text-sm font-extrabold">Want to make this trip more interesting?</p>
                <p className="mt-0.5 text-xs text-muted">Discover unexpected places along your journey.</p>
                <button className="btn-primary mt-2 w-full" onClick={() => setSurpriseOpen(true)}>
                  <Sparkles className="h-4 w-4" /> Surprise Me Along This Route
                </button>
              </div>
            )}
          </>
        )}
      </aside>

      {/* ---------- Drag handle between the list and the map (tablet and desktop only) ---------- */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the list panel. Use the left and right arrow keys."
        aria-valuemin={PANEL_MIN}
        aria-valuemax={PANEL_MAX}
        aria-valuenow={panelWidth}
        tabIndex={0}
        onPointerDown={startResize}
        onKeyDown={resizeWithKeyboard}
        onDoubleClick={resetPanelWidth}
        title="Drag to resize. Double-click to reset."
        className="group z-30 hidden w-2 shrink-0 cursor-col-resize touch-none select-none items-center justify-center border-x border-line bg-paper transition-colors hover:bg-forest-100 focus-visible:bg-forest-100 focus-visible:outline-none md:flex"
      >
        <span className="h-10 w-1 rounded-full bg-muted/40 transition-colors group-hover:bg-forest-600" />
      </div>

      {/* ---------- Map ---------- */}
      <div className="absolute inset-0 isolate md:relative md:inset-auto md:h-full md:min-w-0 md:flex-1">
        <MapView
          places={surprise ? surprise.stops : visiblePlaces}
          selectedId={selectedId}
          onSelect={selectPlace}
          route={surprise ? surpriseLatLng ?? routeLatLng : routeLatLng}
          origin={plan.origin}
          destination={plan.destination}
          fitKey={fitKey}
          fromPath={fromPath}
        />
      </div>

      {surpriseOpen && (
        <SurpriseRouteModal
          plan={plan}
          onClose={() => setSurpriseOpen(false)}
          onResult={(result, limits) => {
            setLastLimits(limits);
            setSurprise(result);
            setSurpriseOpen(false);
            setSelectedId(null);
            setSurpriseCount((n) => n + 1);
            setSheetOpen(true);
          }}
        />
      )}
    </div>
  );
}
