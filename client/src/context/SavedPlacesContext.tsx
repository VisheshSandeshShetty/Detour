// The user's saved places, shared by every page so the heart buttons always agree.
//   const { isSaved, toggleSave } = useSavedPlaces();

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import type { Place, SavedItem } from '../types';
import { useAuth } from './AuthContext';

interface SavedPlacesContextValue {
  items: SavedItem[];
  loading: boolean;
  error: string | null;
  isSaved: (placeId: string) => boolean;
  // Saves the place, or removes it if already saved. Sends guests to the login page.
  toggleSave: (place: Place) => Promise<void>;
}

const SavedPlacesContext = createContext<SavedPlacesContextValue | null>(null);

export function SavedPlacesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [items, setItems] = useState<SavedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the list when someone logs in, clear it when they log out
  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }
    setLoading(true);
    api
      .listSaved()
      .then(setItems)
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [user]);

  function isSaved(placeId: string): boolean {
    return items.some((item) => item.place.id === placeId);
  }

  async function toggleSave(place: Place) {
    if (!user) {
      navigate('/login', {
        state: { from: location.pathname + location.search, message: 'Log in to save places.' },
      });
      return;
    }

    setError(null);
    try {
      const existing = items.find((item) => item.place.id === place.id);
      if (existing) {
        await api.removeSaved(existing.savedId);
        setItems((current) => current.filter((item) => item.savedId !== existing.savedId));
      } else {
        const saved = await api.savePlace(place);
        setItems((current) => [saved, ...current.filter((item) => item.place.id !== place.id)]);
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <SavedPlacesContext.Provider value={{ items, loading, error, isSaved, toggleSave }}>
      {children}
    </SavedPlacesContext.Provider>
  );
}

export function useSavedPlaces(): SavedPlacesContextValue {
  const context = useContext(SavedPlacesContext);
  if (!context) throw new Error('useSavedPlaces must be used inside <SavedPlacesProvider>');
  return context;
}
