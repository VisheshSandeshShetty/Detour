// A row of category buttons. Click to switch categories on or off. No chip selected = show all.

import { CATEGORY_INFO, CATEGORY_ORDER } from '../lib/categories';
import type { CategoryKey } from '../types';

interface CategoryChipsProps {
  selected: CategoryKey[];
  onChange: (categories: CategoryKey[]) => void;
  counts: Partial<Record<CategoryKey, number>>; // how many places each category has
}

export default function CategoryChips({ selected, onChange, counts }: CategoryChipsProps) {
  function toggle(category: CategoryKey) {
    onChange(selected.includes(category) ? selected.filter((c) => c !== category) : [...selected, category]);
  }

  // Only offer categories that actually have places in the current results
  const available = CATEGORY_ORDER.filter((category) => (counts[category] ?? 0) > 0);
  if (available.length === 0) return null;

  return (
    <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-1" role="group" aria-label="Filter by category">
      <button className={`chip ${selected.length === 0 ? 'chip-active' : ''}`} onClick={() => onChange([])}>
        All
      </button>
      {available.map((category) => {
        const info = CATEGORY_INFO[category];
        const Icon = info.icon;
        const active = selected.includes(category);
        return (
          <button
            key={category}
            className={`chip ${active ? 'chip-active' : ''}`}
            onClick={() => toggle(category)}
            aria-pressed={active}
          >
            <Icon className="h-3.5 w-3.5" />
            {info.label}
            <span className={active ? 'text-white/70' : 'text-muted/70'}>{counts[category]}</span>
          </button>
        );
      })}
    </div>
  );
}
