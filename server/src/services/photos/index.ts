// Real photographs of a place. No generic category pictures, ever.
//
// Order of preference:
//   1. the OpenStreetMap  image  tag (only if it is a direct, working image link)
//   2. the Wikidata image (P18), then the Commons category named on Wikidata (P373)
//   3. an independent Wikimedia Commons search, by name variations and by position,
//      where every file is checked by relevance.ts before it is shown
//
// The answer says WHY there is no photo: "none" (we searched, nothing relevant exists) is a different
// thing from "unavailable" (a service was down, so we could not tell).

import { cacheGet, cacheSet } from '../../lib/cache';
import { fetchJson } from '../../lib/http';
import { judge, normalize, type CommonsCandidate, type PlaceIdentity } from './relevance';

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const MAX_PHOTOS = 8;
const ENOUGH = 6;

export interface PlacePhoto {
  url: string; // image shown on the page
  pageUrl: string; // where the photo lives (Commons file page, or the image itself)
  title: string;
  author: string | null;
  license: string | null;
  licenseUrl: string | null;
  attribution: string; // one ready-to-show line
  source: 'osm-image' | 'wikidata' | 'commons-search';
  reason?: string; // why it was judged relevant
}

export interface PhotosResult {
  status: 'ok' | 'none' | 'unavailable';
  photos: PlacePhoto[];
  searched: string[]; // the search terms that were tried (useful for debugging)
}

export interface PhotoInput {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  tags: Record<string, string>;
  nearbyNames?: string[]; // names of landmarks close by
}

// ---------------------------------------------------------------------------------------------
// Name variations
// ---------------------------------------------------------------------------------------------

function splitList(value: string | undefined): string[] {
  return (value ?? '').split(/[;|]/).map((s) => s.trim()).filter(Boolean);
}

export function identityOf(input: PhotoInput): PlaceIdentity {
  const t = input.tags;
  const names = unique([
    input.name,
    t.name,
    t['name:en'],
    t.int_name,
    t.official_name,
    t.short_name,
    t.old_name,
    t.loc_name,
    ...splitList(t.alt_name),
  ].filter((n): n is string => Boolean(n && n.trim())));
  const localities = unique(
    [t['addr:city'], t['addr:suburb'], t['addr:village'], t['addr:town'], t['addr:district'], t['addr:state'], t.is_in]
      .flatMap((v) => splitList(v))
  );
  return { names, localities, latitude: input.latitude, longitude: input.longitude };
}

