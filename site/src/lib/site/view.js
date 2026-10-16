// The tracker's shared view: region, range, interval and end date, kept in the address
// (e.g. /tracker/prices?region=NI&range=7d&int=30m&end=2024-08-14), so the Generation and Prices tabs show the same
// window and any view can be linked or bookmarked. The tab links carry the address across (TrackerTabs.svelte).
//
// Region, range and the interval are also remembered in localStorage ('elenz-view') for a plain visit; the date never
// is, so coming back later opens on the latest data. The interval is only shared once the viewer has picked one: until
// then each tab uses its own default for the range (Generation's 1-year view defaults to weeks, Prices to days).
// The address is replaced, not pushed, so Back leaves the page rather than stepping through every setting.

import { replaceState } from '$app/navigation';
import { KEY, nzOffset } from '#lib/tracker/series.js';

const REGIONS = ['NZ', 'NI', 'SI'];
const RANGES = ['1d', '3d', '7d', '30d', '1y', 'all'];
const INTS = ['5m', '30m', '1d', '1w', '1mo'];
const OLD_RANGE = { 288: '1d', 864: '3d', 2016: '7d' };
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// ---------- NZ days ----------
const DAY = 864e5;
/** Local midnight at or before t. */
export const midnightOf = (t) => { const k = KEY.day(t) * DAY; return k - nzOffset(k - nzOffset(k)); };
/** Whole days later or earlier (a day is 23-25 hours at the clock changes). */
export const addDays = (m, k) => midnightOf(m + k * DAY + 3 * 36e5);
/** 'YYYY-MM-DD' of the NZ day containing t. */
export function ymd(t) {
  const d = new Date(t + nzOffset(t));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
/** The end of a window that shows up to and including the NZ day 'YYYY-MM-DD': the midnight after it. */
export function endOfDay(s) {
  const m = DATE.exec(s || '');
  if (!m) return null;
  return addDays(midnightOf(Date.UTC(+m[1], +m[2] - 1, +m[3], 12) - 12 * 36e5), 1);
}

// ---------- reading and writing ----------
/** The view to open with: the address first, then what this browser remembers. end is a time (ms) or null. */
export function readView() {
  const v = { region: 'NZ', range: '1d', int: null, end: null };
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem('elenz-view') || 'null'); } catch { /* storage blocked */ }
  if (stored) {
    if (REGIONS.includes(stored.region)) v.region = stored.region;
    const r = OLD_RANGE[stored.range] || stored.range;
    if (RANGES.includes(r)) v.range = r;
    if (stored.intPicked && INTS.includes(stored.int)) v.int = stored.int;
  }
  const q = typeof location === 'undefined' ? null : new URLSearchParams(location.search);
  if (q) {
    if (REGIONS.includes(q.get('region'))) v.region = q.get('region');
    if (RANGES.includes(q.get('range'))) { v.range = q.get('range'); v.int = null; }
    if (INTS.includes(q.get('int'))) v.int = q.get('int');
    v.end = endOfDay(q.get('end'));
  }
  return v;
}

/** Records the view: the address always, and region, range and interval in this browser. extra: other fields the
 *  Generation tab keeps in 'elenz-view' (grouping, MW or %). int: null while the tab is on its own default. */
export function writeView({ region, range, int, end }, extra = {}) {
  try {
    const old = JSON.parse(localStorage.getItem('elenz-view') || 'null') || {};
    const keep = { ...old, ...extra, region, range };
    if (int) { keep.int = int; keep.intPicked = true; } else { delete keep.intPicked; }
    localStorage.setItem('elenz-view', JSON.stringify(keep));
  } catch { /* storage blocked: the address still has it */ }
  if (typeof location === 'undefined') return;
  const q = new URLSearchParams();
  if (region !== 'NZ') q.set('region', region);
  if (range !== '1d') q.set('range', range);
  if (int) q.set('int', int);
  if (end != null) q.set('end', ymd(end - 1));
  const url = location.pathname + (q.size ? '?' + q : '') + location.hash;
  if (url === location.pathname + location.search + location.hash) return;
  try { replaceState(url, {}); } catch { history.replaceState(history.state, '', url); }   // before the router starts
}
