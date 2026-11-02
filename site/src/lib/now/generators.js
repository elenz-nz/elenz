// The /now page's "Every generator right now" table: one row per plant from tracker.json's newest interval.
// MW is dispatch (the market's 5-minute target for the plant), capacity is the installed MW that applies today
// (capacity.json, from facilities/plant_capacity.csv; the plant's register nameplate if it has no row), owner from
// plants.json. Stations shown whole (Huntly Rankines ...) and plants on two buses (Arapuni, Roxburgh) carry `units`.
// The table's settings live in /now's address (fuel, island, owner, sort, q, on), so a view can be linked.
import { FUELS } from '#lib/tracker/fuels.js';
import CAPACITY from '#lib/tracker/capacity.json';
import PLANT_META from '#lib/tracker/plants.json';
import { slug } from '#lib/site/viewurl.js';

const FUEL = Object.fromEntries(FUELS.map((f) => [f.k, f]));
const META = /** @type {Record<string, { owner?: string, aka?: string[] }>} */ (PLANT_META);
const CAP_ROWS = new Map(CAPACITY.plants.map((p) => [p.name, p.rows]));
const TODAY = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date());

/** Installed MW today: the capacity.json row covering today, else the register nameplate tracker.json gives. */
function capacityNow(name, fallback, today) {
  const rows = CAP_ROWS.get(name);
  const row = rows?.find(([a, b]) => (a == null || a <= today) && (b == null || today <= b));
  return row ? row[2] : (fallback || null);
}

/** @typedef {{ name: string, mw: number, cap: number | null }} Unit */
/** @typedef {{ name: string, key: string, fuel: string, fuelName: string, tok: string, isl: string, owner: string,
 *   mw: number, cap: number | null, pct: number | null, charging: boolean, href: string, units: Unit[], part: string,
 *   aka: string[] }} Row */
/** @typedef {{ by: string, asc: boolean }} SortKey */
/** @typedef {{ fuel: string, island: string, owner: string, by: string, asc: boolean, then?: SortKey[], text: string, on: boolean }} Settings */

// groups whose members are separate stations rather than units of one (Waikaremoana: Kaitawa, Tuai and Piripaua
// on one river chain): listed here as one row per station, each linking to the group in the tracker
const STATION_GROUPS = new Set(['Waikaremoana']);

/** Rows for every plant in tracker.json at its newest interval.
 * @param {any} D
 * @returns {Row[]} */
export function generatorRows(D) {
  const j = D.N - 1, today = TODAY();
  const plants = (D.plants || []).flatMap((p) => (STATION_GROUPS.has(p.name) && p.units?.length
    ? p.units.map((u) => ({ ...p, name: u.label || u.name, cap: u.cap, s: u.s, units: [], group: p.name }))
    : [p]));
  return plants.map((p) => {
    const mw = p.s?.[j] ?? 0;
    const cap = p.group ? p.cap : capacityNow(p.name, p.cap, today);
    const f = FUEL[p.fuel] || { name: p.fuel, tok: '--muted' };
    return {
      name: p.name, key: slug(p.name), fuel: p.fuel, fuelName: f.name, tok: f.tok, isl: p.isl,
      owner: META[p.group || p.name]?.owner || 'Other generators',
      mw, cap, pct: cap ? (mw / cap) * 100 : null,
      charging: p.fuel === 'batt' && mw < -0.5,
      href: `/tracker?fuel=${p.fuel}&plant=${slug(p.group || p.name)}`,
      units: (p.units || []).map((u) => ({ name: u.label || u.name, mw: u.s?.[j] ?? 0, cap: u.cap || null })),
      // a station shown whole lists its register plants (they carry a label); a plant on two buses, its connections
      part: (p.units || []).some((u) => u.label) ? 'units' : 'connections',
      // other names the search also finds it by (Stratford: Taranaki Combined Cycle), plus a station's units
      aka: [...(META[p.group || p.name]?.aka || []), ...(p.units || []).map((u) => u.label || u.name)],
    };
  });
}

export const SORTS = { mw: 'MW', pct: '% of capacity', name: 'Plant', fuel: 'Fuel', island: 'Island', owner: 'Owner' };
// the words sorts: A to Z first (the numbers start largest first)
const TEXT_SORT = new Set(['name', 'fuel', 'island', 'owner']);

