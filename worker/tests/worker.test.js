// The Worker in Cloudflare's own runtime (workerd, through Miniflare), with a local KV store. Run with `npm test` in
// worker/, and in checks.yml. The static site is a small stand-in here: these test what the Worker does with a
// request. site/tests/viewurl.test.js covers the address parsing it shares with the pages.
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

const here = fileURLToPath(new URL('.', import.meta.url));
const HISTORY_CRON = '40 */6 * * *', LIVE_CRON = '*/5 * * * *';
const PAGE = '<!doctype html><html><head><title>Tracker</title><meta property="og:title" content="Tracker">'
  + '<meta property="og:url" content="https://elenz.co.nz/tracker"></head><body>Tracker</body></html>';
// a record page as prerendered: the site's card in its preview tags (Preview.svelte)
const RECORD_PAGE = '<!doctype html><html><head><title>Peak demand</title><meta property="og:title" content="Peak demand · New Zealand electricity records">'
  + '<meta property="og:url" content="https://elenz.co.nz/records/demand_max">'
  + '<meta property="og:image" content="https://elenz.co.nz/og/elenz.png?p=records-demand_max">'
  + '<meta property="og:image:width" content="2400"><meta property="og:image:height" content="1260">'
  + '<meta property="og:image:alt" content="ELENZ"></head><body>Record</body></html>';
// stands in for the prerendered plant research page, with the site's two visit counters
const RESEARCH_PAGE = '<!doctype html><html><head><title>Plant research</title></head><body><main>facts</main>'
  + '<script defer src="https://static.cloudflareinsights.com/beacon.min.js"></script>'
  + '<script defer src="https://cloud.umami.is/script.js" data-website-id="x"></script><script src="/_app/app.js"></script></body></html>';
const CARD = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);   // stands in for static/og/elenz.png
// a records file with one record: New Zealand's peak demand, which grew in three steps
const RECORDS = {
  v: 99, first: 870350400000, end: 1794652200000, final_to: { gen: 1793442600000 },
  records: { demand_max: { NZ: { t: 1785958200000, v: 7387, n: 3, prev: [1785871800000, 7223],
    steps: [[870350400000, 3726], [1785871800000, 7223], [1785958200000, 7387]] } } },
};

// a stand-in for KV refusing every read and write (a request header picks it), as it does past a daily limit
const ENTRY = `
import worker, { SECURITY_HEADERS } from ${JSON.stringify(join(here, '../index.js'))};
const refuse = new Proxy({}, { get: () => async () => { throw new Error('KV refused'); } });
// a stand-in for Workers Analytics Engine: the rows written, read back (and cleared) at /test/beats
const beats = [];
const BEATS = { writeDataPoint(row) { beats.push(row); } };
export default {
  fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (path === '/test/security-headers') return Response.json(SECURITY_HEADERS);
    if (path === '/test/beats') return Response.json(beats.splice(0));
    return worker.fetch(request, request.headers.has('x-test-kv-down') ? { ...env, DATA: refuse, BEATS } : { ...env, BEATS }, ctx);
  },
  scheduled(event, env, ctx) { return worker.scheduled(event, env.TEST_KV_DOWN ? { ...env, DATA: refuse } : env, ctx); },
};`;

