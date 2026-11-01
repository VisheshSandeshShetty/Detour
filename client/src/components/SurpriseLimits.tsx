// The "how much time / how far" inputs shared by the Surprise Me tab and the along-a-route popup.
// Time is typed in hours (e.g. 3 or 2.5) and distance in km. Either one can be left empty,
// but at least one is needed.

import { Clock, Route } from 'lucide-react';

interface SurpriseLimitsProps {
  hours: string;
  km: string;
  onHoursChange: (value: string) => void;
  onKmChange: (value: string) => void;
  kmLabel?: string;
  hoursLabel?: string;
  idPrefix: string;
}

export default function SurpriseLimits({
  hours,
  km,
  onHoursChange,
  onKmChange,
  kmLabel = 'Max distance (km)',
  hoursLabel = 'Time available (hours)',
  idPrefix,
}: SurpriseLimitsProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="label" htmlFor={`${idPrefix}-hours`}>
          <Clock className="mr-1 inline h-3.5 w-3.5" />
          {hoursLabel}
        </label>
        <input
          id={`${idPrefix}-hours`}
          className="input"
          type="number"
          inputMode="decimal"
          min="0.25"
          step="0.25"
          placeholder="e.g. 3"
          value={hours}
          onChange={(e) => onHoursChange(e.target.value)}
        />
      </div>
      <div>
        <label className="label" htmlFor={`${idPrefix}-km`}>
          <Route className="mr-1 inline h-3.5 w-3.5" />
          {kmLabel}
        </label>
        <input
          id={`${idPrefix}-km`}
          className="input"
          type="number"
          inputMode="numeric"
          min="1"
          step="1"
          placeholder="e.g. 100"
          value={km}
          onChange={(e) => onKmChange(e.target.value)}
        />
      </div>
    </div>
  );
}

// Turns the two text boxes into numbers for the API. Returns an error message if they are not usable.
export function readLimits(
  hours: string,
  km: string
): { ok: true; timeMin: number | null; km: number | null } | { ok: false; message: string } {
  const h = hours.trim() === '' ? null : Number(hours);
  const k = km.trim() === '' ? null : Number(km);
  if (h === null && k === null) return { ok: false, message: 'Enter a time, a distance, or both.' };
  if (h !== null && (!Number.isFinite(h) || h <= 0)) return { ok: false, message: 'Time must be a positive number of hours.' };
  if (k !== null && (!Number.isFinite(k) || k <= 0)) return { ok: false, message: 'Distance must be a positive number of km.' };
  return { ok: true, timeMin: h === null ? null : Math.round(h * 60), km: k };
}
