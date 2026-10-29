// The tracker's address: reading and writing the query that describes a view, and the words for it.
// Pure (no browser or SvelteKit imports), so the Worker (link previews, worker/index.js) and the tests
// (site/tests/viewurl.test.js) use the same code as the pages. The browser side is #lib/site/view.js.
//
// Shared by both tabs:  region  NZ (default) | NI | SI
//                       range   1d (default) | 3d | 7d | 30d | 1y | all
//                       int     5m | 30m | 1d | 1w | 1mo | 1yr   (only once the viewer has picked one)
//                       end     YYYY-MM-DD: the window ends with this NZ day (absent: the latest data)
//                       t       YYYY-MM-DDTHH:MM (NZ time) or YYYY-MM-DD: the point the summary opens on
// Generation tab:       by      the grouping (absent: detailed)
//                       unit    pct (absent: MW)
//                       chart   lines (absent: stacked): each source as its own line, to compare them
//                       price   on (absent: off): the island prices drawn over the generation chart, on a right axis
//                       fold    the charts under it folded to one line, e.g. price,ren (absent: FOLD_DEFAULT,
//                               all of them; none: all open)
//                       group, fuel, plant   the drill-down (plant and set names as slugs, see slug())
//                       zoom    1h | 3h | 6h | 12h: the last hours of the window (the menu on 1D), or
//                               YYYY-MM-DDTHH:MM~YYYY-MM-DDTHH:MM: a span dragged on the chart (NZ time, end exclusive)
// Prices tab:           scale   capped | linear (absent: spike-proof)
//                       hide    nodes hidden from the price chart, e.g. OTA,ISL
//                       band    BEN (absent: HAY), the island whose price range the long view shows

import { nzOffset, KEY } from '#lib/tracker/series.js';
import { FUELS } from '#lib/tracker/fuels.js';
import PLANTS from '#lib/tracker/plants.json' with { type: 'json' };

/** The site's public address, for links people copy and for link previews. */
export const SITE_URL = 'https://elenz.co.nz';

export const REGIONS = ['NZ', 'NI', 'SI'];
export const RANGES = ['1d', '3d', '7d', '30d', '1y', 'all'];
export const INTS = ['5m', '30m', '1d', '1w', '1mo', '1yr'];
export const GROUPINGS = ['detailed', 'simple', 'site', 'scheme', 'owner', 'flex', 'rf', 'vre'];
export const SCALES = ['spike', 'capped', 'linear'];
export const SHARED = ['region', 'range', 'int', 'end', 't'];
const ORDER = [...SHARED, 'by', 'unit', 'chart', 'price', 'fold', 'group', 'fuel', 'plant', 'zoom', 'scale', 'hide', 'band'];
/** The spans the 1D menu offers, in hours. */
export const SPANS = [1, 3, 6, 12];
// the Generation tab's charts under the generation chart that fold to one line, in page order; all start folded
// (owner's call, 29 Oct 2026: price and renewable share are also on $ Price and the share card, and the page is
// cleaner, on portrait phones above all), so a link needs `fold` only when some are open
export const FOLDABLE = ['price', 'ren', 'demand', 'hvdc', 'co2'];
export const FOLD_DEFAULT = FOLDABLE;
/** A fold list in page order without repeats (anything else dropped). */
export const foldList = (xs) => FOLDABLE.filter((k) => xs.includes(k));
const sameFold = (a, b) => a.length === b.length && a.every((k, i) => k === b[i]);
export const OLD_RANGE = { 288: '1d', 864: '3d', 2016: '7d' };
const FUEL_KEYS = FUELS.map((f) => f.k);
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NODE = /^[A-Z]{3}$/;   // the Prices tab's node keys (OTA, HAY ...; #lib/prices/data.js)

/** A name as it appears in an address: "Branch River (Arnold)" → "branch-river-arnold", "Manapōuri" → "manapouri". */
export const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** Old plant slugs that should still open their plant after a rename: { 'old-slug': 'new-slug' }. */
export const PLANT_ALIASES = { 'takapo-a': 'tekapo-a', 'takapo-b': 'tekapo-b' };   // renamed in BUILD 8

