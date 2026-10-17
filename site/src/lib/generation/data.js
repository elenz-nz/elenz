// The Generation tab's lower section: a share of generation over the range with the same dates a year earlier, the
// last 30 days by time of day, and the mix by fuel with capacity factors. Data: the tracker's own model for the
// window (src/lib/tracker/tracker.js passes it through its `view` hook) and the history files (series.js).
// Capacity: capacity.json, written by ingest/capacity.py from facilities/plant_capacity.csv.

import { FUELS } from '#lib/tracker/fuels.js';
import { KEY, aggregate, slice, firstAtOrAfter, nzOffset } from '#lib/tracker/series.js';
import CAPACITY from '#lib/tracker/capacity.json';

const DAY = 864e5;
export const YEAR = 365 * DAY;

// what the share chart and the heat map can show; parts: the fuels summed
export const METRICS = [
  { k: 'ren', label: 'Renewables', title: 'Renewable share', tok: '--g-ren', parts: FUELS.filter((f) => f.ren).map((f) => f.k) },
  { k: 'wind', label: 'Wind', title: 'Wind', tok: '--f-wind', parts: ['wind'] },
  { k: 'sun', label: 'Solar', title: 'Solar', tok: '--f-solar', parts: ['solar', 'roof'], note: 'grid and embedded' },
  { k: 'ibr', label: 'Inverter-based', title: 'Inverter-based', tok: '--g-vre', parts: ['wind', 'solar', 'roof'], note: 'wind and solar, grid and embedded' },
  { k: 'hydro', label: 'Hydro', title: 'Hydro', tok: '--f-hydro', parts: ['hydro'] },
  { k: 'gas', label: 'Gas', title: 'Gas', tok: '--f-gas', parts: ['gas'] },
  { k: 'coal', label: 'Coal/gas', title: 'Coal/gas Rankine', tok: '--f-coal', parts: ['coal'] },
];
export const METRIC = Object.fromEntries(METRICS.map((m) => [m.k, m]));

// output only: battery charging and HVDC never count towards totals or shares
const GEN = FUELS.filter((f) => f.k !== 'hvdc').map((f) => f.k);
const isls = (region) => (region === 'NZ' ? ['NI', 'SI'] : [region]);

/** MW of one fuel in a region at point i (battery: discharge only). Daily history carries each day's battery
 *  discharge (batt_d), since a day's net battery output is close to zero; the live days after it don't, so they fall
 *  back to the net figure. */
function mwAt(S, k, region, i) {
  let v = 0;
  for (const isl of isls(region)) {
    const I = S[isl];
    if (k === 'batt' && I.batt_d && I.batt_d[i] > 0) { v += I.batt_d[i]; continue; }
    const a = I[k];
    if (a) v += k === 'batt' ? Math.max(0, a[i]) : a[i];
  }
  return Math.max(0, v);
}

/** Per point: total generation and the metric's part of it, in MW. */
export function shares(S, region, mk) {
  const parts = METRIC[mk].parts, n = S.n;
  const part = new Float64Array(n), tot = new Float64Array(n), pct = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let a = 0, b = 0;
    for (const k of GEN) { const v = mwAt(S, k, region, i); b += v; if (parts.includes(k)) a += v; }
    part[i] = a; tot[i] = b; pct[i] = b > 0 ? (100 * a) / b : NaN;
  }
  return { part, tot, pct };
}

const INT_KEY = { '30m': KEY.hh, '1d': KEY.day, '1w': KEY.week, '1mo': KEY.month, '1yr': KEY.year };
/** A window of a segment at the chart's interval. */
export const atInterval = (S, int) => (INT_KEY[int] ? aggregate(S, INT_KEY[int]) : S);

/** Points of a segment starting in [from, to). */
export const windowOf = (S, from, to) => slice(S, firstAtOrAfter(S.t, from), firstAtOrAfter(S.t, to));

/** The year-earlier series mapped onto this window's points: at each point, the value a year (365 days) before,
 *  taken from the point of the earlier segment covering that time. */
export function alignYearAgo(t, prev, values) {
  const out = new Float64Array(t.length).fill(NaN);
  if (!prev || !prev.n) return out;
  for (let i = 0; i < t.length; i++) {
    const x = t[i] - YEAR;
    let j = firstAtOrAfter(prev.t, x + 1) - 1;   // the last point starting at or before x
    if (j < 0) continue;
    if (x >= prev.t[j] + prev.h[j] * 36e5) continue;   // past its end: no data then
    out[i] = values[j];
  }
  return out;
}

/** Energy-weighted share over a segment: the metric's MWh over all generation's. */
export function shareOver(S, region, mk) {
  if (!S || !S.n) return NaN;
  const { part, tot } = shares(S, region, mk);
  let a = 0, b = 0;
  for (let i = 0; i < S.n; i++) { a += part[i] * S.h[i]; b += tot[i] * S.h[i]; }
  return b > 0 ? (100 * a) / b : NaN;
}

