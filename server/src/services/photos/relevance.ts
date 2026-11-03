// Decides whether a Wikimedia Commons file really shows THIS place.
// Pure functions (no network), so they are easy to test.
//
// Rules, in plain words:
//   * the file's title / description / categories must contain the place's name
//     (a spelling that is one typo or swap away also counts: Kapu ~ Kaup)
//   * if the file has coordinates it must be near the place
//   * a name made only of generic words ("Beach", "Temple") never matches by itself
//   * maps, logos, flags and diagrams are not photographs of the place

export interface PlaceIdentity {
  names: string[]; // all known names of the place (main name first)
  localities: string[]; // town / district / state names, used when a file has no coordinates
  latitude: number;
  longitude: number;
}

export interface CommonsCandidate {
  title: string; // "File:Kaup Beach.jpg"
  description: string;
  categories: string[];
  latitude: number | null;
  longitude: number | null;
}

export interface Verdict {
  ok: boolean;
  score: number;
  reason: string;
  distanceKm: number | null;
}

const GENERIC = new Set([
  'beach', 'temple', 'fort', 'park', 'lake', 'falls', 'fall', 'waterfall', 'museum', 'church', 'mosque', 'garden', 'gardens',
  'point', 'view', 'viewpoint', 'hill', 'hills', 'island', 'river', 'dam', 'palace', 'mandir', 'masjid', 'sea', 'the', 'of',
  'and', 'near', 'road', 'old', 'new', 'north', 'south', 'east', 'west', 'sri', 'shri', 'devi', 'cave', 'caves', 'bridge',
]);

export function normalize(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const tokens = (text: string) => normalize(text).split(' ').filter(Boolean);

// Edit distance where a swap of two neighbouring letters counts as ONE change
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

function tokenMatch(wanted: string, have: string): 'exact' | 'fuzzy' | null {
  if (wanted === have) return 'exact';
  if (wanted.length < 4 || have.length < 4) return null;
  const allowed = wanted.length >= 8 ? 2 : 1;
  return editDistance(wanted, have) <= allowed ? 'fuzzy' : null;
}

export function distinctiveTokens(name: string): string[] {
  return tokens(name).filter((t) => t.length >= 3 && !GENERIC.has(t));
}

// 'exact' = every distinctive word is there as written, 'fuzzy' = there with a small spelling difference
export function matchName(name: string, haystack: string): 'exact' | 'fuzzy' | null {
  const wanted = distinctiveTokens(name);
  if (wanted.length === 0) return null; // only generic words: too risky
  const have = tokens(haystack);
  let fuzzy = false;
  for (const word of wanted) {
    let best: 'exact' | 'fuzzy' | null = null;
    for (const candidate of have) {
      const result = tokenMatch(word, candidate);
      if (result === 'exact') { best = 'exact'; break; }
      if (result === 'fuzzy') best = 'fuzzy';
    }
    if (!best) return null;
    if (best === 'fuzzy') fuzzy = true;
  }
  return fuzzy ? 'fuzzy' : 'exact';
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

const NOT_A_PHOTO = /\b(map|locator|location map|logo|flag|coat of arms|diagram|plan of|emblem|icon|signature)\b/i;

export function judge(candidate: CommonsCandidate, place: PlaceIdentity): Verdict {
  const title = candidate.title.replace(/^File:/i, '').replace(/\.[a-z0-9]+$/i, '');
  const distanceKm =
    candidate.latitude !== null && candidate.longitude !== null
      ? haversineKm(place.latitude, place.longitude, candidate.latitude, candidate.longitude)
      : null;
  const reject = (reason: string): Verdict => ({ ok: false, score: 0, reason, distanceKm });

  if (NOT_A_PHOTO.test(title)) return reject('not a photograph (map, logo, flag or diagram)');
  if (distanceKm !== null && distanceKm > 30) return reject(`too far away (${distanceKm.toFixed(0)} km)`);

  const haystack = [title, candidate.description, ...candidate.categories].join(' ');
  let best: 'exact' | 'fuzzy' | null = null;
  let distinctiveCount = 0;
  for (const name of place.names) {
    const result = matchName(name, haystack);
    if (result === 'exact') { best = 'exact'; distinctiveCount = Math.max(distinctiveCount, distinctiveTokens(name).length); break; }
    if (result === 'fuzzy' && best === null) { best = 'fuzzy'; distinctiveCount = Math.max(distinctiveCount, distinctiveTokens(name).length); }
  }
  if (!best) return reject('the name of the place does not appear in the file title, description or categories');

  const localityHit = place.localities.some((l) => distinctiveTokens(l).length > 0 && matchName(l, haystack) === 'exact');
  const nameScore = best === 'exact' ? 3 : 2;

  if (distanceKm === null) {
    // No coordinates on the file: we need other proof that it is the right place
    if (best === 'exact' && (localityHit || distinctiveCount >= 2)) return { ok: true, score: nameScore, reason: 'name matches (no coordinates on file)', distanceKm };
    return reject('name matches but the file has no coordinates and nothing else confirms the location');
  }
  if (distanceKm <= 5) {
    const bonus = distanceKm <= 0.3 ? 2 : distanceKm <= 1.5 ? 1 : 0;
    return { ok: true, score: nameScore + bonus, reason: `name matches and the photo was taken ${distanceKm.toFixed(1)} km away`, distanceKm };
  }
  if (best === 'exact' && localityHit) return { ok: true, score: nameScore, reason: 'name and locality match, photographed some km away', distanceKm };
  return reject(`name matches but the file is ${distanceKm.toFixed(0)} km away and the locality does not confirm it`);
}