// ---------- NZ days and times ----------
const DAY = 864e5;
/** Local midnight at or before t. */
export const midnightOf = (t) => { const k = KEY.day(t) * DAY; return k - nzOffset(k - nzOffset(k)); };
/** Whole days later or earlier (a day is 23-25 hours at the clock changes). */
export const addDays = (m, k) => midnightOf(m + k * DAY + 3 * 36e5);
const pad = (n) => String(n).padStart(2, '0');
const parts = (t) => { const d = new Date(t + nzOffset(t)); return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() }; };
/** 'YYYY-MM-DD' of the NZ day containing t. */
export function ymd(t) { const p = parts(t); return `${p.y}-${pad(p.mo)}-${pad(p.d)}`; }
/** The end of a window that shows up to and including the NZ day 'YYYY-MM-DD': the midnight after it. */
export function endOfDay(s) {
  const m = DATE.exec(s || '');
  if (!m || !realDay(m)) return null;
  return addDays(midnightOf(Date.UTC(+m[1], +m[2] - 1, +m[3], 12) - 12 * 36e5), 1);
}
// a calendar date that exists (not 30 Feb or month 13)
const realDay = (m) => { const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]; };
/** A point in time for the address: 'YYYY-MM-DDTHH:MM' in NZ time, or the NZ date alone for daily and longer points. */
export function stamp(t, withTime = true) { const p = parts(t); return withTime ? `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}` : ymd(t); }
/** The time (ms) of a stamp; a date alone is that day's local midnight. At the autumn clock change the repeated
 *  hour reads as its first (daylight) occurrence. */
export function fromStamp(s) {
  const m = TIME.exec(s || '') || DATE.exec(s || '');
  if (!m || !realDay(m) || +(m[4] ?? 0) > 23 || +(m[5] ?? 0) > 59) return null;
  const u = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0));
  // the offset is +12 or +13: try the larger first, so the repeated hour reads as daylight time
  for (const off of [13 * 36e5, 12 * 36e5]) if (nzOffset(u - off) === off) return u - off;
  return u - 12 * 36e5;   // the skipped hour in spring: read on standard time, so the clock shows an hour on
}

// ---------- reading and writing ----------
/** The view an address describes. Unknown or malformed values are left out, so a stale link falls back to defaults
 *  rather than failing; which tab a value applies to is up to the page. end and t are times (ms). */
export function readQuery(search) {
  const q = new URLSearchParams(search || '');
  const v = {};
  const one = (k, ok) => { const x = q.get(k); if (x != null && ok(x)) v[k] = x; };
  one('region', (x) => REGIONS.includes(x));
  const r = q.get('range');
  if (r != null && RANGES.includes(OLD_RANGE[r] || r)) v.range = OLD_RANGE[r] || r;
  one('int', (x) => INTS.includes(x));
  const end = endOfDay(q.get('end'));
  if (end != null) v.end = end;
  const t = fromStamp(q.get('t'));
  if (t != null) v.t = t;
  one('by', (x) => GROUPINGS.includes(x));
  one('unit', (x) => x === 'pct' || x === 'mw');
  one('chart', (x) => x === 'lines' || x === 'stacked');
  one('price', (x) => x === 'on' || x === 'off');
  const fold = q.get('fold');
  if (fold === 'none') v.fold = [];
  else if (fold) { const f = foldList(fold.split(',')); if (f.length) v.fold = f; }
  one('group', (x) => SLUG.test(x) && x.length <= 60);
  one('fuel', (x) => FUEL_KEYS.includes(x));
  one('plant', (x) => SLUG.test(x) && x.length <= 80);
  if (v.plant && PLANT_ALIASES[v.plant]) v.plant = PLANT_ALIASES[v.plant];
  const z = readZoom(q.get('zoom'));
  if (z) v.zoom = z;
  one('scale', (x) => SCALES.includes(x));
  const hide = (q.get('hide') || '').split(',').filter((x) => NODE.test(x));
  if (hide.length) v.hide = [...new Set(hide)];
  one('band', (x) => x === 'HAY' || x === 'BEN');
  return v;
}

