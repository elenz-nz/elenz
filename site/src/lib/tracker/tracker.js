// Elenz tracker: linked generation, price, demand, HVDC, emissions and renewables charts on one time axis.
// Data: tracker.json built by ingest/build_tracker.py. Drawn on <canvas>; the page supplies the markup (ids below).

import { FUELS } from './fuels.js';
import { efAt, plantEf, BY_PLANT } from './emissions.js';
import { onDateSettled, onTimeSettled } from '../site/datefield.js';
import '../site/datepick.js';   // <date-pick>: the date box's calendar (TRK-07)
import { nzOffset, tzName, KEY, fromLayout, firstAtOrAfter, historyStore, genTotal } from './series.js';
import PLANT_META from './plants.json';  // owner, hydro scheme, other names and metering note per plant (ingest/plant_meta.py)
import CAPACITY from './capacity.json';   // installed MW per plant (ingest/capacity.py)
import { readView, writeView, slug, describe, shareLinks, setTitle } from '#lib/site/view.js';
import { readQuery, stamp, fromStamp, FOLDABLE, FOLD_DEFAULT, foldList } from '#lib/site/viewurl.js';
import { priceScale } from '#lib/prices/data.js';
import { fit } from '#lib/site/fitselect.js';
import { composeImage, legendOf, csvText, nzTime, utcTime, fileName, CREDIT, CREDIT_SOLAR, LICENCE } from '#lib/site/download.js';
export { nzOffset, tzName };

// A model: one segment (series.js) plus what the charts read. NIs/SIs are the island series (same objects).
function toModel(S, END) {
  return { ...S, N: S.n, END: END ?? S.t[S.n - 1], NIs: S.NI, SIs: S.SI };
}
// the live week's intervals with no complete dispatch case, interpolated (tracker.json meta.filled: [first, length] runs)
function filledTimes(D) {
  const out = new Set();
  for (const [a, n] of D.meta?.filled || []) for (let i = a; i < a + n; i++) out.add(D.t0 + i * D.step);
  return out;
}
export const buildModel = D => ({ ...toModel(fromLayout(D)), filled: filledTimes(D) });

// Ranges: the live week at 5 minutes, then history. Each lists its intervals; the first is the default.
// A range can end at the latest data or on a chosen date (state.end); the arrows step by the range's length.
// Past windows outside the live week come from half-hourly history, so they offer the `past` intervals.
const RANGES = {
  '1d': { model: 'live', n: 288, days: 1, label: '24 hours', ints: ['5m', '30m'], past: ['30m'], span: 'Last 24 hours' },
  '3d': { model: 'live', n: 864, days: 3, label: '3 days', ints: ['5m', '30m'], past: ['30m'], span: 'Last 3 days' },
  '7d': { model: 'live', n: 2016, days: 7, label: '7 days', ints: ['5m', '30m'], past: ['30m', '1d'], span: 'Last 7 days' },
  '30d': { model: 'hh', days: 30, label: '30 days', ints: ['30m', '1d'], span: 'Last 30 days' },
  '1y': { model: 'day', days: 365, label: '1 year', ints: ['1d', '1w', '1mo'], def: '1w', span: 'Last 12 months' },
  'all': { model: 'day', label: 'All', fixed: true, ints: ['1d', '1w', '1mo', '1yr'], def: '1mo', span: null },
};
const DAY = 864e5;
const INTS = {
  '5m': { label: '5m', key: null, live: true },
  '30m': { label: '30m', key: KEY.hh },
  '1d': { label: 'Day', key: KEY.day },
  '1w': { label: 'Week', key: KEY.week },
  '1mo': { label: 'Month', key: KEY.month },
  '1yr': { label: 'Year', key: KEY.year },
};

