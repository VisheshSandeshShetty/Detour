// "/surprise"  Surprise Me: tell us how much time or distance you have, and we pick a random trip
// of interesting places around you. Round trip or one way.

import { Dices, Loader2, LocateFixed, MapPin, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import LocationSearch from '../components/LocationSearch';
import MapView from '../components/MapView';
import SurpriseLimits, { readLimits } from '../components/SurpriseLimits';
import SurpriseFilter, { FilterSummary } from '../components/SurpriseFilter';
import SurpriseTrip from '../components/SurpriseTrip';
import { ErrorBanner } from '../components/ui';
import { api } from '../lib/api';
import type { ThemeKey } from '../lib/themes';
import { useSurpriseSession } from '../lib/useSurpriseSession';
import { useSaveSurprise } from '../lib/useSaveSurprise';
import { stopNumbers } from '../lib/trip';
import type { NamedLocation } from '../types';

export default function Surprise() {
  const [startText, setStartText] = useState('');
  const [start, setStart] = useState<NamedLocation | null>(null);
  const [hours, setHours] = useState('3');
  const [km, setKm] = useState('100');
  const [tripType, setTripType] = useState<'roundtrip' | 'oneway'>('roundtrip');

  const [themes, setThemes] = useState<ThemeKey[]>([]); // kinds of place; empty = anything
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Reads the form as it is RIGHT NOW. Roll Again calls this again, so it keeps the filters.
  // It throws a readable message if the form is not filled in properly.
  async function ask(excludeIds: string[]) {
    if (!start) throw new Error('Choose a starting place first, or use your location.');
    const limits = readLimits(hours, km);
    if (!limits.ok) throw new Error(limits.message);
    return api.surpriseAround({ start, tripType, timeMin: limits.timeMin, maxKm: limits.km, themes, excludeIds });
  }
  const session = useSurpriseSession(ask);
  const { result } = session;
  const saver = useSaveSurprise();

  // "Around me" is the default, so try the browser location once. A refusal is fine: they can type a place.
  const [locating, setLocating] = useState(false);
  function locateMe() {
    if (!navigator.geolocation) {
      setError('Your browser cannot share its location. Type a starting place instead.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const here = { name: 'Your location', latitude: position.coords.latitude, longitude: position.coords.longitude };
        setStart(here);
        setStartText(here.name);
        setLocating(false);
        setError(null);
      },
      () => {
        setLocating(false);
        setError('Could not get your location. Allow location access, or type a starting place.');
      },
      { timeout: 10000, maximumAge: 300000 }
    );
  }
  useEffect(() => {
    locateMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function surprise() {
    setError(null);
    setSelectedId(null);
    void session.startNew();
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    surprise();
  }

  const routeLatLng = useMemo(
    () => result?.geometry?.map(([lon, lat]) => [lat, lon] as [number, number]),
    [result]
  );

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[420px_1fr]">
      <div className="space-y-5">
        <div>
          <span className="badge mb-3">
            <Sparkles className="h-3.5 w-3.5" /> Surprise Me
          </span>
          <h1 className="text-3xl font-extrabold leading-tight">Got a few free hours?</h1>
          <p className="mt-2 text-muted">
            Tell us how much time or distance you have. We pick a few random places worth visiting and plan the trip.
          </p>
        </div>

        <form onSubmit={onSubmit} className="card space-y-4 p-4">
          <div className="space-y-2">
            <LocationSearch
              label="Starting from"
              placeholder="Search a place"
              text={startText}
              onTextChange={setStartText}
              location={start}
              onLocationChange={setStart}
              allowCurrentLocation
              icon={<MapPin className="h-4 w-4" />}
            />
            <button type="button" className="btn-ghost btn-sm" onClick={locateMe} disabled={locating}>
              {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />}
              Use my location
            </button>
          </div>

          <SurpriseLimits hours={hours} km={km} onHoursChange={setHours} onKmChange={setKm} idPrefix="around" />
          <p className="-mt-2 text-xs text-muted">Fill one or both. The trip stays inside every limit you give.</p>

          <fieldset>
            <legend className="label">Trip type</legend>
            <div className="grid grid-cols-2 gap-2" role="radiogroup">
              {(
                [
                  ['roundtrip', 'Round trip', 'Back to where you started'],
                  ['oneway', 'One way', 'End at the last stop'],
                ] as const
              ).map(([value, title, text]) => (
                <label
                  key={value}
                  className={`cursor-pointer rounded-xl border p-3 text-sm transition ${
                    tripType === value ? 'border-forest-500 bg-forest-50' : 'border-line hover:border-forest-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="tripType"
                    className="sr-only"
                    checked={tripType === value}
                    onChange={() => setTripType(value)}
                  />
                  <span className="block font-bold">{title}</span>
                  <span className="text-xs text-muted">{text}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {error && <ErrorBanner message={error} />}
          {!result && session.failure && <ErrorBanner message={session.failure.message} />}

          <div className="flex gap-2">
            <button className="btn-primary flex-1 py-3" type="submit" disabled={session.rolling}>
              {session.rolling && !result ? <Dices className="h-4 w-4 detour-rolling" /> : <Sparkles className="h-4 w-4" />}
              {session.rolling && !result ? 'Rolling…' : result ? 'New surprise' : 'Surprise me'}
            </button>
            <SurpriseFilter selected={themes} onChange={setThemes} disabled={session.rolling} />
          </div>
          <FilterSummary selected={themes} onChange={setThemes} />
        </form>

        {result && (
          <SurpriseTrip
            result={result}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onRoll={() => {
              setSelectedId(null);
              void session.rollAgain();
            }}
            rolling={session.rolling}
            canGoBack={session.canGoBack}
            canGoForward={session.canGoForward}
            onBack={session.back}
            onForward={session.forward}
            failure={session.failure}
            onStartOver={() => surprise()}
            rollKey={session.rollKey}
            fromPath="/surprise"
            onSave={() => void saver.save(result)}
            saving={saver.saving}
            savedTripId={saver.savedIdFor(result)}
            saveError={saver.error}
          />
        )}
      </div>

      <div className="h-[420px] overflow-hidden rounded-2xl border border-line lg:sticky lg:top-20 lg:h-[calc(100dvh-7rem)]">
        <MapView
          places={result?.stops ?? []}
          selectedId={selectedId}
          onSelect={setSelectedId}
          route={routeLatLng}
          origin={result?.start ?? start ?? undefined}
          center={start ? [start.latitude, start.longitude] : undefined}
          stopNumbers={stopNumbers(result?.stops ?? [])}
          fitKey={`surprise-${session.rollKey}-${start?.latitude ?? 0}`}
          fromPath="/surprise"
        />
      </div>
    </div>
  );
}
