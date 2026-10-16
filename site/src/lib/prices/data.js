// Data for the Prices page (/tracker/prices): node prices, the island spread, HVDC, price captured by fuel, the
// daily spread of prices for long ranges, and the time-of-day heat map. Built on the tracker's series (series.js):
//   live   tracker.json, 5-minute, the last 7 days (nodes: Haywards and Benmore always; the other nodes from the
//          real-time feed's bus rows, so a gap where the week was filled from the daily files)
//   hh     half-hourly history months (final prices), for 30 days and the heat map
//   day    daily history: each day's mean price plus its spread (p10, p90, pmin, pmax, n500, n1000) and revenue by
//          fuel (rv_<fuel>, built by ingest/history.py)

import { FUELS } from '#lib/tracker/fuels.js';
import { KEY, nzOffset, aggregate, slice, firstAtOrAfter } from '#lib/tracker/series.js';

// north to south; tok: the line colour. HAY and BEN are the island reference nodes (NI.price, SI.price).
export const NODES = [
  { k: 'OTA', node: 'OTA2201', name: 'Ōtāhuhu', place: 'Auckland', isl: 'NI', tok: '--o1' },
  { k: 'WKM', node: 'WKM2201', name: 'Whakamaru', place: 'Waikato River', isl: 'NI', tok: '--o5' },
  { k: 'HAY', node: 'HAY2201', name: 'Haywards', place: 'Wellington', isl: 'NI', tok: '--p-ni', ref: true },
  { k: 'BEN', node: 'BEN2201', name: 'Benmore', place: 'Waitaki', isl: 'SI', tok: '--p-si', ref: true },
  { k: 'ISL', node: 'ISL2201', name: 'Islington', place: 'Christchurch', isl: 'SI', tok: '--o2' },
  { k: 'INV', node: 'INV2201', name: 'Invercargill', place: 'Southland', isl: 'SI', tok: '--o6' },
];
export const NODE = Object.fromEntries(NODES.map((n) => [n.k, n]));

/** A node's price series in a segment (NaN where missing), or null if the segment has none. */
export function priceOf(S, k) {
  if (k === 'HAY') return S.NI.price;
  if (k === 'BEN') return S.SI.price;
  const a = S.nodes && S.nodes[k];
  return a && a.some((v) => v === v) ? a : null;
}

// Islands priced apart: Haywards and Benmore more than $10 and more than 10% apart (of the lower, when positive).
export const separated = (a, b) => { const d = Math.abs(a - b); return d > 10 && d > 0.1 * Math.max(Math.min(a, b), 0); };

// ---------- revenue by fuel (price captured) ----------
// Each fuel's output × its island's reference price, like Open Electricity's volume-weighted price. Embedded solar
// isn't paid the spot price; batteries count discharge only.
export const CAP_FUELS = FUELS.filter((f) => f.k !== 'roof' && f.k !== 'hvdc');

/** Adds rv_<fuel> (MW × $/MWh) and batt_d (battery discharge MW) per point wherever a segment lacks them, for points
 *  [0, upto): exact for 5-minute and half-hourly data; from daily means for daily history built before BUILD 5.
 *  force: recompute every point (half-hourly history merged with the live tail). */
export function addRevenue(S, upto = S.n, force = false) {
  for (const isl of ['NI', 'SI']) {
    const I = S[isl], p = I.price;
    const missing = (a) => force || !a || !a.subarray(0, upto).some((v) => v !== 0);
    if (missing(I.batt_d)) { I.batt_d = I.batt_d || new Float64Array(S.n); for (let i = 0; i < upto; i++) I.batt_d[i] = Math.max(I.batt[i], 0); }
    for (const f of CAP_FUELS) {
      const key = 'rv_' + f.k, g = f.k === 'batt' ? I.batt_d : I[f.k];
      if (!g || !missing(I[key])) continue;
      const o = I[key] || (I[key] = new Float64Array(S.n));
      for (let i = 0; i < upto; i++) o[i] = g[i] * p[i];
    }
  }
  return S;
}