// ---------- heat map: the last 30 days by half-hour ----------
// renewable share in bands (brown leans on thermal plant, green is near all renewable); a fuel's MW in its own colour
export const REN_BANDS = [80, 88, 93, 96, 98];
export const REN_LEGEND = ['Under 80%', '80–88%', '88–93%', '93–96%', '96–98%', '98% and over'];

/** One row per NZ day, 48 half-hour cells: the metric's share (ren) or MW (a fuel). */
export function heatRows(S, region, mk) {
  const { part, pct } = shares(S, region, mk);
  const val = mk === 'ren' ? pct : part;
  const rows = new Map();
  for (let i = 0; i < S.n; i++) {
    const loc = S.t[i] + nzOffset(S.t[i]), d = Math.floor(loc / DAY), col = Math.floor((loc - d * DAY) / 18e5);
    let r = rows.get(d);
    if (!r) rows.set(d, (r = { day: d, t: S.t[i], v: new Array(48).fill(NaN), w: new Array(48).fill(0) }));
    const v = val[i];
    if (v === v) { r.v[col] = r.w[col] ? (r.v[col] * r.w[col] + v * S.h[i]) / (r.w[col] + S.h[i]) : v; r.w[col] += S.h[i]; }
  }
  return [...rows.values()].sort((a, b) => a.day - b.day);
}

/** MW bands for a fuel: six equal steps of a round number up to the window's highest half-hour. */
export function mwBands(rows) {
  let hi = 0;
  for (const r of rows) for (const v of r.v) if (v === v && v > hi) hi = v;
  const raw = Math.max(hi, 1) / 6, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw) || raw;
  return { step, edges: [1, 2, 3, 4, 5].map((q) => q * step) };
}

// ---------- capacity ----------
const steps = (isl, k) => (CAPACITY.steps[isl] || {})[k] || [];

/** MW-hours of capacity a fuel had over [from, to) in a region: installed MW integrated over time. Embedded solar
 *  uses the distributed generation registry by month (the latest month carried on). */
export function capacityMWh(k, region, from, to) {
  let out = 0;
  for (const isl of isls(region)) {
    if (k === 'roof') {
      const R = CAPACITY.roof, vals = R[isl] || [];
      if (!vals.length) continue;
      const start = R.months.map((m) => { const [y, mo] = m.split('-').map(Number); const u = Date.UTC(y, mo - 1, 1); return u - nzOffset(u); });
      for (let j = 0; j < vals.length; j++) {
        const a = Math.max(from, start[j]), b = Math.min(to, j + 1 < vals.length ? start[j + 1] : Infinity);
        if (b > a) out += (vals[j] * (b - a)) / 36e5;
      }
      continue;
    }
    const s = steps(isl, k);
    for (let j = 0; j < s.length; j++) {
      const a = Math.max(from, s[j][0]), b = Math.min(to, j + 1 < s.length ? s[j + 1][0] : Infinity);
      if (b > a) out += (s[j][1] * (b - a)) / 36e5;
    }
  }
  return out;
}

// ---------- mix table ----------
/** Per fuel over a window: energy (MWh), share, average and peak MW, capacity factor, and change against the same
 *  dates a year earlier. fine: the points are half-hours or shorter (otherwise peaks aren't meaningful). */
export function mixRows(S, region, from, to, prev, fine) {
  const hours = (to - from) / 36e5;
  const energy = (seg, k) => { let e = 0; if (seg) for (let i = 0; i < seg.n; i++) e += mwAt(seg, k, region, i) * seg.h[i]; return e; };
  const rows = [];
  let tot = 0, totPrev = 0, ren = 0, renPrev = 0, peakTot = 0;
  if (fine) for (let i = 0; i < S.n; i++) { let v = 0; for (const k of GEN) v += mwAt(S, k, region, i); peakTot = Math.max(peakTot, v); }
  for (const f of FUELS) {
    if (f.k === 'hvdc') continue;
    const e = energy(S, f.k), ep = prev ? energy(prev, f.k) : NaN;
    let peak = 0;
    if (fine) for (let i = 0; i < S.n; i++) peak = Math.max(peak, mwAt(S, f.k, region, i));
    const cap = capacityMWh(f.k, region, from, to);
    tot += e; if (f.ren) ren += e;
    if (prev) { totPrev += ep; if (f.ren) renPrev += ep; }
    if (e < 0.5 && !(ep > 0.5)) continue;   // nothing from this fuel in either window
    rows.push({ f, e, ep, share: 0, avg: e / hours, peak: fine ? peak : NaN, cf: cap > 0 ? e / cap : NaN });
  }
  for (const r of rows) r.share = tot > 0 ? r.e / tot : 0;
  return {
    rows, tot, totPrev: prev ? totPrev : NaN, avg: tot / hours, peak: fine ? peakTot : NaN,
    ren, renShare: tot > 0 ? ren / tot : NaN, renSharePrev: prev && totPrev > 0 ? renPrev / totPrev : NaN,
  };
}
