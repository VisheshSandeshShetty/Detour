// Saving a Surprise Me result as a trip. Remembers which results were saved (by their stops), so the
// button turns into "Saved" and a later Roll Again never touches the saved trip.

import { useCallback, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { SurpriseResult } from '../types';
import { api, errorMessage } from './api';
import { stopsKey, surpriseToTripBody } from './trip';

export function surpriseKey(result: SurpriseResult): string {
  return `${result.mode}|${result.start.latitude},${result.start.longitude}|${stopsKey(result.stops)}`;
}

export function useSaveSurprise(radiusKm: number | null = null) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [saved, setSaved] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(
    async (result: SurpriseResult) => {
      if (!user) {
        navigate('/login', { state: { from: location.pathname + location.search, message: 'Log in to save this trip.' } });
        return;
      }
      setSaving(true);
      setError(null);
      try {
        const { trip } = await api.saveTrip(surpriseToTripBody(result, radiusKm));
        setSaved((current) => ({ ...current, [surpriseKey(result)]: trip.id }));
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setSaving(false);
      }
    },
    [user, navigate, location, radiusKm]
  );

  return { save, saving, error, savedIdFor: (result: SurpriseResult) => saved[surpriseKey(result)] ?? null };
}
