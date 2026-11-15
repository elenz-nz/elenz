// The big-number dashboard's values (/dashboard): every live figure a tile can show, worked out from the newest
// interval of tracker.json. Each value has a key, a group (the picker's tabs), a label, a colour for its dot, the
// regions it can show (null: one figure only) and the ways it can be shown (null: one way only):
//   mw   the figure in MW          pct  as a share of generation          cf  as a share of installed capacity
// A layout names a value as "key:region:measure", e.g. "hydro:SI:cf" or "hvdc" (dashboard/layout.js).
//
// The figures follow /now: generation and its shares come from summarise() (#lib/home/now.js), plants from the
// generator table (#lib/now/generators.js), "usual" figures and the possible price setter from the price explainer's
// block (explain in tracker.json). Where a figure needs embedded solar and there is no estimate of it (daylight with no
// irradiance), the tile says "No estimate" (style guide, Status labels).
import { summarise } from '#lib/home/now.js';

export const REGION_NAMES = { NZ: 'New Zealand', NI: 'North Island', SI: 'South Island' };
export const MEASURE_NAMES = { mw: 'MW', pct: '% of generation', cf: '% of capacity' };
export const GROUPS = ['System', 'Prices', 'By fuel', 'Plants', 'Fun facts'];

// dot colours: the site's dark-theme fuel colours, which read on every background (the stage has its own palette)
const C = {
  hydro: '#4f8bd6', wind: '#2fa883', geo: '#c4508f', solar: '#bb8c18', roof: '#d9a62a', gas: '#cc7a2e', coal: '#8a8480',
  diesel: '#bf3a52', batt: '#8a72d8', bio: '#8fb03c', waste: '#a88a74', oemb: '#6fa8c2', hvdc: '#9fb0bb',
  sys: '#7fc4d1', ren: '#2ea88a', co2: '#a8927f', price: '#e6c35c', fossil: '#c0834f', fun: '#e58fb0',
};
export const FUEL_COLOUR = C;

const ALL = ['NZ', 'NI', 'SI'];
const NI_ONLY = ['NZ', 'NI'];

// numbers as the tracker and /now show them: one decimal below 10 MW, whole MW from 10 MW, zero as 0
export const mw = (v) => {
  const a = Math.abs(v);
  if (a < 0.05) return '0';
  const s = a < 10 ? a.toFixed(1) : Math.round(a).toLocaleString('en-NZ');
  return v < 0 ? '−' + s : s;
};
const pct1 = (v) => (Math.abs(v) < 0.05 ? '0.0' : v.toFixed(1));
const pct0 = (v) => String(Math.round(v));
const signed = (v) => (v > 0.5 ? '+' : v < -0.5 ? '−' : '') + Math.abs(Math.round(v));
const money = (v) => (v < 0 ? '−' : '') + Math.abs(v).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NONE = (s) => ({ v: 'No estimate', u: '', s, none: true });

/** Everything the values read, from one tracker.json and its generator rows (generatorRows() in #lib/now/generators.js,
 * passed in so this file runs under node's test runner, which can't import the JSON that file reads). */
export function context(D, rows = []) {
  const now = summarise(D);
  const j = D.N - 1;
  // installed MW by island and fuel: the plants' capacities today (est. rows have none)
  const cap = { NI: {}, SI: {} };
  for (const r of rows) {
    if (r.est || !r.cap || !cap[r.isl]) continue;
    cap[r.isl][r.fuel] = (cap[r.isl][r.fuel] ?? 0) + r.cap;
  }
  return { D, j, now, rows, cap, E: D.explain ?? null, end: D.meta?.end ?? D.t0 + j * D.step };
}

const reg = (x, r) => x.now.regions[r];
// a fuel's MW; embedded solar is null where there is no estimate of it (summarise() counts it as zero in the mix)
const fuelMW = (x, r, k) => {
  if (k === 'roof' && reg(x, r).roof == null) return null;
  const v = reg(x, r).fuels[k];
  return v == null ? null : v;
};
const capOf = (x, r, k) => (r === 'NZ' ? (x.cap.NI[k] ?? 0) + (x.cap.SI[k] ?? 0) : x.cap[r][k] ?? 0);
const usual = (x, r, k) => x.E?.usual?.[r]?.[k] ?? null;
// the share of generation that isn't battery discharge, as the renewable share and emissions intensity use (now.js)
const baseGen = (x, r) => reg(x, r).gen - Math.max(0, reg(x, r).fuels.batt ?? 0);