const unique = <T>(items: T[]): T[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalize(String(item));
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// The text queries sent to Commons, most specific first
export function searchTerms(identity: PlaceIdentity, nearbyNames: string[] = []): string[] {
  const terms: string[] = [];
  const names = identity.names.slice(0, 4);
  terms.push(...names);
  const main = names[0];
  if (main) {
    for (const locality of identity.localities.slice(0, 3)) terms.push(`${main} ${locality}`);
    // name next to a landmark that is close by ("Kapu Beach Lighthouse")
    for (const near of nearbyNames.slice(0, 2)) terms.push(`${main} ${near}`);
  }
  return unique(terms).slice(0, 8);
}

// ---------------------------------------------------------------------------------------------
// Commons helpers
// ---------------------------------------------------------------------------------------------

interface CommonsPage {
  title: string;
  coordinates?: { lat: number; lon: number }[];
  imageinfo?: {
    thumburl?: string;
    url?: string;
    mime?: string;
    descriptionurl?: string;
    extmetadata?: Record<string, { value?: string }>;
  }[];
}
interface CommonsResponse {
  query?: { pages?: Record<string, CommonsPage> };
}

const stripHtml = (html: string | undefined | null): string | null =>
  html
    ? html.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim() || null
    : null;

const PROPS = {
  prop: 'imageinfo|coordinates',
  iiprop: 'url|mime|extmetadata',
  iiurlwidth: '900',
  colimit: 'max',
  coprimary: 'all',
};

async function commons(params: Record<string, string>): Promise<CommonsPage[]> {
  const query = new URLSearchParams({ action: 'query', format: 'json', ...PROPS, ...params });
  const data = await fetchJson<CommonsResponse>(`${COMMONS_API}?${query}`, { timeoutMs: 9000 });
  return Object.values(data.query?.pages ?? {});
}

interface ParsedFile {
  photo: Omit<PlacePhoto, 'source' | 'reason'>;
  candidate: CommonsCandidate;
}

export function parsePage(page: CommonsPage): ParsedFile | null {
  const info = page.imageinfo?.[0];
  if (!info?.mime || !/^image\/(jpeg|png|webp)$/.test(info.mime)) return null; // no SVG maps, PDFs, audio
  const url = info.thumburl ?? info.url;
  if (!url) return null;
  const meta = info.extmetadata ?? {};
  const author = stripHtml(meta.Artist?.value);
  const license = stripHtml(meta.LicenseShortName?.value);
  const title = page.title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '');
  const gps = page.coordinates?.[0];
  const exifLat = Number(meta.GPSLatitude?.value);
  const exifLon = Number(meta.GPSLongitude?.value);
  const latitude = gps?.lat ?? (Number.isFinite(exifLat) && meta.GPSLatitude?.value ? exifLat : null);
  const longitude = gps?.lon ?? (Number.isFinite(exifLon) && meta.GPSLongitude?.value ? exifLon : null);
  const pageUrl = info.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`;
  return {
    photo: {
      url,
      pageUrl,
      title,
      author,
      license,
      licenseUrl: meta.LicenseUrl?.value ?? null,
      attribution: [author ? `Photo by ${author}` : 'Photo', license, 'Wikimedia Commons'].filter(Boolean).join(' · '),
    },
    candidate: {
      title: page.title,
      description: [stripHtml(meta.ImageDescription?.value), stripHtml(meta.ObjectName?.value)].filter(Boolean).join(' '),
      categories: (meta.Categories?.value ?? '').split('|').map((c) => c.trim()).filter(Boolean),
      latitude: latitude !== null && Number.isFinite(latitude) ? latitude : null,
      longitude: longitude !== null && Number.isFinite(longitude) ? longitude : null,
    },
  };
}

const FILE_NAME = /\.(jpe?g|png|webp)$/i;

// ---------------------------------------------------------------------------------------------
// Wikidata
// ---------------------------------------------------------------------------------------------

interface WikidataEntity {
  entities?: Record<string, { claims?: Record<string, { mainsnak?: { datavalue?: { value?: unknown } } }[]> }>;
}

export async function wikidataLinks(qid: string | undefined): Promise<{ images: string[]; category: string | null }> {
  if (!qid || !/^Q\d+$/.test(qid)) return { images: [], category: null };
  const data = await fetchJson<WikidataEntity>(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`, { timeoutMs: 8000 });
  const entity = data.entities?.[qid];
  const strings = (property: string): string[] =>
    (entity?.claims?.[property] ?? []).map((c) => c.mainsnak?.datavalue?.value).filter((v): v is string => typeof v === 'string');
  return { images: strings('P18'), category: strings('P373')[0] ?? null };
}

// ---------------------------------------------------------------------------------------------
// OpenStreetMap image tag
// ---------------------------------------------------------------------------------------------

// Returns a direct image URL, a Commons file name, or null when the tag is unusable
export function parseOsmImageTag(tags: Record<string, string>): { directUrl?: string; commonsFile?: string } | null {
  const raw = splitList(tags.image)[0];
  if (!raw) return null;
  if (/^file:/i.test(raw)) return FILE_NAME.test(raw) ? { commonsFile: raw.replace(/^file:/i, '') } : null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.hostname.endsWith('wikimedia.org') || url.hostname.endsWith('wikipedia.org')) {
    const special = /\/Special:FilePath\/(.+)$/i.exec(url.pathname) ?? /\/wiki\/File:(.+)$/i.exec(url.pathname);
    if (special) return { commonsFile: decodeURIComponent(special[1]) };
  }
  // Pages such as Flickr or Facebook posts are not images; only accept real image file links
  if (!FILE_NAME.test(url.pathname)) return null;
  return { directUrl: url.toString().replace(/^http:/, 'https:') };
}

async function isWorkingImage(url: string): Promise<boolean> {
  const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000), redirect: 'follow' });
  return response.ok && (response.headers.get('content-type') ?? '').startsWith('image/');
}

// ---------------------------------------------------------------------------------------------
// The search
// ---------------------------------------------------------------------------------------------

