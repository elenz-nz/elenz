// Tests for the price explainer's rules (src/lib/now/explain.js) and the preview links' simulator: run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainNow } from '#lib/now/explain.js';
import { simulate } from '#lib/now/simulate.js';

// a week of 5-minute data at flat prices, whose usual price is $60
function week(hay, ben, { peakers = 0, peakersUsual = 0, hvdc = 750 } = {}) {
  const N = 2016, step = 300e3, t0 = Date.UTC(2026, 9, 26, 0, 0);
  const factors = (o = {}) => ({ wind: 500, solar: 0, hydro: 2000, thermal: 100, peakers: 0, demand: 4000, ...o });
  const usual = { NZ: factors({ peakers: peakersUsual }), NI: factors({ peakers: peakersUsual }), SI: factors(), hvdc: 500 };
  return {
    t0, step, N,
    NI: { price: new Array(N).fill(hay) }, SI: { price: new Array(N).fill(ben) },
    explain: {
      level: 50, now: { NZ: factors({ peakers }), NI: factors({ peakers }), SI: factors(), hvdc }, usual,
      typ: { t0, step: 1800e3, med: new Array(336).fill(60), p25: new Array(336).fill(45), p75: new Array(336).fill(80) },
    },
  };
}
const peakRow = (x) => x.rows.find((r) => r.k === 'peakers');

test('under $100 a smaller gap counts as apart, said but not highlighted (NOW-07)', () => {
  const x = explainNow(week(70, 45));
  assert.equal(x.variant, 'split');
  assert.equal(x.tier, 'quiet');
  assert.match(x.link.title, /apart/);
  assert.match(x.verdictNow, /HVDC link is carrying 750 MW north/);
});

test('a small gap stays together, and so does the same gap at higher prices', () => {
  assert.equal(explainNow(week(70, 60)).link.title, 'Islands priced together');
  assert.equal(explainNow(week(150, 120)).link.title, 'Islands priced together');
});

test('a split over $50 is still highlighted', () => {
  const x = explainNow(week(150, 60));
  assert.equal(x.variant, 'split');
  assert.notEqual(x.tier, 'quiet');
});

test('peaking plants: lower than usual while some run, off only when they are (NOW-07)', () => {
  assert.match(peakRow(explainNow(week(60, 58, { peakers: 40, peakersUsual: 120 }))).title, /lower than usual/);
  assert.match(peakRow(explainNow(week(60, 58, { peakers: 0, peakersUsual: 120 }))).title, /are off/);
});

test('the simulator reaches each state (NOW-08)', () => {
  const run = (k) => explainNow(simulate(week(80, 75), k));
  assert.equal(run('high').tier, 'open');
  assert.equal(run('up').variant, 'high');
  assert.equal(run('split').variant, 'split');
  assert.deepEqual([run('apart').variant, run('apart').tier], ['split', 'quiet']);
  assert.equal(run('low').variant, 'low');
});
