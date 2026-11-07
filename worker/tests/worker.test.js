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

// a stand-in for KV refusing every read and write (a request header picks it), as it does past a daily limit
const ENTRY = `
import worker, { SECURITY_HEADERS } from ${JSON.stringify(join(here, '../index.js'))};
const refuse = new Proxy({}, { get: () => async () => { throw new Error('KV refused'); } });
export default {
  fetch(request, env, ctx) {
    if (new URL(request.url).pathname === '/test/security-headers') return Response.json(SECURITY_HEADERS);
    return worker.fetch(request, request.headers.has('x-test-kv-down') ? { ...env, DATA: refuse } : env, ctx);
  },
  scheduled(event, env, ctx) { return worker.scheduled(event, env.TEST_KV_DOWN ? { ...env, DATA: refuse } : env, ctx); },
};`;

let dir, mf, kv;
let github = [], githubAnswer = () => new Response(null, { status: 204 });
const start = (bindings = {}) => new Miniflare({
  modules: true,
  script: readFileSync(join(dir, 'worker.mjs'), 'utf8'),
  compatibilityDate: '2026-07-01',
  kvNamespaces: ['DATA'],
  bindings,
  serviceBindings: {
    ASSETS: (request) => {
      const { pathname } = new URL(request.url);
      if (pathname === '/tracker') return new Response(PAGE, { headers: { 'content-type': 'text/html' } });
      if (pathname === '/data/tracker.json') return Response.json({ snapshot: true });
      return new Response('not found', { status: 404 });
    },
  },
  outboundService: (request) => { github.push(request.url); return githubAnswer(); },
});

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'elenz-worker-'));
  await build({
    stdin: { contents: ENTRY, resolveDir: here, loader: 'js' }, bundle: true, format: 'esm', platform: 'neutral',
    outfile: join(dir, 'worker.mjs'), logLevel: 'error',
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
  const file = readFileSync(join(here, '../../site/static/_headers'), 'utf8').split('\n/*\n')[1];
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