/** A fuel's value: its MW, its share of generation, or its share of installed capacity. */
function fuel(k, { est = false, noCf = false } = {}) {
  return (x, r, m) => {
    const v = fuelMW(x, r, k);
    if (v == null) return NONE(k === 'roof' ? 'No irradiance data at the moment' : 'No estimate right now');
    const g = reg(x, r).gen;
    const share = g > 0 ? (Math.max(0, v) / g) * 100 : 0;
    if (m === 'pct') return { v: pct1(share), u: '%', s: `${mw(v)} MW` };
    if (m === 'cf' && !noCf) {
      const c = capOf(x, r, k);
      if (!c) return null;
      return { v: pct0((Math.max(0, v) / c) * 100), u: '%', s: `${mw(Math.max(0, v))} of ${mw(c)} MW installed` };
    }
    const u = k === 'hydro' || k === 'wind' ? usual(x, r, k) : null;
    let s = `${pct1(share)}% of generation`;
    if (u != null) s += k === 'wind' ? ` · four-week median ${mw(u)} MW` : ` · usual ${mw(u)} MW`;
    if (k === 'roof' && reg(x, r).roofU > 0.5) s = `± ${mw(reg(x, r).roofU)} MW, from satellite sunshine`;
    if (Math.abs(v) < 0.05 && k !== 'roof' && k !== 'solar') s = 'Not running right now';
    return { v: mw(v), u: 'MW', s, est };
  };
}

/** A group of fuels added up (all renewables, fossil fuels, all solar). */
function sum(keys, words, { needsRoof = false } = {}) {
  return (x, r, m) => {
    const vals = keys.map((k) => fuelMW(x, r, k));
    if (needsRoof && vals.some((v) => v == null)) return NONE('No embedded solar estimate at the moment');
    const v = vals.reduce((a, b) => a + Math.max(0, b ?? 0), 0);
    const g = reg(x, r).gen;
    if (m === 'pct') return { v: pct1(g > 0 ? (v / g) * 100 : 0), u: '%', s: `${mw(v)} MW` };
    return { v: mw(v), u: 'MW', s: words };
  };
}

/** Now against the usual for this time of day, as a percentage (fun facts). */
function vsUsual(k, words) {
  return (x, r) => {
    const R = reg(x, r);
    const nowV = k === 'solar' ? (R.roof == null ? null : (R.fuels.solar ?? 0) + R.roof) : R.fuels[k];
    if (nowV == null) return NONE('No embedded solar estimate at the moment');
    const u = usual(x, r, k);
    if (u == null) return null;
    if (u < 5) return { v: '–', u: '', s: `${words} usually about ${mw(u)} MW now` };
    // wind follows the weather, not the clock: its "usual" is the median of the last four weeks (ingest/explain.py)
    return { v: signed((nowV / u - 1) * 100), u: '%', s: k === 'wind' ? `Four-week median ${mw(u)} MW` : `${words}, usual for this time ${mw(u)} MW` };
  };
}

const ISL = { NI: 'North Island', SI: 'South Island' };
const plantSub = (row) => `${row.fuelName}, ${ISL[row.isl]}`;

