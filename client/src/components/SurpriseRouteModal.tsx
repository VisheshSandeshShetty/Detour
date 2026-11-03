// The popup behind "Surprise Me Along This Route". It asks for the total trip time and/or the
// total distance, shows the reserved break, then asks the server for random stops along the route.

import { Loader2, Sparkles, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage } from '../lib/api';
import { formatDuration, formatKm } from '../lib/format';
import type { ThemeKey } from '../lib/themes';
import type { JourneyPlan, SurpriseResult } from '../types';
import SurpriseFilter, { FilterSummary } from './SurpriseFilter';
import SurpriseLimits, { readLimits } from './SurpriseLimits';
import { ErrorBanner } from './ui';

interface Props {
  plan: JourneyPlan;
  onClose: () => void;
  themes: ThemeKey[]; // kept by the page, so Roll Again uses the same kinds
  onThemesChange: (themes: ThemeKey[]) => void;
  onResult: (result: SurpriseResult, limits: { totalMin: number | null; maxTotalKm: number | null }) => void;
}

export default function SurpriseRouteModal({ plan, onClose, onResult, themes, onThemesChange }: Props) {
  const direct = plan.route;
  // Start with something sensible: the direct trip plus about 30% (distance) and an extra 2 hours (time)
  const [hours, setHours] = useState(String(Math.ceil((direct.durationMin + 120) / 30) / 2));
  const [km, setKm] = useState(String(Math.ceil((direct.distanceKm * 1.15) / 10) * 10));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Escape closes the popup
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !loading && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loading, onClose]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const limits = readLimits(hours, km);
    if (!limits.ok) {
      setError(limits.message);
      return;
    }
    setLoading(true);
    try {
      const result = await api.surpriseRoute({
        origin: plan.origin,
        destination: plan.destination,
        radiusKm: plan.radiusKm,
        totalMin: limits.timeMin,
        maxTotalKm: limits.km,
        themes,
        excludeIds: [], // a new surprise starts a new session
      });
      onResult(result, { totalMin: limits.timeMin, maxTotalKm: limits.km });
    } catch (e) {
      setError(errorMessage(e));
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-ink/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="surprise-title">
      <form onSubmit={submit} className="card w-full max-w-md space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="surprise-title" className="text-lg font-extrabold">Surprise me along this route</h2>
            <p className="mt-1 text-sm text-muted">
              {plan.origin.name} → {plan.destination.name}
            </p>
          </div>
          <button type="button" className="btn-ghost btn-sm" onClick={onClose} disabled={loading} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="rounded-xl bg-forest-50 px-3 py-2 text-sm">
          Direct trip: <strong>{formatKm(direct.distanceKm)}</strong> · <strong>{formatDuration(direct.durationMin)}</strong> of driving.
        </p>

        <SurpriseLimits
          hours={hours}
          km={km}
          onHoursChange={setHours}
          onKmChange={setKm}
          hoursLabel="Total trip time (hours)"
          kmLabel="Total distance (km)"
          idPrefix="route"
        />
        <div className="-mt-2 space-y-1 text-xs text-muted">
          <p><strong className="text-ink">Total trip time:</strong> Includes driving, breaks and time spent visiting attractions.</p>
          <p><strong className="text-ink">Total distance:</strong> Includes the driving route and detours required to visit selected attractions.</p>
          <p>Fill one or both. The whole trip stays inside every limit you give.</p>
        </div>

        {error && <ErrorBanner message={error} />}

        <div className="flex gap-2">
          <button className="btn-primary flex-1 py-3" type="submit" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? 'Finding surprises…' : 'Surprise me'}
          </button>
          <SurpriseFilter selected={themes} onChange={onThemesChange} disabled={loading} />
        </div>
        <FilterSummary selected={themes} onChange={onThemesChange} />
      </form>
    </div>
  );
}
