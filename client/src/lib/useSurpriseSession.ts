// Keeps track of ONE Surprise Me session: every recommendation shown so far, which places were
// already shown (so Roll Again never repeats them), and which one is on screen (so the user can go
// back to the previous recommendation).
//
// The page gives us `run(excludeIds)`, a function that asks the server for a recommendation with the
// page's CURRENT filters. Because every roll calls it again, the filters are kept automatically.

import { useCallback, useRef, useState } from 'react';
import type { SurpriseResult } from '../types';
import { ApiError, errorMessage } from './api';

export type Failure = { message: string; reason: 'exhausted' | 'no-match' | 'other' };

const MIN_ROLL_MS = 600; // so the rolling animation is visible even when the server is very quick
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Store {
  history: SurpriseResult[];
  index: number; // which entry of the history is on screen, -1 = none yet
}

export function useSurpriseSession(run: (excludeIds: string[]) => Promise<SurpriseResult>) {
  const [store, setStore] = useState<Store>({ history: [], index: -1 });
  const [rolling, setRolling] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [rollKey, setRollKey] = useState(0); // changes on every new recommendation, to replay the reveal animation
  const seen = useRef<Set<string>>(new Set());
  const busy = useRef(false);
  const runRef = useRef(run);
  runRef.current = run; // always the latest filters

  // fresh = true starts a new session (nothing is excluded). false = Roll Again.
  const execute = useCallback(async (fresh: boolean) => {
    if (busy.current) return; // ignore double clicks
    busy.current = true;
    setRolling(true);
    setFailure(null);
    try {
      const [result] = await Promise.all([runRef.current(fresh ? [] : [...seen.current]), sleep(MIN_ROLL_MS)]);
      if (fresh) seen.current = new Set();
      result.stops.forEach((stop) => seen.current.add(stop.id));
      setStore((prev) =>
        fresh ? { history: [result], index: 0 } : { history: [...prev.history.slice(0, prev.index + 1), result], index: prev.index + 1 }
      );
      setRollKey((k) => k + 1);
    } catch (error) {
      const reason = error instanceof ApiError && (error.reason === 'exhausted' || error.reason === 'no-match') ? error.reason : 'other';
      setFailure({ message: errorMessage(error), reason });
    } finally {
      busy.current = false;
      setRolling(false);
    }
  }, []);

  // Use a result that was fetched elsewhere (for example from the "along this route" popup)
  const adopt = useCallback((result: SurpriseResult) => {
    seen.current = new Set(result.stops.map((stop) => stop.id));
    setStore({ history: [result], index: 0 });
    setFailure(null);
    setRollKey((k) => k + 1);
  }, []);

  const clear = useCallback(() => {
    seen.current = new Set();
    setStore({ history: [], index: -1 });
    setFailure(null);
  }, []);

  const go = useCallback((delta: number) => {
    setStore((prev) => {
      const index = prev.index + delta;
      return index < 0 || index >= prev.history.length ? prev : { ...prev, index };
    });
    setFailure(null);
    setRollKey((k) => k + 1);
  }, []);

  return {
    result: store.index >= 0 ? store.history[store.index] : null,
    rolling,
    failure,
    rollKey,
    seenCount: seen.current.size,
    canGoBack: store.index > 0,
    canGoForward: store.index >= 0 && store.index < store.history.length - 1,
    startNew: () => execute(true),
    rollAgain: () => execute(false),
    back: () => go(-1),
    forward: () => go(1),
    adopt,
    clear,
  };
}
