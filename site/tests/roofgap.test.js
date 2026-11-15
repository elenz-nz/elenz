// Tests for the live week's embedded solar with no estimate (null in tracker.json where daylight has no irradiance):
// run with `npm test`. The page shows a gap, not zero, and leaves the figures that need embedded solar without one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromLayout, aggregate, KEY } from '#lib/tracker/series.js';
import { summarise } from '#lib/home/now.js';
import { liveBeats } from '#lib/records/records.js';

// two hours of 5-minute data from a half-hour boundary; the North Island's embedded solar has no estimate for the
// last `gap` intervals
function live(gap) {
  const N = 24, z = () => new Array(N).fill(0), c = (v) => new Array(N).fill(v);
  const roof = c(500).map((v, j) => (j >= N - gap ? null : v));
  const isl = (r) => ({ geo: z(), bio: z(), waste: z(), coal: z(), gas: c(1000), diesel: z(), hydro: c(500), wind: z(), solar: z(), batt: z(),
    roof: r, roofU: r.map((v) => (v == null ? null : 40)), metered: c(1500), underlying: r.map((v) => (v == null ? null : 1500 + v)),
    tiwai: z(), price: c(100) });
  return { t0: Date.UTC(2026, 10, 15, 0, 0), step: 300e3, N, NI: isl(roof), SI: isl(c(0)), hvdcN: z(), plants: [], meta: {} };
}

test('no estimate: roofNA marks the intervals, embedded solar counts as zero, demand with embedded generation is NaN', () => {
  const S = fromLayout(live(6));
  assert.deepEqual([...S.NI.roofNA.slice(17)], [0, 1, 1, 1, 1, 1, 1]);
  assert.equal(S.NI.roof[23], 0);
  assert.ok(Number.isNaN(S.NI.underlying[23]) && S.NI.underlying[0] === 2000);
  assert.equal(S.SI.roofNA[23], 0);
  // a half-hour with any interval missing: its share is the fraction missing, and its average demand has none
  const H = aggregate(S, KEY.hh);
  assert.deepEqual([...H.NI.roofNA], [0, 0, 0, 1]);
  assert.ok(Number.isNaN(H.NI.underlying[3]) && H.NI.underlying[2] === 2000);
});

test('complete data has no gap marks and keeps every value', () => {
  const S = fromLayout(live(0));
  assert.ok(S.NI.roofNA.every((v) => v === 0) && S.NI.underlying.every((v) => v === 2000));
});

test('the newest interval with no estimate: the Now figures say so rather than leave embedded solar out', () => {
  const n = summarise(live(1));
  assert.equal(n.regions.NI.roof, null);
  assert.equal(n.regions.NI.ren, null);
  assert.equal(n.regions.NI.co2, null);
  assert.equal(n.regions.NI.underlying, null);
  assert.equal(n.regions.NZ.ren, null);
  assert.ok(n.regions.SI.ren > 0 && n.regions.SI.roof === 0);
  const ok = summarise(live(0));
  assert.equal(ok.regions.NI.roof, 500);
  assert.ok(Math.abs(ok.regions.NI.ren - 50) < 1e-9);
});

test('a half-hour with no embedded solar estimate sets no live renewable-share record', () => {
  // with embedded solar the North Island is 50% renewable; counted as zero it would read 33%, under the 40% record
  const R = { final_to: { gen: 0 }, adj: { plants: {}, hh: {}, period: {} }, records: { ren_min: { NI: { t: 1, v: 40, steps: [[1, 40]] } } } };
  assert.equal(liveBeats(R, live(6)).ren_min, undefined);
});
