// Tests for photo discovery. Every outside service (Wikimedia Commons, Wikidata, image hosts) is a
// fake answer, so these prove OUR logic: priority order, name variations, relevance filtering,
// attribution, duplicates, "none" versus "unavailable". They do not prove today's real Wikimedia answers.

import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import { cacheClear } from '../lib/cache';
import { findPhotos, getPhotos, identityOf, parseOsmImageTag, searchTerms } from '../services/photos';
import { editDistance, judge, matchName } from '../services/photos/relevance';

const realFetch = globalThis.fetch;
after(() => { globalThis.fetch = realFetch; });

// ---- a tiny fake Wikimedia ----
interface FakeFile { title: string; lat?: number; lon?: number; description?: string; categories?: string[]; mime?: string; artist?: string; license?: string }
let files: FakeFile[] = [];
let wikidata: Record<string, { P18?: string[]; P373?: string[] }> = {};
let imageOk: Record<string, boolean> = {};
let down = new Set<string>();
const requests: string[] = [];

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const page = (f: FakeFile, i: number) => ({
  pageid: i + 1,
  title: f.title,
  ...(f.lat !== undefined ? { coordinates: [{ lat: f.lat, lon: f.lon }] } : {}),
  imageinfo: [{
    thumburl: `https://upload.wikimedia.org/thumb/${encodeURIComponent(f.title)}`,
    mime: f.mime ?? 'image/jpeg',
    descriptionurl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(f.title)}`,
    extmetadata: {
      Artist: { value: `<a href="x">${f.artist ?? 'Jane Doe'}</a>` },
      LicenseShortName: { value: f.license ?? 'CC BY-SA 4.0' },
      LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' },
      ImageDescription: { value: f.description ?? '' },
      Categories: { value: (f.categories ?? []).join('|') },
    },
  }],
});
const pages = (list: FakeFile[]) => ({ query: { pages: Object.fromEntries(list.map((f, i) => [i, page(f, i)])) } });

function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input));
  requests.push(url.toString());
  if (down.has(url.host)) return Promise.reject(new TypeError('fetch failed'));
  if (url.host === 'www.wikidata.org') {
    const qid = /(Q\d+)\.json/.exec(url.pathname)![1];
    const d = wikidata[qid] ?? {};
    const claim = (v?: string[]) => (v ?? []).map((value) => ({ mainsnak: { datavalue: { value } } }));
    return Promise.resolve(json({ entities: { [qid]: { claims: { P18: claim(d.P18), P373: claim(d.P373) } } } }));
  }
  if (url.host === 'commons.wikimedia.org') {
    const q = url.searchParams;
    if (q.get('titles')) {
      const wanted = q.get('titles')!.split('|');
      return Promise.resolve(json(pages(files.filter((f) => wanted.includes(f.title)))));
    }
    if (q.get('generator') === 'categorymembers') {
      const cat = q.get('gcmtitle')!;
      return Promise.resolve(json(pages(files.filter((f) => f.categories?.includes(cat.replace('Category:', ''))))));
    }
    if (q.get('generator') === 'search') {
      const term = q.get('gsrsearch')!.replace(' filetype:bitmap', '').toLowerCase();
      return Promise.resolve(json(pages(files.filter((f) => f.title.toLowerCase().includes(term) || (f.description ?? '').toLowerCase().includes(term)))));
    }
    if (q.get('generator') === 'geosearch') {
      const [lat, lon] = q.get('ggscoord')!.split('|').map(Number);
      const near = files.filter((f) => f.lat !== undefined && Math.abs(f.lat - lat) < 0.02 && Math.abs((f.lon as number) - lon) < 0.02);
      return Promise.resolve(json(pages(near)));
    }
  }
  if (init?.method === 'HEAD') {
    const ok = imageOk[url.toString()];
    return Promise.resolve(new Response(null, { status: ok ? 200 : 404, headers: ok ? { 'content-type': 'image/jpeg' } : {} }));
  }
  return Promise.reject(new Error(`unexpected request ${url}`));
}

beforeEach(() => {
  globalThis.fetch = fakeFetch as typeof fetch;
  files = []; wikidata = {}; imageOk = {}; down = new Set(); requests.length = 0;
  cacheClear();
});

const kapu = { id: 'way-195721792', name: 'Kapu Beach', latitude: 13.21873, longitude: 74.73868, tags: {} as Record<string, string> };

describe('relevance filtering', () => {
  test('spelling differences of one change count as the same name (Kapu ~ Kaup)', () => {
    assert.equal(editDistance('kapu', 'kaup'), 1);
    assert.equal(matchName('Kapu Beach', 'Kaup Beach Lighthouse'), 'fuzzy');
    assert.equal(matchName('Kapu Beach', 'Kapu Beach at sunset'), 'exact');
    assert.equal(matchName('Kapu Beach', 'Juhu Beach Mumbai'), null);
  });
  test('a name made only of generic words never matches', () => {
    assert.equal(matchName('Beach', 'Beach in Goa'), null);
  });
  test('far away, wrong-name and map files are rejected; near files with the name are accepted', () => {
    const id = identityOf({ ...kapu });
    const ok = judge({ title: 'File:Kaup Beach.jpg', description: '', categories: [], latitude: 13.2187, longitude: 74.7387 }, id);
    assert.ok(ok.ok && ok.score >= 4);
    assert.equal(judge({ title: 'File:Kapu Beach.jpg', description: '', categories: [], latitude: 19.1, longitude: 72.8 }, id).ok, false); // another Kapu Beach far away
    assert.equal(judge({ title: 'File:Lighthouse near sea.jpg', description: '', categories: [], latitude: 13.2187, longitude: 74.7387 }, id).ok, false); // nearby but not about this place
    assert.equal(judge({ title: 'File:Kapu Beach location map.jpg', description: '', categories: [], latitude: 13.2187, longitude: 74.7387 }, id).ok, false);
    assert.equal(judge({ title: 'File:Kapu Beach.jpg', description: '', categories: [], latitude: null, longitude: null }, id).ok, false); // no coordinates, nothing confirms it
  });
});

describe('priority and sources', () => {
  test('1. a working OSM image tag is used first, with the honest note that author/licence are unknown', async () => {
    const url = 'https://example.org/photos/falls.jpg';
    imageOk[url] = true;
    const result = await findPhotos({ ...kapu, name: 'Jog Falls', tags: { image: url } });
    assert.equal(result.status, 'ok');
    assert.equal(result.photos[0].source, 'osm-image');
    assert.equal(result.photos[0].url, url);
    assert.match(result.photos[0].attribution, /OpenStreetMap/);
  });

  test('an OSM image tag that is not an image (web page) or a dead link is ignored', async () => {
    assert.equal(parseOsmImageTag({ image: 'https://www.flickr.com/photos/someone/123' }), null);
    assert.equal(parseOsmImageTag({ image: 'javascript:alert(1)' }), null);
    imageOk['https://example.org/dead.jpg'] = false;
    const result = await findPhotos({ ...kapu, tags: { image: 'https://example.org/dead.jpg' } });
    assert.notEqual(result.photos[0]?.source, 'osm-image');
  });

  test('2. the Wikidata image (P18) is used, with author and licence', async () => {
    wikidata.Q1 = { P18: ['Jog Falls view.jpg'] };
    files = [{ title: 'File:Jog Falls view.jpg', artist: 'Ravi K', license: 'CC BY 4.0' }];
    const result = await findPhotos({ ...kapu, name: 'Jog Falls', tags: { wikidata: 'Q1' } });
    assert.equal(result.status, 'ok');
    assert.equal(result.photos[0].source, 'wikidata');
    assert.equal(result.photos[0].author, 'Ravi K');
    assert.equal(result.photos[0].license, 'CC BY 4.0');
    assert.match(result.photos[0].attribution, /Ravi K/);
    assert.match(result.photos[0].pageUrl, /commons\.wikimedia\.org/);
  });

  test('3. KAUP/KAPU BEACH REGRESSION: Commons photos are found even with no OSM or Wikidata image', async () => {
    files = [
      { title: 'File:Kaup Beach 1.jpg', lat: 13.2187, lon: 74.7387, description: 'Kaup beach and lighthouse' },
      { title: 'File:Kaup Beach sunset.jpg', lat: 13.2190, lon: 74.7385 },
      { title: 'File:Juhu Beach.jpg', lat: 19.09, lon: 72.82 },
      { title: 'File:Kapu Beach map.png', lat: 13.2187, lon: 74.7387 },
    ];
    const result = await findPhotos({ ...kapu, tags: {} });
    assert.equal(result.status, 'ok');
    assert.deepEqual(result.photos.map((p) => p.title).sort(), ['Kaup Beach 1', 'Kaup Beach sunset']);
    assert.ok(result.photos.every((p) => p.source === 'commons-search'));
    assert.ok(result.photos.every((p) => p.license && p.attribution.includes('Wikimedia Commons')));
  });

  test('alternative names (alt_name, name:en, locality) are searched', async () => {
    files = [{ title: 'File:Kaup Lighthouse view.jpg', lat: 13.2189, lon: 74.7389 }];
    const input = { ...kapu, name: 'Kapu Beach', tags: { alt_name: 'Kaup Lighthouse', 'addr:city': 'Udupi', 'addr:state': 'Karnataka' } };
    const terms = searchTerms(identityOf(input), ['Lighthouse']);
    assert.ok(terms.includes('Kapu Beach'));
    assert.ok(terms.includes('Kaup Lighthouse'));
    assert.ok(terms.includes('Kapu Beach Udupi'));
    assert.ok(terms.includes('Kapu Beach Lighthouse'));
    const result = await findPhotos(input);
    assert.equal(result.photos.length, 1); // found through the alternative name
  });

  test('duplicates are removed (same file twice, and "x.jpg" / "x (2).jpg")', async () => {
    files = [
      { title: 'File:Kaup Beach.jpg', lat: 13.2187, lon: 74.7387 },
      { title: 'File:Kaup Beach 2.jpg', lat: 13.2187, lon: 74.7387 },
      { title: 'File:Kaup Beach 3.jpg', lat: 13.2187, lon: 74.7387 },
    ];
    const result = await findPhotos({ ...kapu, tags: {} });
    assert.equal(result.photos.length, 1);
  });
});

describe('honest results', () => {
  test('nothing relevant exists -> "none" (not "unavailable"), and never a generic picture', async () => {
    files = [{ title: 'File:Somewhere else.jpg', lat: 13.2187, lon: 74.7387 }];
    const result = await findPhotos({ ...kapu, tags: {} });
    assert.equal(result.status, 'none');
    assert.deepEqual(result.photos, []);
  });

  test('every service down -> "unavailable", and it is not cached for long', async () => {
    down.add('commons.wikimedia.org');
    const result = await getPhotos({ ...kapu, tags: {} });
    assert.equal(result.status, 'unavailable');
    down.clear();
    files = [{ title: 'File:Kaup Beach.jpg', lat: 13.2187, lon: 74.7387 }];
    cacheClear(); // (the short "unavailable" cache would also expire after a minute)
    assert.equal((await getPhotos({ ...kapu, tags: {} })).status, 'ok');
  });

  test('one service failing does not hide what another found', async () => {
    down.add('www.wikidata.org');
    files = [{ title: 'File:Kaup Beach.jpg', lat: 13.2187, lon: 74.7387 }];
    const result = await findPhotos({ ...kapu, tags: { wikidata: 'Q9' } });
    assert.equal(result.status, 'ok');
  });

  test('results are cached: a second request makes no new calls', async () => {
    files = [{ title: 'File:Kaup Beach.jpg', lat: 13.2187, lon: 74.7387 }];
    await getPhotos({ ...kapu, tags: {} });
    const before = requests.length;
    await getPhotos({ ...kapu, tags: {} });
    assert.equal(requests.length, before);
  });
});
