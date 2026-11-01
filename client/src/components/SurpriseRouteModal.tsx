// The popup behind "Surprise Me Along This Route". It asks for the total trip time and/or the
// total distance, shows the reserved break, then asks the server for random stops along the route.

import { Loader2, Pause, Sparkles, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage } from '../lib/api';
import { formatDuration, formatKm } from '../lib/format';
import type { JourneyPlan, SurpriseResult } from '../types';
import SurpriseLimits, { readLimits } from './SurpriseLimits';
import { ErrorBanner } from './ui';

const FALLBACK_BREAK_MIN = 90; // used only if the server cannot be asked

interface Props {
  plan: JourneyPlan;
  onClose: () => void;
  onResult: (result: SurpriseResult, limits: { totalMin: number | null; maxTotalKm: number | null; breakMin: number }) => void;
}

export default function SurpriseRouteModal({ plan, onClose, onResult }: Props) {
  const direct = plan.route;
  // Start with something sensible: the direct trip plus about 30% (distance) and an extra 2 hours (time)
  const [hours, setHours] = useState(String(Math.ceil((direct.durationMin + 120) / 30) / 2));
  const [km, setKm] = useState(String(Math.ceil((direct.distanceKm * 1.15) / 10) * 10));
  const [breakMin, setBreakMin] = useState(FALLBACK_BREAK_MIN);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The break length lives on the server, so the app and the server always agree on it
  useEffect(() => {
    api.surpriseSettings().then((s) => setBreakMin(s.breakMin)).catch(() => undefined);
  }, []);

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
        breakMin,
      });
      onResult(result, { totalMin: limits.timeMin, maxTotalKm: limits.km, breakMin });
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
        <p className="-mt-2 text-xs text-muted">
          Total means the whole trip, including the surprise detours. Fill one or both.
        </p>

        <div className="flex items-start gap-2 rounded-xl border border-line px-3 py-2 text-sm">
          <Pause className="mt-0.5 h-4 w-4 shrink-0 text-forest-700" />
          <div>
            <p className="font-bold">Reserved break: {formatDuration(breakMin)}</p>
            <p className="text-xs text-muted">For rest, food and fuel. This is not exploration time, so it is taken out of your total time before choosing places.</p>
          </div>
        </div>

        {error && <ErrorBanner message={error} />}

        <button className="btn-primary w-full py-3" type="submit" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? 'Finding surprises…' : 'Surprise me'}
        </button>
      </form>
    </div>
  );
}