let dir, mf, kv;
let github = [], githubAnswer = () => new Response(null, { status: 204 });
let sql = [], sqlAnswer = (body) => Response.json({ data: [] });   // stands in for Cloudflare's Analytics Engine SQL API
const start = (bindings = {}) => new Miniflare({
  modules: [
    { type: 'ESModule', path: join(dir, 'worker.mjs'), contents: readFileSync(join(dir, 'worker.mjs'), 'utf8') },
    // resvg's WebAssembly stays a module of its own, as wrangler bundles it (og.js)
    { type: 'CompiledWasm', path: join(dir, 'vendor/resvg/index_bg.wasm'), contents: readFileSync(join(here, '../vendor/resvg/index_bg.wasm')) },
  ],
  modulesRoot: dir,
  compatibilityDate: '2026-07-01',
  kvNamespaces: ['DATA'],
  bindings,
  serviceBindings: {
    ASSETS: (request) => {
      const { pathname } = new URL(request.url);
      if (pathname === '/tracker') return new Response(PAGE, { headers: { 'content-type': 'text/html' } });
      if (pathname === '/data/tracker.json') return Response.json({ snapshot: true });
      if (pathname.startsWith('/records/')) return new Response(RECORD_PAGE, { headers: { 'content-type': 'text/html' } });
      if (pathname === '/plants/research') return new Response(RESEARCH_PAGE, { headers: { 'content-type': 'text/html' } });
      if (pathname === '/plants/research/__data.json') return Response.json({ facts: 1 });
      if (pathname === '/og/elenz.png') return new Response(CARD, { headers: { 'content-type': 'image/png' } });
      return new Response('not found', { status: 404 });
    },
  },
  outboundService: async (request) => {
    if (new URL(request.url).hostname === 'api.cloudflare.com') {
      const body = await request.text();
      sql.push({ url: request.url, auth: request.headers.get('authorization'), body });
      return sqlAnswer(body);
    }
    github.push(request.url); return githubAnswer();
  },
});

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'elenz-worker-'));
  await build({
    stdin: { contents: ENTRY, resolveDir: here, loader: 'js' }, bundle: true, format: 'esm', platform: 'neutral',
    outfile: join(dir, 'worker.mjs'), logLevel: 'error',
    loader: { '.ttf': 'binary' }, external: ['*.wasm'],   // as wrangler.jsonc's rules: fonts as data, wasm compiled
  });
  mf = start({ GITHUB_TOKEN: 'test-token' });
  kv = await mf.getKVNamespace('DATA');
});
after(async () => { await mf.dispose(); rmSync(dir, { recursive: true, force: true }); });
beforeEach(async () => {
  github = []; githubAnswer = () => new Response(null, { status: 204 });
  for (const { name } of (await kv.list()).keys) await kv.delete(name);
});

const get = (path, headers = {}, host = 'https://elenz.co.nz') => mf.dispatchFetch(host + path, { headers });
const down = { 'x-test-kv-down': '1' };
const fresh = () => Date.now() - 60e3;
const saveLive = (end = fresh()) => kv.put('tracker.json', '{"live":true}', { metadata: { v: 'abc123', end } });
const healthy = async () => {
  await saveLive();
  await kv.put('hist/index.json', JSON.stringify({ end: Date.now() - 864e5 }));
  await kv.put('cron-status', JSON.stringify({ result: 'ok', at: new Date().toISOString() }));
};

test('tracker.json comes from KV with its version tag', async () => {
  await saveLive();
  const r = await get('/data/tracker.json');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { live: true });
  assert.equal(r.headers.get('etag'), 'W/"abc123"');
  assert.equal(r.headers.get('cache-control'), 'public, max-age=30');
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
});

test('a browser that has this version gets 304 with no body', async () => {
  await saveLive();
  for (const tag of ['W/"abc123"', '"abc123"', '"old", W/"abc123"', '*']) {
    const r = await get('/data/tracker.json', { 'if-none-match': tag });
    assert.equal(r.status, 304, tag);
    assert.equal(await r.text(), '');
  }
  assert.equal((await get('/data/tracker.json', { 'if-none-match': '"old"' })).status, 200);
});

test('tracker.json falls back to the bundled snapshot: KV empty, or refusing reads', async () => {
  assert.deepEqual(await (await get('/data/tracker.json')).json(), { snapshot: true });
  await saveLive();
  const r = await get('/data/tracker.json', down);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { snapshot: true });
});

test('history files come from KV under an allowed name only', async () => {
  await kv.put('hist/hh/2026-10.json', '{"month":true}');
  const r = await get('/data/history/hh/2026-10.json');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { month: true });
  assert.equal(r.headers.get('cache-control'), 'public, max-age=900');
  await kv.put('hist/plants.json', '{"plants":{}}');
  assert.deepEqual(await (await get('/data/history/plants.json')).json(), { plants: {} });
  await kv.put('hist/state/2026-10.csv.gz', 'private');
  assert.equal((await get('/data/history/state/2026-10.csv.gz')).status, 404);
});

test('a missing history file is 404; KV refusing reads is 503', async () => {
  assert.equal((await get('/data/history/hh/1990-01.json')).status, 404);
  const r = await get('/data/history/hh/2026-10.json', down);
  assert.equal(r.status, 503);
  assert.equal(r.headers.get('cache-control'), 'no-store');
});

