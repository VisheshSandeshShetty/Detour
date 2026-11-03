// Real photographs of a place, with who took them and under which licence.
// Three honest outcomes: photos, "No images found" (we searched, nothing relevant exists) and
// "temporarily unavailable" (a photo service did not answer, so we cannot say). Never a generic picture,
// never an endless spinner.

import { ChevronLeft, ChevronRight, ImageOff, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { CATEGORY_INFO } from '../lib/categories';
import type { PhotosResult, Place } from '../types';

type PhotoState = { kind: 'loading' } | { kind: 'done'; result: PhotosResult } | { kind: 'unavailable' };

const GIVE_UP_AFTER_MS = 40000; // the server needs a while on slow networks, but we never wait forever

export default function PlacePhotos({ place, ready }: { place: Pick<Place, 'id' | 'name' | 'latitude' | 'longitude' | 'category'>; ready: boolean }) {
  const [state, setState] = useState<PhotoState>({ kind: 'loading' });
  const [index, setIndex] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const autoRetried = useRef<string | null>(null); // one quiet retry per place before we show the error
  const info = CATEGORY_INFO[place.category];

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const giveUp = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), GIVE_UP_AFTER_MS);
    });
    setState({ kind: 'loading' });
    setIndex(0);
    Promise.race([api.placePhotos(place), giveUp])
      .then((result) => {
        if (cancelled) return;
        if (result.status === 'unavailable') throw new Error('unavailable');
        setState({ kind: 'done', result });
      })
      .catch((error: Error) => {
        if (cancelled) return;
        if (error.message === 'timeout') return setState({ kind: 'unavailable' });
        if (autoRetried.current !== place.id) {
          autoRetried.current = place.id;
          setAttempt((n) => n + 1); // a slow network often works on the second try
        } else setState({ kind: 'unavailable' });
      })
      .finally(() => clearTimeout(timer));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place.id, ready, attempt]);

  const frame = 'flex h-48 flex-col items-center justify-center gap-2 text-sm font-semibold sm:h-60';

  if (state.kind === 'loading') {
    return (
      <div className={`${frame} text-muted`} style={{ backgroundColor: `${info.color}12` }} aria-busy="true">
        <Loader2 className="h-6 w-6 animate-spin" /> Looking for photos…
      </div>
    );
  }
  if (state.kind === 'unavailable') {
    return (
      <div className={`${frame} text-muted`} style={{ backgroundColor: `${info.color}12` }}>
        <ImageOff className="h-6 w-6" />
        <span>Photos are temporarily unavailable.</span>
        <button className="btn-ghost btn-sm" onClick={() => setAttempt((n) => n + 1)}>
          <RefreshCw className="h-3.5 w-3.5" /> Try again
        </button>
      </div>
    );
  }
  const photos = state.result.photos;
  if (photos.length === 0) {
    return (
      <div className={`${frame} text-muted`} style={{ backgroundColor: `${info.color}12` }} data-testid="no-images">
        <ImageOff className="h-6 w-6" />
        No images found
      </div>
    );
  }

  const photo = photos[Math.min(index, photos.length - 1)];
  return (
    <figure data-testid="place-photo">
      <div className="relative">
        <img src={photo.url} alt={`${place.name}: ${photo.title}`} className="h-64 w-full bg-paper object-cover sm:h-80" referrerPolicy="no-referrer" />
        {photos.length > 1 && (
          <>
            <button className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1.5 shadow" onClick={() => setIndex((i) => (i - 1 + photos.length) % photos.length)} aria-label="Previous photo">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1.5 shadow" onClick={() => setIndex((i) => (i + 1) % photos.length)} aria-label="Next photo">
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">
              {index + 1} / {photos.length}
            </span>
          </>
        )}
      </div>
      <figcaption className="px-3 py-2 text-xs text-muted">
        {photo.attribution}
        {photo.pageUrl && (
          <> · <a className="underline" href={photo.pageUrl} target="_blank" rel="noreferrer">file page</a></>
        )}
        {photo.licenseUrl && (
          <> · <a className="underline" href={photo.licenseUrl} target="_blank" rel="noreferrer">licence</a></>
        )}
      </figcaption>
    </figure>
  );
}
