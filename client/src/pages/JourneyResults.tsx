// "/journey/:id"  Journey Results: the main screen of Detour.
//
//   - /journey/new?from=...&to=...   a journey that was just planned (not saved yet)
//   - /trip/12                       one of the user's saved trips, opened EDITABLE
//   - /journey/12                    an older saved journey (from before saved trips existed)
//
// The itinerary (which places are selected, in which order) lives in ActiveTripContext. The list, the
// map markers, Navigate and Save all read it from there, so they always agree.
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
  Check,
  Link2,
  ArrowUp,
  ArrowDown,
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
import NavigateButton from '../components/NavigateButton';
import { useActiveTrip } from '../context/ActiveTripContext';
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
import type { ThemeKey } from '../lib/themes';
import { useSurpriseSession } from '../lib/useSurpriseSession';
import { useSaveSurprise } from '../lib/useSaveSurprise';
import { buildListSections, estimateRoute, stopNumbers, stopsKey, tripEnds, tripTotals } from '../lib/trip';
import type { CategoryKey, JourneyPlan, NamedLocation, Place, RouteInfo, SaveTripBody, TripKind, TripStop } from '../types';

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
  const active = useActiveTrip();

  // Which kind of page this is
  const isSavedTripPage = location.pathname.startsWith('/trip/');
  // The address of this page identifies the itinerary that belongs to it
  const tripKey = location.pathname + location.search;

  // ---- Data from the server ----
  const [plan, setPlan] = useState<JourneyPlan | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<{ message: string; needsLogin: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0); // bump to try again
  const [savedTripId, setSavedTripId] = useState<number | null>(null); // set when this itinerary is a saved trip
  const [tripKind, setTripKind] = useState<TripKind>('journey');
  const [tripSettings, setTripSettings] = useState<Record<string, unknown> | null>(null);
  const [savedStopsKey, setSavedStopsKey] = useState<string | null>(null); // the stops as last saved
  const [notice, setNotice] = useState<string | null>(null);
  // The route for the CURRENT stops. `key` says which stops it was calculated for.
  const [routeState, setRouteState] = useState<{ key: string; route: RouteInfo; estimated: boolean } | null>(null);

  // The itinerary: single source of truth for selection, order, markers, Navigate and Save
  const stops: TripStop[] = active.key === tripKey ? active.stops : [];
  const currentKey = stopsKey(stops);

  // ---- What the user is doing ----
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<JourneyFilters>(EMPTY_JOURNEY_FILTERS);
  const [sort, setSort] = useState<JourneySort>('extraDistance');
  const [showFilters, setShowFilters] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false); // phone bottom sheet
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [panelWidth, setPanelWidth] = useState(loadPanelWidth);

  // ---- Surprise Me along this route ----
  const [surpriseOpen, setSurpriseOpen] = useState(false); // the popup asking for time/distance
  const [surpriseThemes, setSurpriseThemes] = useState<ThemeKey[]>([]); // kinds of place, empty = anything
  const [lastLimits, setLastLimits] = useState<{ totalMin: number | null; maxTotalKm: number | null } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [surpriseCount, setSurpriseCount] = useState(0);
  const surpriseSaver = useSaveSurprise(plan?.radiusKm ?? null);
  // One Surprise session: remembers what was shown, so Roll Again never repeats a place
  const surpriseSession = useSurpriseSession(async (excludeIds) => {
    if (!plan || !lastLimits) throw new Error('Choose your time or distance first.');
    return api.surpriseRoute({
      origin: plan.origin,
      destination: plan.destination,
      radiusKm: plan.radiusKm,
      ...lastLimits,
      themes: surpriseThemes,
      excludeIds,
    });
  });
  const surprise = surpriseSession.result; // makes the map re-frame for each new trip

  // ---- Load the journey ----
  const query = searchParams.toString();
  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    setError(null);
    setPlan(null);
    setSelectedId(null);
    setFilters(EMPTY_JOURNEY_FILTERS);
    setSavedTripId(null);
    setSavedStopsKey(null);
    setRouteState(null);
    setNotice(null);
    setTripKind('journey');
    setTripSettings(null);
    surpriseSession.clear();
    setLastLimits(null);

    // Coming back from Place Details keeps the itinerary being edited; a fresh visit starts from the saved data
    const keepEditedStops = active.key === tripKey && active.stops.length > 0 && !isSavedTripPage;

    async function load() {
      try {
        if (id === 'new') {
          const request = readRequestFromUrl(new URLSearchParams(query));
          if (!request) throw new ApiError('This journey link is incomplete. Please plan the journey again.', 400);
          const loaded = await api.planJourney(request.origin, request.destination, request.radiusKm, controller.signal);
          if (!keepEditedStops) active.reset(tripKey, []);
          setPlan(loaded);
          setRouteState({ key: '', route: loaded.route, estimated: false });
        } else if (isSavedTripPage) {
          const tripId = Number(id);
          if (!Number.isInteger(tripId) || tripId <= 0) throw new ApiError('That trip link is not valid.', 404);
          // The saved trip is the source of truth for origin, destination, stops, order and route
          const trip = await api.getTrip(tripId, controller.signal);
          // Fresh discovery along the route is only an extra: if it fails, the saved trip still opens
          let discovered: JourneyPlan | null = null;
          if (trip.kind !== 'surprise-around') {
            try {
              discovered = await api.planJourney(trip.origin, trip.destination, trip.radiusKm ?? 10, controller.signal);
            } catch (e) {
              if (controller.signal.aborted || isAbort(e)) return;
            }
          }
          const keepEdits = active.key === tripKey && active.stops.length > 0 && location.state && (location.state as { resume?: boolean }).resume;
          if (!keepEdits) active.reset(tripKey, trip.stops);
          const geometry = trip.geometry ?? [];
          const route: RouteInfo = { distanceKm: trip.drivingDistanceKm, durationMin: trip.drivingDurationMin, geometry };
          setSavedTripId(trip.id);
          setTripKind(trip.kind);
          setTripSettings(trip.settings);
          setSavedStopsKey(stopsKey(trip.stops));
          setPlan({
            origin: trip.origin,
            destination: trip.destination,
            radiusKm: trip.radiusKm ?? 10,
            route,
            attractions: discovered?.attractions ?? [],
            totalInCorridor: discovered?.totalInCorridor ?? 0,
            warnings: discovered ? discovered.warnings : [],
          });
          // A trip saved without a route line gets its line recalculated (key '?' never matches)
          setRouteState({ key: geometry.length > 1 ? stopsKey(trip.stops) : '?', route, estimated: false });
        } else {
          // An older saved journey (made before "saved trips"): open it, and Save turns it into a saved trip
          const journeyId = Number(id);
          if (!Number.isInteger(journeyId) || journeyId <= 0) throw new ApiError('That journey link is not valid.', 404);
          const [journey, loadedPlan] = await Promise.all([
            api.getJourney(journeyId, controller.signal),
            api.journeyPlan(journeyId, controller.signal),
          ]);
          active.reset(tripKey, journey.stops.map((stop) => stop.place));
          setPlan(loadedPlan);
          setRouteState({ key: '?', route: loadedPlan.route, estimated: false });
          setNotice('This journey was saved before saved trips existed. Press Save Trip to keep it as an editable trip.');
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, query, attempt]);

  // ---- Keep the route, distance and time in step with the stops ----
  // Whenever the stops change, ask for the real driving route through them (after a short pause, so
  // a quick series of clicks makes one request).
  const [routeUpdating, setRouteUpdating] = useState(false);
  useEffect(() => {
    if (!plan || !routeState || routeState.key === currentKey) {
      setRouteUpdating(false);
      return;
    }
    const controller = new AbortController();
    setRouteUpdating(true);
    const timer = setTimeout(async () => {
      const { via, end } = tripEnds(tripKind, tripSettings, plan.origin, plan.destination, stops);
      try {
        const route = await api.routeThrough(plan.origin, via, end, controller.signal);
        setRouteState({ key: currentKey, route, estimated: false });
      } catch (e) {
        if (controller.signal.aborted || isAbort(e)) return;
        // Routing service busy: show an estimate and say so (the old line stays on the map)
        const estimate = estimateRoute({ distanceKm: plan.route.distanceKm, durationMin: plan.route.durationMin }, stops);
        setRouteState((previous) => ({ key: currentKey, route: { ...estimate, geometry: previous?.route.geometry ?? plan.route.geometry }, estimated: true }));
      } finally {
        if (!controller.signal.aborted) setRouteUpdating(false);
      }
    }, 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, currentKey, routeState?.key, tripKind]);

  const route: RouteInfo = routeState?.route ?? plan?.route ?? { distanceKm: 0, durationMin: 0, geometry: [] };
  const totals = tripTotals(route, stops, tripKind);
  const numbers = useMemo(() => stopNumbers(stops), [stops]);
  const ends = plan ? tripEnds(tripKind, tripSettings, plan.origin, plan.destination, stops) : null;
  const dirty = savedTripId === null || savedStopsKey !== currentKey;

  // ---- The list: selected stops first (in trip order), then everything else, filtered and sorted ----
  const sections = useMemo(
    () => buildListSections(plan?.attractions ?? [], stops, (others) => filterAndSortJourney(others, filters, sort)),
    [plan, stops, filters, sort]
  );
  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<CategoryKey, number>> = {};
    for (const place of plan?.attractions ?? []) counts[place.category] = (counts[place.category] ?? 0) + 1;
    return counts;
  }, [plan]);
  const filtersActive =
    filters.categories.length > 0 || filters.query !== '' || filters.maxExtraKm !== null ||
    filters.maxExtraMin !== null;
  // The map shows every selected stop (numbered) plus the places that pass the filters
  const mapPlaces = useMemo(() => [...sections.selected, ...sections.others], [sections]);

  // The map needs [lat, lon]; the server sends [lon, lat]
  const routeLatLng = useMemo(
    () => route.geometry.map(([lon, lat]) => [lat, lon] as [number, number]),
    [route]
  );
  // While a surprise trip is shown, the map draws its stops and its own line (through the stops)
  const surpriseLatLng = useMemo(
    () => surprise?.geometry?.map(([lon, lat]) => [lat, lon] as [number, number]),
    [surprise]
  );
  // Changes only when a new journey arrives, so filtering never re-frames the map
  const fitKey = plan ? `${plan.origin.latitude},${plan.origin.longitude}-${plan.destination.latitude},${plan.destination.longitude}-${plan.radiusKm}-${attempt}-${surpriseCount}-${savedTripId ?? 'new'}` : 'none';

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

  // Share link. A freshly planned journey's address holds the whole request, so anyone can open it.
  // A saved journey is private to its owner, so there we share the same journey as a new plan.
  async function copyLink() {
    if (!plan) return;
    const params = new URLSearchParams({
      from: plan.origin.name,
      fromLat: String(plan.origin.latitude),
      fromLon: String(plan.origin.longitude),
      to: plan.destination.name,
      toLat: String(plan.destination.latitude),
      toLon: String(plan.destination.longitude),
      radius: String(plan.radiusKm),
    });
    const url = `${window.location.origin}/journey/new?${params.toString()}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      window.prompt('Copy this link:', url); // clipboard blocked: let the user copy it by hand
    }
  }

  function toggleTrip(place: Place) {
    active.toggle(tripKey, place);
  }

  // ---- Saving the journey (new trip, or the SAME trip when editing a saved one) ----
  function tripBodyNow(): SaveTripBody {
    const p = plan as JourneyPlan;
    const body: SaveTripBody = {
      kind: tripKind,
      origin: p.origin,
      destination: p.destination,
      radiusKm: tripKind === 'surprise-around' ? null : p.radiusKm,
      totalDistanceKm: route.distanceKm,
      totalDurationMin: totals.totalMin,
      drivingDistanceKm: route.distanceKm,
      drivingDurationMin: route.durationMin,
      geometry: route.geometry.length > 1 && route.geometry.length <= 6000 ? route.geometry : null,
      stops,
      settings: tripSettings,
    };
    // A one-way surprise trip ends at its last stop, so keep that as the destination
    if (ends && tripKind === 'surprise-around') body.destination = ends.end;
    return body;
  }

  async function saveJourney() {
    if (!plan) return;
    if (!user) {
      navigate('/login', { state: { from: location.pathname + location.search, message: 'Log in to save this trip.' } });
      return;
    }
    if (routeUpdating) {
      setSaveError('The route is still being updated for your latest change. Try again in a moment.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      if (savedTripId !== null) {
        await api.updateTrip(savedTripId, tripBodyNow());
        setSavedStopsKey(currentKey);
        setNotice('Changes saved to this trip.');
      } else {
        const { trip, alreadySaved } = await api.saveTrip(tripBodyNow());
        // Move to the saved trip's own page: it is loaded from the database, exactly as it will reopen later
        navigate(`/trip/${trip.id}`, { replace: true, state: { saved: true, alreadySaved } });
      }
    } catch (e) {
      setSaveError(errorMessage(e));
    } finally {
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
            {sections.selected.length + sections.others.length} places
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
                <span className="inline-flex items-center gap-1" data-testid="trip-distance"><Route className="h-3.5 w-3.5" />{formatKm(route.distanceKm)}</span>
                <span className="inline-flex items-center gap-1" data-testid="trip-duration"><Clock className="h-3.5 w-3.5" />{formatDuration(totals.totalMin)}{tripKind !== 'journey' && totals.visitMin > 0 ? ' incl. visits' : ''}</span>
                {tripKind !== 'surprise-around' && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{plan.radiusKm} km corridor</span>}
                {routeUpdating && <span className="inline-flex items-center gap-1 text-forest-700"><Loader2 className="h-3 w-3 animate-spin" />Updating route…</span>}
                {routeState?.estimated && !routeUpdating && <span title="The routing service was busy, so distance and time are estimates">≈ estimate</span>}
              </div>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <button
                className="btn-secondary btn-sm"
                onClick={copyLink}
                aria-label="Copy link to this journey"
                title={linkCopied ? 'Link copied!' : 'Copy link to this journey'}
              >
                {linkCopied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
              </button>
              <button
                className="btn-secondary btn-sm"
                onClick={() => navigate('/journey', { state: { origin: plan.origin, destination: plan.destination, radiusKm: plan.radiusKm } })}
                aria-label="Edit journey"
                title="Edit journey"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* The three separate actions: Navigate (open in Google Maps), Save Trip, and (on the Saved page) Open Trip */}
          {!surprise && ends && (
            <div className="flex flex-wrap items-center gap-2">
              <NavigateButton start={plan.origin} stops={ends.via} end={ends.end} label="Navigate" className="btn-primary btn-sm" />
              <button
                className={dirty ? 'btn-secondary btn-sm border-forest-500' : 'btn-secondary btn-sm pointer-events-none text-forest-800'}
                onClick={saveJourney}
                disabled={saving || (!dirty)}
                data-testid="save-trip"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : dirty ? <Bookmark className="h-3.5 w-3.5" /> : <BookmarkCheck className="h-3.5 w-3.5" />}
                {savedTripId === null ? 'Save Trip' : dirty ? 'Save changes' : 'Saved'}
              </button>
              {stops.length > 0 && (
                <span className="text-xs font-semibold text-amber-800" data-testid="trip-count">{stops.length} in your trip</span>
              )}
            </div>
          )}

          {tripKind !== 'surprise-around' && (
            <p className="text-xs text-muted">
              <strong className="text-ink">{plan.attractions.length}</strong> places found along the route
              {plan.totalInCorridor > plan.attractions.length && (
                <> (the best {plan.attractions.length} of {plan.totalInCorridor} in the corridor)</>
              )}
            </p>
          )}
          {notice && <p className="rounded-lg bg-forest-50 px-3 py-2 text-xs text-forest-900">{notice}</p>}

          {saveError && <ErrorBanner message={saveError} />}
          {plan.warnings.map((warning) => (
            <ErrorBanner key={warning} tone="warning" message={warning} onRetry={() => setAttempt((n) => n + 1)} />
          ))}
        </div>

        {surprise ? (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-paper/60 p-3">
            <button className="btn-ghost btn-sm" onClick={() => { surpriseSession.clear(); setSurpriseCount((n) => n + 1); setSelectedId(null); }}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back to all places
            </button>
            <SurpriseTrip
              result={surprise}
              selectedId={selectedId}
              onSelect={selectPlace}
              onRoll={() => {
                setSelectedId(null);
                void surpriseSession.rollAgain();
              }}
              rolling={surpriseSession.rolling}
              canGoBack={surpriseSession.canGoBack}
              canGoForward={surpriseSession.canGoForward}
              onBack={surpriseSession.back}
              onForward={surpriseSession.forward}
              failure={surpriseSession.failure}
              onStartOver={() => void surpriseSession.startNew()}
              rollKey={surpriseSession.rollKey}
              fromPath={fromPath}
              onSave={() => void surpriseSaver.save(surprise)}
              saving={surpriseSaver.saving}
              savedTripId={surpriseSaver.savedIdFor(surprise)}
              saveError={surpriseSaver.error}
            />
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
          {stops.length > 0 && (
            <div data-testid="trip-section" className="space-y-3">
              <h2 className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wide text-amber-800">
                <span>Your trip · {stops.length} {stops.length === 1 ? 'stop' : 'stops'}</span>
              </h2>
              {sections.selected.map((place, index) => (
                <PlaceCard
                  key={place.id}
                  place={place}
                  selected={place.id === selectedId}
                  onSelect={selectPlace}
                  saved={isSaved(place.id)}
                  onToggleSave={toggleSave}
                  inTrip
                  tripNumber={index + 1}
                  onToggleTrip={toggleTrip}
                  onMove={(direction) => active.move(tripKey, place.id, direction)}
                  canMoveUp={index > 0}
                  canMoveDown={index < sections.selected.length - 1}
                  fromPath={fromPath}
                />
              ))}
              {sections.others.length > 0 && <hr className="border-line" />}
            </div>
          )}

          {sections.others.length === 0 && stops.length === 0 ? (
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
            sections.others.map((place) => (
              <PlaceCard
                key={place.id}
                place={place}
                selected={place.id === selectedId}
                onSelect={selectPlace}
                saved={isSaved(place.id)}
                onToggleSave={toggleSave}
                inTrip={false}
                onToggleTrip={toggleTrip}
                fromPath={fromPath}
              />
            ))
          )}
        </div>

            {/* The Surprise Me card, at the bottom of the list */}
            {tripKind !== 'surprise-around' && (
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
          places={surprise ? surprise.stops : mapPlaces}
          stopNumbers={surprise ? stopNumbers(surprise.stops) : numbers}
          selectedId={selectedId}
          onSelect={selectPlace}
          route={surprise ? surpriseLatLng ?? routeLatLng : routeLatLng}
          origin={plan.origin}
          destination={ends?.end ?? plan.destination}
          fitKey={fitKey}
          fromPath={fromPath}
        />
      </div>

      {surpriseOpen && tripKind !== 'surprise-around' && (
        <SurpriseRouteModal
          plan={plan}
          onClose={() => setSurpriseOpen(false)}
          themes={surpriseThemes}
          onThemesChange={setSurpriseThemes}
          onResult={(result, limits) => {
            setLastLimits(limits);
            surpriseSession.adopt(result);
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
