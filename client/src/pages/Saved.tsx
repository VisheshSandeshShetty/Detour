// "/saved"  The user's saved places (login required, see ProtectedRoute in App.tsx).

import { Bookmark, Compass } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import CategoryChips from '../components/CategoryChips';
import MapView from '../components/MapView';
import PlaceCard from '../components/PlaceCard';
import { CardSkeletons, EmptyState, ErrorBanner } from '../components/ui';
import { useSavedPlaces } from '../context/SavedPlacesContext';
import type { CategoryKey } from '../types';

export default function Saved() {
  const { items, loading, error, isSaved, toggleSave } = useSavedPlaces();
  const [categories, setCategories] = useState<CategoryKey[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const places = useMemo(() => items.map((item) => item.place), [items]);
  const visiblePlaces = useMemo(
    () => places.filter((place) => categories.length === 0 || categories.includes(place.category)),
    [places, categories]
  );
  const counts = useMemo(() => {
    const result: Partial<Record<CategoryKey, number>> = {};
    for (const place of places) result[place.category] = (result[place.category] ?? 0) + 1;
    return result;
  }, [places]);

  useEffect(() => {
    if (selectedId) document.getElementById(`card-${selectedId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold">Saved places</h1>
        <p className="mt-1 text-muted">Everything you have bookmarked, all in one place.</p>
      </div>

      {error && <div className="mb-4"><ErrorBanner message={error} /></div>}

      {loading ? (
        <CardSkeletons count={3} />
      ) : places.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Bookmark}
            title="Nothing saved yet"
            text="Tap the heart on any place to keep it here."
            action={<Link to="/" className="btn-primary"><Compass className="h-4 w-4" /> Explore places</Link>}
          />
        </div>
      ) : (
        <>
          <div className="mb-4">
            <CategoryChips selected={categories} onChange={setCategories} counts={counts} />
          </div>
          <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
            <div className="order-2 space-y-3 lg:order-1 lg:max-h-[640px] lg:overflow-y-auto lg:pr-1">
              {visiblePlaces.map((place) => (
                <PlaceCard
                  key={place.id}
                  place={place}
                  selected={place.id === selectedId}
                  onSelect={setSelectedId}
                  saved={isSaved(place.id)}
                  onToggleSave={toggleSave}
                  fromPath="/saved"
                />
              ))}
            </div>
            <div className="card order-1 h-[320px] overflow-hidden lg:order-2 lg:h-[640px]">
              <div className="isolate h-full">
                <MapView
                  places={visiblePlaces}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  fitKey={`${visiblePlaces.length}-${categories.join(',')}`}
                  fromPath="/saved"
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