export async function findPhotos(input: PhotoInput): Promise<PhotosResult> {
  const identity = identityOf(input);
  const searched: string[] = [];
  const found: PlacePhoto[] = [];
  const seen = new Set<string>();
  let succeeded = 0;
  let failed = 0;

  const dedupeKey = (title: string) => normalize(title).replace(/\b\d+\b/g, '').replace(/\s+/g, ' ').trim();
  const add = (photo: PlacePhoto) => {
    const key = dedupeKey(photo.title);
    if (seen.has(key) || seen.has(photo.url)) return;
    seen.add(key);
    seen.add(photo.url);
    found.push(photo);
  };
  // A step may fail alone (service down). We keep going and remember that it failed.
  const attempt = async (work: () => Promise<void>) => {
    try {
      await work();
      succeeded++;
    } catch {
      failed++;
    }
  };

  // 1. OSM image tag
  const osm = parseOsmImageTag(input.tags);
  if (osm?.directUrl) {
    const directUrl = osm.directUrl;
    await attempt(async () => {
      if (await isWorkingImage(directUrl)) {
        add({ url: directUrl, pageUrl: directUrl, title: input.name, author: null, license: null, licenseUrl: null, attribution: 'Photo linked from OpenStreetMap (author and licence not stated)', source: 'osm-image' });
      }
    });
  }

  // Explicit links: the OSM Commons file, the Wikidata image and the Wikidata category
  const linkedFiles: { name: string; source: PlacePhoto['source'] }[] = [];
  if (osm?.commonsFile) linkedFiles.push({ name: osm.commonsFile, source: 'osm-image' });
  const commonsTag = input.tags.wikimedia_commons;
  if (commonsTag?.startsWith('File:') && FILE_NAME.test(commonsTag)) linkedFiles.push({ name: commonsTag.slice(5), source: 'wikidata' });
  let category: string | null = commonsTag?.startsWith('Category:') ? commonsTag : null;
  if (input.tags.wikidata) {
    await attempt(async () => {
      const links = await wikidataLinks(input.tags.wikidata);
      for (const name of links.images) linkedFiles.push({ name, source: 'wikidata' });
      category ??= links.category;
    });
  }
  if (linkedFiles.length) {
    await attempt(async () => {
      const pages = await commons({ titles: linkedFiles.slice(0, 10).map((f) => `File:${f.name.replace(/^File:/, '')}`).join('|') });
      for (const page of pages) {
        const parsed = parsePage(page);
        const source = linkedFiles.find((f) => normalize(`File:${f.name}`) === normalize(page.title))?.source ?? 'wikidata';
        if (parsed) add({ ...parsed.photo, source, reason: 'linked directly from OpenStreetMap or Wikidata' });
      }
    });
  }
  if (category) {
    const categoryTitle = category.startsWith('Category:') ? category : `Category:${category}`;
    await attempt(async () => {
      const pages = await commons({ generator: 'categorymembers', gcmtype: 'file', gcmlimit: '10', gcmtitle: categoryTitle });
      for (const page of pages) {
        const parsed = parsePage(page);
        if (parsed) add({ ...parsed.photo, source: 'wikidata', reason: 'in the Commons category linked from Wikidata' });
      }
    });
  }

  // 2. Independent Commons search: text variations, then position
  if (found.length < ENOUGH) {
    const accept = (pages: CommonsPage[]) => {
      const accepted: { photo: PlacePhoto; score: number }[] = [];
      for (const page of pages) {
        const parsed = parsePage(page);
        if (!parsed) continue;
        const verdict = judge(parsed.candidate, identity);
        if (verdict.ok) accepted.push({ photo: { ...parsed.photo, source: 'commons-search', reason: verdict.reason }, score: verdict.score });
      }
      accepted.sort((a, b) => b.score - a.score).forEach((a) => add(a.photo));
    };

    // All searches run at the same time (a slow network used to add them up); results are then merged in
    // the order of the search terms, so the most specific name still comes first.
    const terms = searchTerms(identity, input.nearbyNames);
    const jobs: Promise<CommonsPage[] | null>[] = terms.map((term) => {
      searched.push(term);
      return commons({ generator: 'search', gsrsearch: `${term} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '15' }).catch(() => null);
    });
    searched.push(`photos taken near ${input.latitude.toFixed(4)}, ${input.longitude.toFixed(4)}`);
    jobs.push(
      commons({ generator: 'geosearch', ggscoord: `${input.latitude}|${input.longitude}`, ggsradius: '1500', ggsnamespace: '6', ggslimit: '40' }).catch(() => null)
    );
    for (const pages of await Promise.all(jobs)) {
      if (pages === null) failed++;
      else {
        succeeded++;
        accept(pages);
      }
    }
  }

  const photos = found.slice(0, MAX_PHOTOS);
  if (photos.length > 0) return { status: 'ok', photos, searched };
  // Nothing found. If every request failed we cannot say "no photo exists", only "we could not check".
  return { status: succeeded === 0 && failed > 0 ? 'unavailable' : 'none', photos: [], searched };
}

// Cached wrapper: good and "none" answers are remembered, "unavailable" only for a minute
export async function getPhotos(input: PhotoInput): Promise<PhotosResult> {
  const key = `photos:v2:${input.id}`;
  const hit = cacheGet<PhotosResult>(key);
  if (hit) return hit;
  const result = await findPhotos(input);
  cacheSet(key, result, result.status === 'ok' ? 24 * 3600 : result.status === 'none' ? 6 * 3600 : 60);
  return result;
}
