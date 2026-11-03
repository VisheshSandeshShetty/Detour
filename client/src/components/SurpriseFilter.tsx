// The "Filter" button and its popup: tick the kinds of place Surprise Me may pick.
// On a phone it opens as a sheet at the bottom of the screen, on a bigger screen as a dropdown.
// Nothing ticked = no filter: a mix of everything, as before.

import { Check, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { ALL_THEME_KEYS, THEMES, themeLabel, type ThemeKey } from '../lib/themes';

interface SurpriseFilterProps {
  selected: ThemeKey[];
  onChange: (selected: ThemeKey[]) => void;
  disabled?: boolean;
}

export default function SurpriseFilter({ selected, onChange, disabled = false }: SurpriseFilterProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const count = selected.length;
  const allSelected = count === ALL_THEME_KEYS.length;

  // Escape or a click outside closes the popup
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  function toggle(key: ThemeKey) {
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className={`btn-secondary relative py-3 ${count > 0 ? 'border-forest-500 bg-forest-50 text-forest-800' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        disabled={disabled}
      >
        <SlidersHorizontal className="h-4 w-4" />
        Filter
        {count > 0 && (
          <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-forest-800 px-1.5 text-[11px] font-bold text-white">
            {count}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* dim background on phones only */}
          <div className="fixed inset-0 z-[1900] bg-ink/30 sm:hidden" aria-hidden="true" />
          <div
            id={panelId}
            role="dialog"
            aria-label="Choose kinds of place"
            className="fixed inset-x-0 bottom-0 z-[2000] max-h-[80dvh] overflow-y-auto rounded-t-3xl border border-line bg-white p-4 shadow-lift sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 sm:max-h-[70dvh] sm:rounded-2xl"
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-extrabold">Kinds of place</p>
              <button type="button" className="btn-ghost btn-sm -mr-2 sm:hidden" onClick={() => setOpen(false)} aria-label="Close filters">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-3 text-xs text-muted">Pick one or more. Surprise Me will only choose from these.</p>

            <div className="mb-2 flex gap-2">
              <button type="button" className="btn-secondary btn-sm" onClick={() => onChange([...ALL_THEME_KEYS])} disabled={allSelected}>
                Select all
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => onChange([])} disabled={count === 0}>
                Clear all
              </button>
            </div>

            <ul className="grid grid-cols-1 gap-1">
              {THEMES.map(({ key, label, icon: Icon }) => {
                const checked = selected.includes(key);
                return (
                  <li key={key}>
                    <label className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${checked ? 'bg-forest-50' : 'hover:bg-paper'}`}>
                      <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggle(key)} />
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${checked ? 'border-forest-700 bg-forest-800 text-white' : 'border-line bg-white'}`} aria-hidden="true">
                        {checked && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <Icon className="h-4 w-4 shrink-0 text-forest-700" aria-hidden="true" />
                      <span className="font-medium">{label}</span>
                    </label>
                  </li>
                );
              })}
            </ul>

            <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
              <p className="text-xs text-muted">{count === 0 ? 'No filter: a mix of everything.' : `${count} selected`}</p>
              <button type="button" className="btn-primary btn-sm" onClick={() => setOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Shows what is filtered, under the button. Nothing selected explains the default.
export function FilterSummary({ selected, onChange }: { selected: ThemeKey[]; onChange: (selected: ThemeKey[]) => void }) {
  if (selected.length === 0) {
    return <p className="text-xs text-muted">No filter: Surprise Me picks a mix of everything.</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
      {selected.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(selected.filter((k) => k !== key))}
          className="inline-flex items-center gap-1 rounded-full bg-forest-50 px-2.5 py-1 text-xs font-semibold text-forest-800 hover:bg-forest-100"
          title={`Remove ${themeLabel(key)}`}
        >
          {themeLabel(key)} <X className="h-3 w-3" />
        </button>
      ))}
      <button type="button" className="text-xs font-semibold text-muted underline" onClick={() => onChange([])}>
        Clear
      </button>
    </div>
  );
}
