// The private plant research page (/plants/research): its filters, sort, the settings it keeps in the address, and the
// workbook it downloads. Pure, so tests/research.test.js can check it. The data is src/lib/plants/research.json
// (ingest/plant_research.py), built from the plant files. docs/architecture.md, Plant pages (the research page).
import { fuelOf } from './registry.js';
import { slug } from '#lib/site/viewurl.js';

export const OTHER = 'Other generators';
const FUEL_ORDER = ['hydro', 'geo', 'wind', 'solar', 'gas', 'batt', 'coal', 'waste', 'bio', 'diesel'];

/** What still needs work, for the "Needs" filter: [key, label, test]. */
export const NEEDS = /** @type {[string, string, (p: any) => boolean][]} */ ([
  ['todo', 'Something to check', (p) => p.to_check.length > 0],
  ['unreviewed', 'Not reviewed', (p) => !p.reviewed],
  ['unchecked', 'Facts not all checked', (p) => p.checked < p.facts],
  ['disagree', 'Sources disagree', (p) => p.disagree.length > 0],
  ['nophoto', 'No photo', (p) => p.images.length === 0],
  ['location', 'Location not checked', (p) => p.loc !== 'checked'],
  ['grid', 'Location at the grid connection', (p) => p.loc === 'grid' || p.loc === 'none'],
  ['mine', 'Has team notes', (p) => !!p.my_note],   // the team's own notes (notes.js), joined in by the page
  ['reviewed', 'Reviewed (done)', (p) => !!p.reviewed],
]);
const NEED = Object.fromEntries(NEEDS.map(([k, , f]) => [k, f]));

export const LOC = { checked: 'Checked', draft: 'Not checked', grid: 'Grid connection only', none: 'None' };
export const STATUS = { operating: 'Operating', closed: 'Closed', pending: 'Not generating yet', none: 'No Elenz data' };
export const SORTS = { name: 'Plant', fuel: 'Fuel', island: 'Island', owner: 'Owner', mw: 'MW', facts: 'Checked', todo: 'To check', reviewed: 'Reviewed' };
const TEXT_SORT = new Set(['name', 'fuel', 'island', 'owner']);   // A to Z first; numbers start largest first

/** @typedef {{ fuel: string, island: string, owner: string, status: string, need: string, text: string, by: string, asc: boolean, open: string }} Settings */
export const DEFAULTS = /** @type {Settings} */ ({ fuel: '', island: '', owner: '', status: '', need: '', text: '', by: 'name', asc: true, open: '' });

export const fuelName = (/** @type {string} */ k) => (k ? ({ solar: 'Solar', coal: 'Coal/gas' })[k] ?? fuelOf(k).name : 'None');

/** The fuels present, in the index's order: [{k, name, tok}]. */
export function fuelsOf(/** @type {any[]} */ plants) {
  const have = new Set(plants.map((p) => p.fuel));
  const order = [...FUEL_ORDER, ...[...have].filter((k) => !FUEL_ORDER.includes(k)).sort()];
  return order.filter((k) => have.has(k)).map((k) => ({ k, name: fuelName(k), tok: fuelOf(k).tok }));
}

/** Owners A to Z, "Other generators" last. */
export function ownersOf(/** @type {any[]} */ plants) {
  return [...new Set(plants.map((p) => p.owner))].sort((a, b) => (a === OTHER ? 1 : b === OTHER ? -1 : a.localeCompare(b)));
}

/** The settings from the address; anything unknown falls back to its default. */
export function readSettings(/** @type {string} */ search, /** @type {any[]} */ plants) {
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
    status: get('status') in STATUS ? get('status') : '',
    need: get('need') in NEED ? get('need') : '',
    text: get('q').slice(0, 40),
    by: ok ? by : 'name',
    asc: ok ? (dir === 'asc' ? true : dir === 'desc' ? false : TEXT_SORT.has(by)) : true,
    open: slugs.has(get('plant')) ? get('plant') : '',
  };
}

/** The settings as the page's query, keeping the address's key (the page's private key on elenz.co.nz). */
export function writeSettings(/** @type {Settings} */ s, /** @type {string} */ search = '') {
  const q = new URLSearchParams();
  const key = new URLSearchParams(search || '').get('key');
  if (key) q.set('key', key);
  if (s.fuel) q.set('fuel', s.fuel);
  if (s.island) q.set('island', s.island);
  if (s.owner) q.set('owner', s.owner);
  if (s.status) q.set('status', s.status);
  if (s.need) q.set('need', s.need);
  if (s.text.trim()) q.set('q', s.text.trim());
  if (s.by !== 'name' || !s.asc) q.set('sort', s.asc === TEXT_SORT.has(s.by) ? s.by : `${s.by}-${s.asc ? 'asc' : 'desc'}`);
  if (s.open) q.set('plant', s.open);
  const out = q.toString();
  return out ? `?${out}` : '';
}

