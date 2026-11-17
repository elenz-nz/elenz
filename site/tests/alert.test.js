// Tests for the record alert (src/lib/records/alert.js, run by watchdog.yml's `records` job): run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { provisionalNow, toldKeys, issueFor, keyOf, pageOf } from '#lib/records/alert.js';

const T = Date.UTC(2026, 10, 14, 0, 0);   // 1:00 pm NZDT, Sat 14 Nov 2026
const R = {
  final_to: { gen: Date.UTC(2026, 9, 31, 11) },
  records: {
    roof_max: {
      NZ: { t: Date.UTC(2026, 9, 23, 0), v: 763, prov: { t: T, v: 774, m: 0 } },
      NI: { t: Date.UTC(2026, 9, 19, 0), v: 514 },
    },
  },
  periods: { week: { solar_max: { SI: { t: Date.UTC(2026, 8, 20, 11), v: 51, prov: { t: Date.UTC(2026, 9, 25, 11), v: 61, m: 0 } } } } },
};

test('lists provisional records, NZ and half-hours first, with their pages', () => {
  const list = provisionalNow(R, null);
  assert.deepEqual(list.map((x) => x.key), ['roof_max|NZ|tp|2026-11-14', 'solar_max|SI|week|2026-10-26']);
  assert.match(list[0].line, /^Peak embedded solar, New Zealand: 774 MW .*Official record 763 MW/);
  assert.match(list[0].line, /Modelled estimate/);
  assert.equal(list[1].url, 'https://elenz.co.nz/records/solar_max?region=SI&period=week');
  // a week ending in November is settled by November's metering, not October's
  assert.match(list[1].line, /settles it early January/);
});

test('half-hour keys are per NZ day, so a figure climbing through the afternoon is told once', () => {
  assert.equal(keyOf('roof_max', 'NZ', 'tp', T), keyOf('roof_max', 'NZ', 'tp', T + 3 * 3600e3));
  assert.notEqual(keyOf('roof_max', 'NZ', 'tp', T), keyOf('roof_max', 'NZ', 'tp', T + 12 * 3600e3));
  assert.equal(pageOf('ren_max', 'NZ', 'tp'), 'https://elenz.co.nz/records/ren_max');
});

test('each record is told once; the first run lists rather than announces', () => {
  const list = provisionalNow(R, null);
  const first = issueFor(list, new Set(), T, true);
  assert.match(first.title, /^Record alert is on: 2 provisional records/);
  assert.doesNotMatch(first.body, /utm_/);
  const told = toldKeys([first.body]);
  assert.equal(told.size, 2);
  assert.equal(issueFor(list, told, T), null);
  const later = issueFor(list, toldKeys(['<!-- record: solar_max|SI|week|2026-10-26 -->']), T);
  assert.match(later.title, /^Provisional record: Peak embedded solar, New Zealand \(/);
  assert.match(later.body, /records\/roof_max\?utm_source=linkedin&utm_medium=social&utm_campaign=record/);
  assert.match(later.body, /<!-- record: roof_max\|NZ\|tp\|2026-11-14 -->/);
});

test('no records file, nothing to tell', () => {
  assert.deepEqual(provisionalNow(null, null), []);
});
