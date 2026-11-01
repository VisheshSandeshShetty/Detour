// The interactive Leaflet map used on Explore, Journey Results, Place Details and Saved Places.
//
// The page owns the data ("which place is selected?") and passes it in as props. The map
// only draws it and reports clicks back through onSelect. That keeps the map and the
// list of cards in sync: both look at the same `selectedId`.

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { Link } from 'react-router-dom';
import { CATEGORY_INFO } from '../lib/categories';
import type { NamedLocation, Place } from '../types';
import DetourStats from './DetourStats';
import { PlaceImage } from './PlaceCard';
import { formatKm, googleMapsUrl } from '../lib/format';

const TILE_URL = import.meta.env.VITE_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const DEFAULT_CENTER: [number, number] = [20.59, 78.96]; // India, used before we know where the user is

// ---------------------------------------------------------------------------------------
// Marker icons (plain HTML + CSS, styled in index.css)
// ---------------------------------------------------------------------------------------

const iconCache = new Map<string, L.DivIcon>();

function pinIcon(color: string, selected: boolean): L.DivIcon {
  const key = `${color}-${selected}`;
  let icon = iconCache.get(key);
  if (!icon) {
    icon = selected
      ? L.divIcon({
          className: '',
          html: `<div class="detour-pin is-selected" style="--pin:${color}"><span></span></div>`,
          iconSize: [38, 38],
          iconAnchor: [19, 46], // the tip of the pin sits exactly on the coordinates
        })
      : L.divIcon({
          className: '',
          html: `<div class="detour-pin" style="--pin:${color}"><span></span></div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 36],
        });
    iconCache.set(key, icon);
  }
  return icon;
}

const originIcon = L.divIcon({
  className: '',
  html: '<div class="detour-endpoint">A</div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});
const destinationIcon = L.divIcon({
  className: '',
  html: '<div class="detour-endpoint is-destination">B</div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});
const userIcon = L.divIcon({
  className: '',
  html: '<div class="detour-user"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

// ---------------------------------------------------------------------------------------
// Helpers that need access to the map object (they must live INSIDE <MapContainer>)
// ---------------------------------------------------------------------------------------

interface MapBehaviourProps {
  fitKey?: string;
  route?: [number, number][];
  center?: [number, number];
  selected: Place | null;
  fitPlaces: Place[];
}

function MapBehaviour({ fitKey, route, center, selected, fitPlaces }: MapBehaviourProps) {
  const map = useMap();

  // 1. Keep the map correct when its container changes size (window resize, mobile sheet ...)
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);

  // 2. Re-frame the map when a NEW journey / location arrives (fitKey changes).
  //    Filtering does not change fitKey, so the view stays put while filtering.
  useEffect(() => {
    if (route && route.length > 1) {
      map.fitBounds(L.latLngBounds(route), { padding: [48, 48] });
    } else if (center) {
      map.setView(center, 13);
    } else if (fitPlaces.length > 0) {
      map.fitBounds(L.latLngBounds(fitPlaces.map((p) => [p.latitude, p.longitude] as [number, number])), {
        padding: [60, 60],
        maxZoom: 14,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, map]);

  // 3. When a place is selected, pan to it only if it is not comfortably on screen already.
  //    We pan (move) instead of resetting the whole view, so the zoom level is kept.
  useEffect(() => {
    if (!selected) return;
    const position = L.latLng(selected.latitude, selected.longitude);
    if (!map.getBounds().pad(-0.25).contains(position)) {
      map.panTo(position, { animate: true });
    }
  }, [selected, map]);

  return null;
}

// ---------------------------------------------------------------------------------------
// The popup that opens for the selected place
// ---------------------------------------------------------------------------------------

function PlacePreview({ place, fromPath }: { place: Place; fromPath?: string }) {
  const info = CATEGORY_INFO[place.category];
  return (
    <div className="w-52">
      <div className="flex gap-2.5">
        <PlaceImage place={place} className="h-14 w-14 shrink-0 rounded-lg" />
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm font-bold leading-snug">{place.name}</p>
          <p className="mt-0.5 text-xs font-semibold" style={{ color: info.color }}>
            {info.label}
          </p>
        </div>
      </div>
      <div className="mt-2">
        {place.distanceFromRouteKm !== undefined ? (
          <DetourStats place={place} />
        ) : place.distanceKm !== undefined ? (
          <p className="text-xs text-muted">{formatKm(place.distanceKm)} away</p>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold">
        <Link to={`/places/${place.id}`} state={{ place, from: fromPath }} className="text-forest-700 hover:underline">
          View details →
        </Link>
        <a
          href={googleMapsUrl(place.name, place.latitude, place.longitude)}
          target="_blank"
          rel="noreferrer"
          className="text-muted hover:text-forest-800 hover:underline"
        >
          Google Maps ↗
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// The map itself
// ---------------------------------------------------------------------------------------

interface MapViewProps {
  places: Place[];
  selectedId: string | null;
  onSelect: (placeId: string | null) => void;
  route?: [number, number][]; // [latitude, longitude] pairs
  origin?: NamedLocation;
  destination?: NamedLocation;
  userLocation?: { latitude: number; longitude: number };
  center?: [number, number]; // where to look when there is no route
  fitKey?: string; // change this to make the map re-frame itself
  fromPath?: string; // passed on to the details page so it can link back
  className?: string;
}

export default function MapView({
  places,
  selectedId,
  onSelect,
  route,
  origin,
  destination,
  userLocation,
  center,
  fitKey,
  fromPath,
  className = '',
}: MapViewProps) {
  const [tilesFailed, setTilesFailed] = useState(false);
  const tileErrors = useRef(0);
  const tilesLoaded = useRef(0);

  // Always holds the current selection, so the popup's "closed" handler can tell the difference
  // between "the user closed the popup" and "the popup was replaced by another one".
  const selectedIdRef = useRef<string | null>(selectedId);
  selectedIdRef.current = selectedId;

  const selected = useMemo(() => places.find((place) => place.id === selectedId) ?? null, [places, selectedId]);

  return (
    <div className={`relative h-full w-full ${className}`}>
      <MapContainer
        center={center ?? DEFAULT_CENTER}
        zoom={center ? 13 : 5}
        scrollWheelZoom
        className="h-full w-full"
        zoomControl
      >
        <TileLayer
          url={TILE_URL}
          attribution={ATTRIBUTION}
          maxZoom={19}
          eventHandlers={{
            tileload: () => {
              tilesLoaded.current += 1;
            },
            tileerror: () => {
              tileErrors.current += 1;
              // Several failures and not a single tile loaded: the map really is broken
              if (tileErrors.current >= 4 && tilesLoaded.current === 0) setTilesFailed(true);
            },
          }}
        />

        <MapBehaviour fitKey={fitKey} route={route} center={center} selected={selected} fitPlaces={places} />

        {/* The route: a white outline under a green line so it stands out on any background */}
        {route && route.length > 1 && (
          <>
            <Polyline positions={route} pathOptions={{ color: '#ffffff', weight: 9, opacity: 0.9 }} />
            <Polyline positions={route} pathOptions={{ color: '#1f4a3a', weight: 5, opacity: 0.95 }} />
          </>
        )}

        {origin && (
          <Marker position={[origin.latitude, origin.longitude]} icon={originIcon} zIndexOffset={500}>
            <Tooltip direction="top" offset={[0, -14]}>
              Start: {origin.name}
            </Tooltip>
          </Marker>
        )}
        {destination && (
          <Marker position={[destination.latitude, destination.longitude]} icon={destinationIcon} zIndexOffset={500}>
            <Tooltip direction="top" offset={[0, -14]}>
              End: {destination.name}
            </Tooltip>
          </Marker>
        )}
        {userLocation && (
          <Marker position={[userLocation.latitude, userLocation.longitude]} icon={userIcon} interactive={false} />
        )}

        {places.map((place) => {
          const isSelected = place.id === selectedId;
          return (
            <Marker
              key={place.id}
              position={[place.latitude, place.longitude]}
              icon={pinIcon(CATEGORY_INFO[place.category].color, isSelected)}
              zIndexOffset={isSelected ? 1000 : 0}
              eventHandlers={{ click: () => onSelect(place.id) }}
            />
          );
        })}

        {selected && (
          <Popup
            key={selected.id}
            position={[selected.latitude, selected.longitude]}
            offset={[0, -44]}
            eventHandlers={{
              remove: () => {
                // Only treat it as "closed by the user" if this place is still the selected one
                if (selectedIdRef.current === selected.id) onSelect(null);
              },
            }}
          >
            <PlacePreview place={selected} fromPath={fromPath} />
          </Popup>
        )}
      </MapContainer>

      {tilesFailed && (
        <div className="absolute inset-x-4 top-4 z-[1000] rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-card">
          The map tiles could not be loaded. Check your internet connection, or the tile server set in{' '}
          <code>VITE_TILE_URL</code>.
        </div>
      )}
    </div>
  );
}