// the catalogue, in the picker's order
const BASE = [
  // System
  { k: 'gen', g: 'System', label: 'Generation', c: C.sys, regions: ALL, get: (x, r) => {
    const R = reg(x, r);
    return { v: mw(R.gen), u: 'MW', s: R.ren == null ? 'No renewable estimate right now' : `${pct1(R.ren)}% renewable` };
  } },
  { k: 'demand', g: 'System', label: 'Grid demand', c: C.sys, regions: ALL, get: (x, r) => {
    const u = usual(x, r, 'demand');
    return { v: mw(reg(x, r).demand), u: 'MW', s: u != null ? `Usual for this time ${mw(u)} MW` : 'Electricity taken from the grid' };
  } },
  { k: 'underlying', g: 'System', label: 'Demand with embedded generation', c: C.sys, regions: ALL, est: true, get: (x, r) => {
    const v = reg(x, r).underlying;
    return v == null ? NONE('No embedded solar estimate at the moment') : { v: mw(v), u: 'MW', s: 'Grid demand plus embedded generation', est: true };
  } },
  { k: 'ren', g: 'System', label: 'Renewable share', c: C.ren, regions: ALL, get: (x, r) => {
    const R = reg(x, r);
    if (R.ren == null) return NONE('No embedded solar estimate at the moment');
    return { v: pct1(R.ren), u: '%', s: `${mw((R.ren / 100) * baseGen(x, r))} MW from renewables` };
  } },
  { k: 'co2', g: 'System', label: 'Emissions intensity', c: C.co2, regions: ALL, get: (x, r) => {
    const R = reg(x, r);
    return R.co2 == null ? NONE('No embedded solar estimate at the moment') : { v: pct0(R.co2), u: 'g CO₂e/kWh', s: 'Per kWh generated', est: true };
  } },
  { k: 'co2rate', g: 'System', label: 'Emissions right now', c: C.co2, regions: ALL, get: (x, r) => {
    const R = reg(x, r);
    if (R.co2 == null) return NONE('No embedded solar estimate at the moment');
    const t = (R.co2 * baseGen(x, r)) / 1000;
    return { v: pct0(t), u: 't CO₂e an hour', s: t < 0.5 ? 'Almost none right now' : 'Mostly from gas, coal and geothermal steam', est: true };
  } },
  { k: 'ibr', g: 'System', label: 'Wind and solar share', c: C.wind, regions: ALL, get: (x, r) => {
    const R = reg(x, r);
    if (R.roof == null) return NONE('No embedded solar estimate at the moment');
    const v = (R.fuels.wind ?? 0) + (R.fuels.solar ?? 0) + R.roof;
    return { v: pct1(R.gen > 0 ? (v / R.gen) * 100 : 0), u: '%', s: 'Wind, grid solar and embedded solar' };
  } },
  { k: 'hvdc', g: 'System', label: 'HVDC transfer', c: C.hvdc, get: (x) => {
    const h = x.now.hvdc.mid;
    return { v: mw(Math.abs(h)), u: 'MW', s: Math.abs(h) < 1 ? 'Hardly any transfer right now' : h > 0 ? 'Flowing north, Benmore to Haywards' : 'Flowing south, Haywards to Benmore' };
  } },
  { k: 'hvdcshare', g: 'System', label: 'North Island demand met by the HVDC', c: C.hvdc, get: (x) => {
    const ni = x.now.hvdc.ni, d = reg(x, 'NI').demand;
    if (ni <= 0.5) return { v: '0', u: '%', s: 'The HVDC isn’t flowing north right now' };
    return { v: pct1(d > 0 ? (ni / d) * 100 : 0), u: '%', s: `${mw(ni)} MW arriving at Haywards` };
  } },
  { k: 'tiwai', g: 'System', label: 'Tiwai Point smelter', c: C.sys, get: (x) => {
    const t = x.now.regions.NZ.tiwai ?? 0, d = reg(x, 'SI').demand;
    return { v: mw(t), u: 'MW', s: d > 0 ? `${pct0((t / d) * 100)}% of South Island demand` : '' };
  } },
  // Prices
  { k: 'price', g: 'Prices', label: 'Wholesale price', c: C.price, regions: ['NI', 'SI'], get: (x, r) => ({
    v: money(reg(x, r).price ?? 0), u: '$/MWh', s: r === 'NI' ? 'Haywards, Wellington' : 'Benmore, Waitaki',
  }) },
  ...[['OTA', 'Ōtāhuhu', 'Ōtāhuhu, Auckland'], ['WKM', 'Whakamaru', 'Whakamaru, Waikato'], ['ISL', 'Islington', 'Islington, Christchurch'], ['INV', 'Invercargill', 'Invercargill']]
    .map(([n, name, where]) => ({ k: 'price_' + n.toLowerCase(), g: 'Prices', label: `Price at ${name}`, c: C.price, get: (x) => {
      const v = x.D.nodes?.[n]?.[x.j];
      return v == null ? null : { v: money(v), u: '$/MWh', s: where };
    } })),
  { k: 'spread', g: 'Prices', label: 'Price gap between the islands', c: C.price, get: (x) => {
    const g = (reg(x, 'NI').price ?? 0) - (reg(x, 'SI').price ?? 0);
    return { v: money(Math.abs(g)), u: '$/MWh', s: Math.abs(g) < 0.005 ? 'The same price in both islands' : g > 0 ? 'North Island above South Island' : 'South Island above North Island' };
  } },
  { k: 'setter', g: 'Prices', label: 'Possible price setter', c: C.price, regions: ['NI', 'SI'], txt: true, est: true, get: (x, r) => {
    if (!x.E) return null;
    const s = x.E.setter?.[r];
    if (!s) return { v: 'None clear', u: '', s: 'No single plant at the margin in the latest offers', est: true };
    const f = x.rows.find((row) => row.name === s.plant);
    return { v: s.plant, u: '', s: `${f?.fuelName ?? 'Plant'}, ${mw(s.mw)} of ${mw(s.cap)} MW, offered at $${money(s.price)}`, est: true };
  } },
  { k: 'peakers', g: 'Prices', label: 'Peakers running', c: C.gas, get: (x) => {
    if (!x.E) return null;
    const p = x.E.peakers ?? [];
    return { v: String(p.length), u: '', s: p.length ? p.map((q) => `${q.name}, ${mw(q.mw)} MW`).join(' · ') : 'None right now' };
  } },
  // By fuel
  { k: 'hydro', g: 'By fuel', label: 'Hydro', c: C.hydro, regions: ALL, ms: ['mw', 'pct', 'cf'], get: fuel('hydro') },
  { k: 'wind', g: 'By fuel', label: 'Wind', c: C.wind, regions: ALL, ms: ['mw', 'pct', 'cf'], get: fuel('wind') },
  { k: 'geo', g: 'By fuel', label: 'Geothermal', c: C.geo, regions: NI_ONLY, ms: ['mw', 'pct', 'cf'], get: fuel('geo') },
  { k: 'solar', g: 'By fuel', label: 'Grid solar', c: C.solar, regions: ALL, ms: ['mw', 'pct', 'cf'], get: fuel('solar') },
  { k: 'roof', g: 'By fuel', label: 'Embedded solar', c: C.roof, regions: ALL, ms: ['mw', 'pct'], est: true, get: fuel('roof', { est: true, noCf: true }) },
  { k: 'gas', g: 'By fuel', label: 'Gas', c: C.gas, regions: NI_ONLY, ms: ['mw', 'pct', 'cf'], get: fuel('gas') },
  { k: 'coal', g: 'By fuel', label: 'Coal/gas, Rankine', c: C.coal, regions: NI_ONLY, ms: ['mw', 'pct', 'cf'], get: fuel('coal') },
  { k: 'diesel', g: 'By fuel', label: 'Diesel', c: C.diesel, regions: NI_ONLY, ms: ['mw', 'pct'], get: fuel('diesel', { noCf: true }) },
  { k: 'batt', g: 'By fuel', label: 'Battery', c: C.batt, regions: NI_ONLY, ms: ['mw', 'cf'], get: (x, r, m) => {
    const v = fuelMW(x, r, 'batt') ?? 0;
    const state = v > 0.05 ? 'Discharging' : v < -0.05 ? 'Charging' : 'Not running right now';
    if (m === 'cf') {
      const c = capOf(x, r, 'batt');
      return c ? { v: pct0((Math.abs(v) / c) * 100), u: '%', s: `${state}, ${mw(Math.abs(v))} of ${mw(c)} MW` } : null;
    }
    return { v: mw(Math.abs(v)), u: 'MW', s: state };
  } },
  { k: 'bio', g: 'By fuel', label: 'Bioenergy', c: C.bio, regions: NI_ONLY, ms: ['mw', 'pct', 'cf'], get: fuel('bio') },
  { k: 'waste', g: 'By fuel', label: 'Waste heat', c: C.waste, regions: NI_ONLY, ms: ['mw', 'pct', 'cf'], get: fuel('waste') },
  { k: 'oemb', g: 'By fuel', label: 'Other embedded', c: C.oemb, regions: ALL, ms: ['mw', 'pct'], est: true, get: fuel('oemb', { est: true, noCf: true }) },
  { k: 'renmw', g: 'By fuel', label: 'All renewables', c: C.ren, regions: ALL, ms: ['mw', 'pct'], get: (x, r, m) => {
    const R = reg(x, r);
    if (R.ren == null) return NONE('No embedded solar estimate at the moment');
    const v = (R.ren / 100) * baseGen(x, r);
    if (m === 'pct') return { v: pct1(R.ren), u: '%', s: `${mw(v)} MW` };
    return { v: mw(v), u: 'MW', s: 'Hydro, wind, geothermal, solar and bioenergy' };
  } },
  { k: 'fossil', g: 'By fuel', label: 'Fossil fuels', c: C.fossil, regions: ALL, ms: ['mw', 'pct'], get: sum(['gas', 'coal', 'diesel'], 'Gas, coal and diesel') },
  { k: 'allsolar', g: 'By fuel', label: 'All solar', c: C.solar, regions: ALL, ms: ['mw', 'pct'], est: true, get: sum(['solar', 'roof'], 'Grid solar and embedded solar', { needsRoof: true }) },
  // Fun facts
  { k: 'biggest', g: 'Fun facts', label: 'Biggest plant right now', c: C.fun, txt: true, get: (x) => {
    const top = x.rows.filter((r) => !r.est).sort((a, b) => b.mw - a.mw)[0];
    return top ? { v: top.name, u: '', s: `${mw(top.mw)} MW of ${top.fuelName.toLowerCase()}` } : null;
  } },
  { k: 'bigwind', g: 'Fun facts', label: 'Busiest wind farm', c: C.wind, txt: true, get: (x) => busiest(x, 'wind') },
  { k: 'bigsolar', g: 'Fun facts', label: 'Busiest solar farm', c: C.solar, txt: true, get: (x) => busiest(x, 'solar') },
  { k: 'running', g: 'Fun facts', label: 'Grid plants running', c: C.fun, get: (x) => {
    const all = x.rows.filter((r) => !r.est);
    return { v: String(all.filter((r) => r.mw > 0.5).length), u: `of ${all.length}`, s: 'Making more than half a megawatt' };
  } },
  { k: 'windvs', g: 'Fun facts', label: 'Wind against usual', c: C.wind, regions: ALL, get: vsUsual('wind', 'Wind') },
  { k: 'sunvs', g: 'Fun facts', label: 'Solar against usual', c: C.solar, regions: ALL, get: vsUsual('solar', 'All solar') },
  { k: 'hydrovs', g: 'Fun facts', label: 'Hydro against usual', c: C.hydro, regions: ALL, get: vsUsual('hydro', 'Hydro') },
];

