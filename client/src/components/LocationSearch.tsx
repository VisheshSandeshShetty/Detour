// A text box that suggests real places while you type (autocomplete).
//
// The parent owns both the text and the chosen location, which makes things like the
// "swap" button easy. A location is only "chosen" after clicking a suggestion, because
// only then do we have real coordinates.
//
// To respect the free geocoding service we:
//   - wait 350 ms after the last keystroke before searching (debounce)
//   - cancel the previous search when you keep typing
//   - need at least 3 characters

import { Loader2, LocateFixed, MapPin } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { api, errorMessage } from '../lib/api';
import type { GeocodeResult, NamedLocation } from '../types';

interface LocationSearchProps {
  label?: string;
  placeholder: string;
  text: string;
  onTextChange: (text: string) => void;
  location: NamedLocation | null;
  onLocationChange: (location: NamedLocation | null) => void;
  allowCurrentLocation?: boolean;
  icon?: ReactNode;
  invalid?: boolean;
}

export default function LocationSearch({
  label,
  placeholder,
  text,
  onTextChange,
  location,
  onLocationChange,
  allowCurrentLocation = false,
  icon,
  invalid = false,
}: LocationSearchProps) {
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState(-1);
  const [locating, setLocating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Search 350 ms after the user stops typing
  useEffect(() => {
    const query = text.trim();
    const alreadyChosen = location !== null && location.name === text;
    if (!open || query.length < 3 || alreadyChosen) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const found = await api.geocode(query, controller.signal);
        setResults(found);
        setError(null);
        setHighlighted(-1);
      } catch (e) {
        if (controller.signal.aborted) return;
        setResults([]);
        setError(errorMessage(e));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, open, location]);

  // Close the list when clicking anywhere else
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function choose(result: GeocodeResult) {
    onTextChange(result.name);
    onLocationChange({ name: result.name, latitude: result.latitude, longitude: result.longitude });
    setOpen(false);
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError('Your browser does not support location.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const name = 'My current location';
        onTextChange(name);
        onLocationChange({ name, latitude: position.coords.latitude, longitude: position.coords.longitude });
        setLocating(false);
        setOpen(false);
      },
      () => {
        setError('Location permission was denied. Type a place name instead.');
        setLocating(false);
      },
      { timeout: 10000, maximumAge: 300000 }
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && open && highlighted >= 0 && results[highlighted]) {
      event.preventDefault();
      choose(results[highlighted]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  const showCurrentLocation = allowCurrentLocation && open && text.trim().length === 0;
  const showList = open && (results.length > 0 || loading || error || showCurrentLocation || text.trim().length >= 3);

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label htmlFor={inputId} className="label">
          {label}
        </label>
      )}
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-forest-700">
          {icon ?? <MapPin className="h-4 w-4" />}
        </span>
        <input
          id={inputId}
          className={`input pl-10 ${invalid ? 'input-error' : ''}`}
          placeholder={placeholder}
          value={text}
          autoComplete="off"
          role="combobox"
          aria-expanded={Boolean(showList)}
          aria-autocomplete="list"
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          onChange={(event) => {
            onTextChange(event.target.value);
            setOpen(true);
            // Typing again means the earlier choice no longer matches the text
            if (location) onLocationChange(null);
          }}
        />
        {loading && <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted" />}
      </div>

      {showList && (
        <ul
          className="absolute z-[1100] mt-1.5 max-h-72 w-full overflow-auto rounded-xl border border-line bg-white py-1 shadow-lift"
          role="listbox"
        >
          {showCurrentLocation && (
            <li>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={useMyLocation}
                className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-sm font-semibold text-forest-800 hover:bg-forest-50"
              >
                {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
                Use my current location
              </button>
            </li>
          )}
          {results.map((result, index) => (
            <li key={result.id + index} role="option" aria-selected={index === highlighted}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(result)}
                className={`flex w-full items-start gap-3 px-3.5 py-2.5 text-left hover:bg-forest-50 ${
                  index === highlighted ? 'bg-forest-50' : ''
                }`}
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{result.name}</span>
                  {result.subtitle && <span className="block truncate text-xs text-muted">{result.subtitle}</span>}
                </span>
              </button>
            </li>
          ))}
          {error && <li className="px-3.5 py-2.5 text-sm text-red-700">{error}</li>}
          {!loading && !error && results.length === 0 && text.trim().length >= 3 && location === null && (
            <li className="px-3.5 py-2.5 text-sm text-muted">No places found. Try another spelling.</li>
          )}
        </ul>
      )}
    </div>
  );
}
