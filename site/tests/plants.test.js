// Tests for the plant pages' history, live panel, map and index (src/lib/plants/): run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plantMonths, years, lastMonths, latestYear, bestYear, capAt, hoursIn, capChanges, fmtGwh, fmtMw } from '#lib/plants/history.js';
import { livePlant } from '#lib/plants/live.js';
import { toView, islandBox } from '#lib/plants/map.js';
import { readSettings, writeSettings, pick, filtered, fuelsOf, ownersOf, dotSize, statusText, toggleFuel, onlyFuel, DEFAULTS } from '#lib/plants/list.js';
import INDEX from '#lib/plants/index.json' with { type: 'json' };
import { PTS, NI, SI, VIEW } from '#lib/home/nzmap.js';
import { plantHref, PLANTS_PUBLIC } from '#lib/plants/registry.js';
import MANAPOURI from '#lib/plants/pages/manapouri.json' with { type: 'json' };

const STEPS = [{ from: null, to: '2002-04-30', mw: 585 }, { from: '2002-05-01', to: '2007-12-31', mw: 700 }, { from: '2008-01-01', to: null, mw: 800 }];

test('installed MW by month from the capacity steps', () => {
  assert.equal(capAt(STEPS, '1997-08'), 585);
  assert.equal(capAt(STEPS, '2002-05'), 700);
  assert.equal(capAt(STEPS, '2026-10'), 800);
  assert.deepEqual(capChanges(STEPS, '1997-08', '2026-11'), [{ m: '2002-05', mw: 700 }, { m: '2008-01', mw: 800 }]);
  assert.deepEqual(MANAPOURI.steps.map((s) => s.mw), [585, 700, 800]);
});

test('hours by the NZ clock, with the clock changes', () => {
  assert.equal(hoursIn('2026-01'), 744);
  assert.equal(hoursIn('2026-04'), 721);   // clocks go back on 5 April
  assert.equal(hoursIn('2026-09'), 719);   // and forward on 27 September
  assert.equal(hoursIn('2026-11', Date.UTC(2026, 10, 1, 11)), 24);   // the running month, to the history's end
});

// three months of a made-up 100 MW plant: August and September 2026 metered, October dispatch and running
const FILE = {
  months: ['2026-07', '2026-08', '2026-09', '2026-10'], src: 'mmmd', end: Date.UTC(2026, 9, 10, 11), left: 0,
  plants: { Test: { i: 1, g: [37200, 36000, 4800] }, Batt: { i: 2, g: [100, 50], c: [130, 60] } }
};
const STEPS100 = [{ from: '2026-08-01', to: null, mw: 100 }];

test('a plant\'s months, years and capacity factors', () => {
  const ms = plantMonths(FILE, 'Test', STEPS100);
  assert.deepEqual(ms.map((x) => [x.m, x.gwh, x.src, x.whole]), [['2026-08', 37.2, 'metered', true], ['2026-09', 36, 'metered', true], ['2026-10', 4.8, 'dispatch', false]]);
  assert.equal(ms[2].hours, 240);   // 1 October to the history's end (11 am UTC on the 10th: midnight NZDT on the 11th)
  const ys = years(ms);
  assert.equal(ys.length, 1);
  assert.equal(ys[0].part, true);
  assert.ok(Math.abs(ys[0].gwh - 78) < 1e-9);
  assert.ok(Math.abs(ys[0].cf - 78000 / (100 * (744 + 719 + 240))) < 1e-9);
  assert.equal(lastMonths(ms).length, 2);
  assert.equal(latestYear(ms), null);
  assert.equal(bestYear(ys), null);   // part years don't count
  assert.equal(plantMonths(FILE, 'Missing', STEPS100), null);
  const b = plantMonths(FILE, 'Batt', STEPS100);
  assert.equal(b[0].chg, 0.13);
  assert.equal(years(b)[0].chg, 0.19);
});

test('energy and MW written as the site writes them', () => {
  assert.equal(fmtGwh(5861.2), '5,861');
  assert.equal(fmtGwh(4.84), '4.8');
  assert.equal(fmtMw(620.4), '620');
  assert.equal(fmtMw(4.26), '4.3');
  assert.equal(fmtMw(-35), '−35');
  assert.equal(fmtMw(-0.01), '0');
});

