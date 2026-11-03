// "Navigate": opens the complete itinerary (start, every stop in order, destination) in Google Maps.
// Plain Google Maps links, no API key. Google accepts 9 stops per link; a longer trip is opened as
// ordered parts, and we say so (no stop is ever left out).

import { ChevronDown, Navigation } from 'lucide-react';
import { useMemo, useState } from 'react';
import { buildNavigation, type MapPoint } from '../lib/googleMaps';

interface Props {
  start: MapPoint;
  stops: MapPoint[];
  end: MapPoint;
  label?: string;
  className?: string;
  disabled?: boolean;
}

export default function NavigateButton({ start, stops, end, label = 'Navigate', className = 'btn-primary btn-sm', disabled }: Props) {
  const [open, setOpen] = useState(false);
  const navigation = useMemo(() => buildNavigation(start, stops, end), [start, stops, end]);

  if (!navigation.split) {
    return (
      <a
        href={disabled ? undefined : navigation.legs[0].url}
        target="_blank"
        rel="noopener noreferrer"
        className={`${className} ${disabled ? 'pointer-events-none opacity-50' : ''}`}
        aria-disabled={disabled}
        data-testid="navigate"
        data-stops={stops.length}
      >
        <Navigation className="h-3.5 w-3.5" /> {label}
      </a>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        className={className}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-testid="navigate"
        data-stops={stops.length}
        disabled={disabled}
      >
        <Navigation className="h-3.5 w-3.5" /> {label} <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1.5 w-72 rounded-xl border border-line bg-white p-3 shadow-lift">
          <p className="text-xs text-muted">
            Google Maps takes at most 9 stops per link, so this trip opens in {navigation.legs.length} ordered parts. Do them in order:
          </p>
          <ol className="mt-2 space-y-1.5">
            {navigation.legs.map((leg, index) => (
              <li key={leg.url}>
                <a href={leg.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold hover:border-forest-400" onClick={() => setOpen(false)}>
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-forest-800 text-[11px] text-white">{index + 1}</span>
                  <span className="min-w-0 truncate">{leg.fromName} → {leg.toName}</span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