export function mountTracker(D, hooks = {}) {
  const models = { live: buildModel(D), hh: null, day: null };
  const history = historyStore();
  let M = models.live;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const FUEL = Object.fromEntries(FUELS.map(f => [f.k, f]));
  // Source groupings for the generation chart. Each group lists its fuels in stack order.
  // Battery and HVDC are signed (charging, export), so they stay separate layers in every view.
  const REN = { id: 'ren', name: 'Renewables', tok: '--g-ren', f: ['geo', 'bio', 'hydro', 'wind', 'solar', 'roof'] };
  const FOSSIL = f => ({ id: 'fossil', name: f, tok: '--g-fossil', f: ['waste', 'coal', 'gas', 'diesel'] });
  const THERMAL = { id: 'fossil', name: 'Thermal', tok: '--g-fossil', f: ['bio', 'waste', 'coal', 'gas', 'diesel'] };
  const VRE = name => ({ id: 'vre', name, tok: '--g-vre', f: ['wind', 'solar', 'roof'] });
  const one = k => ({ id: k, name: FUEL[k].name, tok: FUEL[k].tok, f: [k] });
  const VIEWS = {
    detailed: { groups: null },
    simple: { groups: [one('geo'), THERMAL, one('hydro'), one('wind'), { id: 'solar', name: 'Solar', tok: '--f-solar', f: ['solar', 'roof'] }] },
    flex: { groups: [
      { ...one('geo'), name: 'Inflexible', f: ['geo', 'bio', 'waste'] },   // geothermal runs flat out; cogeneration follows its mill or steelworks
      { ...one('coal'), name: 'Slow flexible' },    // Huntly's Rankine units: hours to start, slow to ramp
      { id: 'fast', name: 'Fast flexible', tok: '--g-fast', f: ['gas', 'diesel', 'hydro', 'batt'] },
      VRE('Variable'),
    ] },
    rf: { groups: [REN, FOSSIL('Fossils')] },
    // views built from plants rather than fuels (see plantSets below)
    site: { by: 'site' }, scheme: { by: 'scheme' }, owner: { by: 'owner' },
    // inverter-based generation (wind and solar) against the synchronous machines (hydro, geothermal, thermal)
    vre: { groups: [{ id: 'resid', name: 'Synchronous', tok: '--g-resid', f: ['geo', 'bio', 'waste', 'coal', 'gas', 'diesel', 'hydro'] }, { ...VRE('Inverter-based'), f: ['wind', 'solar', 'roof', 'batt'] }] },
  };
  const SIGNED = FUELS.filter(f => f.signed).map(f => f.k);
  // what each grouping shows, in a note under the generation chart
  // one line under the generation chart for the groupings that need it; the full definitions are on /methods/groupings
  const NOTES = {
    simple: 'Five groups: geothermal, thermal, hydro, wind, and solar (grid-scale and embedded together).',
    flex: 'Grouped by how readily each fuel can follow demand: inflexible, slow, fast and variable.',
    rf: 'Renewables against fossil fuels. Geothermal counts as renewable, although it emits some CO₂.',
    vre: 'Wind and solar, connected through inverters, against spinning hydro, geothermal and thermal plant.',
    owner: "Today's owners, applied to the whole history.",
  };
  const groupById = id => (VIEWS[state.view].groups || []).find(g => g.id === id) || setById(id);

  // ---------- plant sets: views stacked by site, hydro scheme or owner ----------
  // A set is a list of plants shown as one layer; drilling into it lists its plants.
  const SCHEMES = ['Tekapo', 'Waitaki', 'Waikato', 'Manapōuri', 'Clutha', 'Tongariro', 'Waikaremoana', 'Rangitaiki', 'Waipori', 'Other hydro'];
  // stacking order chosen so neighbouring brand colours stay distinguishable (colour-blind checked)
  const OWNERS = ['Genesis', 'Meridian', 'Contact', 'Mercury', 'Nova', 'Other generators'];
  const hydroOnly = () => VIEWS[state.view].by === 'scheme';
  const topIsAll = () => level() === 'top' && !hydroOnly();  // shares of all generation (not just the layers shown)
  const ownerOf = p => PLANT_META[p.name]?.owner || 'Other generators';
  const schemeOf = p => PLANT_META[p.name]?.scheme || 'Other hydro';
  // other names a plant has had or goes by ([plant_aka] and the register names of a station shown whole): the list's
  // filter finds a plant by them, and its drill-down lists them with what its metered history counts ([plant_metering])
  const akaOf = name => PLANT_META[name]?.aka || [];
  const meteredOf = name => PLANT_META[name]?.metered || '';
  // by site: every plant its own layer, so the list has every site (owner's report GRP-03, 28 Oct 2026; it was the
  // plants making up 95% of each fuel, at most 12, and an "Other ..." row)
  const SITE_SHARE = Infinity, SITE_MAX = Infinity;   // (idle ones too, at the foot of their fuel)
  const energy = p => {  // MWh over the view, cached per view
    const cache = V.energy || (V.energy = new Map());
    if (!cache.has(p)) { const a = V.avg(p.s); let e = 0; for (let j = 0; j < V.n; j++) e += a[j] * V.hrs[j]; cache.set(p, e); }
    return cache.get(p);
  };
  function plantSets() {
    const by = VIEWS[state.view].by, r = state.region, sets = [];
    const regional = M.plants.filter(p => !FUEL[p.fuel].signed && (r === 'NZ' || p.isl === r));
    if (by === 'scheme') {
      // largest scheme by nameplate capacity at the bottom of the stack; "Other hydro" always last
      const cap = ps => ps.reduce((a, p) => a + (p.cap || 0), 0);
      for (const sc of SCHEMES) {
        const ps = regional.filter(p => p.fuel === 'hydro' && schemeOf(p) === sc);
        if (ps.length) sets.push({ id: 's:' + sc, name: sc, fuel: 'hydro', plants: ps, cap: cap(ps) });
      }
      sets.sort((a, b) => (a.name === 'Other hydro') - (b.name === 'Other hydro') || b.cap - a.cap);
    } else if (by === 'owner') {
      // batteries count with their owner (discharge only; charging is one layer below zero: owner's call, 30 Oct 2026)
      const withBatt = M.plants.filter(p => (p.fuel === 'batt' || !FUEL[p.fuel].signed) && (r === 'NZ' || p.isl === r));
      OWNERS.forEach((o, i) => {
        const ps = withBatt.filter(p => ownerOf(p) === o);
        if (ps.length) sets.push({ id: 'o:' + o, name: o, tok: `--o${i + 1}`, plants: ps });
      });
    } else if (by === 'site') {
      for (const f of FUELS) {
        const ps = regional.filter(p => p.fuel === f.k);
        if (ps.length < 2) continue;
        const es = ps.map(energy), tot = es.reduce((a, b) => a + b, 0);
        const order = ps.map((p, i) => i).sort((a, b) => es[b] - es[a]);
        let cum = 0, keep = 0;
        for (const i of order) { if (keep >= SITE_MAX || (keep && cum >= SITE_SHARE * tot)) break; cum += es[i]; keep++; }
        const small = order.slice(keep).map(i => ps[i]);
        if (small.length > 1) sets.push({ id: 'x:' + f.k, name: `Other ${f.name.toLowerCase().replace(', grid', '')}`, fuel: f.k, plants: small });
      }
    }
    return sets;
  }
  const setById = id => (id && /^[sox]:/.test(id) && V ? (V.sets || (V.sets = plantSets())).find(x => x.id === id) : null);
  const TOP_LEVEL = { group: null, fuel: null, plant: null };

  // National series = sum of islands
  const add = (a, b) => a.map((v, i) => v + b[i]);
  let NZ, SRC, present;
  function derive() {
    NZ = {};
    FUELS.forEach(f => NZ[f.k] = f.k === 'hvdc' ? new Float64Array(M.N) : add(M.NI[f.k], M.SI[f.k]));
    NZ.metered = add(M.NIs.metered, M.SIs.metered);
    NZ.underlying = add(M.NIs.underlying, M.SIs.underlying);
    NZ.roofU = add(M.NIs.roofU, M.SIs.roofU);   // the islands' errors share the calibration, so they add
    NZ.tiwai = M.SIs.tiwai;
    SRC = { NZ, NI: { ...M.NI, ...M.NIs }, SI: { ...M.SI, ...M.SIs } };
    present = {};
    for (const r of ['NZ', 'NI', 'SI']) present[r] = FUELS.filter(f => SRC[r][f.k].some(v => Math.abs(v) > 0.5)).map(f => f.k);
  }
  derive();
  // Embedded solar has no plants: its drill-down shows each island's estimate instead (not drillable further).
  const roofIslands = () => ['NI', 'SI'].map(isl => ({ name: `Embedded solar · ${isl === 'NI' ? 'North' : 'South'} Island`, fuel: 'roof', isl, poc: [], cap: null, roof: true,
                                                       s: M[isl].roof, u: M[isl + 's'].roofU }));
  // Plants are listed largest first by installed MW (the most a plant has had in capacity.json, else its register
  // nameplate), so the order, and each plant's shade, stay the same whatever range is shown (owner's call, 26 Oct 2026;
  // the loaded data's own order changed between the live week and history)
  const MAX_MW = new Map(CAPACITY.plants.map(p => [p.name, Math.max(0, ...p.rows.map(r => r[2] ?? 0))]));
  const sizeOf = p => MAX_MW.get(p.name) ?? p.cap ?? 0;
  const bySize = (a, b) => sizeOf(b) - sizeOf(a) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const plantsFor = (fuel, r = state.region) => (fuel === 'roof' ? roofIslands().filter(p => p.s.some(v => v > 0.5)) : M.plants)
    .filter(p => p.fuel === fuel && (r === 'NZ' || p.isl === r)).sort(bySize);
  const plantByName = name => M.plants.find(p => p.name === name);

  // intPicked: the viewer chose the interval (shared with the Prices tab); otherwise it's this tab's default for the range
  const state = { region: 'NZ', range: '1d', end: null, kind: 'live', int: '5m', intPicked: false, view: 'detailed', unit: 'mw', chart: 'stacked', price: false, hover: null, hoverBy: null,
                  hidden: new Set(), drill: { ...TOP_LEVEL }, open: new Set(), filter: '',
                  // fold: the charts under the generation chart shown as one line (title and value), not drawn
                  fold: new Set(FOLD_DEFAULT),
                  // zoom: part of the window, { span: hours } at its end (the menu on 1D) or { from, to } (dragged on a chart)
                  zoom: null };
  // the view to open with: a link's address, or this browser's last view on a plain visit (#lib/site/view.js)
  const init = readView(), q = init.q;
  state.region = init.region;
  if (init.int && Object.hasOwn(INTS, init.int)) { state.int = init.int; state.intPicked = true; }
  let saved = null;  // a long range or a past date needs history loaded first (see below)
  if (RANGES[init.range].model === 'live' && init.end == null) state.range = init.range;
  else saved = { range: init.range, end: init.end };
  if (init.link) {
    if (q.zoom) state.zoom = q.zoom;
    if (q.by && Object.hasOwn(VIEWS, q.by)) state.view = q.by;
    if (q.unit === 'pct') state.unit = 'pct';
    if (q.chart === 'lines') state.chart = 'lines';
    if (q.price === 'on') state.price = true;
    if (q.fold) state.fold = new Set(q.fold);
  } else try {
    const s = JSON.parse(localStorage.getItem('elenz-view') || 'null');
    if (s && Object.hasOwn(VIEWS, s.view)) state.view = s.view;
    if (s?.unit === 'pct') state.unit = 'pct';
    if (s?.chart === 'lines') state.chart = 'lines';
    if (s?.price === true) state.price = true;
    if (Array.isArray(s?.fold)) state.fold = new Set(foldList(s.fold));
  } catch (e) {}
  if (!RANGES[state.range].ints.includes(state.int)) { state.int = RANGES[state.range].def || RANGES[state.range].ints[0]; state.intPicked = false; }
  // a link's drill-down and point wait for the window they belong to: a long range or past date loads its history
  // first (a retired plant is only in the history), so they're applied by the rebuild after that (waiting: until then)
  let linked = init.link && (q.group || q.fuel || q.plant || init.t != null) ? { group: q.group, fuel: q.fuel, plant: q.plant, t: init.t } : null;
  let waiting = !!saved;
  // the drill-down in the address: plants and plant sets (scheme, owner, other plants of a fuel) by slug
  const groupKey = id => id == null ? null : /^[sox]:/.test(id) ? slug(id.slice(2)) : id;
  const ownQuery = () => {
    const d = state.drill, l = linked;
    return { by: state.view, unit: state.unit, chart: state.chart, price: state.price ? 'on' : null, fold: foldList([...state.fold]), zoom: state.zoom, ...(l ? { group: l.group, fuel: l.fuel, plant: l.plant }
      : { group: groupKey(d.group), fuel: d.fuel, plant: d.plant ? slug(d.plant) : null }) };
  };
  const shared = () => ({ region: state.region, range: state.range, int: state.intPicked ? state.int : null, end: state.end });
  // push: a drill-down step, so Back steps out of it. The browser tab's title says what the view shows.
  const save = (push = false) => {
    writeView(shared(), { store: { view: state.view, unit: state.unit, chart: state.chart, price: state.price, fold: foldList([...state.fold]) }, query: ownQuery(), push });
    const d = state.drill;
    setTitle(describe('generation', { ...shared(), ...ownQuery() }, { plant: d.plant, group: d.group ? groupById(d.group)?.name : null }) + ' · ELENZ');
  };

  // ---------- time helpers ----------
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const lp = t => { const d = new Date(t + nzOffset(t)); return { y: d.getUTCFullYear(), dow: d.getUTCDay(), dom: d.getUTCDate(), mon: d.getUTCMonth(), h: d.getUTCHours(), m: d.getUTCMinutes() }; };
  const clock = p => (p.h === 12 && p.m === 0) ? 'noon' : (p.h === 0 && p.m === 0) ? 'midnight' : `${p.h % 12 || 12}:${String(p.m).padStart(2, '0')} ${p.h < 12 ? 'am' : 'pm'}`;
  const hourLbl = p => p.h === 12 ? 'noon' : `${p.h % 12 || 12} ${p.h < 12 ? 'am' : 'pm'}`;
  const dayLbl = p => `${DOW[p.dow]} ${p.dom} ${MON[p.mon]}`;
  const tp = p => Math.floor((p.h * 60 + p.m) / 30) + 1;
  const fmt = v => Math.round(v).toLocaleString('en-NZ');
  const money = v => '$' + (v >= 100 ? Math.round(v).toLocaleString('en-NZ') : v.toFixed(v < 10 ? 2 : 0));
  const gwh = v => v.toFixed(Math.abs(v) < 10 ? 2 : 1);
  const isLong = () => !INTS[state.int].live && state.int !== '30m';  // points are days, weeks or months
  // a point's name: short for the hover chip, long for the summary heading
  function chip(j) {
    const p = lp(V.t[j]);
    return { '1d': `${DOW[p.dow]} ${p.dom} ${MON[p.mon]} ${p.y}`, '1w': `w/c ${p.dom} ${MON[p.mon]} ${p.y}`, '1mo': `${MON[p.mon]} ${p.y}`, '1yr': `${p.y}` }[state.int]
      || `${DOW[p.dow]} ${p.dom} ${MON[p.mon]}${state.end != null && p.y !== lp(models.live.END).y ? ' ' + p.y : ''}, ${clock(p)}`;
  }
  // the live week's interpolated intervals, named in the summary heading: " · interpolated" for a 5-minute point,
  // " · 2 of 6 interpolated" (5-minute intervals) for a half-hour of the live week (history's half-hours average what was published)
  function filledNote(t) {
    const F = models.live.filled;
    if (!F || !F.size) return '';
    if (state.int === '5m') return F.has(t) ? ' · interpolated' : '';
    if (state.kind !== 'live' && !(t >= models.live.t[0])) return '';
    let k = 0;
    for (let i = 0; i < 6; i++) if (F.has(t + i * 3e5)) k++;
    return k === 6 ? ' · interpolated' : k ? ` · ${k} of 6 interpolated` : '';
  }
  // a partial first or last period: what the faded part of the generation chart is
  function partialNote(j) {
    if (!isLong() || !V.n) return '';
    const word = { '1d': 'day', '1w': 'week', '1mo': 'month', '1yr': 'year' }[state.int] || 'period';
    const rate = energyMode() ? `, drawn at its rate ${j === V.n - 1 && V.partialCut ? 'over the days shown' : 'so far'} for a whole ${word}` : '';
    if (j === V.n - 1 && V.partial) return `Partial ${word}: ${partialTo()}${rate}`;
    if (j === 0 && V.partialFirst) { const p = lp(V.t[0]); return `Partial ${word}: from ${p.dom} ${MON[p.mon]} ${p.y}${rate}`; }
    return '';
  }
  // where the last period's data stops: the newest data, or the end of a past window
  const partialTo = () => { const p = lp(V.partialTo); return `to ${p.dom} ${MON[p.mon]}${V.partialCut ? ' ' + p.y : ''}`; };
  function heading(j) {
    const p = lp(V.t[j]), last = j === V.n - 1 && V.partial;
    // in the energy view generation is the period's total, so the heading names the period rather than an average
    const per = (word, avg, avgSoFar) => energyMode() ? (last ? (V.partialCut ? `the part of the ${word} shown` : `the ${word} so far`) : `the whole ${word}`)
      : (last ? (V.partialCut ? `average over the part shown` : avgSoFar) : avg);
    const h = {
      '1d': [`${DOW[p.dow]} ${p.dom} ${MON[p.mon]} ${p.y}`, per('day', 'daily average', 'daily average so far')],
      '1w': [`Week of ${p.dom} ${MON[p.mon]} ${p.y}`, per('week', 'weekly average', 'average for the week so far')],
      '1mo': [`${MONTH[p.mon]} ${p.y}`, per('month', 'monthly average', 'average for the month so far')],
      '1yr': [`${p.y}`, per('year', 'yearly average', 'average for the year so far')],
    }[state.int];
    return h || [clock(p), `${dayLbl(p)} · TP ${tp(p)} · ${state.int === '5m' ? '5-minute' : 'half-hour average'}${filledNote(V.t[j])}`];
  }

  // ---------- time axis: ticks, labels and the vertical lines at day, week, month or year boundaries ----------
  // a zoomed view is marked like the range nearest its length; under a day and a half, by its own clock step
  function zoomMarks(v) {
    const h = (v.t[v.n - 1] - v.t[0]) / 36e5;
    if (h <= 36) return { r: 'sub', every: h <= 1.5 ? 15 : h <= 4 ? 30 : h <= 8 ? 60 : h <= 16 ? 120 : 180 };
    return { r: h <= 96 ? '3d' : h <= 240 ? '7d' : h <= 1100 ? '30d' : h <= 9600 ? '1y' : 'all' };
  }
  function marks(v) {
    const out = [], zm = v.zoomed ? zoomMarks(v) : null, r = zm ? zm.r : state.range;
    for (let j = 0; j < v.n; j++) {
      const p = lp(v.t[j]), q = j ? lp(v.t[j - 1]) : null;
      if (r === 'sub') {
        const min = p.h * 60 + p.m;
        if (min % zm.every) continue;
        const midnight = min === 0;
        out.push({ j, line: midnight, strong: midnight, label: midnight ? `${DOW[p.dow]} ${p.dom} ${MON[p.mon]}` : p.m ? clock(p) : hourLbl(p), yr: null });
      } else if (RANGES[r].model === 'live') {
        const every = { '1d': 3, '3d': 6, '7d': 24 }[r];
        if (p.m !== 0 || p.h % every) continue;
        const midnight = p.h === 0;
        // day labels carry the month; past windows from an earlier year also carry the year once (drawAxis)
        out.push({ j, line: midnight, strong: midnight,
                   label: midnight ? `${DOW[p.dow]} ${p.dom} ${MON[p.mon]}` : r === '1d' || (r === '3d' && p.h === 12) ? hourLbl(p) : null,
                   yr: midnight && state.end != null && p.y !== lp(models.live.END).y ? p.y : null });
      } else if (r === '30d') {
        if (!q || p.dom === q.dom) continue;
        const monday = p.dow === 1;
        out.push({ j, line: monday, strong: monday, label: monday ? `${p.dom} ${MON[p.mon]}` : null, yr: monday ? p.y : null });
      } else if (r === '1y') {
        if (!q || p.mon === q.mon) continue;
        out.push({ j, line: true, strong: p.mon === 0, label: p.mon === 0 ? `${MON[p.mon]} ${p.y}` : MON[p.mon] });
      } else {
        if (!q || p.y === q.y) continue;
        // the whole history spans decades: a line each year, labels every 5 years once it covers more than 12
        const span = lp(v.t[v.n - 1]).y - lp(v.t[0]).y, every = span > 12 ? 5 : 1;
        out.push({ j, line: true, strong: p.y % every === 0, label: p.y % every === 0 ? String(p.y) : null });
      }
    }
    return out;
  }

  // ---------- view ----------
  let V;
  function buildView() {
    const R = RANGES[state.range], key = INTS[state.int].key, groups = [], daily = state.kind === 'day';
    let start = 0, stop = M.N;
    if (state.end != null) {
      // [end − range, end); daily points sit at local midnight, which moves an hour at the clock changes
      stop = firstAtOrAfter(M.t, state.end);
      // whole local days back, so a clock change inside the window doesn't add an hour of the day before (CHT-10)
      start = firstAtOrAfter(M.t, addDays(state.end, -R.days) - (daily ? 2 * 36e5 : 0));
    } else if (state.kind === 'live') start = Math.max(0, M.N - R.n);
    else if (R.days) start = firstAtOrAfter(M.t, M.END - R.days * DAY + (daily ? 36e5 : 0));
    // the zoom: part of the window ([zf, zt), times); ignored if it would leave fewer than two points
    let zf = null, zt = null;
    if (state.zoom && stop - start > 2) {
      if (state.zoom.span) { zt = M.t[stop - 1] + M.h[stop - 1] * 36e5; zf = zt - state.zoom.span * 36e5; }
      else { zf = state.zoom.from; zt = state.zoom.to; }
      const a = Math.max(start, firstAtOrAfter(M.t, zf)), b = Math.min(stop, firstAtOrAfter(M.t, zt));
      if (b - a >= 2) { start = a; stop = b; } else zf = zt = null;
    }
    // grouped views start at the first whole day, week or month in the window rather than with a sliver of one
    // (a partial first day's energy, or its average, misleads)
    if (key && start > 0 && zf == null) { let i = start; while (i < stop && key(M.t[i]) === key(M.t[i - 1])) i++; if (i < stop) start = i; }
    if (!key) for (let i = start; i < stop; i++) groups.push([i, i + 1]);
    else for (let a = start, i = start + 1; i <= stop; i++) if (i === stop || key(M.t[i]) !== key(M.t[a])) { groups.push([a, i]); a = i; }
    const n = groups.length;
    // averages weighted by each point's hours (days are 23-25 hours at the daylight-saving changes)
    const hrs = groups.map(([a, b]) => { let h = 0; for (let i = a; i < b; i++) h += M.h[i]; return h; });
    const avg = arr => { const o = new Float64Array(n); groups.forEach(([a, b], j) => { let s = 0; for (let i = a; i < b; i++) s += arr[i] * M.h[i]; o[j] = s / hrs[j]; }); return o; };
    const max = arr => { const o = new Float64Array(n); groups.forEach(([a, b], j) => { let m = -Infinity; for (let i = a; i < b; i++) m = Math.max(m, arr[i]); o[j] = m; }); return o; };
    const S = SRC[state.region];
    const v = { n, avg, t: groups.map(([a]) => M.t[a]), hrs, fuels: {}, zoomed: zf != null };
    FUELS.forEach(f => v.fuels[f.k] = avg(S[f.k]));
    v.metered = avg(S.metered); v.underlying = avg(S.underlying); v.tiwai = avg(S.tiwai); v.roofU = avg(S.roofU);
    // peak demand and generation: the highest 5-minute or half-hour value, which daily history keeps alongside its averages
    const pk = M.peak && M.peak[state.region];
    v.pkMet = max(pk ? pk.metered : S.metered);
    v.pkGen = pk ? (pk.gen ? max(pk.gen) : null) : max(genTotal(M, state.region));
    // the last day, week or month is incomplete when it runs up to the newest data, or when the window ends part way
    // through it (a past window on 1 year with weeks or months: owner's report TRK-04, 26 Oct 2026)
    v.partialCut = stop < M.N && isLong() && n > 0 && key(M.t[stop]) === key(v.t[n - 1]);
    v.partial = isLong() && n > 0 && (v.partialCut || (state.end == null && key(M.END + 3e5) === key(v.t[n - 1])));
    v.partialTo = v.partialCut ? M.t[stop - 1] : M.END;
    // the first point is partial when the data starts part way through its period (the history's first year, 1997)
    v.partialFirst = isLong() && n > 0 && start < stop && key(M.t[start] - M.h[start] * 36e5) === key(M.t[start]);
    v.pNI = avg(M.NIs.price); v.pSI = avg(M.SIs.price); v.hvdc = avg(M.hvdcN);
    v.marks = marks(v);
    // geothermal and gas: each plant's own factor (geothermal stations by year, closed gas plants), weighted by its
    // output (emissions.js)
    const own = {};
    for (const k of BY_PLANT) {
      const ps = M.plants.filter(p => p.fuel === k && (state.region === 'NZ' || p.isl === state.region));
      const em = new Float64Array(M.N), mw = new Float64Array(M.N);
      for (const p of ps) for (let i = 0; i < M.N; i++) { const x = p.s[i]; if (x > 0) { mw[i] += x; em[i] += x * plantEf(k, p.name, M.t[i]); } }
      own[k] = { em: avg(em), mw: avg(mw) };
    }
    // the renewable share and emissions intensity leave battery discharge out (as em6 does): that energy was
    // generated, and counted, once already when the battery charged (v.genR: the generation they're shares of)
    v.gen = new Float64Array(n); v.genR = new Float64Array(n); v.co2 = new Float64Array(n); v.ren = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      let tot = 0, base = 0, em = 0, re = 0;
      for (const f of FUELS) {
        if (f.k === 'hvdc') continue;
        const x = v.fuels[f.k][j];
        const o = own[f.k];
        const ef = o && o.mw[j] > 0 ? o.em[j] / o.mw[j] : efAt(f, v.t[j]);
        if (x > 0) { tot += x; if (f.k !== 'batt') { base += x; em += x * ef; if (f.ren) re += x; } }
      }
      v.gen[j] = tot; v.genR[j] = base; v.co2[j] = base ? em / base * 1000 : 0; v.ren[j] = base ? re / base * 100 : 0;
    }
    return v;
  }

  // ---------- drill-down layers: group → fuel → plant → dispatched unit ----------
  const TOP = 7;
  function fuelLayer(k, group) {
    const f = FUEL[k], r = state.region;
    return { id: k, name: k === 'hvdc' ? 'HVDC transfer' : f.name, tok: f.tok, hatch: f.hatch ? k : null, tag: f.tag,
             signed: !!f.signed, s: V.fuels[k], drill: plantsFor(k).length ? { group, fuel: k, plant: null } : null };
  }
  // batteries charging (below zero), for groupings that count their discharge inside a group (Flexibility,
  // Inverter vs synchronous, By owner; owner's call, 30 Oct 2026)
  function chargingLayer() {
    const a = V.fuels.batt, s = new Float64Array(V.n);
    for (let j = 0; j < V.n; j++) s[j] = Math.min(0, a[j]);
    return { ...fuelLayer('batt', null), id: 'batt-c', name: 'Battery charging', signed: true, s };
  }
  function relayer() {
    const r = state.region, d = state.drill, L = [], groups = VIEWS[state.view].groups;
    if (d.plant) {
      const p = plantByName(d.plant), f = FUEL[p.fuel];
      const us = unitsOf(p);
      if (us) us.forEach((u, i) => L.push({ id: u.name, name: unitLabel(u), tok: f.tok, shade: i, signed: !!f.signed, s: V.avg(u.s), cap: u.cap }));
      else L.push({ id: p.name, name: p.name, tok: f.tok, signed: !!f.signed, s: V.avg(p.s), cap: p.cap });
    } else if (d.fuel) {
      const ps = plantsFor(d.fuel), f = FUEL[d.fuel];
      // the largest plants get their own shade of the fuel colour; smaller ones share a muted fill but stay separate layers
      ps.forEach((p, i) => L.push({ id: p.name, name: p.name, tok: f.tok, shade: i < TOP ? i : null, muted: i >= TOP, signed: !!f.signed, s: V.avg(p.s), plant: p,
                                    hatch: p.roof ? 'roof' : null, u: p.roof ? V.avg(p.u) : null, drill: p.roof ? null : { group: d.group, fuel: d.fuel, plant: p.name } }));
    } else if (d.group && setById(d.group)) {
      // a set's plants, each in a shade of its fuel colour, grouped by fuel in the summary
      // a hydro scheme's stations in river order, upstream first; other sets by fuel, then largest first
      const set = setById(d.group), seen = {}, river = p => PLANT_META[p.name]?.river ?? 99;
      const order = set.id.startsWith('s:') && set.id !== 's:Other hydro'
        ? (a, b) => river(a) - river(b)
        : (a, b) => FUELS.findIndex(f => f.k === a.fuel) - FUELS.findIndex(f => f.k === b.fuel) || bySize(a, b);
      for (const p of [...set.plants].sort(order)) {
        const i = seen[p.fuel] = (seen[p.fuel] ?? -1) + 1;
        L.push({ id: 'p:' + p.name, name: p.name, tok: FUEL[p.fuel].tok, shade: i, section: set.fuel ? null : p.fuel, s: V.avg(p.s), plant: p, signed: !!FUEL[p.fuel].signed,
                 drill: { group: d.group, fuel: null, plant: p.name } });
      }
    } else if (d.group) {
      for (const k of groupById(d.group).f) if (present[r].includes(k)) L.push(fuelLayer(k, d.group));
    } else if (VIEWS[state.view].by) {
      const by = VIEWS[state.view].by, sets = V.sets || (V.sets = plantSets());
      const sum = ps => { const o = new Float64Array(V.n); for (const p of ps) { const a = V.avg(p.s), pos = FUEL[p.fuel].signed; for (let j = 0; j < V.n; j++) o[j] += pos ? Math.max(0, a[j]) : a[j]; } return o; };
      const setLayer = (x, shadeIx) => ({ id: x.id, name: x.name, tok: x.tok || FUEL[x.fuel].tok, shade: shadeIx, section: by === 'site' ? x.fuel : null,
                                          s: sum(x.plants), drill: { group: x.id, fuel: null, plant: null }, count: x.plants.length });
      if (by === 'owner') {
        for (const x of sets) L.push(setLayer(x, null));
        if (present[r].includes('roof')) L.push({ ...fuelLayer('roof', null), name: 'Embedded solar (homes, businesses, small farms)' });
      } else {
        for (const f of FUELS) {
          if (!present[r].includes(f.k)) continue;
          if (f.signed) {
            // by site, each battery is a row under its fuel like any other plant, charging below zero (GRP-03)
            if (by === 'site' && f.k === 'batt') plantsFor('batt').forEach((p, i) => L.push({ id: 'p:' + p.name, name: p.name, tok: f.tok, shade: i,
              signed: true, section: f.k, s: V.avg(p.s), plant: p, drill: { group: null, fuel: null, plant: p.name } }));
            continue;
          }
          const mine = sets.filter(x => x.fuel === f.k);
          if (by === 'scheme') { if (f.k === 'hydro') mine.forEach((x, i) => L.push(setLayer(x, i))); continue; }
          if (by === 'site') {
            const small = new Set(mine.flatMap(x => x.plants));
            const ps = plantsFor(f.k).filter(p => !small.has(p));   // largest first (which plants get a row is by output)
            if (!ps.length) { L.push({ ...fuelLayer(f.k, null), section: f.k }); continue; }
            // embedded solar's rows are its islands (as when drilling into it), hatched as an estimate
            if (f.k === 'roof') { ps.forEach((p, i) => L.push({ id: 'p:' + p.name, name: p.name, tok: f.tok, shade: i, section: f.k, s: V.avg(p.s), plant: p, hatch: 'roof', u: V.avg(p.u), drill: null })); continue; }
            ps.forEach((p, i) => L.push({ id: 'p:' + p.name, name: p.name, tok: f.tok, shade: i, section: f.k, s: V.avg(p.s), plant: p,
                                          drill: { group: null, fuel: null, plant: p.name } }));
            for (const x of mine) L.push({ ...setLayer(x, null), light: true });
            continue;
          }
          L.push(fuelLayer(f.k, null));
        }
      }
      if (!hydroOnly()) for (const k of SIGNED) if (present[r].includes(k)) {
        if (k === 'batt' && by === 'site') continue;
        L.push(k === 'batt' && by === 'owner' ? chargingLayer() : fuelLayer(k, null));
      }
    } else if (!groups) {
      for (const k of present[r]) L.push(fuelLayer(k, null));
    } else {
      for (const g of groups) {
        const ks = g.f.filter(k => present[r].includes(k));
        if (!ks.length) continue;
        const s = new Float64Array(V.n);
        for (const k of ks) { const a = V.fuels[k], pos = FUEL[k].signed; for (let j = 0; j < V.n; j++) s[j] += pos ? Math.max(0, a[j]) : a[j]; }
        // a group of several fuels opens onto its fuels; a single-fuel group goes straight to its plants
        const drill = g.f.length > 1 ? { group: g.id, fuel: null, plant: null } : plantsFor(ks[0]).length ? { group: null, fuel: ks[0], plant: null } : null;
        L.push({ id: 'g:' + g.id, name: g.name, tok: g.tok, tag: g.f.length > 1 && ks.includes('roof') ? 'incl. est.' : FUEL[ks[0]].tag, hatch: g.f.length === 1 && FUEL[ks[0]].hatch ? ks[0] : null, signed: false, s, drill });
      }
      // a grouping that counts batteries' discharge in a group shows their charging on its own, below zero
      const battIn = groups.some(g => g.f.includes('batt'));
      for (const k of SIGNED) if (present[r].includes(k)) L.push(k === 'batt' && battIn ? chargingLayer() : fuelLayer(k, null));
    }
    V.layers = L; V.eu = null;
  }
  // A plant's units are its grid connections ("ARI1101": Arapuni, Roxburgh, West Wind) or, for a station shown whole
  // ([plant_groups]: Huntly Rankines, Stratford, Waikaremoana, Te Mihi, Southdown), its register plants. The metered
  // history knows those stations only whole ("Stratford (all units)"), so a range reaching into it shows that row
  // beside the members. Daily history files carry no labels, so they are worked out here.
  const isConn = k => /^[A-Z]{3}\d{4}( |$)/.test(k);
  // "ROX2201" -> "220 kV · ROX2201": the POC code carries the bus voltage
  const busLabel = k => { const poc = k.split(' ')[0]; const kv = parseInt(poc.slice(3, 6), 10); return `${kv} kV · ${poc}`; };
  const SPELLING = { Pirirpaua: 'Piripaua' };   // as in ingest/build_tracker.py
  const unitLabel = u => isConn(u.name) ? busLabel(u.name) : / \(all units\)$/.test(u.name) ? 'Whole station (metered)'
    : SPELLING[u.name] || u.name;
  // Split by grid connection only plants the dispatch data puts on more than one bus. The metered history has more
  // points for some plants, but they are meters, not grid connections: an embedded plant's local network point
  // (Glenbrook's GLN0111, Cobb's STK0661), a connection that moved (Pātea), generator-bus meters (Benmore before 2012)
  // (owner's report, 29 Oct 2026). MULTI_BUS in case the live week has one of them idle on a bus.
  const MULTI_BUS = new Set(['Arapuni', 'Roxburgh', 'West Wind']);
  const byConn = p => p.units.every(u => isConn(u.name));
  function unitsOf(p) {
    if (!p.units) return null;
    if (!byConn(p)) return p.units;
    const live = models.live.plants.some(q => q.name === p.name && q.units && q.units.length > 1 && byConn(q));
    return MULTI_BUS.has(p.name) || live ? p.units : null;
  }
  const unitBy = () => { const p = state.drill.plant && plantByName(state.drill.plant); return !p || !p.units || byConn(p) ? 'grid connection' : p.name === 'Waikaremoana' ? 'station' : 'unit'; };
  const level = () => state.drill.plant ? 'unit' : state.drill.fuel ? 'plant' : state.drill.group ? 'fuel' : 'top';
  function drillTo(d) {
    linked = null; state.drill = d; state.hidden.clear(); state.filter = ''; relayer(); buildSummary(); render(); save(true);
  }
  // a link's drill-down, once its window is built (rebuild); anything that no longer exists is dropped there
  function fromLink(l) {
    const d = { ...TOP_LEVEL };
    if (l.group) {
      const g = (VIEWS[state.view].groups || []).find(x => x.id === l.group) || (V.sets || (V.sets = plantSets())).find(x => slug(x.id.slice(2)) === l.group);
      if (g) d.group = g.id;
    }
    if (l.fuel && FUEL[l.fuel]) d.fuel = l.fuel;
    if (l.plant) { const p = M.plants.find(x => slug(x.name) === l.plant); if (p) d.plant = p.name; }
    return d;
  }
  // the point containing time t, or null
  function pointAt(t) {
    for (let j = V.n - 1; j >= 0; j--) if (V.t[j] <= t) return t < V.t[j] + V.hrs[j] * 36e5 ? j : null;
    return null;
  }

  // ---------- colours ----------
  let C = {}, PAT = {};
  function readColours() {
    const cs = getComputedStyle(document.documentElement);
    for (const t of ['--ink', '--ink-2', '--muted', '--line', '--grid', '--surface', '--accent', '--accent-soft', '--co2', '--p-ni', '--p-si', '--f-coal', '--f-gas', '--f-diesel', '--f-geo', '--f-bio', '--f-waste', '--f-hydro', '--f-wind', '--f-solar', '--f-batt', '--f-hvdc', '--g-fossil', '--g-ren', '--g-fast', '--g-vre', '--g-resid', '--o1', '--o2', '--o3', '--o4', '--o5', '--o6', '--l1', '--l2', '--l3', '--l4', '--l5', '--l6', '--l7', '--l8'])
      C[t] = cs.getPropertyValue(t).trim();
    PAT = {};
    for (const f of FUELS) if (f.hatch) PAT[f.k] = hatchOf(C[f.tok]);
  }
  // diagonal hatching in one colour (estimated series); cached per colour, so shaded layers get their own
  function hatchOf(col) {
    if (PAT[col]) return PAT[col];
    const s = 6, oc = document.createElement('canvas'); oc.width = oc.height = s * 4;
    const x = oc.getContext('2d'); x.scale(4, 4);
    x.globalAlpha = 0.3; x.fillStyle = col; x.fillRect(0, 0, s, s);
    x.globalAlpha = 1; x.strokeStyle = col; x.lineWidth = 1.4;
    x.beginPath(); for (let k = -s; k <= s; k += s) { x.moveTo(k, s); x.lineTo(k + s, 0); } x.stroke();
    return (PAT[col] = oc);
  }
  const alpha = (hex, a) => { const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
  // lightness steps of the fuel hue for plants and units, alternating so neighbours differ
  const SHADE = [0, 15, -13, 26, -22, 8, -6, 20, -17, 4];
  function shade(hex, i) {
    let r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0, l = (mx + mn) / 2;
    if (mx !== mn) { const dd = mx - mn; s = l > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn); h = mx === r ? (g - b) / dd + (g < b ? 6 : 0) : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4; h /= 6; }
    l = Math.max(0.16, Math.min(0.84, l + SHADE[i % SHADE.length] / 100));
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return '#' + [f(h + 1 / 3), f(h), f(h - 1 / 3)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
  }
  // Lines view: fuels and groups keep their own colours. When two to eight lines are shown and some are shades of one
  // fuel (a fuel's plants, sites, a plant's connections) or grey "Other" rows, which are hard to tell apart as thin
  // lines, each line gets a colour from the line palette (--l1..--l8, checked for colour-blind separation in light and
  // dark). A line keeps its colour while others are hidden or shown (SLOT); more than eight keep their fuel shades.
  const LINE_MAX = 8, SLOT = new Map();
  let lineSlots = null;
  function shadesClash(layers) {
    const seen = new Set();
    for (const l of layers) {
      if (l.shade == null && !l.muted) continue;
      const k = l.muted ? 'muted' : l.tok;
      if (seen.has(k)) return true;
      seen.add(k);
    }
    return false;
  }
  function assignLines(layers) {
    lineSlots = null;
    if (state.chart !== 'lines' || layers.length < 2 || layers.length > LINE_MAX || !shadesClash(layers)) { SLOT.clear(); return; }
    const ids = new Set(layers.map(l => l.id));
    for (const id of [...SLOT.keys()]) if (!ids.has(id)) SLOT.delete(id);
    const used = new Set(SLOT.values());
    for (const l of layers) if (!SLOT.has(l.id)) { let k = 0; while (used.has(k)) k++; SLOT.set(l.id, k); used.add(k); }
    lineSlots = SLOT;
  }
  // a layer's colour as drawn: its line colour in the lines view, otherwise its fill
  const lc = l => lineSlots && lineSlots.has(l.id) ? C[`--l${lineSlots.get(l.id) + 1}`] : colourOf(l);
  const colourOf = l => l.muted ? alpha(C['--muted'], 0.5) : l.light ? shade(C[l.tok], 3) : l.shade != null ? shade(C[l.tok], l.shade) : C[l.tok];

  // ---------- chart frame ----------
  // the right margin widens for the price axis when the price is drawn over generation; every chart takes the same
  // margins so their time axes line up
  const PADL = 50, padR = () => state.price ? 50 : 12;
  const FONT = '11px "IBM Plex Mono", ui-monospace, Menlo, monospace';
  let exportScale = 0;   // while drawing a download: at least twice the screen's pixels, so the image is sharp
  // Each chart is drawn once per view into an off-screen copy, its base (fills, lines, axes, labels, highs and lows).
  // Moving the time line only copies the base back and draws the line, dots and time chip over it (paint), so
  // scrubbing a long range on a phone doesn't redraw thousands of points per frame. Each draw function leaves its
  // frame (F) and an `over(ctx, j)` for paint. render() redraws the bases; hover() only repaints.
  const BASE = {};   // canvas id -> { off, dpr, F, over }
  function setup(cv) {
    const dpr = Math.max(exportScale, window.devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const base = BASE[cv.id] || (BASE[cv.id] = { off: document.createElement('canvas') });
    if (base.off.width !== W || base.off.height !== H) { base.off.width = W; base.off.height = H; }
    const ctx = base.off.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    base.dpr = dpr; base.F = null; base.over = null;
    // an enlarged chart (the page's popout) draws its own time axis
    return { ctx, w, h, dpr, base, popped: !!cv.closest('.popped') };
  }
  // the chart on screen: its base, then the time line and whatever the chart marks at the hovered point
  function paint(id) {
    const cv = $(id), b = BASE[id];
    if (!b || !b.F) return;
    const ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(b.off, 0, 0);
    if (state.hover == null || state.hover >= V.n) return;
    ctx.setTransform(b.dpr, 0, 0, b.dpr, 0, 0);
    cursor(ctx, b.F);
    if (b.over) b.over(ctx, state.hover);
  }
  // an enlarged chart has room for about three times as many gridlines
  const ticksFor = (id, n) => ($(id).closest('.popped') ? n * 3 : n);
  function nice(min, max, count) {
    if (max === min) { max += 1; }
    const span = max - min; let step = Math.pow(10, Math.floor(Math.log10(span / count)));
    const e = span / count / step; if (e >= 7.5) step *= 10; else if (e >= 3.5) step *= 5; else if (e >= 1.5) step *= 2;
    const lo = Math.floor(min / step + 1e-9) * step, hi = Math.ceil(max / step - 1e-9) * step, ticks = [];
    for (let v = lo; v <= hi + step * 1e-6; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
    return { lo, hi, ticks };
  }
  function frame(c, dom, tickFmt, opt = {}) {
    const { ctx, w, h } = c;
    const axis = opt.axis || c.popped;
    const top = 8, bottom = h - (axis ? 24 : 6);
    const x0 = PADL, x1 = w - padR(), n = V.n;
    const X = j => x0 + (n <= 1 ? 0 : j / (n - 1)) * (x1 - x0);
    const Y = v => bottom - (v - dom.lo) / (dom.hi - dom.lo) * (bottom - top);
    const Yinv = y => dom.lo + (bottom - y) / (bottom - top) * (dom.hi - dom.lo);
    ctx.font = FONT; ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    const skip = axisUnit(ctx, dom.ticks.map(Y), top, bottom, opt.unit, x0 - 7);
    dom.ticks.forEach((t, i) => {
      const y = Math.round(Y(t)) + 0.5;
      ctx.strokeStyle = t === 0 && dom.lo < 0 ? C['--line'] : C['--grid']; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      if (!skip.has(i)) { ctx.font = FONT; ctx.fillStyle = C['--muted']; ctx.fillText(tickFmt(t), x0 - 7, y); }
    });
    ctx.strokeStyle = C['--line'];
    for (const mk of V.marks) if (mk.line) { const x = Math.round(X(mk.j)) + 0.5; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke(); }
    if (axis) drawAxis(ctx, X, bottom, x0, x1);
    return { X, Y, Yinv, x0, x1, top, bottom };
  }
  // The axis's unit (MW, $/MWh ...) in small type just under its top label, in place of a unit beside the chart's title
  // (owner's call, 29 Oct 2026: tidier on phones). ys: the tick labels' heights; a label the unit would sit on is left
  // out (returned as indexes to skip). x: the labels' edge; align: right for the left axis, left for the right axis.
  const UNIT_FONT = '600 10px "Schibsted Grotesk", system-ui, sans-serif';
  function axisUnit(ctx, ys, top, bottom, unit, x, align = 'right') {
    const skip = new Set();
    if (!unit) return skip;
    let k = -1;
    ys.forEach((y, i) => { if (y >= top - 1 && y <= bottom + 1 && (k < 0 || y < ys[k])) k = i; });
    if (k < 0) return skip;
    const uy = Math.max(ys[k], top + 3) + 12;
    ys.forEach((y, i) => { if (i !== k && Math.abs(y - uy) < 11) skip.add(i); });
    ctx.save(); ctx.font = UNIT_FONT; ctx.fillStyle = C['--muted']; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.fillText(unit, x, uy); ctx.restore();
    return skip;
  }
  function drawAxis(ctx, X, bottom, x0, x1) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.font = FONT;
    let lastX = -1e9, lastYr = null;
    for (const mk of V.marks) {
      const x = X(mk.j);
      ctx.strokeStyle = C['--line']; ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, bottom); ctx.lineTo(Math.round(x) + 0.5, bottom + 4); ctx.stroke();
      if (!mk.label) continue;
      // the year goes on the first label drawn and wherever it changes
      const label = mk.yr != null && mk.yr !== lastYr ? `${mk.label} ${mk.yr}` : mk.label;
      const tw = ctx.measureText(label).width;
      if (x - tw / 2 < lastX + 10 || x - tw / 2 < x0 - 30 || x + tw / 2 > x1 + 10) continue;
      ctx.fillStyle = mk.strong ? C['--ink-2'] : C['--muted'];
      ctx.fillText(label, x, bottom + 7); lastX = x + tw / 2;
      if (mk.yr != null) lastYr = mk.yr;
    }
  }
  function line(ctx, X, Y, arr, color, width = 1.75, dash) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath(); for (let j = 0; j < V.n; j++) { const x = X(j), y = Y(arr[j]); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); ctx.restore();
  }
  function band(ctx, X, Y, lo, hi, fill) {
    ctx.fillStyle = fill; ctx.beginPath();
    for (let j = 0; j < V.n; j++) { const x = X(j), y = Y(hi[j]); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    for (let j = V.n - 1; j >= 0; j--) ctx.lineTo(X(j), Y(lo[j]));
    ctx.closePath(); ctx.fill();
  }
  function area(ctx, X, Y, arr, base, fill) {
    ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(X(0), Y(base));
    for (let j = 0; j < V.n; j++) ctx.lineTo(X(j), Y(arr[j]));
    ctx.lineTo(X(V.n - 1), Y(base)); ctx.closePath(); ctx.fill();
  }
  function cursor(ctx, F) {
    if (state.hover == null) return;
    const x = Math.round(F.X(state.hover)) + 0.5, pin = state.hoverBy === 'pin';
    ctx.strokeStyle = pin ? C['--accent'] : C['--ink-2']; ctx.lineWidth = pin ? 1.5 : 1; ctx.beginPath(); ctx.moveTo(x, F.top); ctx.lineTo(x, F.bottom); ctx.stroke();
  }
  function dot(ctx, x, y, color) {
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = C['--surface']; ctx.stroke();
  }
  // a label in the panel colour's halo, so it reads over lines and fills (as on the Prices tab)
  function haloText(ctx, text, x, y) {
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = C['--surface']; ctx.strokeText(text, x, y);
    ctx.fillStyle = C['--ink-2']; ctx.fillText(text, x, y); ctx.restore();
  }
  // a range's high or low: a dot on the point and a short label ("High $412") with no time, since the cursor's
  // tooltip or time chip gives that. The high's label sits beside the point; the low's above it (a stack's trough
  // has empty space above it, filled area below). Kept inside the plot.
  function extreme(ctx, F, j, v, text, colour, low = false) {
    if (j < 0 || v !== v) return;
    const x = F.X(j), y = F.Y(v);
    ctx.font = FONT; const tw = ctx.measureText(text).width;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    let lx, ly;
    if (low === 'below') { lx = x - tw / 2; ly = y + 12; }   // under a trough below zero
    else if (low) { lx = x - tw / 2; ly = y - 12; }
    else { lx = x + 10 + tw < F.x1 ? x + 9 : x - 9 - tw; ly = y; }
    lx = Math.max(F.x0 + 4, Math.min(F.x1 - tw, lx));
    ly = Math.max(F.top + 6, Math.min(F.bottom - 6, ly));
    haloText(ctx, text, lx, ly);
    dot(ctx, x, y, colour);
  }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  // ---------- charts ----------
  let GEN = null; // last stack geometry, for click-to-drill
  function capacityOf() {
    if (level() !== 'unit') return null;
    const c = V.layers.reduce((a, l) => a + (l.cap || 0), 0);
    return c || plantByName(state.drill.plant).cap || null;
  }
  // % view: each layer as a share of the region's total generation (V.gen: all output, battery discharge included,
  // HVDC and charging left out). Hidden layers leave gaps rather than rescaling the rest, so shares stay true;
  // below the top level the axis fits the drilled layers (wind as a share of all generation, not of wind).
  const pctMode = () => state.unit === 'pct';
  const pctOf = (v, j) => V.gen[j] > 0.5 ? Math.max(0, v) / V.gen[j] * 100 : 0;
  // Energy view: where each point is a day or longer, the generation chart, its tooltip and the summary at a point show
  // energy (average MW × the point's hours) rather than average MW, which reads oddly low for anything that varies
  // through the day (a solar farm's daily average is a fraction of its peak). The unit suits the size: MWh for a plant
  // by the day, GWh for the country by the day or month, TWh by the year. Partial days, weeks and months: the tooltip
  // and summary give the energy so far, but the chart draws the period at its rate so far for a whole period (faded),
  // so it doesn't look as if the data stops part way down (owner's call, Oct 2026).
  const energyMode = () => isLong() && !pctMode();
  function eu() {
    if (!V.eu) {
      let mx = 0;
      for (let j = 0; j < V.n; j++) { let s = 0; for (const l of V.layers) s += Math.max(0, l.s[j]); mx = Math.max(mx, s * V.hrs[j]); }
      V.eu = mx >= 1e7 ? { div: 1e6, unit: 'TWh' } : mx >= 1e4 ? { div: 1e3, unit: 'GWh' } : { div: 1, unit: 'MWh' };
    }
    return V.eu;
  }
  const en = (v, j) => v * V.hrs[j] / eu().div;                       // a point's average MW as energy in the view's unit
  const enFmt = v => { const a = Math.abs(v); return a >= 100 || a === 0 ? fmt(v) : v.toFixed(a >= 10 ? 1 : 2); };
  const genVal = (v, j) => energyMode() ? enFmt(en(v, j)) : fmt(v);  // a generation figure at point j, as the chart shows it
  const genUnit = () => energyMode() ? eu().unit : 'MW';
  // Stacked (the default) or lines (chart=lines): each source as its own line from zero, so plants or fuels can be
  // compared directly (owner's request, 26 Oct 2026). Lines keep the stack's units (MW, energy, %) and its axis rules.
  const linesMode = () => state.chart === 'lines';
  function drawGen() {
    const c = setup($('cv-gen')), { ctx } = c, n = V.n, pct = pctMode(), energy = energyMode(), lines = linesMode();
    const layers = V.layers.filter(l => !state.hidden.has(l.id) && !(pct && l.id === 'hvdc'));
    assignLines(layers); syncSwatches();
    const pos = new Float64Array(n), neg = new Float64Array(n), tops = [];
    // HVDC is signed like the batteries: arriving is stacked on top of the island's generation, leaving goes below zero
    // a partial first or last period, drawn at its rate so far for a period as long as its neighbour's
    const whole = j => energy && n > 1 && ((j === n - 1 && V.partial) ? V.hrs[n - 2] / V.hrs[j] : (j === 0 && V.partialFirst) ? V.hrs[1] / V.hrs[0] : 1);
    let mx = 0, mn = 0;
    for (const l of layers) {
      let a = pct ? Float64Array.from(l.s, pctOf) : energy ? Float64Array.from(l.s, (v, j) => en(v, j) * whole(j)) : l.s;
      if (lines) {
        for (let j = 0; j < n; j++) { const v = a[j]; if (v > mx) mx = v; if (v < mn) mn = v; }
        tops.push({ l, a });
        continue;
      }
      const p0 = Float64Array.from(pos), n0 = Float64Array.from(neg);
      for (let j = 0; j < n; j++) { const v = a[j]; if (v > 0) pos[j] += v; else neg[j] += v; }
      tops.push({ l, p0, p1: Float64Array.from(pos), n0, n1: Float64Array.from(neg) });
    }
    if (!lines) for (let j = 0; j < n; j++) { mx = Math.max(mx, pos[j]); mn = Math.min(mn, neg[j]); }
    const cap = pct || energy ? null : capacityOf();   // nameplate is a MW line, so only on MW views
    if (cap) mx = Math.max(mx, cap * 1.04);
    if (pct) mx = Math.min(mx, 100);  // rounding can push a full stack a hair over 100
    const full = pct && topIsAll() && !lines;  // the whole mix stacked: a fixed 0–100% axis
    let dom = full ? { lo: 0, hi: 100, ticks: [0, 25, 50, 75, 100] } : nice(0, Math.max(mx, pct ? 0.1 : 1), 5);
    if (mn < 0) {
      // below zero (battery charging, HVDC leaving the island): gridlines and labels on both sides when the negative
      // part is big enough to read, otherwise just room for it
      const both = nice(mn, Math.max(mx, pct ? 0.1 : 1), 5), step = both.ticks[1] - both.ticks[0];
      if (-mn >= 0.6 * step) dom = both; else dom.lo = mn * 1.2;
    }
    const F = frame(c, dom, pct ? v => (Number.isInteger(v) ? v : v.toFixed(1)) + '%' : energy ? v => (Math.abs(v - Math.round(v)) < 1e-9 ? fmt(v) : String(+v.toFixed(2))) : v => fmt(v), { axis: true, unit: pct ? '%' : energy ? eu().unit : 'MW' });
    const { X, Y } = F;
    if (lines) {
      // up to eight lines: 2 px with a ring of the panel colour so crossings read; more: thinner, no ring.
      // The first in the list (largest) is drawn last, on top. Embedded solar (estimated) dashed, HVDC dotted.
      const many = tops.length > LINE_MAX;
      for (const T of tops.slice().reverse()) {
        const dash = T.l.hatch ? [5, 3] : T.l.id === 'hvdc' ? [1.5, 3] : null;
        if (!many) line(ctx, X, Y, T.a, C['--surface'], 4);
        line(ctx, X, Y, T.a, lc(T.l), many ? 1.25 : 2, dash);
      }
    } else for (const L of tops) {
      let fill = L.l.hatch ? ctx.createPattern(L.l.shade != null ? hatchOf(colourOf(L.l)) : PAT[L.l.hatch], 'repeat') : colourOf(L.l);
      if (fill && fill.setTransform) fill.setTransform(new DOMMatrix().scale(0.25));
      for (const [b, t] of [[L.p0, L.p1], [L.n0, L.n1]]) {
        let any = false; for (let j = 0; j < n; j++) if (t[j] !== b[j]) { any = true; break; }
        if (!any) continue;
        // HVDC (on top arriving, below zero leaving): lighter than the island's own generation
        ctx.fillStyle = fill; ctx.beginPath(); ctx.globalAlpha = L.l.id === 'hvdc' ? 0.55 : 1;
        for (let j = 0; j < n; j++) { const x = X(j), y = Y(t[j]); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        for (let j = n - 1; j >= 0; j--) ctx.lineTo(X(j), Y(b[j]));
        ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
        // 1px surface gap along the outer edge separates adjacent fills
        ctx.strokeStyle = C['--surface']; ctx.lineWidth = 1;
        ctx.beginPath(); for (let j = 0; j < n; j++) { const x = X(j), y = Y(t[j]); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
      }
    }
    // a period that isn't whole (the one still under way, or the history's first, part year) holds less energy than
    // the rest, so its drop at the end is washed out and labelled rather than read as a fall
    if (energy && n > 1) {
      // the note is in the tooltip and the time chip (partialNote), not on the chart
      const wash = (xa, xb) => {
        ctx.save(); ctx.globalAlpha = 0.6; ctx.fillStyle = C['--surface'];
        ctx.fillRect(xa, F.top, xb - xa, F.bottom - F.top); ctx.restore();
      };
      if (V.partial) wash(X(n - 2), F.x1);
      if (V.partialFirst) wash(F.x0, X(1));
    }
    if (dom.lo < 0) { ctx.strokeStyle = C['--ink-2']; ctx.lineWidth = 1; const y = Math.round(Y(0)) + 0.5; ctx.beginPath(); ctx.moveTo(F.x0, y); ctx.lineTo(F.x1, y); ctx.stroke(); }
    if (cap) {
      const y = Math.round(Y(cap)) + 0.5;
      ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = C['--ink-2']; ctx.lineWidth = 1.25;
      ctx.beginPath(); ctx.moveTo(F.x0, y); ctx.lineTo(F.x1, y); ctx.stroke(); ctx.restore();
      ctx.font = FONT; ctx.fillStyle = C['--ink-2']; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.fillText(`Nameplate ${fmt(cap)} MW`, F.x1, y - 3);
    }
    const P = state.price ? priceOver(ctx, F) : null;
    // the stack's high and low (lines: none, each line's own figures are in the tooltip and the list)
    if (n > 2 && !full && !lines) {
      // a period still in progress (or the history's first, part year) isn't a fair high or low in energy
      const a = energy && V.partialFirst ? 1 : 0, b = energy && V.partial ? n - 1 : n;
      // generation only: HVDC flowing into an island is drawn on the stack but isn't the island's generation.
      // Batteries alone (drilled into battery): net output, so the low is the most charging
      const hv = tops.find(T => T.l.id === 'hvdc');
      const net = tops.length > 0 && tops.every(T => T.l.signed && T.l.id !== 'hvdc');
      const g = net ? pos.map((v, j) => v + neg[j]) : hv ? pos.map((v, j) => v - (hv.p1[j] - hv.p0[j])) : pos;
      let jh = a, jl = a; for (let j = a + 1; j < b; j++) { if (g[j] > g[jh]) jh = j; if (g[j] < g[jl]) jl = j; }
      const val = v => pct ? (v < 10 ? v.toFixed(1) : Math.round(v)) + '%' : energy ? `${enFmt(v)} ${eu().unit}` : `${fmt(v)} MW`;
      // the dot sits on the edge of the generation at that point (its bottom when charging; under any HVDC arriving
      // on top); the label gives the figure
      if (net) {
        if (g[jh] > 0.5) extreme(ctx, F, jh, pos[jh], `High ${val(g[jh])}`, C['--ink']);
        if (g[jl] < -0.5) extreme(ctx, F, jl, neg[jl], `Low ${val(-g[jl])} charging`, C['--ink'], 'below');
      } else if (g[jh] > (energy ? 0 : 0.5)) {
        extreme(ctx, F, jh, g[jh], `High ${val(g[jh])}`, C['--ink']);
        if (g[jl] < g[jh] * 0.98) extreme(ctx, F, jl, g[jl], `Low ${val(g[jl])}`, C['--ink'], true);
      }
    }
    // the amount button says what it shows: MW for 5-minute and half-hourly points, energy (MWh, GWh, TWh) for days and longer
    const amt = $('seg-unit').querySelector('[data-v="mw"]');
    if (amt) { const u = isLong() ? eu().unit : 'MW'; if (amt.textContent !== u) amt.textContent = u; }
    GEN = { F, tops, pos, lines };
    c.base.F = F;
    c.base.over = (ctx, j) => {
      // a dot where the time line crosses each line, and each price
      if (lines && tops.length <= 12) for (const T of tops) dot(ctx, F.X(j), F.Y(T.a[j]), lc(T.l));
      if (P) for (const [, a, col] of P.ser) if (a[j] === a[j]) dot(ctx, F.X(j), P.Y(a[j]), col);
      if (state.hoverBy === 'mouse') return;   // the mouse tooltip shows the time itself
      const lbl = chip(j);
      ctx.font = '600 11px "IBM Plex Mono", ui-monospace, monospace'; const tw = ctx.measureText(lbl).width;
      let x = F.X(j) - tw / 2 - 6; x = Math.max(F.x0, Math.min(F.x1 - tw - 12, x));
      ctx.fillStyle = C['--ink']; roundRect(ctx, x, F.top, tw + 12, 18, 4); ctx.fill();
      ctx.fillStyle = C['--surface']; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(lbl, x + 6, F.top + 9.5);
    };
  }
  // the list's colour squares follow the chart: line colours in the lines view, fills otherwise
  function syncSwatches() {
    for (const l of V.layers) if (l.row) { const c = lc(l); if (l.row.dataset.lc !== c) { l.row.style.setProperty('--c', c); l.row.dataset.lc = c; } }
  }
  // The price over the generation chart (price=on; off unless chosen): the island reference prices, both for New
  // Zealand, the island's own on an island's chart, on a right axis with the Prices tab's spike-proof scale (linear
  // to about $100, compressed above), so a spike doesn't flatten the rest. Owner's call, 29 Oct 2026.
  function priceSeries() {
    const r = state.region, out = [];
    if (r !== 'SI') out.push(['North Island · Haywards', V.pNI, C['--p-ni'], [6, 3]]);
    if (r !== 'NI') out.push(['South Island · Benmore', V.pSI, C['--p-si'], [2, 3]]);
    return out;
  }
  const priceTick = v => (v < 0 ? '−' : '') + '$' + (Math.abs(v) >= 1000 ? Math.abs(v) / 1000 + 'k' : fmt(Math.abs(v)));
  function priceOver(ctx, F) {
    const ser = priceSeries();
    let lo = 0, hi = 0;
    for (const [, a] of ser) for (let j = 0; j < V.n; j++) { const v = a[j]; if (v === v) { if (v < lo) lo = v; if (v > hi) hi = v; } }
    const sc = priceScale('spike', lo, Math.max(hi, 20));
    const top = Math.max(sc.hi, sc.f(sc.ticks[sc.ticks.length - 1]));
    const Y = v => F.bottom - (sc.f(v) - sc.lo) / (top - sc.lo || 1) * (F.bottom - F.top);
    // the right axis: labels only (the gridlines are the MW axis's), with a short tick at each
    ctx.font = FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    // labels that fit (12 px apart), then the unit under the top one
    const shown = []; let last = Infinity;
    for (const t of sc.ticks) { const y = Y(t); if (y < F.top - 1 || y > F.bottom + 1 || last - y < 12) continue; shown.push([t, y]); last = y; }
    const skip = axisUnit(ctx, shown.map(([, y]) => y), F.top, F.bottom, '$/MWh', F.x1 + 7, 'left');
    ctx.font = FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (const [i, [t, y]] of shown.entries()) {
      if (skip.has(i)) continue;
      ctx.strokeStyle = C['--line']; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(F.x1, Math.round(y) + 0.5); ctx.lineTo(F.x1 + 4, Math.round(y) + 0.5); ctx.stroke();
      ctx.fillStyle = C['--muted']; ctx.fillText(priceTick(t), F.x1 + 7, y);
    }
    // Benmore first, so Haywards is on top where they meet (as on the price chart); thin and dashed (Haywards long
    // dashes, Benmore short), each over a ring of the panel colour, so they don't read as generation lines
    for (const [, a, col, dash] of ser.slice().reverse()) for (const [w, s] of [[2.5, C['--surface']], [1.25, col]]) {
      ctx.save(); ctx.strokeStyle = s; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath();
      if (dash) ctx.setLineDash(dash);
      let on = false;
      for (let j = 0; j < V.n; j++) { const v = a[j]; if (v !== v) { on = false; continue; } const x = F.X(j), y = Y(v); on ? ctx.lineTo(x, y) : ctx.moveTo(x, y); on = true; }
      ctx.stroke(); ctx.restore();
    }
    return { Y, ser };
  }
  function layerAt(clientX, clientY) {
    if (!GEN) return null;
    const cv = $('cv-gen'), r = cv.getBoundingClientRect(), j = indexAt(cv, clientX);
    if (GEN.lines) {
      // the line nearest the pointer, within 10 px
      const y = clientY - r.top; let best = null, bd = 10;
      for (const T of GEN.tops) { const d = Math.abs(GEN.F.Y(T.a[j]) - y); if (d < bd) { bd = d; best = T.l; } }
      return best;
    }
    const v = GEN.F.Yinv(clientY - r.top);
    for (const T of GEN.tops) if ((v >= T.p0[j] && v <= T.p1[j] && T.p1[j] > T.p0[j]) || (v <= T.n0[j] && v >= T.n1[j] && T.n1[j] < T.n0[j])) return T.l;
    return null;
  }

  function drawPrice() {
    const c = setup($('cv-price')), { ctx } = c;
    let mx = 0; for (let j = 0; j < V.n; j++) mx = Math.max(mx, V.pNI[j], V.pSI[j]);
    const dom = nice(0, mx * 1.08, ticksFor('cv-price', 3));
    const F = frame(c, dom, v => '$' + fmt(v), { axis: true, unit: '$/MWh' }), { X, Y } = F;
    const r = state.region, aNI = r === 'SI' ? 0.35 : 1, aSI = r === 'NI' ? 0.35 : 1;
    line(ctx, X, Y, V.pSI, alpha(C['--p-si'], aSI));
    line(ctx, X, Y, V.pNI, alpha(C['--p-ni'], aNI));
    // the high of the line in front: the region's island, or for NZ the higher of the two (named, as both are drawn)
    let jm = 0, si = r === 'SI';
    for (let j = 0; j < V.n; j++) {
      if (r !== 'SI' && V.pNI[j] > (si ? V.pSI : V.pNI)[jm]) { jm = j; si = false; }
      if (r !== 'NI' && V.pSI[j] > (si ? V.pSI : V.pNI)[jm]) { jm = j; si = true; }
    }
    const hi = (si ? V.pSI : V.pNI)[jm], who = r === 'NZ' ? (si ? ' · Benmore' : ' · Haywards') : '';
    if (V.n) extreme(ctx, F, jm, hi, `High ${money(hi)}${who}`, si ? C['--p-si'] : C['--p-ni']);
    c.base.F = F; c.base.over = (ctx, j) => { dot(ctx, X(j), Y(V.pSI[j]), alpha(C['--p-si'], aSI)); dot(ctx, X(j), Y(V.pNI[j]), alpha(C['--p-ni'], aNI)); };
  }
  function drawDemand() {
    const c = setup($('cv-demand')), { ctx } = c;
    let mn = Infinity, mx = 0;
    for (let j = 0; j < V.n; j++) { mx = Math.max(mx, V.underlying[j], V.metered[j]); mn = Math.min(mn, V.metered[j]); }
    const dom = nice(mn * 0.95, mx * 1.02, ticksFor('cv-demand', 3));
    const F = frame(c, dom, v => fmt(v), { axis: true, unit: 'MW' }), { X, Y } = F;
    // the embedded solar estimate's uncertainty (± one standard deviation) as a band around the dashed line
    if (V.roofU.some(u => u > 0.5)) band(ctx, X, Y, V.underlying.map((v, j) => v - V.roofU[j]), V.underlying.map((v, j) => v + V.roofU[j]), alpha(C['--ink-2'], 0.22));
    line(ctx, X, Y, V.underlying, C['--ink-2'], 1.5, [4, 3]);
    line(ctx, X, Y, V.metered, C['--ink']);
    c.base.F = F; c.base.over = (ctx, j) => { dot(ctx, X(j), Y(V.underlying[j]), C['--ink-2']); dot(ctx, X(j), Y(V.metered[j]), C['--ink']); };
  }
  function drawHvdc() {
    const c = setup($('cv-hvdc')), { ctx } = c;
    let mn = 0, mx = 0; for (let j = 0; j < V.n; j++) { mn = Math.min(mn, V.hvdc[j]); mx = Math.max(mx, V.hvdc[j]); }
    const dom = nice(mn, mx, ticksFor('cv-hvdc', 2));
    const F = frame(c, dom, v => fmt(v), { axis: true, unit: 'MW' }), { X, Y } = F;
    area(ctx, X, Y, V.hvdc, 0, alpha(C['--f-hvdc'], 0.35));
    line(ctx, X, Y, V.hvdc, C['--f-hvdc'], 1.5);
    ctx.font = FONT; ctx.fillStyle = C['--muted']; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('↑ north', F.x0 + 4, F.top);
    if (dom.lo < 0) { ctx.textBaseline = 'bottom'; ctx.fillText('↓ south', F.x0 + 4, F.bottom); }
    c.base.F = F; c.base.over = (ctx, j) => dot(ctx, X(j), Y(V.hvdc[j]), C['--f-hvdc']);
  }
  function drawCo2() {
    const c = setup($('cv-co2')), { ctx } = c;
    let mx = 0; for (let j = 0; j < V.n; j++) mx = Math.max(mx, V.co2[j]);
    const dom = nice(0, Math.max(mx, 10) * 1.1, ticksFor('cv-co2', 2));
    const F = frame(c, dom, v => fmt(v), { axis: true, unit: 'g/kWh' }), { X, Y } = F;
    area(ctx, X, Y, V.co2, 0, alpha(C['--co2'], 0.28));
    line(ctx, X, Y, V.co2, C['--co2'], 1.5);
    c.base.F = F; c.base.over = (ctx, j) => dot(ctx, X(j), Y(V.co2[j]), C['--co2']);
  }
  function drawRen() {
    const c = setup($('cv-ren')), { ctx } = c;
    let mn = 100; for (let j = 0; j < V.n; j++) mn = Math.min(mn, V.ren[j]);
    const lo = Math.max(0, Math.floor((mn - 4) / 10) * 10);
    const big = !!$('cv-ren').closest('.popped'), st = 100 - lo <= 25 ? 5 : 100 - lo <= 50 ? 10 : 20;
    const dom = { lo, hi: 100, ticks: big ? Array.from({ length: Math.floor((100 - lo) / st) + 1 }, (_, i) => lo + i * st)
      : lo <= 50 ? [lo, 50, 100].filter((v, i, a) => a.indexOf(v) === i) : [lo, Math.round((lo + 100) / 2 / 5) * 5, 100] };
    const F = frame(c, dom, v => v + '%', { axis: true, unit: '%' }), { X, Y } = F;
    area(ctx, X, Y, V.ren, lo, alpha(C['--accent'], 0.14));
    line(ctx, X, Y, V.ren, C['--accent']);
    c.base.F = F; c.base.over = (ctx, j) => dot(ctx, X(j), Y(V.ren[j]), C['--accent']);
  }

  // ---------- summary ----------
  const REGION = { NZ: 'New Zealand', NI: 'North Island', SI: 'South Island' };
  function crumbs() {
    const d = state.drill, parts = [{ label: 'Generation', to: d.group || d.fuel || d.plant ? { ...TOP_LEVEL } : null }];
    if (d.group) parts.push({ label: groupById(d.group).name, to: d.fuel || d.plant ? { group: d.group, fuel: null, plant: null } : null });
    if (d.fuel) parts.push({ label: FUEL[d.fuel].name, to: d.plant ? { group: d.group, fuel: d.fuel, plant: null } : null });
    if (d.plant) parts.push({ label: d.plant, to: null });
    return parts;
  }
  function renderCrumbs() {
    const parts = crumbs(), h = $('gen-title'), d = state.drill;
    h.innerHTML = parts.map((p, i) => (i ? '<span class="sep" aria-hidden="true">›</span>' : '') + (p.to ? `<button type="button" data-i="${i}">${esc(p.label)}</button>` : `<span aria-current="${i === parts.length - 1 ? 'page' : 'false'}">${esc(p.label)}</span>`)).join('');
    h.querySelectorAll('button').forEach(b => b.addEventListener('click', () => drillTo(parts[+b.dataset.i].to)));
    const lv = level();
    const unitTxt = {
      top: { site: 'MW, stacked by site', scheme: 'MW, hydro by scheme', owner: 'MW, stacked by owner' }[VIEWS[state.view].by]
        || (VIEWS[state.view].groups ? 'MW, stacked by group' : 'MW, stacked by fuel'),
      fuel: setById(d.group) ? 'MW, stacked by plant' : 'MW, stacked by fuel', plant: d.fuel === 'roof' ? 'MW, estimated, by island' : 'MW, stacked by plant',
      unit: V.layers.length > 1 ? `MW, by ${unitBy()}` : 'MW',
    }[lv];
    const per = { '1d': 'a day', '1w': 'a week', '1mo': 'a month', '1yr': 'a year' }[state.int];
    // the unit is on the chart's axis; the canvas's description says it in full for screen readers
    const shape = linesMode() ? unitTxt.replace('stacked by', 'by') : unitTxt;
    const unitFull = pctMode() ? shape.replace(/^MW/, '% of all generation') : energyMode() ? shape.replace(/^MW/, `${eu().unit} ${per}`) : shape;
    $('cv-gen').setAttribute('aria-label', (linesMode() ? 'Line chart of generation, one line per source' : 'Stacked area chart of generation') + ` (${unitFull})`
      + (state.price ? ', with wholesale prices in $/MWh on a right axis' : ''));
    $('cv-gen').closest('.chart').classList.toggle('priced', state.price);
    const note = $('gen-note'), txt = NOTES[state.view] || '';
    note.hidden = !txt;
    note.textContent = txt ? txt + ' ' : '';
    if (txt) { const a = document.createElement('a'); a.href = '/methods/groupings#groupings'; a.textContent = 'How the groups are made'; note.append(a); }
    const up = lv !== 'top' ? parts[parts.length - 2] : null;
    $('sum-level').hidden = !up;
    if (up) {
      $('sum-level-txt').textContent = {
        fuel: () => `${groupById(d.group).name}${setById(d.group) ? ' plants' : ''} · ${REGION[state.region]}`,
        plant: () => d.fuel === 'roof' ? `Embedded solar (estimated) · ${REGION[state.region]}` : `${FUEL[d.fuel].name} plants · ${REGION[state.region]}`,
        unit: () => V.layers.length > 1 ? `${d.plant} · by ${unitBy()}` : d.plant,
      }[lv]();
      $('sum-back').textContent = `‹ ${up.label === 'Generation' ? 'All sources' : up.label}`;
      $('sum-back').onclick = () => drillTo(up.to);
    }
    // a plant's other names, and what its metered history counts where that differs from the dispatch data
    const aka = lv === 'unit' ? akaOf(d.plant) : [], metered = lv === 'unit' ? meteredOf(d.plant) : '';
    const pn = $('plant-note');
    pn.hidden = !aka.length && !metered;
    pn.innerHTML = (aka.length ? `<p><b>Also known as</b> ${aka.map(esc).join(', ')}</p>` : '')
      + (metered ? `<p><b>Metered history</b> ${esc(metered)} <a href="/methods/generation#whole">More</a></p>` : '');
  }
  // Long lists (the site view, a fuel's plants) get a filter box; the site view groups its rows under collapsible
  // fuel headings with subtotals. Section headings toggle open; their colour square hides every row in them.
  const norm = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();  // "takapo" finds "Takapō"
  function toggleHidden(ids, tr) {
    const off = !ids.every(id => state.hidden.has(id));
    for (const id of ids) off ? state.hidden.add(id) : state.hidden.delete(id);
    for (const l of V.layers) if (ids.includes(l.id)) { l.row.classList.toggle('off', off); l.row.querySelector('.sw-btn')?.setAttribute('aria-pressed', String(!off)); }
    if (tr) { tr.classList.toggle('off', off); tr.querySelector('.sw-btn').setAttribute('aria-pressed', String(!off)); }
    render();
  }
  // every row's and heading's on/off look from state.hidden (after All, None or Only this)
  function syncHidden() {
    for (const l of V.layers) if (l.row) { const off = state.hidden.has(l.id); l.row.classList.toggle('off', off); l.row.querySelector('button.sw-btn')?.setAttribute('aria-pressed', String(!off)); }
    for (const x of V.sections) if (x.row) { const all = x.members.every(m => state.hidden.has(m.id)); x.row.classList.toggle('off', all); x.row.querySelector('.sw-btn').setAttribute('aria-pressed', String(!all)); }
    syncMixTools();
    render();
  }
  // Only this: hide every other layer; on the layers already shown alone, show everything again
  function onlyThis(ids) {
    const alone = V.layers.every(l => ids.includes(l.id) ? !state.hidden.has(l.id) : state.hidden.has(l.id));
    state.hidden.clear();
    if (!alone) for (const l of V.layers) if (!ids.includes(l.id)) state.hidden.add(l.id);
    syncHidden();
  }
  function syncMixTools() {
    const box = $('mix-tools');
    if (!box) return;
    box.hidden = V.layers.length <= 1;
    $('mix-all').disabled = !V.layers.some(l => state.hidden.has(l.id));
    $('mix-none').disabled = V.layers.every(l => state.hidden.has(l.id));
  }
  // a colour square: click hides or shows; double-click, Shift+click or a long press shows only that row (or section)
  function squareButton(btn, ids, toggle) {
    let held = null, longPressed = false;
    btn.title = 'Hide or show · double-click or press and hold: show only this';
    btn.addEventListener('click', e => {
      if (longPressed) { longPressed = false; return; }
      if (e.shiftKey) onlyThis(ids); else toggle();
    });
    btn.addEventListener('dblclick', e => { e.preventDefault(); onlyThis(ids); });
    btn.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse') return;
      clearTimeout(held); held = setTimeout(() => { longPressed = true; onlyThis(ids); navigator.vibrate?.(15); }, 500);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, () => clearTimeout(held));
    btn.addEventListener('contextmenu', e => { if (longPressed) e.preventDefault(); });
  }
  function applyFilter() {
    const q = norm(state.filter.trim());
    for (const l of V.layers) {
      const sec = V.sections.find(x => x.members.includes(l));
      // a match on another name shows that name beside the row's ("Stratford (Taranaki Combined Cycle)")
      const alt = q && !norm(l.name).includes(q) ? akaOf(l.name).find(a => norm(a).includes(q)) : null;
      l.row.hidden = q ? !norm(l.name).includes(q) && !alt : !!(sec && sec.row && !state.open.has(sec.id));
      const aka = l.row.querySelector('.aka');
      if (aka) { aka.hidden = !alt; aka.textContent = alt ? `(${alt})` : ''; }
    }
    for (const x of V.sections) {
      if (!x.row) continue;
      x.row.hidden = !!q && !x.members.some(l => !l.row.hidden);
      x.row.setAttribute('aria-expanded', String(!!q || state.open.has(x.id)));
    }
  }
  // a row's quantity, share and bar cells, kept so a hover doesn't search the table for them
  const cellsOf = tr => ({ q: tr.querySelector('[data-q]'), s: tr.querySelector('[data-s]'), b: tr.querySelector('[data-b]') });
  function buildSummary() {
    renderCrumbs();
    const body = $('mix-body'); body.innerHTML = '';
    $('col-name').textContent = { top: VIEWS[state.view].by === 'owner' ? 'Owner' : VIEWS[state.view].by === 'site' ? 'Site' : 'Source',
      fuel: setById(state.drill.group) ? 'Plant' : 'Fuel', plant: state.drill.fuel === 'roof' ? 'Island' : 'Plant', unit: V.layers.length > 1 ? 'Connection' : 'Plant' }[level()];
    const canHide = V.layers.length > 1;
    V.sections = [];
    let cur = null;
    for (const l of V.layers) {
      // a fuel heading before the first row of each section with more than one row
      if (l.section && (!cur || cur.id !== l.section)) {
        cur = { id: l.section, name: FUEL[l.section].name, tok: FUEL[l.section].tok, hatch: FUEL[l.section].hatch, members: V.layers.filter(m => m.section === l.section) };
        V.sections.push(cur);
        // a heading for each fuel with sites under it, even a single site (Diesel › Whirinaki)
        if (cur.members.length > 1 || cur.members[0].plant) {
          const x = cur, tr = document.createElement('tr');
          tr.className = 'sec'; tr.style.setProperty('--c', C[x.tok]);
          const ids = x.members.map(m => m.id);
          if (ids.every(id => state.hidden.has(id))) tr.classList.add('off');
          tr.innerHTML = `<td><div class="row-name"><button type="button" class="sw-btn" aria-pressed="${!ids.every(id => state.hidden.has(id))}" aria-label="Show ${esc(x.name)} in the chart"><span class="sw${x.hatch ? ' hatch' : ''}"></span></button><button type="button" class="sec-btn" aria-label="${esc(x.name)}: show or hide its ${x.members.length} rows">${esc(x.name)} <span class="cnt">${x.members.length}</span></button></div></td><td class="n" data-q></td><td class="n"><div class="share"><span data-s></span><span class="bar" data-b></span></div></td>`;
          squareButton(tr.querySelector('.sw-btn'), ids, () => { toggleHidden(ids, tr); syncMixTools(); });
          tr.querySelector('.sec-btn').addEventListener('click', () => { state.open.has(x.id) ? state.open.delete(x.id) : state.open.add(x.id); applyFilter(); });
          x.row = tr; x.cells = cellsOf(tr);
          body.appendChild(tr);
        }
      } else if (!l.section) cur = null;
      const tr = document.createElement('tr'); tr.style.setProperty('--c', colourOf(l));
      if (state.hidden.has(l.id)) tr.className = 'off';
      if (cur && cur.row) tr.classList.add('in-sec');
      const nameHtml = `${esc(l.name)}${akaOf(l.name).length ? ' <span class="aka" hidden></span>' : ''}${l.tag ? ` <span class="tag">${l.tag}</span>` : ''}`;
      tr.innerHTML = `<td><div class="row-name">${canHide ? `<button type="button" class="sw-btn" aria-pressed="${!state.hidden.has(l.id)}" aria-label="Show ${esc(l.name)} in the chart"><span class="sw${l.hatch ? ' hatch' : ''}"></span></button>` : `<span class="sw-btn"><span class="sw"></span></span>`}${l.drill ? `<button type="button" class="drill">${nameHtml}</button>` : `<span class="nm">${nameHtml}</span>`}</div></td><td class="n" data-q></td><td class="n"><div class="share"><span data-s></span><span class="bar" data-b></span></div></td>`;
      if (canHide) squareButton(tr.querySelector('.sw-btn'), [l.id], () => {
        toggleHidden([l.id]);
        const x = V.sections.find(sec => sec.members.includes(l));
        if (x && x.row) { const all = x.members.every(m => state.hidden.has(m.id)); x.row.classList.toggle('off', all); x.row.querySelector('.sw-btn').setAttribute('aria-pressed', String(!all)); }
        syncMixTools();
      });
      if (l.drill) tr.querySelector('.drill').addEventListener('click', () => drillTo(l.drill));
      l.row = tr; l.cells = cellsOf(tr);
      body.appendChild(tr);
    }
    const f = $('mix-filter');
    f.hidden = V.layers.length <= 12;
    f.value = state.filter;
    f.placeholder = `Filter ${V.layers.length} ${VIEWS[state.view].by === 'site' && level() === 'top' ? 'sites' : 'rows'}`;
    applyFilter();
    syncMixTools();
  }
  const setSys = rows => { $('sys').innerHTML = rows.filter(Boolean).map(([k, v, s]) => `<dt>${k}</dt><dd>${v}${s ? `<small>${s}</small>` : ''}</dd>`).join(''); };
  const hvTxt = v => Math.abs(v) < 1 ? '0' : `${fmt(Math.abs(v))}`;
  const hvDir = v => Math.abs(v) < 1 ? '' : v > 0 ? 'MW north' : 'MW south';
  const signedTxt = (l, v, range) => range ? (l.id === 'hvdc' ? (v >= 0 ? 'net in' : 'net out') : 'net')
    : l.id === 'hvdc' ? (Math.abs(v) < 1 ? '—' : v > 0 ? 'import' : 'export') : (Math.abs(v) < 1 ? 'idle' : v > 0 ? 'output' : 'charging');
  function totalLabel() {
    const lv = level(), d = state.drill;
    return lv === 'top' ? (hydroOnly() ? 'Total hydro' : 'Total generation') : lv === 'fuel' ? `Total ${groupById(d.group).name.toLowerCase()}`
      : lv === 'plant' ? `Total ${FUEL[d.fuel].name.toLowerCase()}` : `Total ${d.plant}`;
  }
  function plantRows(range, j) {
    if (level() !== 'unit') return [];
    const p = plantByName(state.drill.plant), cap = capacityOf();
    const rows = [['Grid connection', esc(p.poc.join(', ')), ''], cap && ['Nameplate capacity', fmt(cap), 'MW']];
    if (range) {
      let e = 0, h = 0; for (let i = 0; i < V.n; i++) { e += V.layers.reduce((a, l) => a + l.s[i], 0) * V.hrs[i]; h += V.hrs[i]; }
      if (cap) rows.push(['Capacity factor', (e / (cap * h) * 100).toFixed(1) + '%', 'this range']);
    } else if (cap) {
      const v = V.layers.reduce((a, l) => a + l.s[j], 0);
      rows.push(['Output vs nameplate', (v / cap * 100).toFixed(0) + '%', '']);
    }
    return rows;
  }

  function updateSummary() {
    const j = state.hover, r = state.region, layers = V.layers;
    $('tot-lbl').textContent = totalLabel();
    if (j == null) {
      const R = RANGES[state.range], p0 = lp(V.t[0] ?? M.END);
      if (V.zoomed) {
        const z = zoomSpan();
        $('sum-when').textContent = state.zoom.span && state.end == null ? `Last ${state.zoom.span} hour${state.zoom.span > 1 ? 's' : ''}` : zoomWord(z.to - z.from).replace(/^./, c => c.toUpperCase());
        $('sum-sub').textContent = `${zoomText()} · energy and averages`;
      } else if (state.end == null) {
        const pe = lp(M.END);
        $('sum-when').textContent = R.span || `Since ${p0.dom} ${MON[p0.mon]} ${p0.y}`;
        $('sum-sub').textContent = `to ${clock(pe)} ${dayLbl(pe)}${R.model === 'live' ? '' : ' ' + pe.y} · energy and averages`;
      } else {
        const pe = lp(state.end - 1), d = p => `${p.dom} ${MON[p.mon]}`;
        $('sum-when').textContent = R.days === 1 ? `${DOW[pe.dow]} ${d(pe)} ${pe.y}` : `${R.label} to ${d(pe)} ${pe.y}`;
        $('sum-sub').textContent = `${R.days === 1 ? 'whole day' : `${d(p0)}${p0.y !== pe.y ? ' ' + p0.y : ''} – ${d(pe)}`} · energy and averages`;
      }
      const E = new Map(); let tot = 0;
      for (const l of layers) { let s = 0; for (let i = 0; i < V.n; i++) s += l.s[i] * V.hrs[i]; E.set(l, s / 1000); }
      if (topIsAll()) { for (let i = 0; i < V.n; i++) tot += V.gen[i] * V.hrs[i]; tot /= 1000; }
      else for (const l of layers) tot += l.signed ? E.get(l) : Math.max(0, E.get(l));
      // energy in GWh, or TWh once totals run past 10,000 GWh
      const tw = Math.abs(tot) >= 1e4, en = v => gwh(tw ? v / 1000 : v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      $('col-q').textContent = tw ? 'TWh' : 'GWh';
      for (const x of V.sections) if (x.row) E.set(x, x.members.reduce((a, m) => a + E.get(m), 0));
      for (const l of [...layers, ...V.sections.filter(x => x.row)]) {
        const e = E.get(l);
        l.cells.q.textContent = en(e);
        l.cells.s.textContent = l.signed ? signedTxt(l, e, true) : tot > 0 ? (e / tot * 100).toFixed(1) + '%' : '—';
        l.cells.b.style.transform = `scaleX(${l.signed || tot <= 0 ? 0 : Math.max(0, e / tot)})`;
      }
      $('tot-q').textContent = en(tot); $('tot-s').textContent = layers.some(l => l.signed) && !topIsAll() ? 'net' : '100%';
      let pn = 0, ps = 0, pk = 0, pkg = 0, hv = 0, em = 0, gw = 0, re = 0, hs = 0, mt = 0, ud = 0;
      for (let i = 0; i < V.n; i++) {
        const w = V.hrs[i]; hs += w; pn += V.pNI[i] * w; ps += V.pSI[i] * w; hv += V.hvdc[i] * w; mt += V.metered[i] * w; ud += V.underlying[i] * w;
        pk = Math.max(pk, V.pkMet[i]); if (V.pkGen) pkg = Math.max(pkg, V.pkGen[i]);
        em += V.co2[i] * V.genR[i] * w; re += V.ren[i] * V.genR[i] * w; gw += V.genR[i] * w;
      }
      const hvNet = Math.abs(hv) >= 1e6 ? ['HVDC, net transfer', (Math.abs(hv) / 1e6).toFixed(2), hv >= 0 ? 'TWh north' : 'TWh south']
        : ['HVDC, net transfer', (Math.abs(hv) / 1000).toFixed(1), hv >= 0 ? 'GWh north' : 'GWh south'];
      setSys([
        ...plantRows(true),
        ['Price, North Island', money(pn / hs), 'avg'],
        ['Price, South Island', money(ps / hs), 'avg'],
        ['Peak demand, metered', fmt(pk), 'MW'],
        V.pkGen && ['Peak generation', fmt(pkg), 'MW'],
        hvNet,
        ['Emissions intensity', fmt(em / gw), 'g/kWh'],
        ['Renewable share', (re / gw).toFixed(1) + '%', ''],
      ]);
      for (const id of ['v-gen', 'v-pni', 'v-psi', 'v-met', 'v-und', 'v-hv', 'v-co2', 'v-ren']) $(id).textContent = '';
      // a folded chart's line has no chart to hover, so away from the time line it shows the range's figure
      if (hs > 0 && gw > 0) {
        // "avg"/"net" is its own element, so phones can leave it out (tracker.css); every part is a number we made
        const rest = { price: [['v-pni', 'avg', money(pn / hs)], ['v-psi', 'avg', money(ps / hs)]], demand: [['v-met', 'avg', `${fmt(mt / hs)} MW`], ['v-und', 'avg', `${fmt(ud / hs)} MW`]],
          hvdc: [['v-hv', 'net', `${hvNet[1]} ${hvNet[2]}`]], co2: [['v-co2', 'avg', `${fmt(em / gw)} g/kWh`]], ren: [['v-ren', 'avg', `${(re / gw).toFixed(1)}%`]] };
        for (const k of state.fold) for (const [id, pre, t] of rest[k] || []) $(id).innerHTML = `<small class="pre">${pre} </small>${esc(t)}`;
      }
      return;
    }
    const [when, sub] = heading(j), long = isLong();
    $('sum-when').textContent = when;
    // a partial last period says where its data stops here too, not only in the mouse tooltip: touch has none (TRK-04)
    $('sum-sub').textContent = j === V.n - 1 && V.partial ? `${sub} · ${partialTo()}` : sub;
    $('col-q').textContent = genUnit();
    let tot = 0;
    if (topIsAll()) tot = V.gen[j]; else for (const l of layers) tot += l.signed ? l.s[j] : Math.max(0, l.s[j]);
    for (const l of [...layers, ...V.sections.filter(x => x.row)]) {
      const v = l.members ? l.members.reduce((a, m) => a + m.s[j], 0) : l.s[j];
      l.cells.q.textContent = genVal(v, j);
      l.cells.s.textContent = l.signed ? signedTxt(l, v, false) : tot > 0.5 ? (v / tot * 100).toFixed(1) + '%' : '—';
      l.cells.b.style.transform = `scaleX(${l.signed || tot <= 0.5 ? 0 : Math.max(0, v / tot)})`;
    }
    $('tot-q').textContent = genVal(tot, j); $('tot-s').textContent = layers.some(l => l.signed) && !topIsAll() ? '' : '100%';
    setSys([
      ...plantRows(false, j),
      ['Price, North Island', money(V.pNI[j]), '/MWh'],
      ['Price, South Island', money(V.pSI[j]), '/MWh'],
      ['Demand, metered', fmt(V.metered[j]), long ? 'MW avg' : 'MW'],
      ['With embedded solar', fmt(V.underlying[j]), long ? 'MW avg' : 'MW'],
      ['Embedded solar (est.)', fmt(V.fuels.roof[j]), (long ? 'MW avg' : 'MW') + (V.roofU[j] > 0.5 ? ` ± ${fmt(V.roofU[j])}` : '')],
      long && ['Peak demand, metered', fmt(V.pkMet[j]), 'MW'],
      long && V.pkGen && ['Peak generation', fmt(V.pkGen[j]), 'MW'],
      ['HVDC', hvTxt(V.hvdc[j]), hvDir(V.hvdc[j])],
      ['Emissions intensity', fmt(V.co2[j]), 'g/kWh'],
      ['Renewable share', V.ren[j].toFixed(1) + '%', ''],
    ]);
    // the figure above the chart is what the chart shows: hidden layers and HVDC left out (the summary keeps the whole)
    let shown = tot;
    if (state.hidden.size || !topIsAll()) { shown = 0; for (const l of layers) if (!state.hidden.has(l.id) && l.id !== 'hvdc') shown += l.signed && !topIsAll() ? l.s[j] : Math.max(0, l.s[j]); }
    $('v-gen').textContent = `${genVal(shown, j)} ${genUnit()}`;
    $('v-pni').textContent = money(V.pNI[j]); $('v-psi').textContent = money(V.pSI[j]);
    // a folded chart has no axis to carry the unit, so its figures say it
    const u = (k, unit) => state.fold.has(k) ? ' ' + unit : '';
    $('v-met').textContent = fmt(V.metered[j]) + u('demand', 'MW'); $('v-und').textContent = fmt(V.underlying[j]) + u('demand', 'MW');
    $('v-hv').textContent = `${hvTxt(V.hvdc[j])}${u('hvdc', 'MW')} ${V.hvdc[j] > 0.5 ? 'north' : V.hvdc[j] < -0.5 ? 'south' : ''}`;
    $('v-co2').textContent = fmt(V.co2[j]) + u('co2', 'g/kWh'); $('v-ren').textContent = V.ren[j].toFixed(1) + '%';
  }

  // ---------- orchestration ----------
  const CHARTS = ['cv-gen', 'cv-price', 'cv-ren', 'cv-demand', 'cv-hvdc', 'cv-co2'];   // page order (the download's too)
  // a folded chart is only its heading (title, ⓘ, the value at the time line), so it isn't drawn or painted until it
  // opens (its ResizeObserver then redraws everything)
  const unfolded = id => id === 'cv-gen' || !state.fold.has(id.slice(3));
  const DRAW = { 'cv-gen': drawGen, 'cv-price': drawPrice, 'cv-demand': drawDemand, 'cv-hvdc': drawHvdc, 'cv-co2': drawCo2, 'cv-ren': drawRen };
  let raf = 0, stale = true;
  function drawAll() { for (const id of CHARTS) if (unfolded(id)) DRAW[id](); }
  const paintAll = () => { for (const id of CHARTS) if (unfolded(id)) paint(id); };
  function schedule() {
    $('sum-pin').hidden = state.hoverBy !== 'pin' || state.hover == null;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { if (stale) { drawAll(); stale = false; } paintAll(); updateSummary(); });
  }
  // render: the view, its layers, units, colours or size changed, so the charts are drawn again
  function render() { stale = true; schedule(); }
  // hover: only the time line moved (pointer, touch, keys, pin); the charts are repainted from their bases
  function hover() { schedule(); }
  const intsFor = (r, kind) => RANGES[r].model === 'live' && kind !== 'live' ? RANGES[r].past : RANGES[r].ints;
  // local midnight at or before t; whole days later or earlier (a day is 23-25 hours at the clock changes)
  const midnightOf = t => { const k = KEY.day(t) * DAY; return k - nzOffset(k - nzOffset(k)); };
  const addDays = (m, k) => midnightOf(m + k * DAY + 3 * 36e5);
  const endOfToday = () => addDays(midnightOf(models.live.END), 1);
  const ymd = t => { const p = lp(t); return `${p.y}-${String(p.mon + 1).padStart(2, '0')}-${String(p.dom).padStart(2, '0')}`; };
  const firstDay = () => history.index?.first ?? Date.UTC(1997, 6, 31, 12);
  // the end (exclusive local midnight, or null for the latest) of range r with moment t near its middle
  function endAround(t, r) {
    const R = RANGES[r];
    if (R.fixed || !R.days) return null;
    let end = addDays(midnightOf(t), Math.ceil(R.days / 2));
    end = Math.max(end, addDays(midnightOf(firstDay()), R.days));
    return end >= endOfToday() ? null : end;
  }
  // a range change that drops a pin offers it back: "Go to 9:25 pm Mon 12 Oct" in the bar
  let offerPin = null, pinAfter = null, shownOffer = null;
  const pinLabel = j => chip(j);
  function showPinGo(o) {
    shownOffer = o;
    const b = $('pin-go');
    b.hidden = !o;
    if (o) { $('pin-go-txt').textContent = o.label; b.title = `Show ${RANGES[state.range].label} around ${o.label}, pinned there`; }
  }
  // a zoom's length and span in words: "2 h 25 min", "1:05 pm – 3:30 pm Mon 19 Oct", "3 Feb – 18 Mar 2026"
  function zoomWord(ms) {
    const h = ms / 36e5;
    if (h >= 48) { const d = Math.round(h / 24); return `${d} days`; }
    const m = Math.round(ms / 6e4), hh = Math.floor(m / 60), mm = m % 60;
    return hh ? (mm ? `${hh} h ${mm} min` : `${hh} hour${hh > 1 ? 's' : ''}`) : `${mm} min`;
  }
  function zoomText() {
    const z = zoomSpan(), a = lp(z.from), b = lp(z.to - (isLong() ? 1 : 0));
    if (isLong()) return `${a.dom} ${MON[a.mon]}${a.y !== b.y ? ' ' + a.y : ''} – ${b.dom} ${MON[b.mon]} ${b.y}`;
    return a.dom === b.dom && a.mon === b.mon ? `${clock(a)} – ${clock(b)} ${dayLbl(a)}` : `${clock(a)} ${dayLbl(a)} – ${clock(b)} ${dayLbl(b)}`;
  }
  function syncControls() {
    const seg = $('seg-int'), ints = intsFor(state.range, state.kind);
    if (seg.dataset.for !== ints.join()) {  // each range offers its own intervals
      seg.innerHTML = ints.map(k => `<button type="button" data-v="${k}">${INTS[k].label}</button>`).join('');
      seg.dataset.for = ints.join();
    }
    // the date control: the chosen range ends on this date (today = the latest data)
    const R = RANGES[state.range], inp = $('in-date'), end = state.end ?? endOfToday();
    // a past day on 1D is that whole day, so the box says "Day" rather than "24 hours ending" (CHT-10)
    $('lb-date').textContent = R.fixed ? 'All data' : state.range === '1d' && state.end != null ? 'Day' : `${R.label} ending`;
    if (inp._sync) inp._sync();   // the calendar button's spoken label follows
    inp.disabled = !!R.fixed;
    inp.style.visibility = R.fixed ? 'hidden' : '';  // All has no end date
    inp.value = R.fixed ? '' : ymd(end - 1);
    inp.min = ymd(firstDay()); inp.max = ymd(models.live.END);
    // zoomed into hours (a span from the 1D menu or a dragged stretch): the boxes give the date and time it ends,
    // and choosing either moves it there
    const tin = $('in-time'), zh = zoomedHours();
    tin.hidden = !zh;
    if (zh) {
      const z = zoomSpan(), [d, hm] = stamp(z.to).split('T');
      $('lb-date').textContent = `${zoomWord(z.to - z.from)} ending`;
      inp.value = d; tin.value = hm;
      inp.max = ymd(models.live.END + 3e5);
    }
    $('btn-latest').hidden = state.end == null;
    // the arrows on the chart and beside the date step by the range
    for (const [p, n] of [['nav-prev', 'nav-next'], ['tb-prev', 'tb-next']]) {
      const prev = $(p), next = $(n);
      if (!prev || !next) continue;
      prev.hidden = next.hidden = !!R.fixed;
      prev.disabled = !R.fixed && end - R.days * DAY <= firstDay();
      next.disabled = state.end == null;
      prev.setAttribute('aria-label', `Previous ${R.label}`); next.setAttribute('aria-label', `Next ${R.label}`);
      prev.title = `Previous ${R.label}`; next.title = state.end == null ? 'Showing the latest data' : `Next ${R.label}`;
    }
    // the 1D button names a span chosen from its menu ("3H"); the chip says what a dragged zoom shows
    const span = state.zoom && state.zoom.span && V && V.zoomed ? state.zoom.span : null;
    const oneDay = $('seg-range').querySelector('[data-v="1d"]');
    oneDay.textContent = span ? `${span}H` : '1D';
    oneDay.title = span ? `Last ${span} hour${span > 1 ? 's' : ''} (select for 24 hours)` : '24 hours';
    for (const b of spanMenu.querySelectorAll('button[data-h]')) b.setAttribute('aria-checked', String(+b.dataset.h === (span ?? (state.range === '1d' ? 24 : 0))));
    const chip = $('zoom-reset'), dragged = !!(state.zoom && !state.zoom.span && V && V.zoomed);
    chip.hidden = !dragged;
    if (dragged) $('zoom-txt').textContent = zoomText();
    if (V && V.zoomed) for (const id of ['nav-prev', 'tb-prev', 'nav-next', 'tb-next']) {
      const b = $(id); if (!b) continue;
      b.hidden = false;
      const z = zoomSpan(), word = zoomWord(z.to - z.from), back = /prev/.test(id);
      b.disabled = back ? z.from - (z.to - z.from) < firstDay() : z.to >= models.live.END + 3e5 - 6e4;
      b.title = back ? `Previous ${word}` : b.disabled ? 'Showing the latest data' : `Next ${word}`;
      b.setAttribute('aria-label', back ? `Previous ${word}` : `Next ${word}`);
    }
    $('sel-region').value = state.region;
    for (const [id, val] of [['seg-range', state.range], ['seg-int', state.int]])
      for (const b of $(id).querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === val));
    $('sel-view').value = state.view; fit($('sel-view'));   // only as wide as the choice (#lib/site/fitselect.js)
    for (const b of $('seg-unit').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === state.unit));
    for (const b of $('seg-chart').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === state.chart));
    $('btn-price').setAttribute('aria-pressed', String(state.price));
    syncFold();
  }
  // the folded charts: the card's class (CSS hides the canvas) and each title button's state
  function syncFold() {
    for (const k of FOLDABLE) {
      const cv = $('cv-' + k), card = cv.closest('.chart'), on = state.fold.has(k), b = card.querySelector('[data-fold]');
      card.classList.toggle('folded', on);
      b.setAttribute('aria-expanded', String(!on));
      b.title = on ? 'Show this chart' : 'Fold this chart to one line';
    }
  }

  // ---------- models: the live week, and history merged with it (loaded when a long range is first chosen) ----------
  // hv: the store's version it was merged from; a model older than the files loaded since is merged again (setView)
  const merge = kind => Object.assign(toModel(history.merged(kind, models.live), models.live.END), { hv: history.version(kind) });
  // the span of history a window [end − range, end) needs (the latest 31 days when end is null)
  const spanFor = (r, end) => { const to = end ?? models.live.END; return [end == null ? to - 31 * DAY : addDays(end, -RANGES[r].days) - DAY, to]; };
  function useModel() {
    const m = models[state.kind];
    if (m !== M) { M = m; derive(); }
  }
  function report(extra = {}) {
    const ix = history.index, kind = state.kind;
    hooks.status?.({ range: state.range, kind, past: state.end != null, loading: false, error: '', liveEnd: models.live.END,
                     histFirst: kind !== 'live' && V && V.n ? V.t[0] : null, histEnd: kind !== 'live' ? Math.min(M.histEnd, (state.end ?? Infinity) - 1) : null,
                     histBuilt: ix && ix.built, ...extra });
  }
  // which data a window needs: the live 5-minute week if it covers it, otherwise half-hourly or daily history
  function kindFor(r, end) {
    const R = RANGES[r];
    if (R.model !== 'live') return R.model;
    if (end == null) return 'live';
    return end - R.days * DAY >= models.live.t[0] - 6e4 ? 'live' : 'hh';
  }
  let pending = 0;
  // keepInt: keep a chosen interval across a range change; wantInt: the interval to open on (from the address);
  // opening: the view a link or this browser's last visit opens on, after which a link's drill-down applies
  async function setView(r, end = state.end, keepInt = false, wantInt = null, opening = false) {
    cancelAnimationFrame(soonRaf); clearTimeout(soonTimer); stepEnd = undefined;   // a queued step or range gives way
    const R = RANGES[r];
    if (!opening) waiting = false;   // the viewer moved on before the linked view loaded: its drill-down applies now
    if (R.fixed || (end != null && end >= endOfToday())) end = null;
    const kind = kindFor(r, end), ticket = ++pending;
    if (kind !== 'live') {
      const [from, to] = spanFor(r, end);
      if (!history.has(kind, from, to) || !models[kind]) {
        report({ range: r, kind, loading: true });
        $('charts').setAttribute('aria-busy', 'true');
        try {
          await history.load(kind, from, to);
          models[kind] = merge(kind);
        } catch (e) {
          if (ticket === pending) report({ error: e.message || String(e) });  // the view stays as it was
          return;
        } finally {
          $('charts').removeAttribute('aria-busy');
        }
        if (ticket !== pending) return;  // another view was chosen while this one loaded
      }
      // files loaded since the model was merged (by the lower cards, or a refresh): merge again so it has them
      if (models[kind].hv !== history.version(kind)) models[kind] = merge(kind);
    }
    if (r !== state.range && !keepInt) state.intPicked = false;   // a new range starts on its default interval
    state.range = r; state.end = end; state.kind = kind;
    const ints = intsFor(r, kind);
    if (wantInt && ints.includes(wantInt)) { state.int = wantInt; state.intPicked = true; }
    if (!state.intPicked || !ints.includes(state.int)) { state.int = R.def && ints.includes(R.def) ? R.def : ints[0]; state.intPicked = false; }
    if (opening) waiting = false;
    useModel(); rebuild();
  }
  // A click on the arrows or a range shows its effect at once (the date box, the pressed button) and the new view is
  // built just after that paint (the next frame, then a task), so the page answers the click straight away. Only the
  // latest queued view is built; quick steps add up through stepEnd, the end the queued step will show.
  let soonRaf = 0, soonTimer = 0, stepEnd;   // stepEnd: undefined when no step is waiting (null is the latest data)
  function soon(fn) {
    cancelAnimationFrame(soonRaf); clearTimeout(soonTimer);
    soonRaf = requestAnimationFrame(() => { soonTimer = setTimeout(fn, 0); });
  }
  const step = dir => {
    const R = RANGES[state.range];
    if (state.zoom && V && V.zoomed) return stepZoom(dir);
    if (R.fixed) return;
    const from = stepEnd !== undefined ? stepEnd : state.end;
    if (dir > 0 && from == null) return;
    let end = addDays(from ?? endOfToday(), dir * R.days);
    if (end >= endOfToday()) end = null;
    stepEnd = end;
    $('in-date').value = ymd((end ?? endOfToday()) - 1);
    soon(() => { const e = stepEnd; stepEnd = undefined; setView(state.range, e); });
  };
  // zoomed, the arrows move the zoom by its own length, into the next window if need be; forward to the latest data
  // a span from the menu becomes "the last N hours" again
  function zoomSpan() { const a = V.t[0], b = V.t[V.n - 1] + V.hrs[V.n - 1] * 36e5; return { from: a, to: b }; }
  function stepZoom(dir) {
    const z = zoomSpan(), len = z.to - z.from, latest = models.live.END + 3e5;
    let from = z.from + dir * len, to = z.to + dir * len;
    if (to >= latest) {
      if (state.end == null && dir > 0) return;
      to = latest; from = to - len;
      state.zoom = state.zoom.span ? { span: state.zoom.span } : { from, to };
      return setView(state.range, null, true);
    }
    if (from < firstDay()) return;
    state.zoom = { from, to };
    const R = RANGES[state.range], wFrom = M.t[0], wEnd = state.end ?? endOfToday(), wStart = R.days ? addDays(wEnd, -R.days) : wFrom;
    if (from >= wStart && to <= wEnd) rebuild();
    else setView(state.range, addDays(midnightOf(to - 1), 1), true);
  }
  function setZoom(z) { state.zoom = z; state.hover = null; state.hoverBy = null; rebuild(); }
  // zoomed into hours on a 5-minute or half-hourly view
  function zoomedHours() { return !!(state.zoom && V && V.zoomed && !isLong()); }
  // the date and time boxes, zoomed: the same length of time, ending at t (snapped to 5 minutes). At or past the newest
  // data a span from the menu (or a stretch as long as one) is "the last N hours" again. The window around it is the day it ends in (or the latest),
  // widened to 3 days when the stretch starts the day before, so none of it is cut off.
  const SPANS = [1, 3, 6, 12];   // the 1D menu's hours (#span-menu)
  function zoomEndAt(t) {
    if (!zoomedHours() || !(t > 0)) return;
    const z = zoomSpan(), len = z.to - z.from, latest = models.live.END + 3e5;
    const to = Math.max(firstDay() + len, Math.min(latest, Math.round(t / 3e5) * 3e5)), from = to - len;
    if (to === latest) {
      // back to the newest data: a length the 1D menu offers is live "last N hours" again
      const span = state.zoom.span || (SPANS.includes(len / 36e5) ? len / 36e5 : null);
      if (span) { state.zoom = { span }; return setView('1d', null, true); }
      state.zoom = { from, to };
      return setView(state.range, null, true);
    }
    state.zoom = { from, to };
    let end = addDays(midnightOf(to - 1), 1);
    if (end >= endOfToday()) end = null;
    const fits = r => from >= (end == null ? latest - RANGES[r].days * DAY : addDays(end, -RANGES[r].days));
    setView(fits(state.range) || !RANGES['3d'] ? state.range : '3d', end, true);
  }
  // A rebuild (a new range, new data) can bring layers the last view didn't have: a plant that didn't run in the live
  // week, or a site moved into or out of "Other ..." in the By site view. state.hidden only lists what was switched off,
  // so these used to come back on and undo "Only this". So picks() keeps each plant's own last state (memo, across
  // rebuilds, while anything is hidden at this drill-down level): a plant's row sets it; an "Other ..." row sets its
  // plants only when it was switched on or off itself (its state differs from what its plants say). keepPicks() then
  // shows a layer if any of its plants was showing, else as the layer was; a layer nothing is known about follows what
  // most of the last view's layers were (off after "Only this", on after hiding a few). If that leaves nothing showing
  // where something was, all show again.
  const plantNames = l => l.plant ? [l.plant.name] : setById(l.id)?.plants.map(p => p.name) ?? [];
  let memo = null;
  function picks() {
    const drill = JSON.stringify(state.drill);
    if (!V || !V.layers || !state.hidden.size) { memo = null; return null; }
    if (!memo || memo.drill !== drill) memo = { drill, plants: new Map() };
    const ids = new Map(), P = memo.plants;
    for (const l of V.layers) {
      const on = !state.hidden.has(l.id), names = plantNames(l);
      ids.set(l.id, on);
      if (names.length === 1) { P.set(names[0], on); continue; }
      const known = names.filter(n => P.has(n));
      if (!known.length || known.some(n => P.get(n)) !== on) { for (const n of names) P.set(n, on); continue; }
      // as its plants say: those not seen on their own row show only if every known one does (no pick inside it)
      const all = known.every(n => P.get(n));
      for (const n of names) if (!P.has(n)) P.set(n, all);
    }
    return { drill, ids };
  }
  function keepPicks(prev) {
    if (!prev) return;
    if (prev.drill !== JSON.stringify(state.drill)) { state.hidden.clear(); memo = null; return; }  // the drill-down was dropped
    const P = memo.plants, was = [...prev.ids.values()], dflt = was.filter(Boolean).length * 2 > was.length;
    let any = false;
    for (const l of V.layers) {
      const known = plantNames(l).filter(n => P.has(n));
      const on = known.length ? known.some(n => P.get(n)) : prev.ids.get(l.id) ?? dflt;
      if (on) state.hidden.delete(l.id); else state.hidden.add(l.id);
      any ||= on;
    }
    if (!any && was.some(Boolean)) { state.hidden.clear(); memo = null; }
  }
  function rebuild() {
    const prev = picks();   // from the outgoing view
    // a pinned time line, or the point a touch or the arrow keys left, stays where it was when the new view still
    // shows that moment (grouping, region, drill-down: owner's report GRP-01, 30 Oct 2026, on a computer and on a
    // phone); anything else that rebuilds starts afresh
    const want = pinAfter; pinAfter = null;
    const keepBy = want != null ? 'pin' : ['pin', 'touch', 'key'].includes(state.hoverBy) ? state.hoverBy : null;
    const pinT = want ?? (keepBy && state.hover != null && V?.t ? V.t[state.hover] : null);
    const pinH = want != null ? 0 : keepBy && state.hover != null && V?.hrs ? V.hrs[state.hover] : 0;
    const offer = offerPin; offerPin = null;
    V = buildView();  // first: the drill-down checks below look at this view's plant sets
    const link = linked && !waiting ? linked : null;
    if (link) state.drill = fromLink(link);
    const d = state.drill;
    if (d.plant) { const p = plantByName(d.plant); if (!p || (state.region !== 'NZ' && p.isl !== state.region)) d.plant = null; }
    if (d.fuel && !plantsFor(d.fuel).length) { d.fuel = null; d.plant = null; }
    if (d.group && !(setById(d.group)?.plants.length || groupById(d.group)?.f?.some(k => present[state.region].includes(k)))) { d.group = null; d.plant = null; }
    relayer(); keepPicks(prev); state.hover = null;
    const pinJ = pinT != null ? pointAt(pinT) : null;
    // kept when the moment is still on screen as the same point or within a longer one (a day, a week); a finer view
    // (a pinned day opened on 5-minute data) drops it rather than pin its first minutes
    if (pinJ != null && (V.t[pinJ] === pinT || V.hrs[pinJ] >= pinH)) { state.hover = pinJ; state.hoverBy = keepBy; }
    else if (keepBy) state.hoverBy = null;
    // a pin a range change didn't keep: offer to go there instead (owner's call ZM-02, 30 Oct 2026)
    showPinGo(offer && state.hoverBy !== 'pin' ? offer : null);
    if (link) {
      linked = null;
      const j = link.t != null ? pointAt(link.t) : null;
      if (j != null) { state.hover = j; state.hoverBy = 'pin'; }   // the summary opens on the linked point, pinned
    }
    syncControls(); buildSummary(); render(); save(); report(); share();
  }
  // Back and Forward between drill-down steps (save(true)): the entry's address says the view
  function onPop() {
    if (location.pathname.replace(/\/$/, '') !== '/tracker') return;   // leaving the page
    const a = readQuery(location.search);
    state.region = a.region || 'NZ';
    state.view = a.by && Object.hasOwn(VIEWS, a.by) ? a.by : 'detailed';
    state.unit = a.unit === 'pct' ? 'pct' : 'mw';
    state.chart = a.chart === 'lines' ? 'lines' : 'stacked';
    state.price = a.price === 'on';
    state.fold = new Set(a.fold ?? FOLD_DEFAULT);
    state.hidden.clear(); state.filter = ''; state.open.clear();
    linked = { group: a.group, fuel: a.fuel, plant: a.plant, t: null }; waiting = false;
    state.zoom = a.zoom || null;
    const range = a.range || '1d', end = a.end ?? null;
    if (range !== state.range || end !== state.end || (a.int && a.int !== state.int)) setView(range, end, !!a.int, a.int || null);
    else rebuild();
  }
  window.addEventListener('popstate', onPop);
  // the page's lower section (src/lib/generation/GenLower.svelte) works from the same window: told on every rebuild
  let lastShared = '';
  // The lower cards are told after the charts above have painted (the next frame, then a task), so a click on the
  // arrows or a range shows its charts at once and the cards follow a moment later; several quick steps tell them once.
  let shareTimer = 0;
  function share() {
    if (!hooks.view || !V || !V.n) return;
    const R = RANGES[state.range], from = V.t[0], to = V.t[V.n - 1] + V.hrs[V.n - 1] * 36e5;
    const key = [state.region, state.range, state.int, state.kind, state.end, from, to, M.END].join('|');
    if (key === lastShared) return;   // grouping, drill-down and hidden layers don't change it
    lastShared = key;
    const w = { region: state.region, range: state.range, label: R.label, days: R.days ?? null, int: state.int, kind: state.kind,
                end: state.end, from, to, M, live: models.live, history };
    clearTimeout(shareTimer);
    requestAnimationFrame(() => { clearTimeout(shareTimer); shareTimer = setTimeout(() => { if (lastShared === key) hooks.view(w); }, 0); });
  }

  $('sel-region').addEventListener('change', e => { if (!['NZ', 'NI', 'SI'].includes(e.target.value)) return; state.region = e.target.value; state.hidden.clear(); rebuild(); });
  $('seg-range').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !Object.hasOwn(RANGES, b.dataset.v)) return;
    if (b.dataset.v === state.range && !state.zoom) return;
    for (const x of $('seg-range').querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
    stepEnd = undefined;
    const r = b.dataset.v;
    // a dragged zoom carries over: the new range is centred on what was zoomed (owner's call ZM-02, 30 Oct 2026);
    // a pinned moment stays pinned if the new range shows it, and otherwise is offered (Go to ...)
    const z = state.zoom && !state.zoom.span && V?.zoomed ? state.zoom : null;
    const pin = !z && state.hoverBy === 'pin' && state.hover != null && V ? { t: V.t[state.hover], label: pinLabel(state.hover) } : null;
    soon(() => {
      state.zoom = null;
      if (z && !RANGES[r].fixed) { setView(r, endAround((z.from + z.to) / 2, r)); return; }
      offerPin = pin; setView(r);
    });
  });
  // Go to the pinned moment the last range change left out: that range around it, pinned there
  $('pin-go').addEventListener('click', () => {
    const o = shownOffer;
    if (!o) return;
    showPinGo(null);
    pinAfter = o.t; setView(state.range, RANGES[state.range].fixed ? null : endAround(o.t, state.range));
  });
  // the menu on 1D: the last hour, 3, 6 or 12 hours of the day (5-minute points), or the whole 24 hours
  const spanMenu = $('span-menu'), spanBtn = $('btn-span');
  const closeSpans = () => { spanMenu.hidden = true; spanBtn.setAttribute('aria-expanded', 'false'); };
  // fixed to the window (the sticky bar clips anything that hangs below it), placed under the button
  const placeSpans = () => { const r = spanBtn.getBoundingClientRect(); spanMenu.style.top = `${r.bottom + 4}px`; spanMenu.style.left = `${Math.max(8, Math.min(window.innerWidth - 170, r.right - 150))}px`; };
  spanBtn.addEventListener('click', e => {
    e.stopPropagation();
    const open = spanMenu.hidden;
    if (open) placeSpans();
    spanMenu.hidden = !open; spanBtn.setAttribute('aria-expanded', String(open));
    if (open) spanMenu.querySelector('[aria-checked="true"], button')?.focus();
  });
  window.addEventListener('scroll', () => { if (!spanMenu.hidden) placeSpans(); }, { passive: true });
  window.addEventListener('resize', () => { if (!spanMenu.hidden) placeSpans(); });
  spanMenu.addEventListener('click', e => {
    const b = e.target.closest('button[data-h]');
    if (!b) return;
    closeSpans();
    const h = +b.dataset.h;
    state.zoom = h < 24 ? { span: h } : null;
    if (h < 24 && state.int !== '5m' && state.range === '1d') { state.int = '5m'; state.intPicked = false; }
    if (state.range === '1d') { state.hover = null; rebuild(); } else setView('1d', state.end);
  });
  spanMenu.addEventListener('keydown', e => { if (e.key === 'Escape') { closeSpans(); spanBtn.focus(); } });
  document.addEventListener('click', e => { if (!spanMenu.hidden && !spanMenu.contains(e.target)) closeSpans(); });
  $('zoom-reset').addEventListener('click', () => setZoom(null));
  onDateSettled($('in-date'), v => {
    if (zoomedHours()) return zoomEndAt(fromStamp(`${v}T${$('in-time').value || '00:00'}`));
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (!m) return;
    const day = midnightOf(Date.UTC(+m[1], +m[2] - 1, +m[3], 12) - 12 * 36e5);  // that date's local midnight
    state.zoom = null; setView(state.range, addDays(day, 1));
  });
  onTimeSettled($('in-time'), v => zoomEndAt(fromStamp(`${$('in-date').value}T${v}`)));
  $('btn-latest').addEventListener('click', () => { if (state.zoom && !state.zoom.span) state.zoom = null; setView(state.range, null); });
  for (const id of ['nav-prev', 'tb-prev']) $(id)?.addEventListener('click', () => step(-1));
  for (const id of ['nav-next', 'tb-next']) $(id)?.addEventListener('click', () => step(1));
  $('sel-view').addEventListener('change', e => {
    if (!Object.hasOwn(VIEWS, e.target.value)) return;
    state.view = e.target.value; state.drill = { ...TOP_LEVEL }; linked = null; state.hidden.clear(); state.filter = ''; state.open.clear(); rebuild();
  });
  $('seg-unit').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !['mw', 'pct'].includes(b.dataset.v) || b.dataset.v === state.unit) return;
    state.unit = b.dataset.v; syncControls(); renderCrumbs(); render(); save();
  });
  $('seg-chart').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !['stacked', 'lines'].includes(b.dataset.v) || b.dataset.v === state.chart) return;
    state.chart = b.dataset.v; syncControls(); renderCrumbs(); render(); save();
  });
  // the price over the generation chart: every chart's right margin changes with it, so all are redrawn
  $('btn-price').addEventListener('click', () => { state.price = !state.price; syncControls(); renderCrumbs(); render(); save(); });
  // a lower chart's title folds it to one line or opens it again (not while it's enlarged)
  for (const b of $('charts-more').querySelectorAll('[data-fold]')) b.addEventListener('click', () => {
    const k = b.dataset.fold;
    if (!FOLDABLE.includes(k) || b.closest('.popped')) return;
    if (state.fold.has(k)) state.fold.delete(k); else state.fold.add(k);
    syncFold(); render(); save();
  });
  $('mix-filter').addEventListener('input', e => { state.filter = e.target.value; applyFilter(); });
  $('mix-all').addEventListener('click', () => { state.hidden.clear(); syncHidden(); });
  $('mix-none').addEventListener('click', () => { for (const l of V.layers) state.hidden.add(l.id); syncHidden(); });
  $('seg-int').addEventListener('click', e => { const b = e.target.closest('button'); if (!b || !intsFor(state.range, state.kind).includes(b.dataset.v)) return; state.int = b.dataset.v; state.intPicked = true; rebuild(); });

  // ---------- pointer and keyboard: one time cursor across both chart panels, a tooltip that follows the mouse ----------
  const boxes = [$('charts'), $('charts-more')];
  const tip = $('tip');
  const indexAt = (cv, clientX) => {
    const r = cv.getBoundingClientRect(), x0 = PADL, x1 = r.width - padR();
    const f = (clientX - r.left - x0) / (x1 - x0);
    return Math.max(0, Math.min(V.n - 1, Math.round(f * (V.n - 1))));
  };
  // the window x of point j on a chart (the inverse of indexAt)
  const xAt = (cv, j) => {
    const r = cv.getBoundingClientRect(), x0 = PADL, x1 = r.width - padR();
    return r.left + x0 + (V.n > 1 ? j / (V.n - 1) : 0) * (x1 - x0);
  };
  const row = (colour, name, value, extra = '', hatch = false) =>
    `<div class="tip-r"><i class="${hatch ? 'hatch' : ''}" style="--c:${colour}"></i><span>${esc(name)}</span><b>${value}</b>${extra ? `<small>${extra}</small>` : ''}</div>`;
  // the generation chart's tooltip: the layer under the pointer (or the total); in the lines view the lines at that
  // time, largest first (up to 8, the one nearest the pointer first)
  function genTip(j, e, head) {
    const mw = isLong() ? 'MW avg' : 'MW';
    if (GEN && GEN.lines) {
      const gu = genUnit(), near = layerAt(e.clientX, e.clientY), shown = GEN.tops.map(T => T.l);
      const val = l => pctMode() && !l.signed ? pctOf(l.s[j], j).toFixed(1) + '%' : genVal(l.s[j], j);
      const extra = l => pctMode() && !l.signed ? 'of all generation' : l.signed ? `${gu} · ${signedTxt(l, l.s[j], false)}` : gu;
      const list = shown.slice().sort((a, b) => b.s[j] - a.s[j]).filter(l => l !== near).slice(0, near ? 7 : 8);
      if (near) list.unshift(near);
      const more = shown.length - list.length;
      return head + list.map(l => row(lc(l), l.name, val(l), extra(l), !!l.hatch)).join('') + (more > 0 ? `<div class="tip-n">and ${more} more in the list</div>` : '');
    }
    const l = layerAt(e.clientX, e.clientY), lv = level();
    let tot = 0;
    if (topIsAll()) tot = V.gen[j]; else for (const x of V.layers) tot += x.signed ? x.s[j] : Math.max(0, x.s[j]);
    const gu = genUnit();
    if (!l) return head + row(C['--ink'], totalLabel(), genVal(tot, j), gu);
    const v = l.s[j];
    const uj = l.id === 'roof' ? V.roofU[j] : l.u ? l.u[j] : 0, pm = uj > 0.5 ? ` ± ${fmt(uj)}` : '';
    if (pctMode() && !l.signed) return head + row(colourOf(l), l.name, pctOf(v, j).toFixed(1) + '%', `of all generation · ${fmt(v)} ${mw}${pm}`, !!l.hatch);
    const pmE = energyMode() && uj > 0.5 ? ` ± ${genVal(uj, j)}` : pm;
    const extra = l.signed ? `${gu} · ${signedTxt(l, v, false)}` : `${gu}${pmE}${tot > 0.5 ? ` · ${(v / tot * 100).toFixed(1)}%` : ''}`;
    return head + row(colourOf(l), l.name, genVal(v, j), extra, !!l.hatch);
  }
  const priceRows = j => state.price ? priceSeries().map(([name, a, col]) => row(col, name, a[j] === a[j] ? money(a[j]) : '–', '/MWh')).join('') : '';
  function tipHtml(cv, j, e) {
    const pn = partialNote(j);
    const mw = isLong() ? 'MW avg' : 'MW', head = `<div class="tip-t">${esc(chip(j))}</div>` + (pn ? `<div class="tip-n">${esc(pn)}</div>` : '');
    switch (cv.id) {
      case 'cv-gen': return genTip(j, e, head) + priceRows(j);
      case 'cv-price':
        return head + row(C['--p-ni'], 'North Island · Haywards', money(V.pNI[j]), '/MWh') + row(C['--p-si'], 'South Island · Benmore', money(V.pSI[j]), '/MWh');
      case 'cv-demand':
        return head + row(C['--ink'], 'Metered', fmt(V.metered[j]), mw) + row(C['--ink-2'], 'With embedded solar', fmt(V.underlying[j]), V.roofU[j] > 0.5 ? `${mw} ± ${fmt(V.roofU[j])}` : mw)
          + (isLong() ? row(C['--muted'], 'Peak, metered', fmt(V.pkMet[j]), 'MW') : '');
      case 'cv-hvdc':
        return head + row(C['--f-hvdc'], 'Benmore ⇄ Haywards', hvTxt(V.hvdc[j]), hvDir(V.hvdc[j]));
      case 'cv-co2':
        return head + row(C['--co2'], 'Generation mix', fmt(V.co2[j]), 'g CO₂e/kWh');
      default:
        return head + row(C['--accent'], 'Renewable share', V.ren[j].toFixed(1) + '%');
    }
  }
  function showTip(cv, j, e) {
    tip.innerHTML = tipHtml(cv, j, e);
    tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight, pad = 8;
    let x = e.clientX + 16, y = e.clientY + 16;
    if (x + w > window.innerWidth - pad) x = e.clientX - w - 16;
    if (y + h > window.innerHeight - pad) y = e.clientY - h - 12;
    tip.style.transform = `translate(${Math.max(pad, x)}px, ${Math.max(pad, y)}px)`;
  }
  const hideTip = () => { tip.hidden = true; };
  // drag across a chart with the mouse to zoom into that span (every chart follows); the Reset zoom chip, Escape or a
  // range button goes back. A drag shorter than a few pixels is a click (which pins).
  let drag = null, dragged = false;
  function dragBox(cv) {
    const host = cv.parentElement;
    let el = host.querySelector(':scope > .zoom-sel');
    if (!el) { el = document.createElement('div'); el.className = 'zoom-sel'; el.setAttribute('aria-hidden', 'true'); host.appendChild(el); }
    return el;
  }
  function endDrag(e, apply) {
    if (!drag) return;
    const d = drag; drag = null;
    d.el.hidden = true;
    try { d.cv.releasePointerCapture(e.pointerId); } catch (_) {}
    if (!apply || !d.moved) return;
    dragged = true;
    const j1 = indexAt(d.cv, e.clientX), a = Math.min(d.j0, j1), b = Math.max(d.j0, j1);
    if (b - a < 1) return;
    hideTip();
    setZoom({ from: V.t[a], to: V.t[b] + V.hrs[b] * 36e5 });
  }
  for (const box of boxes) for (const cv of box.querySelectorAll('canvas')) {
    cv.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || V.n < 3) return;
      drag = { cv, x0: e.clientX, j0: indexAt(cv, e.clientX), moved: false, el: dragBox(cv) };
    });
    cv.addEventListener('pointermove', e => {
      if (tap && Math.abs(e.clientX - tap.x0) > 8) tap = null;   // sliding: a scrub, not a tap
      if (drag && drag.cv === cv) {
        if (!drag.moved && Math.abs(e.clientX - drag.x0) > 6) { drag.moved = true; try { cv.setPointerCapture(e.pointerId); } catch (_) {} hideTip(); }
        if (drag.moved) {
          const r = cv.getBoundingClientRect(), host = cv.parentElement.getBoundingClientRect();
          const lo = Math.max(r.left + PADL, Math.min(drag.x0, e.clientX)), hi = Math.min(r.right - padR(), Math.max(drag.x0, e.clientX));
          Object.assign(drag.el.style, { left: `${lo - host.left}px`, width: `${Math.max(0, hi - lo)}px`, top: `${r.top - host.top}px`, height: `${r.height}px` });
          drag.el.hidden = false;
          return;
        }
      }
      if (state.hoverBy === 'pin') return;   // pinned: the line stays put until a click, Release or Escape
      const j = indexAt(cv, e.clientX), by = e.pointerType === 'touch' ? 'touch' : 'mouse';
      if (j !== state.hover || by !== state.hoverBy) { state.hover = j; state.hoverBy = by; hover(); }
      if (by === 'mouse') showTip(cv, j, e);
    });
    cv.addEventListener('pointerleave', hideTip);
    cv.addEventListener('pointerdown', e => {
      downBy = e.pointerType;
      if (state.hoverBy === 'pin' || e.pointerType !== 'touch') return;   // a touch keeps its point; a click pins (below)
      // a touch keeps its point after the finger lifts; a tap on that line (without sliding) lets it go (owner's
      // report CHT-02, 30 Oct 2026: on a phone there was no way to release it)
      tap = state.hoverBy === 'touch' && state.hover != null && Math.abs(e.clientX - xAt(cv, state.hover)) <= TAP_PX ? { x0: e.clientX } : null;
      state.hover = indexAt(cv, e.clientX); state.hoverBy = 'touch'; hover();
    });
    // a click pins the time line there; a click on the pinned point (or next to it) releases it. Drilling down is from
    // the list beside the charts.
    cv.addEventListener('pointerup', e => {
      if (tap && e.pointerType === 'touch') { tap = null; state.hover = null; state.hoverBy = null; hover(); return; }
      endDrag(e, true);
    });
    cv.addEventListener('pointercancel', e => { tap = null; endDrag(e, false); });
    cv.addEventListener('click', e => {
      if (dragged) { dragged = false; return; }   // the end of a zoom drag, not a click
      if (downBy === 'touch') return;
      const j = indexAt(cv, e.clientX);
      hideTip();
      if (state.hoverBy === 'pin' && state.hover != null && Math.abs(j - state.hover) <= 1) { state.hoverBy = 'mouse'; showTip(cv, j, e); }
      else { state.hover = j; state.hoverBy = 'pin'; }
      hover();
    });
  }
  let downBy = '', tap = null;
  const TAP_PX = 18;   // how near the time line a tap must land to let it go
  $('sum-unpin').addEventListener('click', () => { state.hover = null; state.hoverBy = null; hover(); });
  for (const box of boxes) {
    box.addEventListener('pointerleave', e => { hideTip(); if (e.pointerType === 'mouse' && state.hoverBy !== 'pin') { state.hover = null; hover(); } });
    box.addEventListener('keydown', e => {
      if (e.target !== box) return;
      const by = e.shiftKey ? { '5m': 12, '30m': 2, '1d': 7, '1w': 4, '1mo': 12, '1yr': 5 }[state.int] : 1;
      if (state.hoverBy !== 'pin') state.hoverBy = 'key';   // the arrows move a pinned line and keep it pinned
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const cur = state.hover == null ? V.n - 1 : state.hover;
        state.hover = Math.max(0, Math.min(V.n - 1, cur + (e.key === 'ArrowLeft' ? -by : by))); hover();
      } else if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); step(e.key === 'PageUp' ? -1 : 1); }
      else if (e.key === 'Home') { e.preventDefault(); state.hover = 0; hover(); }
      else if (e.key === 'End') { e.preventDefault(); state.hover = V.n - 1; hover(); }
      else if (e.key === 'Escape') {
        if (state.hover == null && state.zoom && !state.zoom.span) { setZoom(null); return; }   // a second Escape leaves a dragged zoom
        state.hover = null; state.hoverBy = null; hover();
      }
    });
  }
  window.addEventListener('scroll', hideTip, { passive: true });

  const updateAsof = () => { const pe = lp(M.END); $('asof').textContent = `Data to ${clock(pe)} ${dayLbl(pe)} ${tzName(M.END)}`; };
  updateAsof();

  const retheme = () => { readColours(); buildSummary(); render(); };
  const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  if (mq) mq.addEventListener('change', retheme);
  const mo = new MutationObserver(retheme);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const ro = new ResizeObserver(() => render());
  for (const box of boxes) ro.observe(box);
  for (const id of CHARTS) ro.observe($(id));   // an enlarged chart changes height without its panel changing width
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fit($('sel-view')); render(); });

  // ---------- for the downloads ----------
  const names = () => ({ plant: state.drill.plant, group: state.drill.group ? groupById(state.drill.group)?.name : null });
  // the dates a view covers, for a file name ("... 24 hours to 18 Oct 2026" rather than "last 24 hours")
  const fixedView = L => { const m = /[?&]end=(\d{4}-\d\d-\d\d)/.exec((L.fixed(false) || {}).url || ''); return { ...shared(), ...ownQuery(), end: m ? addDays(midnightOf(Date.parse(m[1] + 'T12:00:00Z') - 12 * 36e5), 1) : state.end }; };
  // "6:05 pm Sat 17 Oct 2026 to 6:00 pm Sun 18 Oct 2026 NZDT · 5-minute averages"
  function spanText() {
    const a = V.t[0], b = V.t[V.n - 1] + V.hrs[V.n - 1] * 36e5, long = isLong();
    const at = t => { const p = lp(t); return long ? `${p.dom} ${MON[p.mon]} ${p.y}` : `${clock(p)} ${dayLbl(p)} ${p.y}`; };
    const each = { '5m': '5-minute', '30m': 'half-hourly', '1d': 'daily', '1w': 'weekly', '1mo': 'monthly', '1yr': 'yearly' }[state.int];
    return `${at(a)} to ${at(long ? b - 1 : b)}${long ? '' : ' ' + tzName(b)} · ${each} averages`;
  }
  // the generation chart's sources as a legend: the layers shown, in stack order from the top
  // the address a download names: the live view while it's live, otherwise its dates (and a pinned point)
  const viewLink = L => (L.live && L.point == null ? L.live : (L.fixed(L.point != null) || { url: L.live }).url);
  // (lines: the list's order, each as a line); then the prices when they're drawn over it
  const genLegend = () => {
    const ls = V.layers.filter(l => !state.hidden.has(l.id) && !(pctMode() && l.id === 'hvdc'));
    const out = linesMode() ? ls.map(l => ({ name: l.name, colour: lc(l), kind: l.hatch || l.id === 'hvdc' ? 'dash' : 'line' }))
      : ls.slice().reverse().map(l => ({ name: l.name, colour: colourOf(l), kind: 'fill', hatch: !!l.hatch }));
    if (state.price) for (const [name, , col, dash] of priceSeries()) out.push({ name: `Price, ${name} ($/MWh, right axis)`, colour: col, kind: dash ? 'dash' : 'line' });
    return out;
  };

  readColours();
  rebuild();
  if (saved) setView(saved.range, saved.end, true, init.int, true);  // a long range or past date, once its history has loaded

  return {
    // new data: keep the viewer's region, range, interval and drill-down; drop the hover point
    update(D2) {
      models.live = buildModel(D2);
      for (const kind of ['hh', 'day']) if (models[kind]) models[kind] = merge(kind);
      if (state.end == null || state.kind === 'live') state.kind = kindFor(state.range, state.end);
      M = null; useModel(); updateAsof(); rebuild();
      // history gains days a few times a day: refresh what's loaded, at most hourly (history.load checks the age)
      // (a refresh after a history rebuild drops every cached file, so a past window being shown is loaded again too)
      for (const kind of ['hh', 'day']) if (models[kind]) Promise.all([spanFor('30d', null), ...(state.kind === kind && state.end != null ? [spanFor(state.range, state.end)] : [])]
        .map(([a, b]) => history.load(kind, a, b))).then(() => {
        models[kind] = merge(kind);
        if (state.kind === kind) { M = null; useModel(); rebuild(); }
      }).catch(() => {});
    },
    // ---------- downloads (#lib/site/DownloadMenu.svelte, #lib/site/download.js) ----------
    // which: 'gen' (the generation chart) or 'all' (every chart shown: folded ones are left out). Resolves to { blob, name }.
    async image(which) {
      const L = this.links(), views = { ...shared(), ...ownQuery() };
      const ids = which === 'gen' ? ['cv-gen'] : CHARTS.filter(unfolded);
      exportScale = 2; drawAll(); paintAll();   // redraw at double resolution, copy, then back to the screen's own
      try {
        const panels = ids.map(id => {
          const cv = $(id), card = cv.closest('.chart'), src = document.createElement('canvas');
          src.width = cv.width; src.height = cv.height; src.getContext('2d').drawImage(cv, 0, 0);
          const gen = id === 'cv-gen';
          return {
            heading: gen ? $('gen-title').textContent.replace(/›/g, ' › ').replace(/\s+/g, ' ').trim() : card.querySelector('h2').textContent.trim(),
            unit: '',   // each chart carries its unit on its axis
            legend: gen ? (which === 'gen' ? [] : genLegend()) : legendOf(card),
            img: src, w: cv.clientWidth, h: cv.clientHeight,
          };
        });
        const blob = await composeImage({
          title: describe('generation', views, names()), sub: spanText(), legend: which === 'gen' ? genLegend() : [], panels,
          credit: [CREDIT, CREDIT_SOLAR], link: viewLink(L),
        });
        return { blob, name: fileName(describe('generation', fixedView(L)), 'png') };
      } finally { exportScale = 0; render(); }
    },
    // the view's data: every source shown, then prices, demand, HVDC, emissions and renewable share, one row per point
    csv() {
      const L = this.links(), layers = V.layers.filter(l => !state.hidden.has(l.id)), u = isLong() ? 'MW average' : 'MW';
      const f1 = v => Math.round(v * 10) / 10, f2 = v => Math.round(v * 100) / 100;
      // generation in the chart's own unit: energy (MWh, GWh or TWh) for days and longer, as the chart shows it; a
      // partial period's energy is what it generated so far (the chart draws it at its rate for a whole period)
      const energy = isLong(), gu = energy ? eu().unit : 'MW', g = (v, j) => energy ? +en(v, j).toPrecision(6) : f1(v);
      const header = ['start_nz', 'start_utc', ...(energy ? ['hours'] : []), ...layers.map(l => `${l.name} (${gu})`), `${totalLabel()} (${gu})`,
        'Price, North Island, Haywards ($/MWh)', 'Price, South Island, Benmore ($/MWh)', `Demand, metered (${u})`, `Demand with embedded solar (${u})`,
        `HVDC transfer, northward (${u})`, 'Emissions intensity (g CO2e/kWh)', 'Renewable share (%)'];
      const rows = [];
      for (let j = 0; j < V.n; j++) {
        let tot = 0;
        if (topIsAll()) tot = V.gen[j]; else for (const l of layers) tot += l.signed ? l.s[j] : Math.max(0, l.s[j]);
        rows.push([nzTime(V.t[j]), utcTime(V.t[j]), ...(energy ? [f2(V.hrs[j])] : []), ...layers.map(l => g(l.s[j], j)), g(tot, j), f2(V.pNI[j]), f2(V.pSI[j]),
          f1(V.metered[j]), f1(V.underlying[j]), f1(V.hvdc[j]), f1(V.co2[j]), f1(V.ren[j])]);
      }
      const text = csvText([
        `ELENZ: ${describe('generation', { ...shared(), ...ownQuery() }, names())}`,
        `${spanText()}. Times are the start of each interval.` + (energy ? ` Generation is energy in ${gu} over each period ('hours' long; a partial period so far); prices, demand and HVDC are averages.` : ''),
        CREDIT + ' ' + CREDIT_SOLAR, LICENCE,
        'How each series is made: https://elenz.co.nz/methods',
        `This view: ${viewLink(L)}`,
      ], header, rows);
      return { blob: new Blob([text], { type: 'text/csv;charset=utf-8' }), name: fileName(describe('generation', fixedView(L)), 'csv') };
    },
    // the links the Share button offers (#lib/site/ShareLink.svelte): this view, live or fixed to its dates, and the
    // pinned point
    links() {
      // the pinned point, or one chosen with the arrow keys or a touch (not wherever the mouse last passed)
      const R = RANGES[state.range], j = state.hover != null && state.hoverBy !== 'mouse' && V ? state.hover : null;
      return shareLinks('/tracker', { ...shared(), ...ownQuery() }, {
        point: j != null ? V.t[j] : null, pointLabel: j != null ? (isLong() ? heading(j)[0] : chip(j)) : null, tDay: isLong(),
        days: R.fixed ? null : R.days, latestEnd: endOfToday(), zoomAt: V && V.zoomed ? zoomSpan() : null,
      });
    },
    destroy() { window.removeEventListener('popstate', onPop); window.removeEventListener('scroll', hideTip); mo.disconnect(); ro.disconnect(); if (mq) mq.removeEventListener('change', retheme); cancelAnimationFrame(raf); },
  };
}