test('the live panel: newest interval and half-hours of the live week', () => {
  const t0 = Date.UTC(2026, 10, 17, 11, 5);   // 12:05 am NZDT: the first half-hour starts five intervals in
  const s = Array.from({ length: 20 }, (_, j) => j);
  const D = { t0, step: 300000, N: 20, meta: { end: t0 + 19 * 300000 }, plants: [{ name: 'Test', fuel: 'hydro', isl: 'NI', s }] };
  const L = livePlant(D, 'Test');
  assert.equal(L.mw, 19);
  assert.deepEqual(L.half.map((h) => h.mw), [7.5, 13.5, 18]);   // 5-10, 11-16, 17-19
  assert.equal(L.half[0].t, t0 + 5 * 300000);
  assert.equal(L.min, 7.5);
  assert.equal(livePlant(D, 'Other'), null);
});

test('a checked point lands where the island outlines put it', () => {
  for (const [k, [la, lo]] of Object.entries({ ben: [-44.57, 170.20], akl: [-36.85, 174.76], chc: [-43.53, 172.63] })) {
    const [x, y] = toView(la, lo);
    assert.ok(Math.hypot(x - PTS[k][0], y - PTS[k][1]) < 0.5, `${k}: ${x.toFixed(1)}, ${y.toFixed(1)} against ${PTS[k]}`);
  }
});

// the index (/plants): its rows, filters and the settings in the address
const ROWS = [
  { slug: 'big', name: 'Big', plant: 'Big', fuel: 'hydro', island: 'SI', status: 'operating', mw: 800, owner: 'Meridian', commissioned: '1971', closed: null, reviewed: true, pt: null },
  { slug: 'oho', name: 'Ōhau', plant: 'Ohau', fuel: 'hydro', island: 'SI', status: 'operating', mw: 264, owner: 'Meridian', commissioned: null, closed: null, reviewed: false, pt: null },
  { slug: 'gas', name: 'Gas Town', plant: 'Gas Town', fuel: 'gas', island: 'NI', status: 'closed', mw: 400, owner: 'Contact', commissioned: '2000', closed: '2015', reviewed: false, pt: null },
  { slug: 'sun', name: 'Sunny', plant: 'Sunny', fuel: 'solar', island: 'NI', status: 'operating', mw: 20, owner: 'Other generators', commissioned: null, closed: null, reviewed: false, pt: null }
];

test('the index: closed plants hidden until asked for, largest first', () => {
  assert.deepEqual(pick(ROWS, DEFAULTS).map((p) => p.slug), ['big', 'oho', 'sun']);
  assert.deepEqual(pick(ROWS, { ...DEFAULTS, closed: 'all' }).map((p) => p.slug), ['big', 'gas', 'oho', 'sun']);
  assert.deepEqual(pick(ROWS, { ...DEFAULTS, closed: 'only' }).map((p) => p.slug), ['gas']);
  // several fuels at once, or none
  assert.deepEqual(pick(ROWS, { ...DEFAULTS, fuels: ['hydro', 'solar'] }).map((p) => p.slug), ['big', 'oho', 'sun']);
  assert.deepEqual(pick(ROWS, { ...DEFAULTS, fuels: [] }), []);
  assert.deepEqual(pick(ROWS, { ...DEFAULTS, text: 'ohau' }).map((p) => p.slug), ['oho']);   // macrons don't matter
  assert.deepEqual(pick(ROWS, { ...DEFAULTS, owner: 'meridian', island: 'SI' }).map((p) => p.slug), ['big', 'oho']);
  assert.deepEqual(pick(ROWS, { ...DEFAULTS, by: 'name', asc: true }).map((p) => p.slug), ['big', 'oho', 'sun']);
  // Now sorts by live MW; a plant with no figure goes last
  assert.deepEqual(pick(ROWS, { ...DEFAULTS, by: 'now' }, new Map([['Sunny', 15], ['Big', 600]])).map((p) => p.slug), ['big', 'sun', 'oho']);
  assert.deepEqual(pick(ROWS, { ...DEFAULTS, by: 'commissioned', asc: true }).map((p) => p.slug), ['big', 'oho', 'sun']);
  // the fuel buttons count everything the other filters let through
  assert.equal(filtered(ROWS, { ...DEFAULTS, fuels: ['solar'] }).length, 3);
  assert.deepEqual(fuelsOf(ROWS).map((f) => f.k), ['hydro', 'solar', 'gas']);
  assert.deepEqual(ownersOf(ROWS), ['Contact', 'Meridian', 'Other generators']);
  assert.equal(statusText(ROWS[2]), 'Closed 2015');
  assert.ok(dotSize(500) > dotSize(100) && dotSize(100) > dotSize(10));
});