/** Price captured by each fuel over points [a, b) of a segment, for a region: [{ f, mwh, price }], plus the
 *  generation-weighted average of all of them. */
export function captured(S, region, a = 0, b = S.n) {
  const isls = region === 'NZ' ? ['NI', 'SI'] : [region];
  const rows = [];
  let allE = 0, allR = 0;
  for (const f of CAP_FUELS) {
    let e = 0, r = 0;
    for (const isl of isls) {
      const I = S[isl], g = f.k === 'batt' ? I.batt_d : I[f.k], rv = I['rv_' + f.k];
      if (!g || !rv) continue;
      for (let i = a; i < b; i++) { e += g[i] * S.h[i]; r += rv[i] * S.h[i]; }
    }
    if (e > 1) rows.push({ f, mwh: e, price: r / e });
    allE += e; allR += r;
  }
  return { rows, avg: allE > 0 ? allR / allE : NaN, mwh: allE };
}

// ---------- ranges ----------
export const RANGES = {
  '1d': { mode: 'time', src: 'live', days: 1, ints: ['5m', '30m'], label: '24 hours' },
  '3d': { mode: 'time', src: 'live', days: 3, ints: ['5m', '30m'], label: '3 days' },
  '7d': { mode: 'time', src: 'live', days: 7, ints: ['5m', '30m'], label: '7 days' },
  '30d': { mode: 'time', src: 'hh', days: 30, ints: ['30m', '1d'], label: '30 days' },
  '1y': { mode: 'long', src: 'day', days: 365, ints: ['1d', '1w', '1mo'], label: '12 months' },
  'all': { mode: 'long', src: 'day', days: null, ints: ['1d', '1w', '1mo'], def: '1w', label: 'All history' },
};
export const INT_LABEL = { '5m': '5m', '30m': '30m', '1d': 'Day', '1w': 'Week', '1mo': 'Month' };
const INT_KEY = { '30m': KEY.hh, '1d': KEY.day, '1w': KEY.week, '1mo': KEY.month };

/** The last `days` days of a segment (all of it when days is null). */
export function lastDays(S, days) {
  if (!days) return S;
  const a = firstAtOrAfter(S.t, S.t[S.n - 1] - days * 864e5 + 1);
  return slice(S, a, S.n);
}

/** A time-mode segment at the chosen interval. */
export const atInterval = (S, int) => (int === '5m' ? S : aggregate(S, INT_KEY[int]));

// ---------- daily spread for long ranges ----------
const quant = (sorted, q) => {
  if (!sorted.length) return NaN;
  const x = (sorted.length - 1) * q, i = Math.floor(x);
  return sorted[i] + (sorted[Math.min(i + 1, sorted.length - 1)] - sorted[i]) * (x - i);
};

/** Each day's price spread from half-hourly prices (for the live days after the daily history ends). */
function spreadByDay(hh) {
  const out = { NI: new Map(), SI: new Map() };
  for (const isl of ['NI', 'SI']) {
    const p = hh[isl].price, days = new Map();
    for (let i = 0; i < hh.n; i++) { const d = KEY.day(hh.t[i]); (days.get(d) || days.set(d, []).get(d)).push(p[i]); }
    for (const [d, v] of days) {
      const s = [...v].sort((a, b) => a - b);
      out[isl].set(d, { p10: quant(s, 0.1), p90: quant(s, 0.9), pmin: s[0], pmax: s[s.length - 1],
        n500: v.filter((x) => x > 500).length, n1000: v.filter((x) => x > 1000).length });
    }
  }
  return out;
}