const norm = (/** @type {any} */ x) => String(x).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Plants passing every filter but "Needs" (the Needs list counts these). */
export function filtered(/** @type {any[]} */ plants, /** @type {Settings} */ s) {
  const text = norm(s.text.trim());
  return plants.filter((p) => (!s.fuel || p.fuel === s.fuel) && (!s.island || p.island === s.island)
    && (!s.owner || slug(p.owner) === s.owner) && (!s.status || p.status === s.status)
    && (!text || norm(p.name).includes(text) || norm(p.slug).includes(text)));
}

/** How many of these plants each "Needs" choice keeps: {key: n}. */
export function needCounts(/** @type {any[]} */ plants) {
  return Object.fromEntries(NEEDS.map(([k, , f]) => [k, plants.filter(f).length]));
}

/** The table's rows: the filters, then the sort (the name breaks ties). */
export function pick(/** @type {any[]} */ plants, /** @type {Settings} */ s) {
  const rows = filtered(plants, s).filter((p) => !s.need || NEED[s.need](p));
  const val = (/** @type {any} */ p) => {
    switch (s.by) {
      case 'fuel': return norm(fuelName(p.fuel));
      case 'island': return p.island || null;
      case 'owner': return p.owner === OTHER ? '￿' : norm(p.owner);
      case 'mw': return p.mw;
      case 'facts': return p.facts ? p.checked / p.facts : null;
      case 'todo': return p.to_check.length;
      case 'reviewed': return p.reviewed || null;
      default: return norm(p.name);
    }
  };
  return rows.sort((a, b) => {
    const x = val(a), y = val(b);
    if (x !== y) {
      if (x == null) return 1;   // no value goes last either way
      if (y == null) return -1;
      return (x < y ? -1 : 1) * (s.asc ? 1 : -1);
    }
    return norm(a.name).localeCompare(norm(b.name));
  });
}

/** Progress across all plants. */
export function progress(/** @type {any[]} */ plants) {
  const sum = (/** @type {(p: any) => number} */ f) => plants.reduce((a, p) => a + f(p), 0);
  return {
    plants: plants.length,
    reviewed: sum((p) => (p.reviewed ? 1 : 0)),
    facts: sum((p) => p.facts),
    checked: sum((p) => p.checked),
    photos: sum((p) => (p.images.length ? 1 : 0)),
    located: sum((p) => (p.loc === 'checked' ? 1 : 0)),
    todo: sum((p) => (p.to_check.length ? 1 : 0)),
    disagree: sum((p) => (p.disagree.length ? 1 : 0)),
  };
}

/** The research rounds, shown at the top of the page; move `now` along when a round finishes (design decision,
 * 23 Nov 2026: the stations without a page next, then history). [label, what it covers, 'done' | 'now' | 'next']. */
export const ROUNDS = /** @type {[string, string, string][]} */ ([
  ['First pass', 'The 110 tracker plants: facts, locations, aerial views, capacity and dates, then the pages went public (23 Nov 2026).', 'done'],
  ['Stations without a page', 'The station leads below, starting with "To research": embedded and other stations Elenz has no page for yet.', 'now'],
  ['History', 'Previous owners, upgrades and closures for every page, then retired stations (the leads marked "Historic").', 'next'],
]);

/** The station leads' groups (ingest/plant_research.py, lead_group): [key, label, what it means]. */
export const LEAD_GROUPS = /** @type {[string, string, string][]} */ ([
  ['todo', 'To research', 'Stations without a page: check each, then give it a plant file or set it aside'],
  ['osm', 'OpenStreetMap leads', 'Unverified: confirm the station exists and its rating before researching it'],
  ['small', 'Under 1 MW', 'Below the pages’ threshold: only as an exception'],
  ['new', 'Not generating yet', 'Gets a plant file when it first dispatches'],
  ['historic', 'Historic', 'Retired or historic: for the history round'],
  ['page', 'On a page already', 'A station or unit on an existing plant page (on_page)'],
  ['', 'All leads', ''],
]);

/** The note key for a station lead: its notes sit beside the plants' (notes.js), keyed lead-<id>. */
export const leadKey = (/** @type {string} */ id) => `lead-${id.toLowerCase()}`;

/** How many leads each group holds: {key: n}, '' for all. */
export function leadCounts(/** @type {any[]} */ leads) {
  return Object.fromEntries(LEAD_GROUPS.map(([k]) => [k, leads.filter((r) => !k || r.group === k).length]));
}

