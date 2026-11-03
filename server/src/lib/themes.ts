// "Themes" are the finer kinds of place the Surprise Me filter offers (beaches, waterfalls, caves ...).
// They are different from the 7 broad categories (attraction, nature ...): one category can hold
// several themes, and one place can have more than one theme (a fort can be "landmark" and "historic").
//
// A theme is worked out ONCE, from the place's OpenStreetMap tags, when the place is downloaded.
// Restaurants, cafes and shops have no theme on purpose: they never match a theme filter.
// Keep the keys in sync with client/src/lib/themes.ts.

export const THEME_KEYS = [
  'landmark',
  'beach',
  'waterfall',
  'viewpoint',
  'hill',
  'park',
  'historic',
  'temple',
  'museum',
  'adventure',
  'cave',
  'other',
] as const;

export type ThemeKey = (typeof THEME_KEYS)[number];

export const THEME_LABELS: Record<ThemeKey, string> = {
  landmark: 'Landmarks and monuments',
  beach: 'Beaches',
  waterfall: 'Waterfalls',
  viewpoint: 'Viewpoints',
  hill: 'Hills and peaks',
  park: 'Parks and nature',
  historic: 'Historical places',
  temple: 'Temples and religious sites',
  museum: 'Museums',
  adventure: 'Adventure and activities',
  cave: 'Caves',
  other: 'Other attractions',
};

const ADVENTURE_SPORTS = ['climbing', 'canoe', 'kayak', 'scuba_diving', 'paragliding', 'surfing', 'rafting', 'diving'];

// The `tags` are the raw OpenStreetMap tags of one place.
export function detectThemes(tags: Record<string, string>): ThemeKey[] {
  const themes = new Set<ThemeKey>();
  if (tags.natural === 'beach') themes.add('beach');
  if (tags.waterway === 'waterfall') themes.add('waterfall');
  if (tags.tourism === 'viewpoint') themes.add('viewpoint');
  if (tags.natural === 'peak') themes.add('hill');
  if (tags.natural === 'cave_entrance') themes.add('cave');
  if (tags.tourism === 'museum' || tags.tourism === 'gallery') themes.add('museum');
  if (tags.amenity === 'place_of_worship') themes.add('temple');
  if (['monument', 'memorial', 'city_gate', 'palace'].includes(tags.historic)) themes.add('landmark');
  if (tags.historic) themes.add('historic');
  if (['park', 'garden', 'nature_reserve'].includes(tags.leisure) || tags.boundary === 'national_park') themes.add('park');
  if (
    tags.tourism === 'theme_park' ||
    tags.leisure === 'water_park' ||
    tags.aerialway === 'zip_line' ||
    ADVENTURE_SPORTS.includes(tags.sport)
  ) {
    themes.add('adventure');
  }
  if (['attraction', 'zoo', 'aquarium'].includes(tags.tourism) || ['cinema', 'theatre'].includes(tags.amenity)) {
    themes.add('other');
  }
  return [...themes];
}

// No themes selected = no filter. Otherwise the place needs at least one of the selected themes.
export function matchesThemes(place: { themes?: ThemeKey[] }, selected: ThemeKey[] | undefined): boolean {
  if (!selected || selected.length === 0) return true;
  return (place.themes ?? []).some((theme) => selected.includes(theme));
}

export function themeNames(selected: ThemeKey[]): string {
  return selected.map((theme) => THEME_LABELS[theme].toLowerCase()).join(', ');
}