/** A zoom from the address: { span: hours } or { from, to } (ms, to exclusive); null if malformed. */
export function readZoom(x) {
  if (!x) return null;
  const m = /^(\d+)h$/.exec(x);
  if (m) return SPANS.includes(+m[1]) ? { span: +m[1] } : null;
  const [a, b] = x.split('~'), from = fromStamp(a), to = fromStamp(b);
  return from != null && to != null && to > from && TIME.test(a) && TIME.test(b) ? { from, to } : null;
}
const writeZoom = (z) => z.span ? `${z.span}h` : `${stamp(z.from)}~${stamp(z.to)}`;

/** The query for a view (no leading '?'): defaults left out, keys in a fixed order, ':' and ',' left readable.
 *  tDay: write t as a date alone (daily and longer points). */
export function writeQuery(v, { tDay = false } = {}) {
  const out = [];
  const add = (k, x) => out.push(`${k}=${encodeURIComponent(x).replace(/%3A/gi, ':').replace(/%2C/gi, ',')}`);
  for (const k of ORDER) {
    const x = v[k];
    if (k === 'fold') { if (Array.isArray(x)) { const f = foldList(x); if (!sameFold(f, FOLD_DEFAULT)) add(k, f.length ? f.join(',') : 'none'); } continue; }
    if (x == null || x === '' || (Array.isArray(x) && !x.length)) continue;
    if (k === 'region' && x === 'NZ') continue;
    if (k === 'range' && x === '1d') continue;
    if (k === 'by' && x === 'detailed') continue;
    if (k === 'unit' && x !== 'pct') continue;
    if (k === 'chart' && x !== 'lines') continue;
    if (k === 'price' && x !== 'on') continue;
    if (k === 'scale' && x === 'spike') continue;
    if (k === 'band' && x === 'HAY') continue;
    if (k === 'end') add(k, ymd(x - 1));
    else if (k === 't') add(k, stamp(x, !tDay));
    else if (k === 'hide') add(k, x.join(','));
    else if (k === 'zoom') add(k, writeZoom(x));
    else add(k, x);
  }
  return out.join('&');
}

/** Only the settings both tabs share (for the tab links). */
export const sharedOnly = (v) => Object.fromEntries(SHARED.filter((k) => k !== 't' && v[k] != null).map((k) => [k, v[k]]));

// ---------- words for a view: the browser tab's title and link previews ----------
const REGION_NAME = { NZ: 'New Zealand', NI: 'North Island', SI: 'South Island' };
const RANGE_LAST = { '1d': 'last 24 hours', '3d': 'last 3 days', '7d': 'last 7 days', '30d': 'last 30 days', '1y': 'last 12 months', all: 'since 1997' };
const RANGE_LEN = { '1d': null, '3d': '3 days', '7d': '7 days', '30d': '30 days', '1y': '12 months' };
const GROUP_NAME = { ren: 'Renewable', fossil: 'Fossil', fast: 'Fast flexible', vre: 'Wind and solar', resid: 'Synchronous', solar: 'Solar' };
const BY_NAME = { site: 'by site', scheme: 'by hydro scheme', owner: 'by owner', simple: 'by group', flex: 'by flexibility', rf: 'renewable vs fossil', vre: 'inverter vs synchronous' };
const PLANT_NAMES = Object.fromEntries(Object.keys(PLANTS).map((n) => [slug(n), n]));
const SET_NAMES = Object.fromEntries(Object.values(PLANTS).flatMap((m) => [m.scheme, m.owner]).filter(Boolean).map((n) => [slug(n), n]));
const MON = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
/** 'D Mon to D Mon YYYY' for the NZ days containing a and b, without repeating the month or year. */
export function spanText(a, b) {
  const p = parts(a), q = parts(b);
  if (p.y !== q.y) return `${dayText(a)} to ${dayText(b)}`;
  return `${p.d}${p.mo === q.mo ? '' : ' ' + MON[p.mo - 1]} to ${dayText(b)}`;
}
/** 'D Mon YYYY' of the NZ day containing t. */
export const dayText = (t) => { const p = parts(t); return `${p.d} ${MON[p.mo - 1]} ${p.y}`; };
const clockText = (t) => { const p = parts(t); return p.h === 12 && p.mi === 0 ? 'noon' : `${p.h % 12 || 12}:${pad(p.mi)} ${p.h < 12 ? 'am' : 'pm'}`; };

