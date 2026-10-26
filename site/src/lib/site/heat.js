// What the time-of-day heat maps show, on both tracker tabs (#lib/generation/GenLower.svelte, the Prices page).
// They follow the range: one row per day from the half-hourly history for anything up to a year (at least the last
// week, so a short range still shows a pattern), one row per month for All from hist/tod.json (each month's average
// half-hour of the day, ingest/tod.py), or per year when the interval is a year.
import { nzOffset, slice, firstAtOrAfter } from '#lib/tracker/series.js';

const windowOf = (S, from, to) => slice(S, firstAtOrAfter(S.t, from), firstAtOrAfter(S.t, to));

const DAY = 864e5;
export const MIN_DAYS = 7;
export const MAX_DAYS = 400;   // longer than this, monthly rows
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

let todCache = null;
/** hist/tod.json, fetched once per page. */
export function loadTod(base = '/data/history') {
  if (!todCache) todCache = fetch(`${base}/tod.json`, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((j) => { if (!j) todCache = null; return j; });
  return todCache;
}

/** The window a heat map covers for a view's [from, to): daily rows (at least MIN_DAYS) or, over MAX_DAYS, monthly. */
export function heatWindow(from, to) {
  if (to - from > MAX_DAYS * DAY) return { kind: 'months', from, to };
  return { kind: 'days', from: Math.min(from, to - MIN_DAYS * DAY), to };
}

/** Load what a heat map needs: { kind: 'days', seg } (half-hourly segment) or { kind: 'months', tod, from, to }. */
export async function heatSource(w, history, live) {
  if (w.kind === 'months') {
    const tod = await loadTod();
    if (tod && tod.months) return { kind: 'months', tod: tod.months, from: w.from, to: w.to };
    w = { kind: 'days', from: w.to - 365 * DAY, to: w.to };   // not built yet: the last year by day
  }
  try {
    if (!history.has('hh', w.from, w.to)) await history.load('hh', w.from, w.to);
    return { kind: 'days', seg: history.merged('hh', live, w.from, w.to), from: w.from, to: w.to };
  } catch {
    return { kind: 'days', seg: windowOf(live, w.from, w.to), from: w.from, to: w.to };   // history not ready
  }
}

// ---------- rows ----------
/** Rows by NZ day from a half-hourly series: val(i) at each point, averaged into its day's half-hour. */
export function dayRows(S, val) {
  const rows = new Map();
  for (let i = 0; i < S.n; i++) {
    const loc = S.t[i] + nzOffset(S.t[i]), d = Math.floor(loc / DAY), col = Math.floor((loc - d * DAY) / 18e5);
    let r = rows.get(d);
    if (!r) {
      const p = new Date(d * DAY);
      rows.set(d, (r = { day: d, t: S.t[i], v: new Array(48).fill(NaN), w: new Array(48).fill(0),
                         lab: `${p.getUTCDate()} ${MON[p.getUTCMonth()]}`, long: `${WD[p.getUTCDay()]} ${p.getUTCDate()} ${MON[p.getUTCMonth()]} ${p.getUTCFullYear()}` }));
    }
    const v = val(i);
    if (v === v) { r.v[col] = r.w[col] ? (r.v[col] * r.w[col] + v * S.h[i]) / (r.w[col] + S.h[i]) : v; r.w[col] += S.h[i]; }
  }
  return [...rows.values()].sort((a, b) => a.day - b.day);
}

const monthStart = (m) => { const [y, mo] = m.split('-').map(Number); const u = Date.UTC(y, mo - 1, 1); return u - nzOffset(u); };
/** Rows by month (or by year: yearly) from hist/tod.json's months in [from, to). cell(month's profile, slot) -> value. */
export function monthRows(months, from, to, cell, yearly = false) {
  const out = [], byYear = new Map();
  for (const m of Object.keys(months).sort()) {
    const t = monthStart(m);
    if (t < from - 31 * DAY || t >= to) continue;
    const v = Array.from({ length: 48 }, (_, k) => cell(months[m], k));
    const [y, mo] = m.split('-').map(Number);
    if (!yearly) { out.push({ day: y * 12 + mo, t, v, lab: mo === 1 ? String(y) : '', long: `${MON[mo - 1]} ${y}`, month: true }); continue; }
    let r = byYear.get(y);
    if (!r) byYear.set(y, (r = { day: y, t, v: new Array(48).fill(NaN), w: new Array(48).fill(0), lab: String(y), long: String(y), month: true }));
    v.forEach((x, k) => { if (x === x) { r.v[k] = r.w[k] ? (r.v[k] * r.w[k] + x) / (r.w[k] + 1) : x; r.w[k] += 1; } });
  }
  return yearly ? [...byYear.values()] : out;
}

/** Six bands of a round step up to hi: { step, edges }. */
export function stepBands(hi) {
  const raw = Math.max(hi, 1) / 6, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw) || raw;
  return { step, edges: [1, 2, 3, 4, 5].map((q) => q * step) };
}

/** Round breakpoints at the view's sixths (prices scaled to the view). */
export function quantileEdges(rows) {
  const all = rows.flatMap((r) => r.v.filter((x) => x === x)).sort((a, b) => a - b);
  if (all.length < 12) return null;
  const nice = (x) => { const a = Math.abs(x), m = a >= 1000 ? 100 : a >= 200 ? 50 : a >= 50 ? 10 : 5; return Math.round(x / m) * m; };
  const e = [1, 2, 3, 4, 5].map((q) => nice(all[Math.floor((q / 6) * (all.length - 1))]));
  for (let i = 1; i < e.length; i++) if (e[i] <= e[i - 1]) e[i] = e[i - 1] + 5;
  return e;
}
