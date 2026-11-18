// A plant page's history: its plant's months from /data/history/plants.json (ingest/plant_history.py) turned into
// years, the last 24 months and the latest 12 months, each with its capacity factor from the page's capacity timeline
// (steps, from plant_capacity.csv via ingest/plant_pages.py). Pure, so tests/plants.test.js can run it.
//
// Energy is MWh in the file and GWh here. A capacity factor is the energy as a share of what the installed MW could
// make running every hour of the same months; only months the plant has data for count (its history starts with its
// first month of output, as its capacity does in plant_capacity.csv).

import { nzOffset } from '#lib/tracker/series.js';

export const HISTORY_URL = '/data/history/plants.json';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM' → 'October 2026' (prose) or 'Oct 2026' (narrow labels). */
export const monthName = (m, short = false) => `${(short ? SHORT : MONTHS)[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;

/** NZ local midnight starting month 'YYYY-MM', in ms. */
export function monthStart(m) {
  const u = Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1, 1);
  return u - nzOffset(u - nzOffset(u));
}
const nextMonth = (m) => { const y = +m.slice(0, 4), k = +m.slice(5, 7); return k === 12 ? `${y + 1}-01` : `${y}-${String(k + 1).padStart(2, '0')}`; };

/** Hours in month m by the NZ clock (743 or 745 at the clock changes), or up to `end` for the running month. */
export function hoursIn(m, end) {
  const a = monthStart(m), b = monthStart(nextMonth(m));
  return (Math.min(b, end ?? b) - a) / 36e5;
}

/** Installed MW in month m (its first day) from the page's steps ({from, to, mw}; from/to 'YYYY-MM-DD' or null). */
export function capAt(steps, m) {
  const d = `${m}-01`;
  const s = (steps || []).find((x) => (!x.from || x.from <= d) && (!x.to || x.to >= d));
  return s ? s.mw : null;
}

/**
 * One plant's months from the file: [{m, gwh, chg (batteries), src: 'metered'|'dispatch', hours, cap, whole}], oldest
 * first, or null when the file doesn't have the plant. `whole`: the month is over by the history's end. A month inside
 * the plant's span with no figure (a month file without the plant: it had no output) counts as zero.
 */
export function plantMonths(file, plant, steps) {
  const row = file?.plants?.[plant];
  if (!row) return null;
  const end = file.end ?? null, last = file.months.length - 1;
  return row.g.map((v, k) => {
    const i = row.i + k, m = file.months[i];
    const whole = i < last || (end != null && end >= monthStart(nextMonth(m)));
    return {
      m, gwh: (v ?? 0) / 1000, chg: row.c ? (row.c[k] ?? 0) / 1000 : null,
      src: file.src[i] === 'm' ? 'metered' : 'dispatch',
      hours: hoursIn(m, i === last ? end : null), cap: capAt(steps, m), whole
    };
  });
}

const cfOf = (ms) => {
  const e = ms.reduce((s, x) => s + (x.cap ? x.gwh ?? 0 : 0), 0), pot = ms.reduce((s, x) => s + (x.cap ? x.cap * x.hours : 0), 0) / 1000;
  return pot > 0 ? e / pot : null;
};

/**
 * Calendar years: [{y, gwh, cf, part, months}]. A part year has fewer than 12 whole months of the plant's data: the
 * history's first year (from August 1997), the running year, and a plant's first and last years.
 */
export function years(months) {
  const by = new Map();
  for (const x of months || []) {
    const y = +x.m.slice(0, 4);
    if (!by.has(y)) by.set(y, []);
    by.get(y).push(x);
  }
  return [...by].map(([y, ms]) => ({
    y, gwh: ms.reduce((s, x) => s + (x.gwh ?? 0), 0), cf: cfOf(ms),
    part: ms.filter((x) => x.whole).length < 12, months: ms.length,
    chg: ms.some((x) => x.chg != null) ? ms.reduce((s, x) => s + (x.chg ?? 0), 0) : null
  }));
}

/** The last n whole months, each with its capacity factor. */
export function lastMonths(months, n = 24) {
  return (months || []).filter((x) => x.whole).slice(-n).map((x) => ({ ...x, cf: cfOf([x]) }));
}

/** The latest 12 whole months together: {from, to, gwh, cf}, or null with fewer than 12. */
export function latestYear(months) {
  const ms = lastMonths(months, 12);
  if (ms.length < 12) return null;
  return { from: ms[0].m, to: ms[11].m, gwh: ms.reduce((s, x) => s + (x.gwh ?? 0), 0), cf: cfOf(ms) };
}

/** The whole calendar year with the most energy: {y, gwh}, or null. */
export function bestYear(ys) {
  return (ys || []).filter((y) => !y.part).reduce((b, y) => (!b || y.gwh > b.gwh ? y : b), null);
}

/** Where installed MW changed inside the span shown: [{m: 'YYYY-MM', mw}] (a step starting on a month's first day). */
export function capChanges(steps, first, last) {
  return (steps || []).filter((s) => s.from && s.from.slice(0, 7) > first && s.from.slice(0, 7) <= last)
    .map((s) => ({ m: s.from.slice(0, 7), mw: s.mw }));
}

/** Energy in GWh as the site writes it: one decimal below 10, whole above, thousands with commas. */
export function fmtGwh(v) {
  if (v == null) return '';
  if (v === 0) return '0';
  const a = Math.abs(v);
  return a < 9.95 ? v.toFixed(1) : Math.round(v).toLocaleString('en-NZ');
}
/** A share as a percentage, whole (dp 0) or to one decimal. */
export const fmtPct = (v, dp = 0) => (v == null ? '' : `${(v * 100).toFixed(dp)}%`);
/** MW: one decimal below 10 MW, whole from 10 MW (style guide). */
export function fmtMw(v) {
  if (v == null) return '';
  const a = Math.abs(v), s = a < 9.95 ? (Math.round(a * 10) / 10).toString() : Math.round(a).toLocaleString('en-NZ');
  return (v < 0 && s !== '0' ? '−' : '') + s;
}