test('the fuel squares turn one fuel on or off; a fuel name shows it alone', () => {
  const all = ['hydro', 'solar', 'gas'];
  assert.deepEqual(toggleFuel(null, 'gas', all), ['hydro', 'solar']);
  assert.equal(toggleFuel(['hydro', 'solar'], 'gas', all), null);   // every fuel on again
  assert.deepEqual(toggleFuel(['hydro'], 'hydro', all), []);
  assert.deepEqual(onlyFuel(null, 'solar'), ['solar']);
  assert.deepEqual(onlyFuel(['hydro', 'solar'], 'solar'), ['solar']);
  assert.equal(onlyFuel(['solar'], 'solar'), null);
});

test('the index keeps its settings in the address, and ignores what it does not know', () => {
  const s = { ...DEFAULTS, fuels: ['hydro'], island: 'SI', owner: 'meridian', closed: 'all', text: 'Ō', by: 'name', asc: true, sel: 'big', size: 'now' };
  const q = writeSettings(s);
  assert.equal(q, '?fuel=hydro&island=SI&owner=meridian&closed=1&q=%C5%8C&sort=name&plant=big&size=now');
  assert.deepEqual(readSettings(q, ROWS), s);
  assert.deepEqual(readSettings('?fuel=hydro,solar&closed=only', ROWS), { ...DEFAULTS, fuels: ['hydro', 'solar'], closed: 'only' });
  assert.deepEqual(readSettings('?fuel=none', ROWS), { ...DEFAULTS, fuels: [] });
  assert.equal(writeSettings({ ...DEFAULTS, fuels: [] }), '?fuel=none');
  assert.equal(writeSettings(DEFAULTS), '');
  assert.deepEqual(readSettings('?fuel=coal&owner=nobody&plant=gone&sort=bogus', ROWS), DEFAULTS);
  assert.deepEqual(readSettings('?sort=mw-asc', ROWS), { ...DEFAULTS, asc: true });
});

test('the index file: every plant, each point in New Zealand', () => {
  assert.equal(INDEX.plants.length, 110);
  for (const p of INDEX.plants) {
    assert.ok(p.slug && p.name && p.fuel && p.island && p.status, p.slug);
    assert.match(p.overview, /^An? \d[\d.]* MW .+\.$/, p.slug);
    if (p.pt) assert.ok(p.pt.lat < -34 && p.pt.lat > -48 && p.pt.lon > 166 && p.pt.lon < 179, `${p.slug}: ${p.pt.lat}, ${p.pt.lon}`);
  }
});

test('the locator frames one island', () => {
  const [x, y, w, h] = islandBox(NI);
  assert.ok(x > VIEW.w * 0.4 && y + h < VIEW.h * 0.6, 'the North Island sits top right');
  const pt = toView(-38.62, 176.14);   // Aratiatia
  assert.ok(pt[0] > x && pt[0] < x + w && pt[1] > y && pt[1] < y + h);
  const s = islandBox(SI);
  assert.ok(s[1] > y + h * 0.5, 'the South Island sits below the North Island');
});

test('plant names link to their pages by slug, and only where a page exists', () => {
  assert.equal(PLANTS_PUBLIC, true);
  assert.equal(plantHref('Manapōuri'), '/plants/manapouri');
  assert.equal(plantHref('Branch River (Arnold)'), '/plants/branch-river-arnold');
  assert.equal(plantHref('Other embedded generation · North Island'), null);
  assert.equal(plantHref('Not a plant'), null);
  // every plant the index lists has a page link, and every page is in the sitemap's list (slugs.json: plant_pages.py)
  for (const p of INDEX.plants) assert.equal(plantHref(p.plant), `/plants/${p.slug}`, p.plant);
});

test('every plant page\'s description fits search results (110 to 160 characters)', async () => {
  const { description } = await import('#lib/plants/registry.js');
  for (const p of INDEX.plants) {
    const d = description({ name: p.name, status: p.status, fuel: p.fuel, island: p.island });
    assert.ok(d.length >= 110 && d.length <= 160, `${p.slug}: ${d.length} characters`);
  }
});

test('each plant page\'s views and facts have their own keys (a repeated key stops the page hydrating)', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const dir = new URL('../src/lib/plants/pages/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const p = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    for (const [what, list] of [['aerial views', (p.aerial ?? []).map((v) => v.k)], ['facts', (p.facts ?? []).map((v) => v.k)], ['sources', (p.sources ?? []).map((v) => v.n)]]) {
      assert.equal(new Set(list).size, list.length, `${p.slug}: ${what} repeat a key (${list.join(', ')})`);
    }
  }
});