/** The technologies the leads have, A to Z. */
export const leadTechs = (/** @type {any[]} */ leads) => [...new Set(leads.map((r) => r.technology ?? '').filter(Boolean))].sort();

/** The leads to list: by group, technology and a name, ID, owner or region match; ordered by name. */
export function pickLeads(/** @type {any[]} */ leads, /** @type {{ group: string, tech: string, text: string }} */ f) {
  const text = norm(f.text.trim());
  return leads
    .filter((r) => (!f.group || r.group === f.group) && (!f.tech || r.technology === f.tech)
      && (!text || [r.name, r.id, r.owner, r.region].some((x) => x && norm(x).includes(text))))
    .sort((a, b) => norm(a.name).localeCompare(norm(b.name)) || a.id.localeCompare(b.id));
}

/** A source's name for a table: its title, or its ID if it has none. */
export const sourceName = (/** @type {Record<string, any>} */ sources, /** @type {string} */ id) => sources[id]?.title || id;

/** The download: one sheet each for the plants, every fact (other sources' values as their own rows), the sources and
 * the two leads files; the team's notes (notes.js, by slug) in the Plants sheet, and the leads' (lead-<id>) with their
 * group in the Station leads sheet. [{name, header, rows}], for xlsx.js. */
export function workbook(/** @type {any} */ d, /** @type {Record<string, { text: string }>} */ notes = {}) {
  const srcs = d.sources, names = (/** @type {string[]} */ ids) => ids.map((x) => sourceName(srcs, x)).join('; ');
  const plants = [...d.plants].sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  const plantRows = plants.map((p) => [
    p.name, p.slug, fuelName(p.fuel), p.island, STATUS[/** @type {keyof typeof STATUS} */ (p.status)] ?? p.status, p.mw, p.owner, p.scheme,
    p.reviewed, p.facts, p.checked, LOC[/** @type {keyof typeof LOC} */ (p.loc)], p.disagree.join('; '), p.images.length, p.photo_leads.join(' '),
    p.to_check.join('\n'), p.notes.join('\n'), notes[p.slug]?.text ?? '', p.wikidata, p.osm.join(' '), p.register.join(' '), `https://elenz.co.nz/plants/${p.slug}`,
  ]);
  const factRows = plants.flatMap((p) => p.entries.flatMap((/** @type {any} */ e) => [
    [p.name, p.slug, e.label, 'Main', e.value, e.source.join(' '), names(e.source), e.grade, e.checked, e.published ? 'Yes' : 'No', e.note ?? ''],
    ...e.alt.map((/** @type {any} */ a) => [p.name, p.slug, e.label, 'Other source', a.value, a.source.join(' '), names(a.source), a.grade, '', 'No', a.note ?? '']),
  ]));
  const sourceRows = Object.entries(srcs).map(([id, s]) => [id, s.title, s.publisher, s.url, s.kind, s.opened, s.note]);
  const keys = (/** @type {any[]} */ rows) => [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const leadKeys = keys(d.photo_leads), stationKeys = keys(d.station_leads).filter((k) => k !== 'group');
  const groupName = Object.fromEntries(LEAD_GROUPS.map(([k, name]) => [k, name]));
  return [
    { name: 'Plants', header: ['Plant', 'Slug', 'Fuel', 'Island', 'Status', 'Installed MW', 'Owner', 'Scheme', 'Reviewed', 'Facts', 'Facts checked',
      'Location', 'Sources disagree on', 'Photos', 'Photo leads', 'To check', 'Notes', 'Team notes', 'Wikidata', 'OpenStreetMap', 'Register IDs', 'Page'], rows: plantRows },
    { name: 'Facts', header: ['Plant', 'Slug', 'Fact', 'Main or other source', 'Value', 'Source IDs', 'Sources', 'Grade', 'Checked', 'Published', 'Note'], rows: factRows },
    { name: 'Sources', header: ['ID', 'Title', 'Publisher', 'Address', 'Kind', 'Opened', 'Note'], rows: sourceRows },
    { name: 'Photo leads', header: leadKeys, rows: d.photo_leads.map((/** @type {any} */ r) => leadKeys.map((k) => r[k] ?? '')) },
    { name: 'Station leads', header: ['Group', ...stationKeys, 'Team notes'],
      rows: d.station_leads.map((/** @type {any} */ r) => [groupName[r.group] ?? r.group, ...stationKeys.map((k) => r[k] ?? ''), notes[leadKey(r.id)]?.text ?? '']) },
  ];
}
