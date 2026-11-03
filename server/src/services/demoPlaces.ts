// A small built-in list of well-known places in coastal Karnataka (Mangalore, Udupi, Manipal and
// nearby). It is ONLY a safety net: if every Overpass server is unreachable (for example on a
// blocked college network), Detour shows these instead of an empty page, and clearly says so.
//
// Honest note: the places are real, but the coordinates were written from general knowledge
// and are approximate (usually within about 1 km). They were not checked against OpenStreetMap.
// Fake OpenStreetMap-style ids (node-99000xxx) are used so the rest of the app accepts them.

import type { CategoryKey } from '../lib/categories';
import type { ThemeKey } from '../lib/themes';
import type { Candidate } from '../types';

// Demo places have no OpenStreetMap tags, so their themes are read from the name
function themesFromName(name: string): ThemeKey[] {
  const themes: ThemeKey[] = [];
  if (/beach/i.test(name)) themes.push('beach');
  if (/island/i.test(name)) themes.push('beach');
  if (/temple|matha/i.test(name)) themes.push('temple', 'historic');
  if (/fort|battery|chapel/i.test(name)) themes.push('historic', 'landmark');
  if (/falls/i.test(name)) themes.push('waterfall');
  if (/sunset point|kudremukh/i.test(name)) themes.push('viewpoint', 'hill');
  if (/park|nisargadhama|end point/i.test(name)) themes.push('park');
  if (/heritage village/i.test(name)) themes.push('other');
  if (/lighthouse/i.test(name)) themes.push('landmark');
  return themes;
}

const raw: [string, CategoryKey, number, number][] = [
  ['Sri Krishna Matha, Udupi', 'historic', 13.3409, 74.7521],
  ['Malpe Beach', 'nature', 13.379, 74.704],
  ["St. Mary's Island", 'nature', 13.3794, 74.6753],
  ['Kaup Beach and Lighthouse', 'nature', 13.2178, 74.7467],
  ['Hasta Shilpa Heritage Village, Manipal', 'attraction', 13.353, 74.7955],
  ['End Point, Manipal', 'park', 13.351, 74.785],
  ['Kudroli Gokarnath Temple, Mangalore', 'historic', 12.8789, 74.8287],
  ['Panambur Beach', 'nature', 12.9486, 74.8077],
  ['Tannirbhavi Beach', 'nature', 12.921, 74.81],
  ['Sultan Battery, Mangalore', 'historic', 12.9061, 74.8225],
  ["St. Aloysius Chapel, Mangalore", 'historic', 12.8736, 74.8438],
  ['Pilikula Nisargadhama', 'park', 12.925, 74.899],
  ['Kadri Manjunatha Temple', 'historic', 12.8889, 74.8467],
  ['Mangaladevi Temple', 'historic', 12.8423, 74.8466],
  ['Maravanthe Beach', 'nature', 13.708, 74.635],
  ['Kollur Mookambika Temple', 'historic', 13.863, 74.814],
  ['Murudeshwar Temple', 'historic', 14.0942, 74.485],
  ['Dharmasthala Temple', 'historic', 12.9545, 75.38],
  ['Agumbe Sunset Point', 'nature', 13.5083, 75.09],
  ['Kudremukh', 'nature', 13.216, 75.254],
  ['Jog Falls', 'nature', 14.229, 74.812],
  ['Kukke Subramanya Temple', 'historic', 12.666, 75.61],
  ['Bekal Fort', 'historic', 12.392, 75.033],
];

export const DEMO_PLACES: Candidate[] = raw.map(([name, category, latitude, longitude], i) => ({
  id: `node-${99000001 + i}`,
  name,
  category,
  latitude,
  longitude,
  description: null,
  rating: null,
  imageUrl: null,
  openingHours: null,
  website: null,
  themes: themesFromName(name),
  score: 20,
}));

export const DEMO_WARNING =
  'The places service could not be reached, so a small built-in DEMO list of well-known places (Mangalore, Udupi, Manipal area, approximate locations) is shown instead. Try again later for live results.';
