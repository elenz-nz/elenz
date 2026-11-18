// Tests for the plant pages' history, live panel and map (src/lib/plants/): run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plantMonths, years, lastMonths, latestYear, bestYear, capAt, hoursIn, capChanges, fmtGwh, fmtMw } from '#lib/plants/history.js';
import { livePlant } from '#lib/plants/live.js';
import { toView } from '#lib/plants/map.js';
import { PTS } from '#lib/home/nzmap.js';
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