/** The table's settings from /now's address; unknown values fall back to the defaults.
 * @param {string} search
 * @param {Row[]} rows
 * @returns {Settings} */
export function readSettings(search, rows) {
  const q = new URLSearchParams(search || '');
  const get = (/** @type {string} */ k) => q.get(k) || '';
  const fuels = new Set(rows.map((r) => r.fuel)), owners = new Set(rows.map((r) => slug(r.owner)));
  // sort=island,mw-asc: the first key sorts, the rest break its ties in turn (Shift-click, owner's report NOW-10)
  const keys = get('sort').split(',').map((x) => { const [by, dir] = x.split('-'); return by in SORTS ? { by, asc: dir === 'asc' ? true : dir === 'desc' ? false : TEXT_SORT.has(by) } : null; })
    .filter((k, i, a) => k && a.findIndex((x) => x?.by === k.by) === i);
  const first = keys[0] ?? { by: 'mw', asc: false };
  return {
    fuel: fuels.has(get('fuel')) ? get('fuel') : '',
    island: ['NI', 'SI'].includes(get('island').toUpperCase()) ? get('island').toUpperCase() : '',
    owner: owners.has(get('owner')) ? get('owner') : '',
    by: first.by,
    asc: first.asc,
    then: /** @type {SortKey[]} */ (keys.slice(1)),
    text: get('q').slice(0, 40),
    on: q.get('on') === '1',
  };
}

/** The settings as /now's query ('' when all are defaults).
 * @param {Settings} s */
export function writeSettings(s) {
  const q = new URLSearchParams();
  if (s.fuel) q.set('fuel', s.fuel);
  if (s.island) q.set('island', s.island);
  if (s.owner) q.set('owner', s.owner);
  const key = (/** @type {SortKey} */ k) => (k.asc === TEXT_SORT.has(k.by) ? k.by : `${k.by}-${k.asc ? 'asc' : 'desc'}`);
  const keys = [{ by: s.by, asc: s.asc }, ...(s.then ?? [])];
  if (keys.length > 1 || s.by !== 'mw' || s.asc) q.set('sort', keys.map(key).join(','));
  if (s.text.trim()) q.set('q', s.text.trim());
  if (s.on) q.set('on', '1');
  const out = q.toString();
  return out ? `?${out}` : '';
}

const norm = (x) => String(x).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Rows after the filters, in the chosen order.
 * @param {Row[]} rows
 * @param {Settings} s
 * @returns {Row[]} */
export function pick(rows, s) {
  const text = norm(s.text.trim());
  const out = rows.filter((r) => (!s.fuel || r.fuel === s.fuel) && (!s.island || r.isl === s.island) &&
    (!s.owner || slug(r.owner) === s.owner) && (!text || [r.name, ...(r.aka || [])].some((n) => norm(n).includes(text))) && (!s.on || Math.abs(r.mw) >= 0.5));
  // the sort keys in turn (Shift-click adds one); fuel, island and owner group the list, and within the last group
  // the largest MW comes first (owner's report NOW-10)
  const val = (by, r) => (by === 'name' ? norm(r.name) : by === 'pct' ? r.pct : by === 'fuel' ? norm(r.fuelName)
    : by === 'island' ? r.isl : by === 'owner' ? (r.owner === 'Other generators' ? '\uffff' : norm(r.owner)) : r.mw);
  const keys = [{ by: s.by, asc: s.asc }, ...(s.then ?? [])];
  const last = keys[keys.length - 1].by;
  const group = last === 'fuel' || last === 'island' || last === 'owner';
  const cmp = (k, a, b) => {
    const x = val(k.by, a), y = val(k.by, b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;   // plants with no capacity go last either way
    if (y == null) return -1;
    const c = x < y ? -1 : x > y ? 1 : 0;
    return k.asc ? c : -c;
  };
  return out.sort((a, b) => {
    for (const k of keys) { const c = cmp(k, a, b); if (c) return c; }
    return (group ? b.mw - a.mw : 0) || norm(a.name).localeCompare(norm(b.name));
  });
}
