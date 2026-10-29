// Tests for the tracker's address (src/lib/site/viewurl.js): run with `npm test` (Node's own test runner).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readQuery, writeQuery, slug, stamp, fromStamp, endOfDay, ymd, describe, shareLinks, addDays, midnightOf } from '#lib/site/viewurl.js';

const PLANTS = JSON.parse(readFileSync(new URL('../src/lib/tracker/plants.json', import.meta.url)));
const CAPACITY = JSON.parse(readFileSync(new URL('../src/lib/tracker/capacity.json', import.meta.url)));

test('an address reads and writes back unchanged', () => {
  for (const qs of [
    '',
    'region=NI',
    'range=7d&int=30m',
    'region=SI&range=30d&int=1d&end=2024-08-14',
    'range=1y&int=1mo&by=owner&group=meridian&plant=benmore',
    'region=NI&range=3d&end=2026-10-18&t=2026-10-16T18:30&by=site&unit=pct&fuel=wind&plant=te-apiti',
    'range=all&int=1yr&t=2008-01-01&by=scheme&group=manapouri',
    'region=NI&range=7d&scale=capped&hide=OTA,WKM&band=BEN',
    'zoom=3h',
    'by=site&chart=lines&price=on&fuel=hydro',
    'region=SI&unit=pct&price=on',
    'price=on&fold=demand',
    'fold=none',
    'range=7d&fold=price,ren,hvdc',
    'range=3d&end=2026-10-19&zoom=2026-10-19T13:05~2026-10-19T15:30',
  ]) {
    const day = /t=\d{4}-\d\d-\d\d(&|$)/.test(qs);
    assert.equal(writeQuery(readQuery(qs), { tDay: day }), qs, qs);
  }
});

test('defaults are left out and unknown values dropped', () => {
  assert.equal(writeQuery({ region: 'NZ', range: '1d', by: 'detailed', unit: 'mw', chart: 'stacked', price: 'off', scale: 'spike', band: 'HAY', hide: [] }), '');
  assert.deepEqual(readQuery('?region=AU&range=2w&int=10m&end=2026-13-40&t=noon&by=colour&unit=gw&chart=pie&price=yes&fuel=nuclear&plant=Not%20a%20slug&hide=x,OTA&band=OTA'), { hide: ['OTA'] });
  assert.deepEqual(readQuery('?range=2016'), { range: '7d' });   // the old interval-count ranges
});

test('folded charts: the default (all) is left out, any order reads the same, nothing folded is none', () => {
  assert.equal(writeQuery({ fold: ['price', 'ren', 'demand', 'hvdc', 'co2'] }), '');
  assert.equal(writeQuery({ fold: ['co2', 'hvdc', 'demand', 'ren', 'price'] }), '');
  assert.equal(writeQuery({ fold: ['ren', 'price'] }), 'fold=price,ren');
  assert.equal(writeQuery({ fold: [] }), 'fold=none');
  assert.deepEqual(readQuery('?fold=ren,co2,ren'), { fold: ['ren', 'co2'] });
  assert.deepEqual(readQuery('?fold=none'), { fold: [] });
  assert.deepEqual(readQuery('?fold=gen,pie'), {});   // nothing it knows: the default
});

test('plant and set slugs', () => {
  assert.equal(slug('Branch River (Arnold)'), 'branch-river-arnold');
  assert.equal(slug('Manapōuri'), 'manapouri');
  assert.equal(slug('Ngāwhā'), 'ngawha');
  assert.equal(slug('Other generators'), 'other-generators');
});

test('old group slugs forward: the Tekapo scheme is Takapō', () => {
  assert.equal(slug('Takapō'), 'takapo');
  assert.equal(readQuery('?by=scheme&group=tekapo').group, 'takapo');
  assert.equal(readQuery('?by=scheme&group=waitaki').group, 'waitaki');
  assert.equal(describe('generation', readQuery('?by=scheme&group=tekapo')).split(' · ')[0], 'Takapō generation');
});

test('no two plants share a slug', () => {
  // the same plant spelt with and without macrons (the register's Ōtāhuhu A, the metered history's Otahuhu A) is fine
  const plain = (n) => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const names = new Set([...Object.keys(PLANTS), ...CAPACITY.plants.map((p) => p.name)]);
  const seen = new Map();
  for (const n of names) {
    const s = slug(n);
    assert.ok(s, `${n} has an empty slug`);
    assert.ok(!seen.has(s) || plain(seen.get(s)) === plain(n), `${n} and ${seen.get(s)} are both "${s}"`);
    seen.set(s, n);
  }
});

test('NZ times in the address, across the clock changes', () => {
  // standard and daylight time
  assert.equal(fromStamp('2026-07-01T12:00'), Date.UTC(2026, 6, 1, 0, 0));
  assert.equal(fromStamp('2026-12-01T12:00'), Date.UTC(2025 + 1, 10, 30, 23, 0));
  for (const s of ['2026-04-05T01:30', '2026-04-05T03:30', '2026-09-27T01:30', '2026-09-27T03:30', '1997-08-01T00:00'])
    assert.equal(stamp(fromStamp(s)), s);
  // the repeated hour in April reads as its first (daylight) occurrence; the skipped hour in September moves on
  assert.equal(fromStamp('2026-04-05T02:30'), Date.UTC(2026, 3, 4, 13, 30));
  assert.equal(stamp(fromStamp('2026-09-27T02:30')), '2026-09-27T03:30');
  // a date alone is that day's midnight; end dates name the last day shown
  assert.equal(stamp(fromStamp('2026-09-27'), false), '2026-09-27');
  for (const d of ['2026-04-05', '2026-09-27', '2026-10-18', '1997-08-01']) assert.equal(ymd(endOfDay(d) - 1), d);
  for (const bad of ['2026-02-30', '2026-13-01', '2026-1-1']) assert.equal(endOfDay(bad), null, bad);
  for (const bad of ['2026-02-30T10:00', '2026-10-18T24:00', '2026-10-18T10:60', '2026-10-18 10:00']) assert.equal(fromStamp(bad), null, bad);
});