test('/data/health is 200 while the data is fresh', async () => {
  await healthy();
  const r = await get('/data/health');
  const body = await r.json();
  assert.equal(r.status, 200);
  assert.equal(body.ok, true);
  assert.deepEqual(body.problems, []);
});

test('/data/health is 503 with the reasons when something is wrong', async () => {
  await healthy();
  await saveLive(Date.now() - 75 * 60e3);
  await kv.put('hist/index.json', JSON.stringify({ end: Date.now() - 6 * 864e5 }));
  await kv.put('cron-status', JSON.stringify({ result: 'GitHub said HTTP 401: Bad credentials', at: new Date().toISOString(),
    since: new Date(Date.now() - 20 * 60e3).toISOString() }));
  const r = await get('/data/health');
  const { problems } = await r.json();
  assert.equal(r.status, 503);
  assert.equal(problems.length, 3);
  assert.match(problems[0], /75 minutes old/);
  assert.match(problems[1], /6\.0 days behind/);
  assert.match(problems[2], /HTTP 401/);
});

test('/data/health lets a failed start pass until failures have lasted 15 minutes', async () => {
  await healthy();
  const at = new Date().toISOString();
  await kv.put('cron-status', JSON.stringify({ result: 'GitHub said HTTP 500: ', at, since: new Date(Date.now() - 5 * 60e3).toISOString() }));
  assert.equal((await get('/data/health')).status, 200);
  await kv.put('cron-status', JSON.stringify({ result: 'GitHub said HTTP 500: ', at, since: new Date(Date.now() - 16 * 60e3).toISOString() }));
  assert.equal((await get('/data/health')).status, 503);
});

test('/data/health and /data/status.json answer 503 when KV refuses reads', async () => {
  const r = await get('/data/health', down);
  assert.equal(r.status, 503);
  assert.deepEqual((await r.json()).problems, ['the data store could not be read']);
  assert.equal((await get('/data/status.json', down)).status, 503);
});