/** Daily history merged with the live tail -> the daily segment with spreads and revenue filled in for every day. */
export function completeDaily(S, histEnd, live) {
  const tail = firstAtOrAfter(S.t, histEnd + 1);
  addRevenue(S, tail);   // daily history built before BUILD 5 had no revenue: estimate from daily means
  if (tail < S.n) {
    const sp = spreadByDay(aggregate(slice(live, firstAtOrAfter(live.t, S.t[tail]), live.n), KEY.hh));
    for (const isl of ['NI', 'SI']) {
      for (const k of ['p10', 'p90', 'pmin', 'pmax', 'n500', 'n1000']) if (!S[isl][k]) S[isl][k] = new Float64Array(S.n);
      for (let i = tail; i < S.n; i++) {
        const v = sp[isl].get(KEY.day(S.t[i]));
        if (v) for (const k in v) S[isl][k][i] = v[k];
      }
    }
  }
  return S;
}

/** Long-range periods (day, week or month) from the daily segment: mean price, middle-80% band (the mean of each
 *  day's p10 and p90), low and high, half-hours over $500 and $1,000, spread and HVDC. */
export function periods(S, int) {
  const key = INT_KEY[int], groups = [];
  let a = 0;
  for (let i = 1; i <= S.n; i++) if (i === S.n || key(S.t[i]) !== key(S.t[a])) { groups.push([a, i]); a = i; }
  const n = groups.length, mk = () => new Float64Array(n);
  const P = { n, t: mk(), h: mk(), hvdc: mk(), spread: mk(), sepDays: mk(), NI: {}, SI: {}, nodes: {} };
  for (const isl of ['NI', 'SI']) for (const k of ['price', 'p10', 'p90', 'pmin', 'pmax', 'n500', 'n1000']) P[isl][k] = mk();
  const nodeKeys = Object.keys(S.nodes || {});
  for (const k of nodeKeys) P.nodes[k] = mk();
  groups.forEach(([a, b], j) => {
    let h = 0;
    for (let i = a; i < b; i++) h += S.h[i];
    P.t[j] = S.t[a]; P.h[j] = h;
    const wavg = (arr) => { let s = 0, w = 0; for (let i = a; i < b; i++) if (arr[i] === arr[i]) { s += arr[i] * S.h[i]; w += S.h[i]; } return w ? s / w : NaN; };
    for (const isl of ['NI', 'SI']) {
      const I = S[isl], O = P[isl];
      O.price[j] = wavg(I.price); O.p10[j] = wavg(I.p10); O.p90[j] = wavg(I.p90);
      let lo = Infinity, hi = -Infinity, c5 = 0, c1 = 0;
      for (let i = a; i < b; i++) { lo = Math.min(lo, I.pmin[i]); hi = Math.max(hi, I.pmax[i]); c5 += I.n500[i]; c1 += I.n1000[i]; }
      O.pmin[j] = lo; O.pmax[j] = hi; O.n500[j] = c5; O.n1000[j] = c1;
    }
    P.spread[j] = P.NI.price[j] - P.SI.price[j];
    P.hvdc[j] = wavg(S.hvdcN);
    for (const k of nodeKeys) P.nodes[k][j] = wavg(S.nodes[k]);
  });
  return P;
}

// ---------- the time-of-day heat map ----------
/** Half-hourly prices at a node over a segment, by NZ day (rows, oldest first) and half-hour of the day (48 columns). */
export function heat(S, k) {
  const p = priceOf(S, k);
  const rows = new Map();
  if (!p) return [];
  for (let i = 0; i < S.n; i++) {
    const loc = S.t[i] + nzOffset(S.t[i]), d = Math.floor(loc / 864e5), col = Math.floor((loc - d * 864e5) / 18e5);
    let r = rows.get(d);
    if (!r) rows.set(d, (r = { day: d, t: S.t[i], v: new Array(48).fill(NaN), w: new Array(48).fill(0) }));
    if (p[i] === p[i]) { r.v[col] = r.w[col] ? (r.v[col] * r.w[col] + p[i] * S.h[i]) / (r.w[col] + S.h[i]) : p[i]; r.w[col] += S.h[i]; }
  }
  return [...rows.values()].sort((a, b) => a.day - b.day);
}

