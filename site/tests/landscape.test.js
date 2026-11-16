// Tests for the power landscape's dials and feed (/landscape): run with `npm test`. Each dial stays between 0 and 1
// (the battery between −1 and 1), follows its band, and the feed marks intervals with no embedded solar estimate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDials, sampleAt, band01, sun, seasonOf, seasonIdx } from '#lib/landscape/dials.js';
import { feedFrom } from '#lib/landscape/feed.js';

const NOON = Date.UTC(2026, 10, 15, 0, 0);       // 1 pm on 15 November, New Zealand time
const MIDNIGHT = Date.UTC(2026, 10, 15, 11, 0);  // midnight

function tracker(roofLast = 400) {
  const N = 6, c = (v) => new Array(N).fill(v);
  const isl = (hydro, roof) => ({ geo: c(500), bio: c(20), waste: c(0), coal: c(0), gas: c(100), diesel: c(0), hydro: c(hydro), wind: c(300), solar: c(50), batt: c(-40),
    roof, roofU: roof, metered: c(2000), underlying: c(2200), tiwai: c(0), price: c(80), hvdc: c(0) });
  return { t0: NOON, step: 300e3, N, hvdcN: c(0), meta: { end: NOON + 5 * 300e3 },
    NI: isl(800, [...c(200).slice(1), roofLast]), SI: isl(2000, c(100)), plants: [{ name: 'Stratford', fuel: 'gas', isl: 'NI', cap: 212, s: [0, 0, 0, 0, 0, 101] }] };
}

test('the feed adds the islands, keeps 24 hours and marks embedded solar with no estimate', () => {
  const f = feedFrom(tracker(), { batt: 335 });
  assert.equal(f.n, 6);
  assert.equal(f.hydro[0], 2800);
  assert.equal(f.demand[0], 4000);
  assert.equal(f.roof[5], 500);
  assert.deepEqual(f.roofNA, [0, 0, 0, 0, 0, 0]);
  const g = feedFrom(tracker(null), { batt: 335 });
  assert.equal(g.roofNA[5], 1);
  assert.equal(g.roof[5], g.roof[4]);   // the picture keeps the last estimate
  assert.deepEqual(g.plants[0], { n: 'Stratford', f: 'gas', c: 212, s: [0, 0, 0, 0, 0, 101] });
});

test('dials stay in range and follow their bands', () => {
  const f = feedFrom(tracker(), { batt: 335 });
  const d = makeDials(f.cap)(sampleAt(f, f.n - 1));
  for (const k of ['wind', 'hydro', 'geo', 'solar', 'roof', 'thermal', 'town', 'cloud']) assert.ok(d[k] >= 0 && d[k] <= 1, k);
  assert.ok(d.batt < 0 && d.batt >= -1);            // charging
  assert.equal(d.hydro, band01('hydro', 2800));
  assert.equal(band01('wind', -5), 0);
  assert.equal(band01('wind', 5000), 1);
  assert.ok(d._ren > 0.9 && d._ren < 1);
});

test('with no embedded solar estimate, the renewable share is left out and the cloud holds', () => {
  const f = feedFrom(tracker(null), { batt: 335 });
  const dials = makeDials(f.cap);
  const before = dials(sampleAt(f, 4));
  const d = dials(sampleAt(f, 5));
  assert.equal(d._ren, null);
  assert.equal(d.cloud, before.cloud);
});

test('sun and season: up at 1 pm, down at midnight, November is spring', () => {
  assert.ok(sun(NOON).e > 50);
  assert.ok(sun(MIDNIGHT).e < -20);
  assert.equal(seasonIdx(seasonOf(NOON)), 3);
});
