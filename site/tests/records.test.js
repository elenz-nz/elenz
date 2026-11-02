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

test('a record with no margin is beaten or not: a tie is not close', () => {
  const R0 = { ...R, adj: { plants: {}, hh: {}, period: {} } };
  assert.deepEqual(liveNear(R0, live(900)), {});
  assert.equal(liveBeats(R0, live(901)).wind_max.NI.v, 901);
});

test('cards: every region and period, most notable first; the first four one per record, two per group at most', async () => {
  const { recentAll, topCards } = await import('#lib/records/records.js');
  const now = Date.UTC(2026, 10, 1);
  const since = now - 2 * 864e5, t = now - 40 * 864e5;
  const rec = (v, prev, steps) => ({ t, v, prev, steps, since });
  const RR = {
    adj: { plants: {}, hh: {}, period: {} }, resolved: [],
    records: {
      wind_max: { NZ: rec(1120, [t - 9e9, 1000], [[0, 900], [1, 950], [2, 1000], [t, 1120]]) },
      demand_max: { NZ: rec(7387, [t - 9e9, 7380], [[0, 7200], [1, 7300], [2, 7380], [t, 7387]]) },
      solar_max: { NZ: rec(538, [t - 9e9, 500], [[0, 400], [1, 450], [2, 500], [t, 538]]), NI: { t, v: 356, steps: [[t, 356]], prov: { t: now, v: 391 } }, SI: { t, v: 201, steps: [[t, 201]], prov: { t: now, v: 204 } } },
      roof_max: { NZ: rec(680, [t - 9e9, 650], [[0, 600], [1, 620], [2, 650], [t, 680]]) },
      hydro_max: { NZ: rec(4500, [t - 9e9, 4490], [[0, 4400], [1, 4450], [2, 4490], [t, 4500]]) },
    },
    periods: { day: { solar_max: { NZ: { t, v: 182, steps: [[t, 182]], prov: { t: now, v: 228 } } } } },
  };
  const all = recentAll(RR, {}, null, now);
  assert.ok(all.length >= 7, 'every region and period');
  assert.ok(all.some((c) => c.period === 'day' && c.d.id === 'solar_max'), 'period records included');
  for (let i = 1; i < all.length; i++) assert.ok(all[i - 1].score >= all[i].score, 'most notable first');
  const top = topCards(all, 4);
  assert.equal(new Set(top.map((c) => c.d.id)).size, top.length, 'one per record');
  assert.ok(top.filter((c) => c.d.group === 'Wind and solar').length <= 2, 'two per group at most');
  assert.ok(top.some((c) => c.d.id === 'wind_max'), 'a big jump ranks high');
});