function busiest(x, f) {
  const top = x.rows.filter((r) => r.fuel === f && !r.est).sort((a, b) => b.mw - a.mw)[0];
  if (!top || top.mw < 0.5) return { v: 'None', u: '', s: f === 'solar' ? 'No grid solar right now' : 'No wind right now' };
  return { v: top.name.replace(/ (Wind|Solar) Farm$/, ''), u: '', s: `${mw(top.mw)} MW` + (top.pct != null ? `, ${pct0(top.pct)}% of capacity` : '') };
}

/** The whole catalogue for this data: the fixed values, then one per plant (largest installed first). */
export function catalogue(x) {
  const plants = (x?.rows ?? []).filter((r) => !r.est).slice().sort((a, b) => (b.cap ?? 0) - (a.cap ?? 0) || a.name.localeCompare(b.name))
    .map((row) => ({
      k: 'p_' + row.key, g: 'Plants', label: row.name, c: C[row.fuel] ?? C.sys, fuel: row.fuel, ms: row.cap ? ['mw', 'cf'] : null,
      get: (xx, _r, m) => {
        const p = xx.rows.find((q) => q.key === row.key);
        if (!p) return null;
        const off = Math.abs(p.mw) < 0.05 ? ' · off right now' : '';
        if (m === 'cf' && p.cap) return { v: pct0((Math.max(0, p.mw) / p.cap) * 100), u: '%', s: `${mw(Math.max(0, p.mw))} of ${mw(p.cap)} MW` };
        return { v: mw(p.mw), u: 'MW', s: plantSub(p) + (p.charging ? ' · charging' : off) };
      },
    }));
  return [...BASE, ...plants];
}