test('a linked tracker view gets its own title; a plain visit keeps the page as built', async () => {
  const linked = await (await get('/tracker?region=NI')).text();
  assert.match(linked, /<title>[^<]*North Island[^<]*· ELENZ<\/title>/);
  assert.match(linked, /og:url" content="https:\/\/elenz\.co\.nz\/tracker\?region=NI"/);
  assert.equal(await (await get('/tracker')).text(), PAGE);
});

test('an odd address can neither break the page nor reach its markup', async () => {
  for (const q of ['?end=garbage', '?region=%3Cscript%3E', '?zoom=~~&t=x', '?range=__proto__', '?%E0%A4%A=1']) {
    const r = await get('/tracker' + q);
    assert.equal(r.status, 200, q);
    assert.doesNotMatch(await r.text(), /<script/, q);
  }
});

test('every response carries the security headers, the same list as _headers', async () => {
  const want = await (await get('/test/security-headers')).json();
  const file = readFileSync(join(here, '../../site/static/_headers'), 'utf8').split('\n/*\n')[1].split('\n\n')[0]; // the /* block only: other blocks (caching) follow it
  const listed = Object.fromEntries(file.trim().split('\n').map((l) => l.trim().split(/: (.*)/s).slice(0, 2)));
  assert.deepEqual(listed, want);
  await saveLive();
  for (const path of ['/data/tracker.json', '/data/health', '/data/history/hh/1990-01.json', '/tracker', '/tracker?region=NI', '/nowhere']) {
    const r = await get(path);
    for (const [k, v] of Object.entries(want)) assert.equal(r.headers.get(k), v, `${k} on ${path}`);
    await r.arrayBuffer();
  }
});

test('noindex off the real site only', async () => {
  await saveLive();
  const real = await get('/tracker');
  const preview = await get('/tracker', {}, 'https://branch-elenz.elenz.workers.dev');
  assert.equal(real.headers.get('x-robots-tag'), null);
  assert.equal(preview.headers.get('x-robots-tag'), 'noindex');
  await real.arrayBuffer(); await preview.arrayBuffer();
  const data304 = await get('/data/tracker.json', { 'if-none-match': '"abc123"' }, 'https://branch-elenz.elenz.workers.dev');
  assert.equal(data304.status, 304);
  assert.equal(data304.headers.get('x-robots-tag'), 'noindex');
});

const fire = (cron, minute = 0, worker = mf) => worker.getWorker()
  .then((w) => w.scheduled({ cron, scheduledTime: new Date(Date.UTC(2026, 10, 3, 1, minute)) }));
const started = () => github.map((u) => u.match(/workflows\/(.+)\/dispatches/)[1]);

test('the 5-minute cron starts the live job, and the watchdog each quarter hour', async () => {
  await fire(LIVE_CRON, 5);
  assert.deepEqual(started(), ['update-data.yml']);
  github = [];
  await fire(LIVE_CRON, 10);
  assert.deepEqual(started(), ['update-data.yml', 'watchdog.yml']);
  assert.equal((await kv.get('cron-status', 'json')).result, 'ok');
});

test('the 6-hour cron starts the history and offers jobs', async () => {
  await fire(HISTORY_CRON, 40);
  assert.deepEqual(started(), ['history.yml', 'offers.yml']);
  assert.equal((await kv.get('cron-status-history', 'json')).result, 'ok');
});

test('an answer other than 204 from GitHub is recorded', async () => {
  githubAnswer = () => new Response('Bad credentials', { status: 401 });
  await fire(LIVE_CRON, 5);
  assert.equal((await kv.get('cron-status', 'json')).result, 'GitHub said HTTP 401: Bad credentials');
});

test('a server error from GitHub is tried once more', async () => {
  let calls = 0;
  githubAnswer = () => (++calls === 1 ? new Response('', { status: 500 }) : new Response(null, { status: 204 }));
  await fire(LIVE_CRON, 5);
  assert.deepEqual(started(), ['update-data.yml', 'update-data.yml']);
  assert.equal((await kv.get('cron-status', 'json')).result, 'ok');
});

test('a failure keeps the time it began while it goes on, and clears when a start works', async () => {
  githubAnswer = () => new Response('Bad credentials', { status: 401 });
  await fire(LIVE_CRON, 5);
  const first = await kv.get('cron-status', 'json');
  assert.ok(first.since);
  githubAnswer = () => new Response('Not Found', { status: 404 });
  await fire(LIVE_CRON, 15);
  assert.equal((await kv.get('cron-status', 'json')).since, first.since);
  githubAnswer = () => new Response(null, { status: 204 });
  await fire(LIVE_CRON, 20);
  assert.equal((await kv.get('cron-status', 'json')).since, undefined);
});

test('no GitHub token: no job is attempted and the reason is recorded', async () => {
  const noToken = start();
  try {
    await fire(LIVE_CRON, 5, noToken);
    assert.deepEqual(github, []);
    const status = await (await noToken.getKVNamespace('DATA')).get('cron-status', 'json');
    assert.equal(status.result, 'GITHUB_TOKEN secret not set');
  } finally { await noToken.dispose(); }
});

test('the jobs still start when KV refuses to record the outcome', async () => {
  const refused = start({ GITHUB_TOKEN: 'test-token', TEST_KV_DOWN: true });
  try {
    await fire(LIVE_CRON, 5, refused);
    assert.deepEqual(started(), ['update-data.yml']);
  } finally { await refused.dispose(); }
});

// ---------- record pages' preview images (og.js) ----------

const ogImage = (html) => html.match(/property="og:image" content="([^"]+)"/)?.[1];

test('a record page names its own preview image, which changes with the record', async () => {
  await kv.put('hist/records.json', JSON.stringify(RECORDS));
  const html = await (await get('/records/demand_max')).text();
  const img = ogImage(html);
  assert.match(img, /^https:\/\/elenz\.co\.nz\/og\/records\/demand_max\.png\?v=[a-z0-9]+$/);
  assert.match(html, /property="og:title" content="Record: Peak demand, New Zealand, 7,387 MW · ELENZ"/);
  assert.match(html, /property="og:image:width" content="1200"/);
  // a new record gives a new image address, so link previews fetch it again
  await kv.put('hist/records.json', JSON.stringify({ ...RECORDS, records: { demand_max: { NZ: { ...RECORDS.records.demand_max.NZ, v: 7400 } } } }));
  assert.notEqual(ogImage(await (await get('/records/demand_max')).text()), img);
});

