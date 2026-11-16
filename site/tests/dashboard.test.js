// Tests for the big-number dashboard (/dashboard): run with `npm test`. Its layouts survive the address and the
// browser's storage, and its values follow /now, including "No estimate" where embedded solar has none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clean, fromQuery, toQuery, resize, plainPalette, toHsl, fromHsl, PLAIN, DEFAULT } from '#lib/dashboard/layout.js';
import { context, catalogue, resolve } from '#lib/dashboard/values.js';

// an hour of 5-minute data; the North Island's embedded solar has no estimate in the newest interval when `gap`
function live(gap = false) {
  const N = 12, z = () => new Array(N).fill(0), c = (v) => new Array(N).fill(v);
  const roof = c(300).map((v, j) => (gap && j === N - 1 ? null : v));
  const isl = (r, hydro) => ({ geo: z(), bio: z(), waste: z(), coal: z(), gas: c(100), diesel: z(), hydro: c(hydro), wind: c(200), solar: z(), batt: z(),
    roof: r, roofU: r.map((v) => (v == null ? null : 20)), metered: c(1500), underlying: r.map((v) => (v == null ? null : 1500 + v)),
    tiwai: c(0), price: c(100), hvdc: z() });
  const D = { t0: Date.UTC(2026, 10, 15, 0, 0), step: 300e3, N, NI: isl(roof, 500), SI: isl(c(0), 1500), hvdcN: c(400), plants: [], meta: { end: Date.UTC(2026, 10, 15, 0, 55) },
    nodes: { OTA: c(110) }, explain: { usual: { NZ: { wind: 300, solar: 0, hydro: 1800, demand: 3000 }, NI: {}, SI: {} }, setter: { NI: { plant: 'Stratford', fuel: 'gas', mw: 101, cap: 212, price: 140 }, SI: null }, peakers: [] } };
  D.SI.tiwai = c(570);
  D.NI.hvdc = c(390); D.SI.hvdc = c(-400);
  return D;
}
const rows = [
  { name: 'Benmore', key: 'benmore', fuel: 'hydro', fuelName: 'Hydro', isl: 'SI', mw: 356, cap: 540, pct: 65.9, est: false, charging: false },
  { name: 'Turitea Wind Farm', key: 'turitea-wind-farm', fuel: 'wind', fuelName: 'Wind', isl: 'NI', mw: 182, cap: 222, pct: 82, est: false, charging: false },
];

test('a layout from the address: counts capped, unknown backgrounds and bad specs dropped, an empty small list kept', () => {
  assert.equal(fromQuery(''), null);
  const l = fromQuery('?bg=nope&big=gen:NZ,ren:NZ,hydro:SI:cf&small=hvdc,<script>,wind:NI:pct');
  assert.deepEqual(l, { bg: DEFAULT.bg, col: DEFAULT.col, view: 'detailed', big: ['gen:NZ', 'ren:NZ'], small: ['hvdc', 'wind:NI:pct'] });
  assert.deepEqual(fromQuery('?bg=aurora&big=gen:NZ&small=').small, []);
  assert.deepEqual(clean({ big: [] }).big, ['gen:NZ']);
  const back = fromQuery(toQuery(clean({ bg: 'alps', big: ['p_benmore::cf'], small: [] }), { kiosk: '1' }));
  assert.deepEqual(back, { bg: 'alps', col: DEFAULT.col, view: 'detailed', big: ['p_benmore::cf'], small: [] });
  assert.match(toQuery(DEFAULT), /big=gen:NZ,ren:NZ/);
});