export const DEFAULT_KEYS = BASE.map((v) => v.k);

/** One value, ready for a tile: { key, label, region, measure, v, u, s, est, none, txt, c } (v '–' when unavailable). */
export function resolve(spec, cat, x) {
  const [k0, r0, m0] = String(spec || '').split(':');
  const found = cat.find((c) => c.k === k0);
  // a plant's value before the data has loaded: keep the spec as it is, so the layout isn't changed
  if (!found && !x && k0?.startsWith('p_')) {
    return { key: k0, item: null, label: '', region: null, measure: m0 || null, c: C.sys, txt: false, v: '–', u: '', s: '', est: false, none: false, spec: String(spec) };
  }
  const it = found ?? cat[0];
  const r = it.regions ? (it.regions.includes(r0) ? r0 : it.regions[0]) : null;
  const ms = it.ms ?? [null];
  const m = ms.includes(m0) ? m0 : ms[0];
  let d = null;
  try { d = x ? it.get(x, r ?? 'NZ', m) : null; } catch (e) { console.warn('dashboard value failed:', it.k, e); d = null; }
  const label = it.label + (m === 'pct' ? ', share' : m === 'cf' ? ', capacity in use' : '');
  return {
    key: it.k, item: it, label, region: r, measure: m, c: it.c, txt: !!it.txt,
    v: d?.v ?? '–', u: d?.u ?? '', s: d?.s ?? (x ? 'Not available right now' : ''), est: !!(d?.est ?? it.est), none: !!d?.none,
    spec: [it.k, r ?? '', m ?? ''].join(':').replace(/:+$/, ''),
  };
}