test('a record page keeps the site card when there are no records to read', async () => {
  const html = await (await get('/records/demand_max')).text();
  assert.equal(ogImage(html), 'https://elenz.co.nz/og/elenz.png?p=records-demand_max');
  const down_ = await (await get('/records/demand_max', down)).text();
  assert.equal(ogImage(down_), 'https://elenz.co.nz/og/elenz.png?p=records-demand_max');
});

test('the record image is a 1200 x 630 PNG, kept long only at its current address', async () => {
  await kv.put('hist/records.json', JSON.stringify(RECORDS));
  const img = new URL(ogImage(await (await get('/records/demand_max')).text()));
  const r = await get(img.pathname + img.search);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/png');
  assert.equal(r.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  const png = new Uint8Array(await r.arrayBuffer());
  assert.deepEqual([...png.slice(1, 4)].map((c) => String.fromCharCode(c)).join(''), 'PNG');
  const view = new DataView(png.buffer);
  assert.deepEqual([view.getUint32(16), view.getUint32(20)], [1200, 630]);
  const stale = await get('/og/records/demand_max.png?v=old');
  assert.equal(stale.headers.get('cache-control'), 'public, max-age=600');
  await stale.arrayBuffer();
});

test('an unknown record or no records gives the site card', async () => {
  for (const path of ['/og/records/not_a_record.png', '/og/records/demand_max.png']) {
    const r = await get(path);
    assert.deepEqual(new Uint8Array(await r.arrayBuffer()), CARD, path);
  }
});

// ---------- heartbeats (POST /data/beat, stored in Workers Analytics Engine) ----------
const ID = '0123456789abcdef';
const beatOf = (body, host = 'https://elenz.co.nz') => mf.dispatchFetch(host + '/data/beat', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'text/plain' } });
const stored = async () => (await mf.dispatchFetch('https://elenz.co.nz/test/beats')).json();

test('a heartbeat from the site is stored: page, on screen or hidden, kiosk, country and minutes open', async () => {
  await stored();
  const r = await beatOf({ p: 'dashboard', s: ID, m: 35, v: 0, k: 1 });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  const rows = await stored();
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].indexes, [ID]);
  assert.deepEqual(rows[0].blobs.slice(0, 3), ['dashboard', 'hidden', 'kiosk']);
  assert.equal(typeof rows[0].blobs[3], 'string');
  assert.deepEqual(rows[0].doubles, [35]);
  await beatOf({ p: 'now', s: ID, m: 0, v: 1, k: 0 });
  assert.deepEqual((await stored())[0].blobs.slice(0, 3), ['now', 'visible', 'page']);
});

test('anything else posted to /data/beat is dropped, and still answered 204', async () => {
  await stored();
  for (const bad of [
    { p: 'tracker', s: ID, m: 0, v: 1, k: 0 },            // not a page that beats
    { p: 'now', s: 'not-an-id', m: 0, v: 1, k: 0 },       // the ID isn't 16 hex digits
    { p: 'now', s: ID, m: -5, v: 1, k: 0 },               // minutes below zero
    { p: 'now', s: ID, m: 1.5, v: 1, k: 0 },              // not whole minutes
    { p: 'now', s: ID, m: 0, v: 2, k: 0 },
    'not json', '', 'x'.repeat(500),
  ]) assert.equal((await beatOf(bad)).status, 204, JSON.stringify(bad).slice(0, 40));
  assert.deepEqual(await stored(), []);
  const g = await get('/data/beat');
  assert.equal(g.status, 405);
});

test('a preview link stores no heartbeats', async () => {
  await stored();
  const r = await beatOf({ p: 'now', s: ID, m: 5, v: 1, k: 0 }, 'https://beat-test-elenz.elenz.workers.dev');
  assert.equal(r.status, 204);
  assert.deepEqual(await stored(), []);
});