test('a plain colour and the simple view survive the address; a bad colour falls back', () => {
  const q = toQuery(clean({ bg: 'plain', col: '0B1A33', view: 'simple', big: ['gen:NZ'], small: [] }));
  assert.match(q, /bg=plain&col=0b1a33&view=simple/);
  assert.deepEqual(fromQuery(q), { bg: 'plain', col: '0b1a33', view: 'simple', big: ['gen:NZ'], small: [] });
  assert.doesNotMatch(toQuery(clean({ bg: 'aurora', big: ['gen:NZ'] })), /col=|view=/);
  assert.equal(fromQuery('?bg=plain&col=red&big=gen:NZ').col, DEFAULT.col);
  // light ink on dark colours, dark ink on light ones
  assert.equal(plainPalette('000000').ink, '#f4f7f6');
  assert.equal(plainPalette('f2efe8').ink, '#132020');
  assert.equal(plainPalette('e0a526').ink, '#132020');   // gold: dark ink stands out more
  assert.equal(plainPalette('b4432f').ink, '#f4f7f6');   // brick: light ink
});

test("the colour picker's sliders go to a colour and back", () => {
  for (const { c } of PLAIN) {
    const back = fromHsl(toHsl(c));
    for (const i of [0, 2, 4]) assert.ok(Math.abs(parseInt(back.slice(i, i + 2), 16) - parseInt(c.slice(i, i + 2), 16)) <= 3, `${c} came back as ${back}`);
  }
  assert.deepEqual(toHsl('ff0000'), { h: 0, s: 100, l: 50 });
  assert.equal(fromHsl({ h: 120, s: 100, l: 25 }), '008000');
  assert.equal(fromHsl({ h: 0, s: 0, l: 100 }), 'ffffff');
});

test('growing a row adds values not already shown', () => {
  const s = resize(['hvdc'], 3, ['demand:NZ']);
  assert.equal(s.length, 3);
  assert.equal(new Set(s).size, 3);
  assert.ok(!s.includes('demand:NZ'));
  assert.deepEqual(resize(['a', 'b', 'c'], 1), ['a']);
});

test('values follow /now: generation, shares, HVDC, prices, plants and the possible price setter', () => {
  const x = context(live(), rows), cat = catalogue(x), v = (s) => resolve(s, cat, x);
  assert.equal(v('gen:NZ').v, '2,900');                     // 2,000 hydro + 400 wind + 200 gas + 300 embedded solar
  assert.equal(v('hydro:SI:pct').v, '83.3');
  assert.equal(v('hydro:NZ:mw').s, '69.0% of generation · usual 1,800 MW');
  assert.equal(v('wind:NZ:mw').s, '13.8% of generation · four-week median 300 MW');
  assert.equal(v('hvdc').s, 'Flowing north, Benmore to Haywards');
  assert.equal(v('price_ota').v, '110.00');
  assert.equal(v('setter:NI').v, 'Stratford');
  assert.ok(v('setter:NI').est);
  assert.equal(v('p_benmore::cf').v, '66');
  assert.equal(v('bigwind').v, 'Turitea');
  assert.equal(v('bigwind').label, 'Top wind farm');
  assert.equal(v('bighydro').v, 'Benmore');
  assert.equal(v('tiwai').s, '38% of South Island demand');
  // a region a value doesn't have falls back to its first
  assert.equal(v('price:NZ').region, 'NI');
});

test('with no embedded solar estimate, the values that need one say "No estimate"', () => {
  const x = context(live(true), rows), cat = catalogue(x), v = (s) => resolve(s, cat, x);
  for (const s of ['ren:NZ', 'ren:NI', 'co2:NZ', 'underlying:NI', 'roof:NI:mw', 'allsolar:NZ:mw', 'ibr:NZ']) {
    assert.equal(v(s).v, 'No estimate', s);
    assert.ok(v(s).none, s);
  }
  assert.notEqual(v('ren:SI').v, 'No estimate');
  assert.equal(v('gen:NZ').s, 'No renewable estimate right now');
});

test('a plant in a stored layout keeps its place until the data arrives', () => {
  const before = resolve('p_benmore::cf', catalogue(null), null);
  assert.equal(before.spec, 'p_benmore::cf');
});
