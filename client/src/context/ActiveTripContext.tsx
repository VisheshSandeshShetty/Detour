// The itinerary the user is building RIGHT NOW (the "active trip").
//
// This is the single source of truth for which places are selected and in what order. The attraction
// list, the map markers, the Navigate button, Save Trip and Place Details all read it from here, so
// they can never disagree. It lives above the pages, so the selection also survives a visit to Place
// Details and back.
//
// `key` says which journey page the stops belong to (its address). When the journey page opens with a
// different key, it starts a new itinerary.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { TripStop } from '../types';
import { moveStop, toggleStop } from './activeTripLogic';

interface ActiveTrip {
  key: string | null;
  stops: TripStop[];
}

interface ActiveTripValue extends ActiveTrip {
  // Replace the whole itinerary (used when a journey or saved trip opens)
  reset: (key: string, stops: TripStop[]) => void;
  // Add the place at the end, or remove it if it is already there. Never creates duplicates.
  toggle: (key: string, place: TripStop) => void;
  remove: (key: string, placeId: string) => void;
  move: (key: string, placeId: string, direction: -1 | 1) => void;
  has: (placeId: string) => boolean;
}

const Context = createContext<ActiveTripValue | null>(null);

export function ActiveTripProvider({ children }: { children: ReactNode }) {
  const [trip, setTrip] = useState<ActiveTrip>({ key: null, stops: [] });

  const reset = useCallback((key: string, stops: TripStop[]) => setTrip({ key, stops }), []);
  // Every change names the journey it is for, so a late click can never edit another journey's stops
  const update = useCallback(
    (key: string, change: (stops: TripStop[]) => TripStop[]) =>
      setTrip((current) => (current.key === key ? { key, stops: change(current.stops) } : current)),
    []
  );
  const toggle = useCallback((key: string, place: TripStop) => update(key, (stops) => toggleStop(stops, place)), [update]);
  const remove = useCallback((key: string, id: string) => update(key, (stops) => stops.filter((s) => s.id !== id)), [update]);
  const move = useCallback((key: string, id: string, d: -1 | 1) => update(key, (stops) => moveStop(stops, id, d)), [update]);

  const value = useMemo<ActiveTripValue>(
    () => ({ ...trip, reset, toggle, remove, move, has: (id) => trip.stops.some((s) => s.id === id) }),
    [trip, reset, toggle, remove, move]
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useActiveTrip(): ActiveTripValue {
  const value = useContext(Context);
  if (!value) throw new Error('useActiveTrip must be used inside <ActiveTripProvider>');
  return value;
}