// ---------- /data/screens: the private page of open screens ----------
// two heartbeat rows in the same hour (20:00 on 16 Nov, NZ time) for one dashboard screen (seen, then hidden), and a Now
// page that stayed hidden
const ROWS = [
  { hour: '2026-11-16 07:00:00', page: 'dashboard', id: 'aaaa', shown: 'visible', opened: 'kiosk', country: 'NZ', minutes: '55', beats: '6' },
  { hour: '2026-11-16 07:00:00', page: 'dashboard', id: 'aaaa', shown: 'hidden', opened: 'kiosk', country: 'NZ', minutes: '58', beats: '1' },
  { hour: '2026-11-16 07:00:00', page: 'now', id: 'bbbb', shown: 'hidden', opened: 'page', country: 'AU', minutes: '5', beats: '2' },
];
// open now: a dashboard screen on a wall link (seen, then hidden: its latest beat counts) and a /now screen on screen
const LIVE = [
  { page: 'dashboard', id: 'aaaa', shown: 'visible', opened: 'kiosk', last: '2026-11-17 07:01:00' },
  { page: 'dashboard', id: 'aaaa', shown: 'hidden', opened: 'kiosk', last: '2026-11-17 07:06:00' },
  { page: 'now', id: 'cccc', shown: 'visible', opened: 'page', last: '2026-11-17 07:05:00' },
];
const KEY = 'test-key-0123456789';
let mfKey;
const screensGet = (q, m = mfKey) => m.dispatchFetch('https://elenz.co.nz/data/screens' + q);

test('/data/screens is a 404 without its key, or when no key is set at all', async () => {
  mfKey ??= start({ SCREENS_KEY: KEY, CF_ACCOUNT_ID: 'acct123', CF_ANALYTICS_TOKEN: 'tok-abc' });
  for (const q of ['', '?key=', '?key=wrong', `?key=${KEY}x`]) assert.equal((await screensGet(q)).status, 404, q);
  assert.equal((await screensGet(`?key=${KEY}`, mf)).status, 404);   // the main test Worker has no SCREENS_KEY
  assert.equal(sql.length, 0, 'nothing asked of Cloudflare without the key');
});

