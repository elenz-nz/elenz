// The tracker's view in the address, so any view can be linked or bookmarked: region, range, interval and end date
// are shared by the Generation and Prices tabs, and each tab adds its own settings (grouping, drill-down, chart
// options) and the selected point. What each key means, and the parsing, is in #lib/site/viewurl.js.
//
// Opening a page: an address with a query is a link, and opens exactly what it says (anything it leaves out is the
// default). A plain visit opens on what this browser last used: region, range and a chosen interval in localStorage
// ('elenz-view', shared), each tab's own settings in its own key; never the date or the drill-down, so coming back
// later opens on the latest data at the top level.
//
// Writing: the address is replaced as settings change, so Back leaves the page rather than stepping through every
// setting; a drill-down step pushes a new entry (push), so Back steps back out of it. Each tab's last address is also
// kept for this browser tab (sessionStorage), so switching tabs and back restores the drill-down (TrackerTabs.svelte).

import { replaceState, pushState } from '$app/navigation';
import { readQuery, writeQuery, sharedOnly, REGIONS, RANGES, INTS, OLD_RANGE } from './viewurl.js';

export { midnightOf, addDays, ymd, endOfDay, slug, describe, shareUrl, shareLinks, SITE_URL } from './viewurl.js';

const TAB_KEY = 'elenz-tab:';

/** The view to open with. Returns the shared settings (end and t as times, or null), `link` (true when the address
 *  has a query: the page then takes its own settings from `q` only) and `q`, everything the address holds. */
export function readView() {
  /** @type {{ region: string, range: string, int: string | null, end: number | null, t: number | null, link: boolean, q: Record<string, any> }} */
  const v = { region: 'NZ', range: '1d', int: null, end: null, t: null, link: false, q: {} };
  const search = typeof location === 'undefined' ? '' : location.search;
  if (search.length > 1) {
    const q = readQuery(search);
    Object.assign(v, { link: true, q });
    if (q.region) v.region = q.region;
    if (q.range) v.range = q.range;
    if (q.int) v.int = q.int;
    if (q.end != null) v.end = q.end;
    if (q.t != null) v.t = q.t;
    return v;
  }
  try {
    const stored = JSON.parse(localStorage.getItem('elenz-view') || 'null');
    if (stored) {
      if (REGIONS.includes(stored.region)) v.region = stored.region;
      const r = OLD_RANGE[stored.range] || stored.range;
      if (RANGES.includes(r)) v.range = r;
      if (stored.intPicked && INTS.includes(stored.int)) v.int = stored.int;
    }
  } catch { /* storage blocked */ }
  return v;
}

/** Records the view: the address always, and region, range and interval in this browser.
 *  query: this tab's own settings for the address (see viewurl.js); store: other fields the Generation tab keeps in
 *  'elenz-view' (grouping, MW or %); push: a new history entry (a drill-down step) rather than replacing this one.
 *  int: null while the tab is on its own default. */
export function writeView({ region, range, int, end }, { query = {}, store = {}, push = false } = {}) {
  try {
    const old = JSON.parse(localStorage.getItem('elenz-view') || 'null') || {};
    const keep = { ...old, ...store, region, range };
    if (int) { keep.int = int; keep.intPicked = true; } else { delete keep.intPicked; }
    localStorage.setItem('elenz-view', JSON.stringify(keep));
  } catch { /* storage blocked: the address still has it */ }
  if (typeof location === 'undefined') return;
  const qs = writeQuery({ region, range, int, end, ...query });
  const url = location.pathname + (qs ? '?' + qs : '') + location.hash;
  try { sessionStorage.setItem(TAB_KEY + location.pathname.replace(/\/$/, ''), qs); } catch { /* storage blocked */ }
  if (url === location.pathname + location.search + location.hash) return;
  const go = push ? pushState : replaceState;
  // before the router has started (the first moments after loading) SvelteKit refuses: use the browser's own
  Promise.resolve().then(() => go(url, {})).catch(() => history[push ? 'pushState' : 'replaceState'](history.state, '', url));
}

/** The address for another tab: this page's shared settings with that tab's own from its last visit in this browser
 *  tab (its drill-down, grouping or chart options). */
export function tabHref(path) {
  const shared = sharedOnly(readQuery(location.search));
  let own = {};
  try {
    const last = readQuery(sessionStorage.getItem(TAB_KEY + path) || '');
    own = Object.fromEntries(Object.entries(last).filter(([k]) => !['region', 'range', 'int', 'end', 't'].includes(k)));
  } catch { /* storage blocked */ }
  const qs = writeQuery({ ...shared, ...own });
  return path + (qs ? '?' + qs : '');
}
