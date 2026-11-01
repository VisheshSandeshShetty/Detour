// Checks that the outside services Detour needs actually answer from YOUR computer.
// Run it with:   npm run check:services --prefix server
//
// It sends the same kind of requests the server sends (same headers), and prints one line per
// service. If places do not load in the app, this tells you which service is the problem.

process.env.JWT_SECRET ??= 'only-used-by-the-check-script';

async function timed(label: string, run: () => Promise<string>) {
  const started = Date.now();
  try {
    const detail = await run();
    console.log(`  OK    ${label.padEnd(52)} ${String(Date.now() - started).padStart(5)} ms  ${detail}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`  FAIL  ${label.padEnd(52)} ${String(Date.now() - started).padStart(5)} ms  ${message}`);
    return false;
  }
}

async function main() {
  const { config } = await import('../src/config');
  console.log(`\nUser-Agent sent: ${config.userAgent}`);
  if (!process.env.CONTACT_EMAIL) {
    console.log('Tip: set CONTACT_EMAIL in server/.env. Overpass asks every app to identify itself.');
  }

  // ---- Overpass: a tiny query, 3 tourism places within 1 km of Manipal ----
  console.log('\nOverpass (places):');
  const query = '[out:json][timeout:25];node(around:1000,13.35,74.79)["tourism"];out 3;';
  let overpassWorks = 0;
  for (const url of config.overpassUrls) {
    const ok = await timed(url, async () => {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'User-Agent': config.userAgent,
          Accept: '*/*',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = (await response.json()) as { elements?: unknown[] };
      return `HTTP ${response.status}, ${json.elements?.length ?? 0} places`;
    });
    if (ok) overpassWorks++;
  }

  // ---- OSRM: Manipal to Udupi ----
  console.log('\nOSRM (routes):');
  const osrmOk = await timed(config.osrmUrl, async () => {
    const response = await fetch(
      `${config.osrmUrl}/route/v1/driving/74.7855,13.3525;74.7421,13.3409?overview=false`,
      { headers: { 'User-Agent': config.userAgent }, signal: AbortSignal.timeout(30000) }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = (await response.json()) as { routes?: { distance: number }[] };
    return `HTTP ${response.status}, route of ${((json.routes?.[0]?.distance ?? 0) / 1000).toFixed(1)} km`;
  });

  // ---- Photon: location search ----
  console.log('\nPhoton (location search):');
  const photonOk = await timed(config.photonUrl, async () => {
    const response = await fetch(`${config.photonUrl}/api/?q=mangalore&limit=1&lang=en`, {
      headers: { 'User-Agent': config.userAgent },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = (await response.json()) as { features?: unknown[] };
    return `HTTP ${response.status}, ${json.features?.length ?? 0} result`;
  });

  console.log('\nSummary:');
  console.log(`  Places (Overpass):  ${overpassWorks > 0 ? `${overpassWorks} of ${config.overpassUrls.length} servers work` : 'NOTHING WORKS, places will not load'}`);
  console.log(`  Routes (OSRM):      ${osrmOk ? 'works' : 'NOT WORKING, journeys will fail'}`);
  console.log(`  Search (Photon):    ${photonOk ? 'works' : 'NOT WORKING, autocomplete will fail'}`);
  if (overpassWorks === 0) {
    console.log(
      '\nIf every Overpass server says HTTP 406 or 429, you are being rate limited. Wait a minute and run this again.\n' +
        'If they time out, check your internet, VPN or firewall. You can also add other servers to OVERPASS_URLS\n' +
        '(see https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances).'
    );
  }
  console.log('');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