test('/data/screens with its key asks the SQL API and draws the screens open', async () => {
  sql = []; sqlAnswer = (body) => Response.json({ data: /MINUTE/.test(body) ? LIVE : ROWS });
  const r = await screensGet(`?key=${KEY}&days=30`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.match(r.headers.get('x-robots-tag'), /noindex/);
  const page = await r.text();
  assert.equal(sql.length, 2, 'the range and open now');
  sql.sort((a, b) => (/MINUTE/.test(a.body) ? 1 : 0) - (/MINUTE/.test(b.body) ? 1 : 0));
  assert.equal(sql[0].url, 'https://api.cloudflare.com/client/v4/accounts/acct123/analytics_engine/sql');
  assert.equal(sql[0].auth, 'Bearer tok-abc');
  assert.match(sql[0].body, /FROM elenz_beats/);
  assert.match(sql[0].body, /INTERVAL '30' DAY/);
  assert.ok(!page.includes('tok-abc'), 'the token never reaches the page');
  assert.match(page, /Mon 16 Nov, 20:00/);
  // that hour: the dashboard open 1, on screen 1, from a wall-screen link 1; Now open 1, on screen 0, wall 0
  assert.match(page, /<td class="gstart">1<\/td><td>1<\/td><td>1<\/td>/);
  assert.match(page, /<td class="gstart">1<\/td><td><span class="zero">0<\/span><\/td><td><span class="zero">0<\/span><\/td>/);
  assert.equal((page.match(/<svg /g) ?? []).length, 2, 'two charts: by time of day and over time');
  assert.match(page, /<title>20:00–21:00 NZ time\n\/now: /);   // each bar carries its own hover note
  assert.match(sql[1].body, /INTERVAL '11' MINUTE/);
  // open now: 2 screens, 1 on screen (the dashboard's latest beat was hidden), 1 from a wall link
  assert.match(page, /<p class="big">2 <small>screens · 1 on screen · 1 from a wall link<\/small>/);
  assert.match(page, /\/dashboard <b>1<\/b>/);
  assert.match(page, /58 min/);              // the dashboard screen's time open
  assert.match(page, /NZ 1/);
  assert.match(page, /aria-current="page" title="Last 30 days">30 days</);
});

test('/data/screens says what is missing or wrong, in words', async () => {
  const noToken = start({ SCREENS_KEY: KEY, CF_ACCOUNT_ID: 'acct123' });
  try {
    const r = await screensGet(`?key=${KEY}`, noToken);
    assert.equal(r.status, 503);
    assert.match(await r.text(), /Add CF_ANALYTICS_TOKEN/);
  } finally { await noToken.dispose(); }
  sqlAnswer = () => Response.json({ errors: [{ message: 'Authentication error' }] }, { status: 403 });
  const r = await screensGet(`?key=${KEY}`);
  assert.equal(r.status, 502);
  assert.match(await r.text(), /refused the token/);
  sqlAnswer = () => Response.json({ data: [] });
  assert.match(await (await screensGet(`?key=${KEY}&days=1`)).text(), /No heartbeats in this range yet/);
  await mfKey.dispose(); mfKey = undefined;
});

// ---------- /plants/research: the private plant research page ----------
test('/plants/research on elenz.co.nz needs the key; without it, the not-found page', async () => {
  const keyed = start({ SCREENS_KEY: KEY });
  try {
    const get = (path, m = keyed, init) => m.dispatchFetch('https://elenz.co.nz' + path, init);
    for (const q of ['', '?key=', '?key=wrong', `?key=${KEY}x`]) {
      for (const path of ['/plants/research', '/plants/research/__data.json']) {
        const r = await get(path + q);
        assert.equal(r.status, 404, path + q);
        assert.equal(r.headers.get('cache-control'), 'no-store');
        assert.ok(!(await r.text()).includes('facts'), 'nothing of the page without the key');
      }
    }
    assert.equal((await get(`/plants/research?key=${KEY}`, mf)).status, 404, 'no key set at all: closed on the real site');
    assert.equal((await get(`/plants/research?key=${KEY}`, keyed, { method: 'POST', body: 'x' })).status, 404);
    const r = await get(`/plants/research?key=${KEY}&fuel=hydro`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.match(r.headers.get('x-robots-tag'), /noindex/);
    assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
    const page = await r.text();
    assert.match(page, /<main>facts<\/main>/);
    assert.ok(!/cloudflareinsights|umami/.test(page), 'the visit counters are taken out, so the key never reaches them');
    assert.match(page, /\/_app\/app\.js/, 'the page keeps its own script');
    assert.equal((await get(`/plants/research/__data.json?key=${KEY}`)).status, 200);
  } finally { await keyed.dispose(); }
});

test('/plants/research opens without a key on a branch preview, still noindex', async () => {
  const r = await mf.dispatchFetch('https://plant-research-elenz.elenz.workers.dev/plants/research');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('x-robots-tag'), /noindex/);
  assert.ok(!/umami/.test(await r.text()));
  // a plant page is not the research page
  assert.notEqual((await mf.dispatchFetch('https://elenz.co.nz/plants/researcher')).headers.get('referrer-policy'), 'no-referrer');
});

// ---------- /data/plant-notes: the Elenz team's notes on each plant (worker/notes.js) ----------
test('/data/plant-notes needs the key on every host; a preview with no key set says so', async () => {
  const keyed = start({ SCREENS_KEY: KEY });
  try {
    const call = (m, host, path, init = {}) => m.dispatchFetch(host + path, init);
    for (const host of ['https://elenz.co.nz', 'https://plant-research-elenz.elenz.workers.dev']) {
      for (const k of [undefined, '', 'wrong', KEY + 'x']) {
        const headers = k === undefined ? {} : { 'x-elenz-key': k };
        assert.equal((await call(keyed, host, '/data/plant-notes', { headers })).status, 404, `${host} ${k}`);
        assert.equal((await call(keyed, host, '/data/plant-notes/benmore', { method: 'PUT', headers, body: '{"text":"x","base":null}' })).status, 404);
      }
      // the key in the address isn't enough: only the header counts
      assert.equal((await call(keyed, host, `/data/plant-notes?key=${KEY}`)).status, 404);
    }
    assert.equal((await call(mf, 'https://elenz.co.nz', '/data/plant-notes', { headers: { 'x-elenz-key': KEY } })).status, 404, 'no key set: closed on the real site');
    const r = await call(mf, 'https://plant-research-elenz.elenz.workers.dev', '/data/plant-notes', { headers: { 'x-elenz-key': KEY } });
    assert.equal(r.status, 503, 'no key set on a preview: says so');
    assert.match((await r.json()).error, /no key/);
    assert.equal((await kv.list({ prefix: 'plant-notes/' })).keys.length, 0, 'nothing written');
  } finally { await keyed.dispose(); }
});

test('/data/plant-notes saves, reads back, refuses a stale save, and deletes an emptied note', async () => {
  const keyed = start({ SCREENS_KEY: KEY });
  try {
    const store = await keyed.getKVNamespace('DATA');
    const h = { 'x-elenz-key': KEY };
    const list = async () => (await (await keyed.dispatchFetch('https://elenz.co.nz/data/plant-notes', { headers: h })).json()).notes;
    const put = (slug, body) => keyed.dispatchFetch(`https://elenz.co.nz/data/plant-notes/${slug}`, { method: 'PUT', headers: h, body: JSON.stringify(body) });

    assert.deepEqual(await list(), {});
    let r = await put('benmore', { text: 'Ask Meridian about unit 6.\r\nAlso the 1965 date.  ', base: null });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const first = await r.json();
    assert.equal(first.text, 'Ask Meridian about unit 6.\nAlso the 1965 date.', 'line ends tidied, trailing space trimmed');
    assert.ok(first.at > 0);
    assert.deepEqual(JSON.parse(await store.get('plant-notes/benmore')), first, 'one KV key per plant');
    await put('mahinerangi-waipori-b', { text: 'Second plant', base: null });
    const all = await list();
    assert.deepEqual(Object.keys(all).sort(), ['benmore', 'mahinerangi-waipori-b']);
    assert.equal(all.benmore.text, first.text);

    // another device saved since this page read it: refused, with what's stored, and nothing written
    r = await put('benmore', { text: 'stale', base: first.at - 1 });
    assert.equal(r.status, 409);
    assert.equal((await r.json()).note.text, first.text);
    assert.equal(JSON.parse(await store.get('plant-notes/benmore')).text, first.text);
    r = await put('benmore', { text: 'new page, nothing read', base: null });
    assert.equal(r.status, 409, 'a page that saw no note may not overwrite one');
    // with the right base, or "any", it saves
    r = await put('benmore', { text: 'Updated', base: first.at });
    assert.equal(r.status, 200);
    const second = await r.json();
    assert.equal((await put('benmore', { text: 'Mine wins', base: 'any' })).status, 200);
    assert.equal((await list()).benmore.text, 'Mine wins');
    assert.ok(second.at >= first.at);

    // emptied: deleted
    const now = (await list()).benmore.at;
    r = await put('benmore', { text: '  \n ', base: now });
    assert.deepEqual(await r.json(), { text: '', at: null });
    assert.equal(await store.get('plant-notes/benmore'), null);
    assert.deepEqual(Object.keys(await list()), ['mahinerangi-waipori-b']);
  } finally { await keyed.dispose(); }
});

test('/data/plant-notes turns away bad addresses, methods and bodies', async () => {
  const keyed = start({ SCREENS_KEY: KEY });
  try {
    const h = { 'x-elenz-key': KEY };
    const send = (path, init) => keyed.dispatchFetch('https://elenz.co.nz' + path, { headers: h, ...init });
    for (const slug of ['Benmore', 'a/b', '..', '-x', 'x'.repeat(81)]) {
      assert.equal((await send(`/data/plant-notes/${slug}`, { method: 'PUT', body: '{"text":"x","base":null}' })).status, 404, slug);
    }
    assert.equal((await send('/data/plant-notes', { method: 'POST', body: '{}' })).status, 405);
    assert.equal((await send('/data/plant-notes/benmore')).status, 405);
    assert.equal((await send('/data/plant-notes/benmore', { method: 'PUT', body: 'not json' })).status, 400);
    assert.equal((await send('/data/plant-notes/benmore', { method: 'PUT', body: '{"base":null}' })).status, 400);
    assert.equal((await send('/data/plant-notes/benmore', { method: 'PUT', body: JSON.stringify({ text: 'x'.repeat(20001), base: null }) })).status, 413);
    // KV down: the page is told, in words
    const r = await keyed.dispatchFetch('https://elenz.co.nz/data/plant-notes', { headers: { ...h, 'x-test-kv-down': '1' } });
    assert.equal(r.status, 503);
    assert.match((await r.json()).error, /try again/);
    // a neighbouring address isn't the notes
    assert.notEqual((await send('/data/plant-notesx')).status, 405);
  } finally { await keyed.dispose(); }
});