// ---------- price scales ----------
// Spike-proof: linear to about $100, logarithmic above (a symmetric log, so negative prices work too).
const C = 100;
const slog = (v) => Math.sign(v) * Math.log10(1 + Math.abs(v) / C);
export const CAP = 600;
export function priceScale(kind, lo, hi) {
  lo = Math.min(0, lo); hi = Math.max(hi, 10);
  if (kind === 'capped') {
    const top = Math.min(hi, CAP);
    return { f: (v) => Math.min(v, CAP), lo, hi: top, ticks: niceTicks(lo, top), capped: hi > CAP };
  }
  if (kind === 'linear') return { f: (v) => v, lo, hi, ticks: niceTicks(lo, hi) };
  const all = [-1000, -100, 0, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  const t = all.filter((x) => x >= lo - 1e-9 && x <= hi * 1.15);
  return { f: slog, lo: slog(lo), hi: slog(hi), ticks: t.length >= 2 ? t : niceTicks(lo, hi), log: true };
}

export function niceTicks(lo, hi, n = 5) {
  const span = hi - lo || 1, raw = span / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}

// ---------- formatting ----------
export function money(v) {
  if (v == null || v !== v) return '–';
  const a = Math.abs(v), s = v < 0 ? '−' : '';
  if (a < 10) return `${s}$${a.toFixed(2)}`;
  return `${s}$${Math.round(a).toLocaleString('en-NZ')}`;
}
export const signedMoney = (v) => (v == null || v !== v ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + money(Math.abs(v)));

const MON = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
const WD = 'Sun Mon Tue Wed Thu Fri Sat'.split(' ');
export function nzParts(t) {
  const d = new Date(t + nzOffset(t));
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), wd: d.getUTCDay(), h: d.getUTCHours(), mi: d.getUTCMinutes() };
}
export const clock = (t) => { const p = nzParts(t); return `${p.h % 12 || 12}:${String(p.mi).padStart(2, '0')} ${p.h < 12 ? 'am' : 'pm'}`; };
export const dayLabel = (t) => { const p = nzParts(t); return `${WD[p.wd]} ${p.d} ${MON[p.mo]}`; };
export const dateLabel = (t) => { const p = nzParts(t); return `${p.d} ${MON[p.mo]} ${p.y}`; };
export const monthLabel = (t) => { const p = nzParts(t); return `${MON[p.mo]} ${p.y}`; };
export const shortDate = (t) => { const p = nzParts(t); return `${p.d} ${MON[p.mo]}`; };

/** Time-axis ticks for a span: [{ t, label }]. */
export function timeTicks(t0, t1) {
  const span = t1 - t0, out = [];
  if (span <= 40 * 864e5) {
    // NZ's offsets are whole hours, so stepping by the hour finds every local hour mark
    const every = span <= 1.6 * 864e5 ? 3 : span <= 4 * 864e5 ? 12 : 24;
    for (let t = Math.ceil(t0 / 36e5) * 36e5; t <= t1; t += 36e5) {
      const p = nzParts(t);
      if (p.h % every || (span > 9 * 864e5 && p.wd !== 1)) continue;
      const day = `${WD[p.wd]} ${p.d}` + (span > 9 * 864e5 ? ` ${MON[p.mo]}` : '');
      out.push({ t, label: p.h === 0 ? day : `${String(p.h).padStart(2, '0')}:00`, minor: p.h !== 0 && every > 3 });
    }
    return out;
  }
  const p0 = nzParts(t0), months = span <= 400 * 864e5 ? 1 : span <= 1200 * 864e5 ? 3 : 12;
  for (let y = p0.y, m = p0.mo; ; m++) {
    if (m > 11) { m = 0; y++; }
    const t = Date.UTC(y, m, 1) - nzOffset(Date.UTC(y, m, 1));
    if (t > t1) break;
    if (t < t0 || m % months) continue;
    out.push({ t, label: months === 12 || m === 0 ? (months === 12 ? String(y) : `${MON[m]} ${y}`) : MON[m] });
  }
  return out;
}
