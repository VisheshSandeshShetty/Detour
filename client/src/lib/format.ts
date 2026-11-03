// Small helpers that turn numbers into readable text.

export function formatKm(km: number): string {
  if (km < 0.1) return '<0.1 km';
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

// 215 -> "3 h 35 min"
export function formatDuration(minutes: number): string {
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours === 0) return `${mins} min`;
  return mins === 0 ? `${hours} h` : `${hours} h ${mins} min`;
}

// Extra driving time, e.g. "+14 min"
export function formatExtraTime(minutes: number): string {
  if (minutes < 1) return '+<1 min';
  const total = Math.round(minutes);
  return total >= 60 ? `+${formatDuration(total)}` : `+${total} min`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// A link that opens turn-by-turn directions to a place in the user's maps app
export function directionsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
}

// Opens the place in Google Maps, where its Google rating, reviews and photos are shown.
// We search by name plus coordinates so Google picks the right listing.
export function googleMapsUrl(name: string, latitude: number, longitude: number): string {
  const query = `${name} ${latitude.toFixed(6)},${longitude.toFixed(6)}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function openStreetMapUrl(latitude: number, longitude: number): string {
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`;
}