/** What a view shows, in a few words: "Wind generation · North Island · 7 days to 18 Oct 2026".
 *  tab: 'generation' | 'prices'; names: optional display names the page already has ({ plant, group }). */
export function describe(tab, v, names = {}) {
  let what;
  if (tab === 'prices') what = 'Wholesale electricity prices';
  else {
    const fuel = v.fuel && FUELS.find((f) => f.k === v.fuel)?.name;
    const plant = names.plant || (v.plant && PLANT_NAMES[v.plant]);
    const group = names.group || (v.group && (GROUP_NAME[v.group] || SET_NAMES[v.group] || FUELS.find((f) => f.k === v.group)?.name));
    if (plant) what = plant;
    else if (fuel) what = `${fuel} generation`;
    else if (group) what = `${group} generation`;
    else what = `Electricity generation${BY_NAME[v.by] ? ' ' + BY_NAME[v.by] : ''}`;
  }
  const range = v.range || '1d';
  const daily = (v.int && !['5m', '30m'].includes(v.int)) || range === '1y' || range === 'all';
  let when;
  const z = v.zoom;
  if (v.t != null) when = daily ? dayText(v.t) : `${clockText(v.t)}, ${dayText(v.t)}`;
  else if (z && z.span) when = v.end == null ? `last ${z.span} hour${z.span > 1 ? 's' : ''}` : `${z.span} hour${z.span > 1 ? 's' : ''} to ${dayText(v.end - 1)}`;
  else if (z) when = daily || ymd(z.from) !== ymd(z.to - 1) ? spanText(z.from, z.to - 1) : `${clockText(z.from)} to ${clockText(z.to)}, ${dayText(z.from)}`;
  else if (v.end == null || range === 'all') when = RANGE_LAST[range];
  else when = RANGE_LEN[range] ? `${RANGE_LEN[range]} to ${dayText(v.end - 1)}` : dayText(v.end - 1);
  return [what, REGION_NAME[v.region || 'NZ'], when].join(' · ');
}

// ---------- links people copy (the Share button) ----------
/** A link to a view on the public site (copied or shared). tDay: the point is a day or longer. */
export function shareUrl(path, view, opts) {
  const qs = writeQuery(view, opts);
  return SITE_URL + path + (qs ? '?' + qs : '');
}

/** What the Share button offers for a view (#lib/site/ShareLink.svelte).
 *  v: the view's settings (end null for the latest data); point: the time of the last point the cursor was on and
 *  pointLabel its name, or null; tDay: points are a day or longer; days: the range's length (null for All);
 *  latestEnd: the midnight after the latest data.
 *  live: a link that always opens on the latest data (null when the view is already a past window).
 *  fixed(mark): { url, span }, a link to the dates shown (span: those dates in words, null for All), with the point
 *  marked if mark. A live window (the last 24 hours) becomes the days it reaches into today, or, with the point
 *  marked, the days ending with the point's if it's earlier. Null when that would be the same as the live link. */
/** @param {string} path @param {Record<string, any>} v
 *  zoomAt: the zoom as times ({ from, to }), for the link to the dates shown, so "the last 3 hours" stays those hours.
 *  @param {{ point?: number | null, pointLabel?: string | null, tDay?: boolean, days?: number | null, latestEnd: number, zoomAt?: { from: number, to: number } | null }} opts */
export function shareLinks(path, v, { point = null, pointLabel = null, tDay = false, days = null, latestEnd, zoomAt = null }) {
  const live = v.end == null ? shareUrl(path, { ...v, end: null, t: null }) : null;
  const fixed = (mark = false) => {
    const t = mark && point != null ? point : null;
    let end = days == null ? null : v.end ?? latestEnd;
    if (end != null && t != null && t < addDays(end, -days)) end = addDays(midnightOf(t), 1);
    if (end == null && t == null && live) return null;
    const span = end == null ? null : days === 1 ? dayText(end - 1) : spanText(addDays(end, -days), end - 1);
    return { url: shareUrl(path, { ...v, end, t, ...(v.zoom && zoomAt ? { zoom: zoomAt } : {}) }, { tDay }), span };
  };
  return { live, point, pointLabel, fixed };
}
