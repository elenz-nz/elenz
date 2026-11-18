// The plant index (/plants): its rows, filters, sort and the settings it keeps in the address. Pure, so
// tests/plants.test.js can check it. The rows come from src/lib/plants/index.json (ingest/plant_pages.py); the Now
// column from tracker.json's newest interval. docs/architecture.md, Plant pages.
import { fuelOf } from './registry.js';
import { slug } from '#lib/site/viewurl.js';
import { withOemb } from '#lib/tracker/oemb.js';

export const OTHER = 'Other generators';
// the fuels in the index's filter order (the mock-up's), then any other
const FUEL_ORDER = ['hydro', 'geo', 'wind', 'solar', 'gas', 'batt', 'coal', 'waste', 'bio', 'diesel'];
export const SORTS = { mw: 'Installed', now: 'Now', name: 'Plant', fuel: 'Fuel', island: 'Island', owner: 'Owner', commissioned: 'Commissioned' };
const TEXT_SORT = new Set(['name', 'fuel', 'island', 'owner']);   // A to Z first; numbers start largest first

/** @typedef {{ lat: number, lon: number, basis: string, checked: boolean }} Point */
/** @typedef {{ slug: string, name: string, plant: string, fuel: string, island: string, status: string, mw: number | null,
 *   owner: string, commissioned: string | null, closed: string | null, reviewed: boolean, pt: Point | null }} Plant */
/** @typedef {{ fuel: string, island: string, owner: string, closed: boolean, text: string, by: string, asc: boolean, sel: string }} Settings */

export const DEFAULTS = /** @type {Settings} */ ({ fuel: '', island: '', owner: '', closed: false, text: '', by: 'mw', asc: false, sel: '' });

/** The fuels present, in filter order: [{k, name, tok}]. */
export function fuelsOf(/** @type {Plant[]} */ plants) {
  const have = new Set(plants.map((p) => p.fuel));
  const order = [...FUEL_ORDER, ...[...have].filter((k) => !FUEL_ORDER.includes(k)).sort()];
  return order.filter((k) => have.has(k)).map((k) => ({ k, name: fuelName(k), tok: fuelOf(k).tok }));
}

/** Fuel names as the index shows them (the tracker's, without its grid and Rankine qualifiers). */
export const fuelName = (/** @type {string} */ k) => ({ solar: 'Solar', coal: 'Coal/gas' })[k] ?? fuelOf(k).name;

/** Owners A to Z, "Other generators" last. */
export function ownersOf(/** @type {Plant[]} */ plants) {
  return [...new Set(plants.map((p) => p.owner))].sort((a, b) => (a === OTHER ? 1 : b === OTHER ? -1 : a.localeCompare(b)));
}

/** The settings from the address; anything unknown falls back to its default. */
export function readSettings(/** @type {string} */ search, /** @type {Plant[]} */ plants) {
  const q = new URLSearchParams(search || '');
  const get = (/** @type {string} */ k) => q.get(k) || '';
  const fuels = new Set(plants.map((p) => p.fuel)), owners = new Set(plants.map((p) => slug(p.owner)));
  const slugs = new Set(plants.map((p) => p.slug));
  const [by, dir] = get('sort').split('-');
  const ok = by in SORTS;
  return {
    fuel: fuels.has(get('fuel')) ? get('fuel') : '',
    island: ['NI', 'SI'].includes(get('island').toUpperCase()) ? get('island').toUpperCase() : '',
    owner: owners.has(get('owner')) ? get('owner') : '',
    closed: q.get('closed') === '1',
    text: get('q').slice(0, 40),
    by: ok ? by : 'mw',
    asc: ok ? (dir === 'asc' ? true : dir === 'desc' ? false : TEXT_SORT.has(by)) : false,
    sel: slugs.has(get('plant')) ? get('plant') : '',
  };
}

/** The settings as the page's query ('' when all are defaults). */
export function writeSettings(/** @type {Settings} */ s) {
  const q = new URLSearchParams();
  if (s.fuel) q.set('fuel', s.fuel);
  if (s.island) q.set('island', s.island);
  if (s.owner) q.set('owner', s.owner);
  if (s.closed) q.set('closed', '1');
  if (s.text.trim()) q.set('q', s.text.trim());
  if (s.by !== 'mw' || s.asc) q.set('sort', s.asc === TEXT_SORT.has(s.by) ? s.by : `${s.by}-${s.asc ? 'asc' : 'desc'}`);
  if (s.sel) q.set('plant', s.sel);
  const out = q.toString();
  return out ? `?${out}` : '';
}

const norm = (/** @type {any} */ x) => String(x).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Plants passing every filter but fuel (the fuel buttons count these). */
export function filtered(/** @type {Plant[]} */ plants, /** @type {Settings} */ s) {
  const text = norm(s.text.trim());
  return plants.filter((p) => (s.closed || p.status !== 'closed') && (!s.island || p.island === s.island)
    && (!s.owner || slug(p.owner) === s.owner) && (!text || norm(p.name).includes(text)));
}

/** The table's rows: the filters, then the sort (largest installed MW breaks ties, then the name). */
export function pick(/** @type {Plant[]} */ plants, /** @type {Settings} */ s, /** @type {Map<string, number>} */ now = new Map()) {
  const rows = filtered(plants, s).filter((p) => !s.fuel || p.fuel === s.fuel);
  const val = (/** @type {Plant} */ p) => {
    switch (s.by) {
      case 'name': return norm(p.name);
      case 'fuel': return norm(fuelName(p.fuel));
      case 'island': return p.island;
      case 'owner': return p.owner === OTHER ? '￿' : norm(p.owner);
      case 'now': return p.status === 'closed' ? null : now.get(p.plant) ?? null;
      case 'commissioned': return p.commissioned;
      default: return p.mw;
    }
  };
  return rows.sort((a, b) => {
    const x = val(a), y = val(b);
    if (x !== y) {
      if (x == null) return 1;   // no value goes last either way
      if (y == null) return -1;
      return (x < y ? -1 : 1) * (s.asc ? 1 : -1);
    }
    return (b.mw ?? 0) - (a.mw ?? 0) || norm(a.name).localeCompare(norm(b.name));
  });
}

/** {plant name: MW} at tracker.json's newest interval. */
export function nowMw(/** @type {any} */ D) {
  const out = new Map();
  if (!D?.plants) return out;
  withOemb(D);
  const j = D.N - 1;
  for (const p of D.plants) if (p.s?.length) out.set(p.name, p.s[j] ?? 0);
  return out;
}

/** A dot's diameter in px for its installed MW: area grows with MW (10 MW ≈ 9 px, 500 MW ≈ 32 px, as the key). */
export const dotSize = (/** @type {number | null} */ mw) => Math.round(5 + Math.sqrt(Math.max(0, mw ?? 0)) * 1.2);

/** The status as the table words it: "Operating", "Closed 2015", "Not generating yet". */
export const statusText = (/** @type {Plant} */ p) => (p.status === 'closed' ? `Closed${p.closed ? ' ' + p.closed : ''}` : p.status === 'pending' ? 'Not generating yet' : 'Operating');
