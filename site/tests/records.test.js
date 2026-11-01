// Tests for the records' live-week check (src/lib/records/records.js): run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveBeats, liveNear, adjustLive, close, recent } from '#lib/records/records.js';

// a live week of 5-minute data: two hours, wind steady at `w` MW in the North Island
function live(w, extra = {}) {
  const N = 24, z = () => new Array(N).fill(0);
  const isl = (wind) => ({ geo: z(), bio: z(), waste: z(), coal: z(), gas: z(), diesel: z(), hydro: z().map(() => 1000), wind: z().map(() => wind), solar: z(), roof: z(), batt: z(), metered: z().map(() => 2000), price: z().map(() => 100) });
  return { t0: Date.UTC(2026, 9, 31, 0, 0), step: 300e3, N, NI: isl(w), SI: isl(0), plants: [], meta: {}, ...extra };
}
// records.json with a North Island wind record of 900 MW, a 10 MW shift and 6 MW margin for dispatch data
const R = {
  final_to: { gen: 0 },
  adj: { plants: { 'Glenbrook Steel': 1.5 }, hh: { wind_max: { NI: { shift: 10, m: 6 } } }, period: {} },
  records: { wind_max: { NI: { t: 1, v: 900, steps: [[1, 900]] } } },
};

test('a live figure clear of the margin after its shift is provisional, at the corrected value', () => {
  const b = liveBeats(R, live(920));
  assert.equal(b.wind_max.NI.v, 910);
  assert.equal(b.wind_max.NI.m, 6);
  assert.deepEqual(liveNear(R, live(920)), {});
});

test('within the margin either side it is close to the record, not provisional', () => {
  for (const w of [912, 908, 905]) {
    assert.deepEqual(liveBeats(R, live(w)), {}, `${w} MW`);
    assert.equal(liveNear(R, live(w)).wind_max.NI.v, w - 10, `${w} MW`);
  }
  assert.deepEqual(liveNear(R, live(895)), {});
  const near = liveNear(R, live(908));
  assert.equal(close(R, {}, near, 'wind_max', 'NI').v, 898);
  assert.equal(recent(R, {}, Date.now(), near)[0].near.v, 898);
});

test('plants dispatch reads off are scaled to their meters', () => {
  const D = live(0, { plants: [{ name: 'Glenbrook Steel', fuel: 'waste', isl: 'NI', s: new Array(24).fill(40) }] });
  D.NI.waste = D.NI.waste.map(() => 40);
  assert.equal(adjustLive(D, R.adj).NI.waste[0], 60);
  assert.equal(D.NI.waste[0], 40, 'the original is left alone');
});
