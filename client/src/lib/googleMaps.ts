// Google Maps directions links (no API key, no billing: these are plain web links).
//
// A Google Maps directions link can carry at most 9 intermediate waypoints. A longer trip is cut into
// consecutive legs: each leg ends where the next one starts, so the stops stay in the saved order and
// none is dropped. The page tells the user when a trip was split.
//
// NOTE: client/src/lib/googleMaps.ts is an identical copy (the browser app cannot import from the
// server). A test checks that the two files stay identical.

export interface MapPoint {
  latitude: number;
  longitude: number;
  name?: string;
}

export const MAX_WAYPOINTS = 9;

const point = (p: MapPoint) => `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`;

export interface NavigationLeg {
  url: string;
  fromName: string;
  toName: string;
  stopCount: number; // stops visited inside this leg
}

export interface Navigation {
  legs: NavigationLeg[];
  split: boolean; // true when the trip needed more than one link
}

function legUrl(from: MapPoint, via: MapPoint[], to: MapPoint): string {
  const params = new URLSearchParams({
    api: '1',
    origin: point(from),
    destination: point(to),
    travelmode: 'driving',
  });
  if (via.length > 0) params.set('waypoints', via.map(point).join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

// start -> stops (in order) -> end
export function buildNavigation(start: MapPoint, stops: MapPoint[], end: MapPoint): Navigation {
  const points = [start, ...stops, end];
  const legs: NavigationLeg[] = [];
  const perLeg = MAX_WAYPOINTS + 2; // origin + 9 waypoints + destination
  let from = 0;
  while (from < points.length - 1) {
    const to = Math.min(from + perLeg - 1, points.length - 1);
    const via = points.slice(from + 1, to);
    legs.push({
      url: legUrl(points[from], via, points[to]),
      fromName: points[from].name ?? 'Start',
      toName: points[to].name ?? 'Destination',
      stopCount: via.length,
    });
    from = to;
  }
  return { legs, split: legs.length > 1 };
}

// Directions to one place
export function buildDirectionsUrl(to: MapPoint): string {
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', destination: point(to), travelmode: 'driving' }).toString()}`;
}