test('words for a view', () => {
  const end = endOfDay('2026-10-18');
  assert.equal(describe('generation', {}), 'Electricity generation · New Zealand · last 24 hours');
  assert.equal(describe('generation', { region: 'NI', range: '7d', fuel: 'wind', end }), 'Wind generation · North Island · 7 days to 18 Oct 2026');
  assert.equal(describe('generation', { by: 'owner', group: 'meridian' }), 'Meridian generation · New Zealand · last 24 hours');
  assert.equal(describe('generation', { by: 'scheme', group: 'manapouri', range: 'all' }), 'Manapōuri generation · New Zealand · since 1997');
  assert.equal(describe('generation', { plant: 'branch-river-arnold', t: fromStamp('2026-10-16T18:30') }), 'Branch River (Arnold) · New Zealand · 6:30 pm, 16 Oct 2026');
  assert.equal(describe('generation', { range: '1y', by: 'site' }), 'Electricity generation by site · New Zealand · last 12 months');
  assert.equal(describe('prices', { region: 'SI', range: '1d', end }), 'Wholesale electricity prices · South Island · 18 Oct 2026');
});

test('share links: live, fixed to the dates shown, and the marked point', () => {
  const latestEnd = endOfDay('2026-10-18');
  // the last 24 hours: live, or fixed to today
  let L = shareLinks('/tracker', { region: 'NI', range: '1d', by: 'owner' }, { latestEnd, days: 1 });
  assert.equal(L.live, 'https://elenz.co.nz/tracker?region=NI&by=owner');
  assert.deepEqual(L.fixed(false), { url: 'https://elenz.co.nz/tracker?region=NI&end=2026-10-18&by=owner', span: '18 Oct 2026' });
  // a point late yesterday, marked: the window moves back to its day
  const t = fromStamp('2026-10-17T23:30');
  L = shareLinks('/tracker', { range: '1d' }, { latestEnd, days: 1, point: t, pointLabel: 'Sat 17 Oct, 11:30 pm' });
  assert.deepEqual(L.fixed(true), { url: 'https://elenz.co.nz/tracker?end=2026-10-17&t=2026-10-17T23:30', span: '17 Oct 2026' });
  assert.equal(L.fixed(false).url, 'https://elenz.co.nz/tracker?end=2026-10-18');
  // a past window has no live link
  L = shareLinks('/tracker/prices', { range: '7d', end: endOfDay('2024-08-14'), band: 'BEN' }, { latestEnd, days: 7 });
  assert.equal(L.live, null);
  assert.deepEqual(L.fixed(false), { url: 'https://elenz.co.nz/tracker/prices?range=7d&end=2024-08-14&band=BEN', span: '8 to 14 Aug 2024' });
  // All: fixed only with a point, written as a date for daily points
  L = shareLinks('/tracker', { range: 'all', int: '1mo' }, { latestEnd, days: null, point: fromStamp('2008-05-01'), tDay: true });
  assert.equal(L.fixed(false), null);
  assert.equal(L.fixed(true).url, 'https://elenz.co.nz/tracker?range=all&int=1mo&t=2008-05-01');
  assert.equal(midnightOf(addDays(latestEnd, -1)), endOfDay('2026-10-17'));
  assert.equal(shareLinks('/tracker', { range: '30d' }, { latestEnd, days: 30 }).fixed().span, '19 Sep to 18 Oct 2026');
  assert.equal(shareLinks('/tracker', { range: '1y' }, { latestEnd, days: 365 }).fixed().span, '19 Oct 2025 to 18 Oct 2026');
});

test('zoom: the menu spans and a dragged span', () => {
  assert.deepEqual(readQuery('zoom=6h'), { zoom: { span: 6 } });
  assert.deepEqual(readQuery('zoom=5h&x=1'), {});                          // not a span the menu offers
  assert.deepEqual(readQuery('zoom=2026-10-19T15:30~2026-10-19T13:05'), {}); // backwards
  assert.deepEqual(readQuery('zoom=2026-10-19~2026-10-20'), {});             // dates alone
  assert.equal(describe('generation', { zoom: { span: 3 } }), 'Electricity generation · New Zealand · last 3 hours');
  assert.equal(describe('generation', { zoom: { span: 1 }, end: endOfDay('2026-10-18') }), 'Electricity generation · New Zealand · 1 hour to 18 Oct 2026');
  const z = readQuery('zoom=2026-10-19T13:05~2026-10-19T15:30').zoom;
  assert.equal(describe('generation', { range: '3d', zoom: z }), 'Electricity generation · New Zealand · 1:05 pm to 3:30 pm, 19 Oct 2026');
  assert.equal(describe('prices', { zoom: z }), 'Wholesale electricity prices · New Zealand · 1:05 pm to 3:30 pm, 19 Oct 2026');  // both tabs zoom (Oct 2026)
  // the link to the dates shown pins "the last 3 hours" to those hours
  const L = shareLinks('/tracker', { range: '1d', zoom: { span: 3 } }, { latestEnd: endOfDay('2026-10-18'), days: 1, zoomAt: z });
  assert.equal(L.live, 'https://elenz.co.nz/tracker?zoom=3h');
  assert.equal(L.fixed(false).url, 'https://elenz.co.nz/tracker?end=2026-10-18&zoom=2026-10-19T13:05~2026-10-19T15:30');
});
