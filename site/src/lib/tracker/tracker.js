// Elenz tracker: linked generation, price, demand, HVDC, emissions and renewables charts on one time axis.
// Data: tracker.json built by ingest/build_tracker.py. Drawn on <canvas>; the page supplies the markup (ids below).

import { FUELS } from './fuels.js';
import { efAt, geoEf } from './emissions.js';
import { nzOffset, tzName, KEY, fromLayout, firstAtOrAfter, historyStore, genTotal } from './series.js';
import PLANT_META from './plants.json';
import { readView, writeView } from '#lib/site/view.js';  // owner and hydro scheme per plant (ingest/plant_meta.py)
export { nzOffset, tzName };

// A model: one segment (series.js) plus what the charts read. NIs/SIs are the island series (same objects).
function toModel(S, END) {
  return { ...S, N: S.n, END: END ?? S.t[S.n - 1], NIs: S.NI, SIs: S.SI };
}
export const buildModel = D => toModel(fromLayout(D));

// Ranges: the live week at 5 minutes, then history. Each lists its intervals; the first is the default.
// A range can end at the latest data or on a chosen date (state.end); the arrows step by the range's length.
// Past windows outside the live week come from half-hourly history, so they offer the `past` intervals.
const RANGES = {
  '1d': { model: 'live', n: 288, days: 1, label: '24 hours', ints: ['5m', '30m'], past: ['30m'], span: 'Last 24 hours' },
  '3d': { model: 'live', n: 864, days: 3, label: '3 days', ints: ['5m', '30m'], past: ['30m'], span: 'Last 3 days' },
  '7d': { model: 'live', n: 2016, days: 7, label: '7 days', ints: ['5m', '30m'], past: ['30m', '1d'], span: 'Last 7 days' },
  '30d': { model: 'hh', days: 30, label: '30 days', ints: ['30m', '1d'], span: 'Last 30 days' },
  '1y': { model: 'day', days: 365, label: '1 year', ints: ['1d', '1w', '1mo'], def: '1w', span: 'Last 12 months' },
  'all': { model: 'day', label: 'All', fixed: true, ints: ['1d', '1w', '1mo'], def: '1mo', span: null },
};
const DAY = 864e5;
const INTS = {
  '5m': { label: '5m', key: null, live: true },
  '30m': { label: '30m', key: KEY.hh },
  '1d': { label: 'Day', key: KEY.day },
  '1w': { label: 'Week', key: KEY.week },
  '1mo': { label: 'Month', key: KEY.month },
};

export function mountTracker(D, hooks = {}) {
  const models = { live: buildModel(D), hh: null, day: null };
  const history = historyStore();
  let M = models.live;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const FUEL = Object.fromEntries(FUELS.map(f => [f.k, f]));
  // Source groupings for the generation chart, after Open Electricity's. Each group lists its fuels in stack order.
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
      { id: 'fast', name: 'Fast flexible', tok: '--g-fast', f: ['gas', 'diesel', 'hydro'] },
      VRE('Variable'),
    ] },
    rf: { groups: [REN, FOSSIL('Fossils')] },
    // views built from plants rather than fuels (see plantSets below)
    site: { by: 'site' }, scheme: { by: 'scheme' }, owner: { by: 'owner' },
    // inverter-based generation (wind and solar) against the synchronous machines (hydro, geothermal, thermal)
    vre: { groups: [{ id: 'resid', name: 'Synchronous', tok: '--g-resid', f: ['geo', 'bio', 'waste', 'coal', 'gas', 'diesel', 'hydro'] }, VRE('Inverter-based')] },
  };
  const SIGNED = FUELS.filter(f => f.signed).map(f => f.k);
  // what each grouping shows, in a note under the generation chart
  const NOTES = {
    simple: 'Simplified groups the fuels into five: geothermal; thermal (Huntly\'s coal/gas Rankine units, gas, diesel, bioenergy and waste heat); hydro; wind; and solar, grid-scale and estimated embedded solar together.',
    flex: 'Groups generation by how readily it can follow demand. Inflexible: geothermal, which runs flat out around the clock, and the industrial cogeneration (bioenergy and waste heat), which follows its mill or steelworks. Slow flexible: Huntly\'s coal/gas Rankine units, which take hours to start and ramp slowly. Fast flexible: hydro, gas and diesel, which can change output quickly. Variable: wind and solar, which follow the weather. Grouping is by fuel, so gas cogeneration counts as fast flexible.',
    rf: 'Renewables are geothermal, bioenergy, hydro, wind and solar (grid-scale and estimated embedded solar). Fossils are Huntly\'s coal/gas Rankine units, gas, diesel and waste heat (Glenbrook\'s cogeneration on NZ Steel\'s ironmaking gases, counted as zero emissions because the ironmaking is counted elsewhere). Geothermal counts as renewable, although it emits some CO₂ (each station\'s own figure, about 0.05 t/MWh across the fleet now).',
    vre: 'Inverter-based is wind and solar (grid-scale and estimated embedded solar), connected through power electronics. Synchronous is hydro, geothermal and thermal plant (including bioenergy and waste heat), whose spinning generators add inertia and system strength. Batteries are also inverter-based but are shown separately, because they charge as well as generate.',
    owner: "Owners as of October 2026, from each plant's operator in the EA register (Manawa Energy's stations counted as Contact's). Today's owners are applied to the whole history, so earlier sales and transfers aren't shown.",
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
  const SITE_SHARE = 0.95, SITE_MAX = 12;  // by site: the plants making up 95% of each fuel (at most 12) get their own layer
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
      OWNERS.forEach((o, i) => {
        const ps = regional.filter(p => ownerOf(p) === o);
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
  const plantsFor = (fuel, r = state.region) => (fuel === 'roof' ? roofIslands().filter(p => p.s.some(v => v > 0.5)) : M.plants)
    .filter(p => p.fuel === fuel && (r === 'NZ' || p.isl === r));
  const plantByName = name => M.plants.find(p => p.name === name);

  // intPicked: the viewer chose the interval (shared with the Prices tab); otherwise it's this tab's default for the range
  const state = { region: 'NZ', range: '1d', end: null, kind: 'live', int: '5m', intPicked: false, view: 'detailed', unit: 'mw', hover: null, hoverBy: null,
                  hidden: new Set(), drill: { ...TOP_LEVEL }, open: new Set(), filter: '' };
  // region, range, interval and date: the address first, then this browser's last view (#lib/site/view.js)
  const init = readView();
  state.region = init.region;
  if (init.int && Object.hasOwn(INTS, init.int)) { state.int = init.int; state.intPicked = true; }
  let saved = null;  // a long range or a past date needs history loaded first (see below)
  if (RANGES[init.range].model === 'live' && init.end == null) state.range = init.range;
  else saved = { range: init.range, end: init.end };
  try {
    const s = JSON.parse(localStorage.getItem('elenz-view') || 'null');
    if (s && Object.hasOwn(VIEWS, s.view)) state.view = s.view;
    if (s?.unit === 'pct') state.unit = 'pct';
  } catch (e) {}
  if (!RANGES[state.range].ints.includes(state.int)) { state.int = RANGES[state.range].def || RANGES[state.range].ints[0]; state.intPicked = false; }
  const save = () => writeView({ region: state.region, range: state.range, int: state.intPicked ? state.int : null, end: state.end }, { view: state.view, unit: state.unit });

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
    return { '1d': `${DOW[p.dow]} ${p.dom} ${MON[p.mon]} ${p.y}`, '1w': `w/c ${p.dom} ${MON[p.mon]} ${p.y}`, '1mo': `${MON[p.mon]} ${p.y}` }[state.int]
      || `${DOW[p.dow]} ${p.dom} ${MON[p.mon]}${state.end != null && p.y !== lp(models.live.END).y ? ' ' + p.y : ''}, ${clock(p)}`;
  }
  function heading(j) {
    const p = lp(V.t[j]), last = j === V.n - 1 && V.partial;
    const h = {
      '1d': [`${DOW[p.dow]} ${p.dom} ${MON[p.mon]} ${p.y}`, last ? 'daily average so far' : 'daily average'],
      '1w': [`Week of ${p.dom} ${MON[p.mon]} ${p.y}`, last ? 'average for the week so far' : 'weekly average'],
      '1mo': [`${MONTH[p.mon]} ${p.y}`, last ? 'average for the month so far' : 'monthly average'],
    }[state.int];
    return h || [clock(p), `${dayLbl(p)} · TP ${tp(p)} · ${state.int === '5m' ? '5-minute' : 'half-hour average'}`];
  }

  // ---------- time axis: ticks, labels and the vertical lines at day, week, month or year boundaries ----------
  function marks(v) {
    const out = [], r = state.range;
    for (let j = 0; j < v.n; j++) {
      const p = lp(v.t[j]), q = j ? lp(v.t[j - 1]) : null;
      if (RANGES[r].model === 'live') {
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
        out.push({ j, line: true, strong: true, label: String(p.y) });
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
      start = firstAtOrAfter(M.t, state.end - R.days * DAY - (daily ? 2 * 36e5 : 0));
    } else if (state.kind === 'live') start = Math.max(0, M.N - R.n);
    else if (R.days) start = firstAtOrAfter(M.t, M.END - R.days * DAY + (daily ? 36e5 : 0));
    if (!key) for (let i = start; i < stop; i++) groups.push([i, i + 1]);
    else for (let a = start, i = start + 1; i <= stop; i++) if (i === stop || key(M.t[i]) !== key(M.t[a])) { groups.push([a, i]); a = i; }
    const n = groups.length;
    // averages weighted by each point's hours (days are 23-25 hours at the daylight-saving changes)
    const hrs = groups.map(([a, b]) => { let h = 0; for (let i = a; i < b; i++) h += M.h[i]; return h; });
    const avg = arr => { const o = new Float64Array(n); groups.forEach(([a, b], j) => { let s = 0; for (let i = a; i < b; i++) s += arr[i] * M.h[i]; o[j] = s / hrs[j]; }); return o; };
    const max = arr => { const o = new Float64Array(n); groups.forEach(([a, b], j) => { let m = -Infinity; for (let i = a; i < b; i++) m = Math.max(m, arr[i]); o[j] = m; }); return o; };
    const S = SRC[state.region];
    const v = { n, avg, t: groups.map(([a]) => M.t[a]), hrs, fuels: {} };
    FUELS.forEach(f => v.fuels[f.k] = avg(S[f.k]));
    v.metered = avg(S.metered); v.underlying = avg(S.underlying); v.tiwai = avg(S.tiwai); v.roofU = avg(S.roofU);
    // peak demand and generation: the highest 5-minute or half-hour value, which daily history keeps alongside its averages
    const pk = M.peak && M.peak[state.region];
    v.pkMet = max(pk ? pk.metered : S.metered);
    v.pkGen = pk ? (pk.gen ? max(pk.gen) : null) : max(genTotal(M, state.region));
    // the last day, week or month is incomplete when it runs up to the newest data
    v.partial = state.end == null && isLong() && n > 0 && key(M.END + 3e5) === key(v.t[n - 1]);
    v.pNI = avg(M.NIs.price); v.pSI = avg(M.SIs.price); v.hvdc = avg(M.hvdcN);
    v.marks = marks(v);
    // geothermal: each station's own factor by year, weighted by its output (emissions.js)
    const geo = M.plants.filter(p => p.fuel === 'geo' && (state.region === 'NZ' || p.isl === state.region));
    const gEm = new Float64Array(M.N), gMw = new Float64Array(M.N);
    for (const p of geo) for (let i = 0; i < M.N; i++) { const x = p.s[i]; if (x > 0) { gMw[i] += x; gEm[i] += x * geoEf(p.name, M.t[i]); } }
    const gEmA = avg(gEm), gMwA = avg(gMw);
    v.gen = new Float64Array(n); v.co2 = new Float64Array(n); v.ren = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      let tot = 0, em = 0, re = 0;
      for (const f of FUELS) {
        if (f.k === 'hvdc') continue;
        const x = v.fuels[f.k][j];
        const ef = f.k === 'geo' && gMwA[j] > 0 ? gEmA[j] / gMwA[j] : efAt(f, v.t[j]);
        if (x > 0) { tot += x; em += x * ef; if (f.ren) re += x; }
      }
      v.gen[j] = tot; v.co2[j] = tot ? em / tot * 1000 : 0; v.ren[j] = tot ? re / tot * 100 : 0;
    }
    return v;
  }

  // ---------- drill-down layers: group → fuel → plant → dispatched unit ----------
  const TOP = 7;
  function fuelLayer(k, group) {
    const f = FUEL[k], r = state.region;
    return { id: k, name: k === 'hvdc' ? (r === 'NI' ? 'HVDC import' : 'HVDC export') : f.name, tok: f.tok, hatch: f.hatch ? k : null, tag: f.tag,
             signed: !!f.signed, s: V.fuels[k], drill: plantsFor(k).length ? { group, fuel: k, plant: null } : null };
  }
  function relayer() {
    const r = state.region, d = state.drill, L = [], groups = VIEWS[state.view].groups;
    if (d.plant) {
      const p = plantByName(d.plant), f = FUEL[p.fuel];
      if (p.units) p.units.forEach((u, i) => L.push({ id: u.name, name: busLabel(u.name), tok: f.tok, shade: i, signed: !!f.signed, s: V.avg(u.s), cap: u.cap }));
      else L.push({ id: p.name, name: p.name, tok: f.tok, signed: !!f.signed, s: V.avg(p.s), cap: p.cap });
    } else if (d.fuel) {
      const ps = plantsFor(d.fuel), f = FUEL[d.fuel];
      // the largest plants get their own shade of the fuel colour; smaller ones share a muted fill but stay separate layers
      ps.forEach((p, i) => L.push({ id: p.name, name: p.name, tok: f.tok, shade: i < TOP ? i : null, muted: i >= TOP, signed: !!f.signed, s: V.avg(p.s), plant: p,
                                    hatch: p.roof ? 'roof' : null, u: p.roof ? V.avg(p.u) : null, drill: p.roof ? null : { group: d.group, fuel: d.fuel, plant: p.name } }));
    } else if (d.group && setById(d.group)) {
      // a set's plants, each in a shade of its fuel colour, grouped by fuel in the summary
      // a hydro scheme's stations in river order, upstream first; other sets by fuel, then output over the view
      const set = setById(d.group), seen = {}, river = p => PLANT_META[p.name]?.river ?? 99;
      const order = set.id.startsWith('s:') && set.id !== 's:Other hydro'
        ? (a, b) => river(a) - river(b)
        : (a, b) => FUELS.findIndex(f => f.k === a.fuel) - FUELS.findIndex(f => f.k === b.fuel) || energy(b) - energy(a);
      for (const p of [...set.plants].sort(order)) {
        const i = seen[p.fuel] = (seen[p.fuel] ?? -1) + 1;
        L.push({ id: 'p:' + p.name, name: p.name, tok: FUEL[p.fuel].tok, shade: i, section: set.fuel ? null : p.fuel, s: V.avg(p.s), plant: p,
                 drill: { group: d.group, fuel: null, plant: p.name } });
      }
    } else if (d.group) {
      for (const k of groupById(d.group).f) if (present[r].includes(k)) L.push(fuelLayer(k, d.group));
    } else if (VIEWS[state.view].by) {
      const by = VIEWS[state.view].by, sets = V.sets || (V.sets = plantSets());
      const sum = ps => { const o = new Float64Array(V.n); for (const p of ps) { const a = V.avg(p.s); for (let j = 0; j < V.n; j++) o[j] += a[j]; } return o; };
      const setLayer = (x, shadeIx) => ({ id: x.id, name: x.name, tok: x.tok || FUEL[x.fuel].tok, shade: shadeIx, section: by === 'site' ? x.fuel : null,
                                          s: sum(x.plants), drill: { group: x.id, fuel: null, plant: null }, count: x.plants.length });
      if (by === 'owner') {
        for (const x of sets) L.push(setLayer(x, null));
        if (present[r].includes('roof')) L.push({ ...fuelLayer('roof', null), name: 'Embedded solar (homes, businesses, small farms)' });
      } else {
        for (const f of FUELS) {
          if (f.signed || !present[r].includes(f.k)) continue;
          const mine = sets.filter(x => x.fuel === f.k);
          if (by === 'scheme') { if (f.k === 'hydro') mine.forEach((x, i) => L.push(setLayer(x, i))); continue; }
          if (by === 'site') {
            const small = new Set(mine.flatMap(x => x.plants));
            const ps = plantsFor(f.k).filter(p => !small.has(p)).sort((a, b) => energy(b) - energy(a));
            if (!ps.length || f.k === 'roof') { L.push({ ...fuelLayer(f.k, null), section: f.k }); continue; }
            ps.forEach((p, i) => L.push({ id: 'p:' + p.name, name: p.name, tok: f.tok, shade: i, section: f.k, s: V.avg(p.s), plant: p,
                                          drill: { group: null, fuel: null, plant: p.name } }));
            for (const x of mine) L.push({ ...setLayer(x, null), light: true });
            continue;
          }
          L.push(fuelLayer(f.k, null));
        }
      }
      if (!hydroOnly()) for (const k of SIGNED) if (present[r].includes(k)) L.push(fuelLayer(k, null));
    } else if (!groups) {
      for (const k of present[r]) L.push(fuelLayer(k, null));
    } else {
      for (const g of groups) {
        const ks = g.f.filter(k => present[r].includes(k));
        if (!ks.length) continue;
        const s = new Float64Array(V.n);
        for (const k of ks) { const a = V.fuels[k]; for (let j = 0; j < V.n; j++) s[j] += a[j]; }
        // a group of several fuels opens onto its fuels; a single-fuel group goes straight to its plants
        const drill = g.f.length > 1 ? { group: g.id, fuel: null, plant: null } : plantsFor(ks[0]).length ? { group: null, fuel: ks[0], plant: null } : null;
        L.push({ id: 'g:' + g.id, name: g.name, tok: g.tok, tag: g.f.length > 1 && ks.includes('roof') ? 'incl. est.' : FUEL[ks[0]].tag, hatch: g.f.length === 1 && FUEL[ks[0]].hatch ? ks[0] : null, signed: false, s, drill });
      }
      for (const k of SIGNED) if (present[r].includes(k)) L.push(fuelLayer(k, null));
    }
    V.layers = L;
  }
  // "ROX2201 ROX0" -> "220 kV · ROX2201": the POC code carries the bus voltage
  const busLabel = k => { const poc = k.split(' ')[0]; const kv = parseInt(poc.slice(3, 6), 10); return `${kv} kV · ${poc}`; };
  const level = () => state.drill.plant ? 'unit' : state.drill.fuel ? 'plant' : state.drill.group ? 'fuel' : 'top';
  function drillTo(d) {
    state.drill = d; state.hidden.clear(); state.filter = ''; relayer(); buildSummary(); render();
  }

  // ---------- colours ----------
  let C = {}, PAT = {};
  function readColours() {
    const cs = getComputedStyle(document.documentElement);
    for (const t of ['--ink', '--ink-2', '--muted', '--line', '--grid', '--surface', '--accent', '--accent-soft', '--co2', '--p-ni', '--p-si', '--f-coal', '--f-gas', '--f-diesel', '--f-geo', '--f-bio', '--f-waste', '--f-hydro', '--f-wind', '--f-solar', '--f-batt', '--f-hvdc', '--g-fossil', '--g-ren', '--g-fast', '--g-vre', '--g-resid', '--o1', '--o2', '--o3', '--o4', '--o5', '--o6'])
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
  const colourOf = l => l.muted ? alpha(C['--muted'], 0.5) : l.light ? shade(C[l.tok], 3) : l.shade != null ? shade(C[l.tok], l.shade) : C[l.tok];

  // ---------- chart frame ----------
  const PADL = 50, PADR = 12;
  const FONT = '11px "IBM Plex Mono", ui-monospace, Menlo, monospace';
  function setup(cv) {
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    // an enlarged chart (the page's popout) draws its own time axis
    return { ctx, w, h, dpr, popped: !!cv.closest('.popped') };
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
    const x0 = PADL, x1 = w - PADR, n = V.n;
    const X = j => x0 + (n <= 1 ? 0 : j / (n - 1)) * (x1 - x0);
    const Y = v => bottom - (v - dom.lo) / (dom.hi - dom.lo) * (bottom - top);
    const Yinv = y => dom.lo + (bottom - y) / (bottom - top) * (dom.hi - dom.lo);
    ctx.font = FONT; ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    for (const t of dom.ticks) {
      const y = Math.round(Y(t)) + 0.5;
      ctx.strokeStyle = t === 0 && dom.lo < 0 ? C['--line'] : C['--grid']; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      ctx.fillStyle = C['--muted']; ctx.fillText(tickFmt(t), x0 - 7, y);
    }
    ctx.strokeStyle = C['--line'];
    for (const mk of V.marks) if (mk.line) { const x = Math.round(X(mk.j)) + 0.5; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke(); }
    if (axis) drawAxis(ctx, X, bottom, x0, x1);
    return { X, Y, Yinv, x0, x1, top, bottom };
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
    const x = Math.round(F.X(state.hover)) + 0.5;
    ctx.strokeStyle = C['--ink-2']; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, F.top); ctx.lineTo(x, F.bottom); ctx.stroke();
  }
  function dot(ctx, x, y, color) {
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = C['--surface']; ctx.stroke();
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
  function drawGen() {
    const c = setup($('cv-gen')), { ctx } = c, n = V.n, pct = pctMode();
    const layers = V.layers.filter(l => !state.hidden.has(l.id) && !(pct && l.id === 'hvdc'));
    const pos = new Float64Array(n), neg = new Float64Array(n), tops = [];
    for (const l of layers) {
      const a = pct ? Float64Array.from(l.s, pctOf) : l.s, p0 = Float64Array.from(pos), n0 = Float64Array.from(neg);
      for (let j = 0; j < n; j++) { const v = a[j]; if (v > 0) pos[j] += v; else neg[j] += v; }
      tops.push({ l, p0, p1: Float64Array.from(pos), n0, n1: Float64Array.from(neg) });
    }
    let mx = 0, mn = 0; for (let j = 0; j < n; j++) { mx = Math.max(mx, pos[j]); mn = Math.min(mn, neg[j]); }
    const cap = pct ? null : capacityOf();
    if (cap) mx = Math.max(mx, cap * 1.04);
    if (pct) mx = Math.min(mx, 100);  // rounding can push a full stack a hair over 100
    const full = pct && topIsAll();  // the whole mix: a fixed 0–100% axis
    const dom = full ? { lo: 0, hi: 100, ticks: [0, 25, 50, 75, 100] } : nice(0, Math.max(mx, pct ? 0.1 : 1), 5);
    if (mn < 0) dom.lo = mn * 1.2;
    const F = frame(c, dom, pct ? v => (Number.isInteger(v) ? v : v.toFixed(1)) + '%' : v => fmt(v), { axis: true });
    const { X, Y } = F;
    for (const L of tops) {
      let fill = L.l.hatch ? ctx.createPattern(L.l.shade != null ? hatchOf(colourOf(L.l)) : PAT[L.l.hatch], 'repeat') : colourOf(L.l);
      if (fill && fill.setTransform) fill.setTransform(new DOMMatrix().scale(0.25));
      for (const [b, t] of [[L.p0, L.p1], [L.n0, L.n1]]) {
        let any = false; for (let j = 0; j < n; j++) if (t[j] !== b[j]) { any = true; break; }
        if (!any) continue;
        ctx.fillStyle = fill; ctx.beginPath();
        for (let j = 0; j < n; j++) { const x = X(j), y = Y(t[j]); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        for (let j = n - 1; j >= 0; j--) ctx.lineTo(X(j), Y(b[j]));
        ctx.closePath(); ctx.fill();
        // 1px surface gap along the outer edge separates adjacent fills
        ctx.strokeStyle = C['--surface']; ctx.lineWidth = 1;
        ctx.beginPath(); for (let j = 0; j < n; j++) { const x = X(j), y = Y(t[j]); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
      }
    }
    if (dom.lo < 0) { ctx.strokeStyle = C['--ink-2']; ctx.lineWidth = 1; const y = Math.round(Y(0)) + 0.5; ctx.beginPath(); ctx.moveTo(F.x0, y); ctx.lineTo(F.x1, y); ctx.stroke(); }
    if (cap) {
      const y = Math.round(Y(cap)) + 0.5;
      ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = C['--ink-2']; ctx.lineWidth = 1.25;
      ctx.beginPath(); ctx.moveTo(F.x0, y); ctx.lineTo(F.x1, y); ctx.stroke(); ctx.restore();
      ctx.font = FONT; ctx.fillStyle = C['--ink-2']; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.fillText(`Nameplate ${fmt(cap)} MW`, F.x1, y - 3);
    }
    GEN = { F, tops };
    cursor(ctx, F);
    if (state.hover != null && state.hoverBy !== 'mouse') {  // the mouse tooltip shows the time itself
      const lbl = chip(state.hover);
      ctx.font = '600 11px "IBM Plex Mono", ui-monospace, monospace'; const tw = ctx.measureText(lbl).width;
      let x = F.X(state.hover) - tw / 2 - 6; x = Math.max(F.x0, Math.min(F.x1 - tw - 12, x));
      ctx.fillStyle = C['--ink']; roundRect(ctx, x, F.top, tw + 12, 18, 4); ctx.fill();
      ctx.fillStyle = C['--surface']; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(lbl, x + 6, F.top + 9.5);
    }
  }
  function layerAt(clientX, clientY) {
    if (!GEN) return null;
    const cv = $('cv-gen'), r = cv.getBoundingClientRect(), j = indexAt(cv, clientX), v = GEN.F.Yinv(clientY - r.top);
    for (const T of GEN.tops) if ((v >= T.p0[j] && v <= T.p1[j] && T.p1[j] > T.p0[j]) || (v <= T.n0[j] && v >= T.n1[j] && T.n1[j] < T.n0[j])) return T.l;
    return null;
  }

  function drawPrice() {
    const c = setup($('cv-price')), { ctx } = c;
    let mx = 0; for (let j = 0; j < V.n; j++) mx = Math.max(mx, V.pNI[j], V.pSI[j]);
    const dom = nice(0, mx * 1.08, ticksFor('cv-price', 3));
    const F = frame(c, dom, v => '$' + fmt(v)), { X, Y } = F;
    const r = state.region, aNI = r === 'SI' ? 0.35 : 1, aSI = r === 'NI' ? 0.35 : 1;
    line(ctx, X, Y, V.pSI, alpha(C['--p-si'], aSI));
    line(ctx, X, Y, V.pNI, alpha(C['--p-ni'], aNI));
    const prim = r === 'SI' ? V.pSI : V.pNI; let jm = 0; for (let j = 1; j < V.n; j++) if (prim[j] > prim[jm]) jm = j;
    const lbl = `High ${money(prim[jm])} · ${chip(jm)}`;
    ctx.font = FONT; const tw = ctx.measureText(lbl).width, x = X(jm), y = Y(prim[jm]);
    ctx.fillStyle = C['--ink-2']; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    // beside the high point, kept inside the plot (clear of the axis labels on narrow screens)
    let lx = x + 10 + tw < F.x1 ? x + 9 : x - 9 - tw;
    lx = Math.max(F.x0 + 4, Math.min(F.x1 - tw, lx));
    ctx.fillText(lbl, lx, Math.max(F.top + 6, y));
    if (state.hover == null) dot(ctx, x, y, r === 'SI' ? C['--p-si'] : C['--p-ni']);
    cursor(ctx, F);
    if (state.hover != null) { const j = state.hover; dot(ctx, X(j), Y(V.pSI[j]), alpha(C['--p-si'], aSI)); dot(ctx, X(j), Y(V.pNI[j]), alpha(C['--p-ni'], aNI)); }
  }
  function drawDemand() {
    const c = setup($('cv-demand')), { ctx } = c;
    let mn = Infinity, mx = 0;
    for (let j = 0; j < V.n; j++) { mx = Math.max(mx, V.underlying[j], V.metered[j]); mn = Math.min(mn, V.metered[j]); }
    const dom = nice(mn * 0.95, mx * 1.02, ticksFor('cv-demand', 3));
    const F = frame(c, dom, v => fmt(v)), { X, Y } = F;
    // the embedded solar estimate's uncertainty (± one standard deviation) as a band around the dashed line
    if (V.roofU.some(u => u > 0.5)) band(ctx, X, Y, V.underlying.map((v, j) => v - V.roofU[j]), V.underlying.map((v, j) => v + V.roofU[j]), alpha(C['--ink-2'], 0.22));
    line(ctx, X, Y, V.underlying, C['--ink-2'], 1.5, [4, 3]);
    line(ctx, X, Y, V.metered, C['--ink']);
    cursor(ctx, F);
    if (state.hover != null) { const j = state.hover; dot(ctx, X(j), Y(V.underlying[j]), C['--ink-2']); dot(ctx, X(j), Y(V.metered[j]), C['--ink']); }
  }
  function drawHvdc() {
    const c = setup($('cv-hvdc')), { ctx } = c;
    let mn = 0, mx = 0; for (let j = 0; j < V.n; j++) { mn = Math.min(mn, V.hvdc[j]); mx = Math.max(mx, V.hvdc[j]); }
    const dom = nice(mn, mx, ticksFor('cv-hvdc', 2));
    const F = frame(c, dom, v => fmt(v)), { X, Y } = F;
    area(ctx, X, Y, V.hvdc, 0, alpha(C['--f-hvdc'], 0.35));
    line(ctx, X, Y, V.hvdc, C['--f-hvdc'], 1.5);
    ctx.font = FONT; ctx.fillStyle = C['--muted']; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('↑ north', F.x0 + 4, F.top);
    if (dom.lo < 0) { ctx.textBaseline = 'bottom'; ctx.fillText('↓ south', F.x0 + 4, F.bottom); }
    cursor(ctx, F);
    if (state.hover != null) dot(ctx, X(state.hover), Y(V.hvdc[state.hover]), C['--f-hvdc']);
  }
  function drawCo2() {
    const c = setup($('cv-co2')), { ctx } = c;
    let mx = 0; for (let j = 0; j < V.n; j++) mx = Math.max(mx, V.co2[j]);
    const dom = nice(0, Math.max(mx, 10) * 1.1, ticksFor('cv-co2', 2));
    const F = frame(c, dom, v => fmt(v)), { X, Y } = F;
    area(ctx, X, Y, V.co2, 0, alpha(C['--co2'], 0.28));
    line(ctx, X, Y, V.co2, C['--co2'], 1.5);
    cursor(ctx, F);
    if (state.hover != null) dot(ctx, X(state.hover), Y(V.co2[state.hover]), C['--co2']);
  }
  function drawRen() {
    const c = setup($('cv-ren')), { ctx } = c;
    let mn = 100; for (let j = 0; j < V.n; j++) mn = Math.min(mn, V.ren[j]);
    const lo = Math.max(0, Math.floor((mn - 4) / 10) * 10);
    const big = !!$('cv-ren').closest('.popped'), st = 100 - lo <= 25 ? 5 : 100 - lo <= 50 ? 10 : 20;
    const dom = { lo, hi: 100, ticks: big ? Array.from({ length: Math.floor((100 - lo) / st) + 1 }, (_, i) => lo + i * st)
      : lo <= 50 ? [lo, 50, 100].filter((v, i, a) => a.indexOf(v) === i) : [lo, Math.round((lo + 100) / 2 / 5) * 5, 100] };
    const F = frame(c, dom, v => v + '%', { axis: true }), { X, Y } = F;
    area(ctx, X, Y, V.ren, lo, alpha(C['--accent'], 0.14));
    line(ctx, X, Y, V.ren, C['--accent']);
    cursor(ctx, F);
    if (state.hover != null) dot(ctx, X(state.hover), Y(V.ren[state.hover]), C['--accent']);
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
      unit: V.layers.length > 1 ? 'MW, by grid connection' : 'MW',
    }[lv];
    $('gen-unit').textContent = pctMode() ? unitTxt.replace(/^MW/, '% of all generation') : unitTxt;
    const note = $('gen-note'), txt = NOTES[state.view] || '';
    note.hidden = !txt;
    note.textContent = txt;
    const up = lv !== 'top' ? parts[parts.length - 2] : null;
    $('sum-level').hidden = !up;
    if (up) {
      $('sum-level-txt').textContent = {
        fuel: () => `${groupById(d.group).name}${setById(d.group) ? ' plants' : ''} · ${REGION[state.region]}`,
        plant: () => d.fuel === 'roof' ? `Embedded solar (estimated) · ${REGION[state.region]}` : `${FUEL[d.fuel].name} plants · ${REGION[state.region]}`,
        unit: () => V.layers.length > 1 ? `${d.plant} · by grid connection` : d.plant,
      }[lv]();
      $('sum-back').textContent = `‹ ${up.label === 'Generation' ? 'All sources' : up.label}`;
      $('sum-back').onclick = () => drillTo(up.to);
    }
  }
  // Long lists (the site view, a fuel's plants) get a filter box; the site view groups its rows under collapsible
  // fuel headings with subtotals. Section headings toggle open; their colour square hides every row in them.
  const norm = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();  // "takapo" finds "Takapō"
  function toggleHidden(ids, tr) {
    const off = !ids.every(id => state.hidden.has(id));
    for (const id of ids) off ? state.hidden.add(id) : state.hidden.delete(id);
    for (const l of V.layers) if (ids.includes(l.id)) { l.row.classList.toggle('off', off); l.row.querySelector('.sw-btn')?.setAttribute('aria-pressed', String(!off)); }
    if (tr) { tr.classList.toggle('off', off); tr.querySelector('.sw-btn').setAttribute('aria-pressed', String(!off)); }
    drawGen();
  }
  function applyFilter() {
    const q = norm(state.filter.trim());
    for (const l of V.layers) {
      const sec = V.sections.find(x => x.members.includes(l));
      l.row.hidden = q ? !norm(l.name).includes(q) : !!(sec && sec.row && !state.open.has(sec.id));
    }
    for (const x of V.sections) {
      if (!x.row) continue;
      x.row.hidden = !!q && !x.members.some(l => !l.row.hidden);
      x.row.setAttribute('aria-expanded', String(!!q || state.open.has(x.id)));
    }
  }
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
          tr.querySelector('.sw-btn').addEventListener('click', () => toggleHidden(ids, tr));
          tr.querySelector('.sec-btn').addEventListener('click', () => { state.open.has(x.id) ? state.open.delete(x.id) : state.open.add(x.id); applyFilter(); });
          x.row = tr;
          body.appendChild(tr);
        }
      } else if (!l.section) cur = null;
      const tr = document.createElement('tr'); tr.style.setProperty('--c', colourOf(l));
      if (state.hidden.has(l.id)) tr.className = 'off';
      if (cur && cur.row) tr.classList.add('in-sec');
      const nameHtml = `${esc(l.name)}${l.tag ? ` <span class="tag">${l.tag}</span>` : ''}`;
      tr.innerHTML = `<td><div class="row-name">${canHide ? `<button type="button" class="sw-btn" aria-pressed="${!state.hidden.has(l.id)}" aria-label="Show ${esc(l.name)} in the chart"><span class="sw${l.hatch ? ' hatch' : ''}"></span></button>` : `<span class="sw-btn"><span class="sw"></span></span>`}${l.drill ? `<button type="button" class="drill">${nameHtml}</button>` : `<span class="nm">${nameHtml}</span>`}</div></td><td class="n" data-q></td><td class="n"><div class="share"><span data-s></span><span class="bar" data-b></span></div></td>`;
      if (canHide) tr.querySelector('.sw-btn').addEventListener('click', () => {
        toggleHidden([l.id]);
        const x = V.sections.find(sec => sec.members.includes(l));
        if (x && x.row) { const all = x.members.every(m => state.hidden.has(m.id)); x.row.classList.toggle('off', all); x.row.querySelector('.sw-btn').setAttribute('aria-pressed', String(!all)); }
      });
      if (l.drill) tr.querySelector('.drill').addEventListener('click', () => drillTo(l.drill));
      l.row = tr;
      body.appendChild(tr);
    }
    const f = $('mix-filter');
    f.hidden = V.layers.length <= 12;
    f.value = state.filter;
    f.placeholder = `Filter ${V.layers.length} ${VIEWS[state.view].by === 'site' && level() === 'top' ? 'sites' : 'rows'}`;
    applyFilter();
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
    const showT = r !== 'NI';
    $('tot-lbl').textContent = totalLabel();
    if (j == null) {
      const R = RANGES[state.range], p0 = lp(V.t[0] ?? M.END);
      if (state.end == null) {
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
        l.row.querySelector('[data-q]').textContent = en(e);
        l.row.querySelector('[data-s]').textContent = l.signed ? signedTxt(l, e, true) : tot > 0 ? (e / tot * 100).toFixed(1) + '%' : '—';
        l.row.querySelector('[data-b]').style.transform = `scaleX(${l.signed || tot <= 0 ? 0 : Math.max(0, e / tot)})`;
      }
      $('tot-q').textContent = en(tot); $('tot-s').textContent = layers.some(l => l.signed) && !topIsAll() ? 'net' : '100%';
      let pn = 0, ps = 0, pk = 0, pkg = 0, ti = 0, hv = 0, em = 0, gw = 0, re = 0, hs = 0;
      for (let i = 0; i < V.n; i++) {
        const w = V.hrs[i]; hs += w; pn += V.pNI[i] * w; ps += V.pSI[i] * w; ti += V.tiwai[i] * w; hv += V.hvdc[i] * w;
        pk = Math.max(pk, V.pkMet[i]); if (V.pkGen) pkg = Math.max(pkg, V.pkGen[i]);
        em += V.co2[i] * V.gen[i] * w; re += V.ren[i] * V.gen[i] * w; gw += V.gen[i] * w;
      }
      setSys([
        ...plantRows(true),
        ['Price, North Island', money(pn / hs), 'avg'],
        ['Price, South Island', money(ps / hs), 'avg'],
        ['Peak demand, metered', fmt(pk), 'MW'],
        V.pkGen && ['Peak generation', fmt(pkg), 'MW'],
        showT && ['Tiwai smelter', fmt(ti / hs), 'MW avg'],
        Math.abs(hv) >= 1e6 ? ['HVDC, net transfer', (Math.abs(hv) / 1e6).toFixed(2), hv >= 0 ? 'TWh north' : 'TWh south']
          : ['HVDC, net transfer', (Math.abs(hv) / 1000).toFixed(1), hv >= 0 ? 'GWh north' : 'GWh south'],
        ['Emissions intensity', fmt(em / gw), 'g/kWh'],
        ['Renewable share', (re / gw).toFixed(1) + '%', ''],
      ]);
      for (const id of ['v-gen', 'v-pni', 'v-psi', 'v-met', 'v-und', 'v-hv', 'v-co2', 'v-ren']) $(id).textContent = '';
      return;
    }
    const [when, sub] = heading(j), long = isLong();
    $('sum-when').textContent = when;
    $('sum-sub').textContent = sub;
    $('col-q').textContent = long ? 'MW avg' : 'MW';
    let tot = 0;
    if (topIsAll()) tot = V.gen[j]; else for (const l of layers) tot += l.signed ? l.s[j] : Math.max(0, l.s[j]);
    for (const l of [...layers, ...V.sections.filter(x => x.row)]) {
      const v = l.members ? l.members.reduce((a, m) => a + m.s[j], 0) : l.s[j];
      l.row.querySelector('[data-q]').textContent = fmt(v);
      l.row.querySelector('[data-s]').textContent = l.signed ? signedTxt(l, v, false) : tot > 0.5 ? (v / tot * 100).toFixed(1) + '%' : '—';
      l.row.querySelector('[data-b]').style.transform = `scaleX(${l.signed || tot <= 0.5 ? 0 : Math.max(0, v / tot)})`;
    }
    $('tot-q').textContent = fmt(tot); $('tot-s').textContent = layers.some(l => l.signed) && !topIsAll() ? '' : '100%';
    setSys([
      ...plantRows(false, j),
      ['Price, North Island', money(V.pNI[j]), '/MWh'],
      ['Price, South Island', money(V.pSI[j]), '/MWh'],
      ['Demand, metered', fmt(V.metered[j]), long ? 'MW avg' : 'MW'],
      ['With embedded solar', fmt(V.underlying[j]), long ? 'MW avg' : 'MW'],
      ['Embedded solar (est.)', fmt(V.fuels.roof[j]), (long ? 'MW avg' : 'MW') + (V.roofU[j] > 0.5 ? ` ± ${fmt(V.roofU[j])}` : '')],
      long && ['Peak demand, metered', fmt(V.pkMet[j]), 'MW'],
      long && V.pkGen && ['Peak generation', fmt(V.pkGen[j]), 'MW'],
      showT && ['Tiwai smelter', fmt(V.tiwai[j]), long ? 'MW avg' : 'MW'],
      ['HVDC', hvTxt(V.hvdc[j]), hvDir(V.hvdc[j])],
      ['Emissions intensity', fmt(V.co2[j]), 'g/kWh'],
      ['Renewable share', V.ren[j].toFixed(1) + '%', ''],
    ]);
    $('v-gen').textContent = fmt(tot) + ' MW';
    $('v-pni').textContent = money(V.pNI[j]); $('v-psi').textContent = money(V.pSI[j]);
    $('v-met').textContent = fmt(V.metered[j]); $('v-und').textContent = fmt(V.underlying[j]);
    $('v-hv').textContent = `${hvTxt(V.hvdc[j])} ${V.hvdc[j] > 0.5 ? 'north' : V.hvdc[j] < -0.5 ? 'south' : ''}`;
    $('v-co2').textContent = fmt(V.co2[j]); $('v-ren').textContent = V.ren[j].toFixed(1) + '%';
  }

  // ---------- orchestration ----------
  let raf = 0;
  function drawAll() { drawGen(); drawPrice(); drawDemand(); drawHvdc(); drawCo2(); drawRen(); }
  function render() { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { drawAll(); updateSummary(); }); }
  const intsFor = (r, kind) => RANGES[r].model === 'live' && kind !== 'live' ? RANGES[r].past : RANGES[r].ints;
  // local midnight at or before t; whole days later or earlier (a day is 23-25 hours at the clock changes)
  const midnightOf = t => { const k = KEY.day(t) * DAY; return k - nzOffset(k - nzOffset(k)); };
  const addDays = (m, k) => midnightOf(m + k * DAY + 3 * 36e5);
  const endOfToday = () => addDays(midnightOf(models.live.END), 1);
  const ymd = t => { const p = lp(t); return `${p.y}-${String(p.mon + 1).padStart(2, '0')}-${String(p.dom).padStart(2, '0')}`; };
  const firstDay = () => history.index?.first ?? Date.UTC(2020, 8, 9, 12);
  function syncControls() {
    const seg = $('seg-int'), ints = intsFor(state.range, state.kind);
    if (seg.dataset.for !== ints.join()) {  // each range offers its own intervals
      seg.innerHTML = ints.map(k => `<button type="button" data-v="${k}">${INTS[k].label}</button>`).join('');
      seg.dataset.for = ints.join();
    }
    // the date control: the chosen range ends on this date (today = the latest data)
    const R = RANGES[state.range], inp = $('in-date'), end = state.end ?? endOfToday();
    $('lb-date').textContent = R.fixed ? 'All data' : `${R.label} ending`;
    inp.disabled = !!R.fixed;
    inp.style.visibility = R.fixed ? 'hidden' : '';  // All has no end date
    inp.value = R.fixed ? '' : ymd(end - 1);
    inp.min = ymd(firstDay()); inp.max = ymd(models.live.END);
    $('btn-latest').hidden = state.end == null;
    // the arrows on the chart step by the range
    const prev = $('nav-prev'), next = $('nav-next');
    prev.hidden = next.hidden = !!R.fixed;
    prev.disabled = !R.fixed && end - R.days * DAY <= firstDay();
    next.disabled = state.end == null;
    prev.setAttribute('aria-label', `Previous ${R.label}`); next.setAttribute('aria-label', `Next ${R.label}`);
    prev.title = `Previous ${R.label}`; next.title = state.end == null ? 'Showing the latest data' : `Next ${R.label}`;
    $('sel-region').value = state.region;
    for (const [id, val] of [['seg-range', state.range], ['seg-int', state.int]])
      for (const b of $(id).querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === val));
    $('sel-view').value = state.view;
    for (const b of $('seg-unit').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === state.unit));
  }

  // ---------- models: the live week, and history merged with it (loaded when a long range is first chosen) ----------
  const merge = kind => toModel(history.merged(kind, models.live), models.live.END);
  function useModel() {
    const m = models[state.kind];
    if (m !== M) { M = m; derive(); }
  }
  function report(extra = {}) {
    const ix = history.index, kind = state.kind;
    hooks.status?.({ range: state.range, kind, past: state.end != null, loading: false, error: '', liveEnd: models.live.END,
                     histFirst: kind !== 'live' && V ? V.t[0] : null, histEnd: kind !== 'live' ? Math.min(M.histEnd, (state.end ?? Infinity) - 1) : null,
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
  // keepInt: keep a chosen interval across a range change; wantInt: the interval to open on (from the address)
  async function setView(r, end = state.end, keepInt = false, wantInt = null) {
    const R = RANGES[r];
    if (R.fixed || (end != null && end >= endOfToday())) end = null;
    const kind = kindFor(r, end), ticket = ++pending;
    if (kind !== 'live') {
      const to = end ?? models.live.END, from = end == null ? to - 31 * DAY : end - R.days * DAY - DAY;
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
    }
    if (r !== state.range && !keepInt) state.intPicked = false;   // a new range starts on its default interval
    state.range = r; state.end = end; state.kind = kind;
    const ints = intsFor(r, kind);
    if (wantInt && ints.includes(wantInt)) { state.int = wantInt; state.intPicked = true; }
    if (!state.intPicked || !ints.includes(state.int)) { state.int = R.def && ints.includes(R.def) ? R.def : ints[0]; state.intPicked = false; }
    useModel(); rebuild();
  }
  const step = dir => {
    const R = RANGES[state.range];
    if (R.fixed) return;
    if (dir < 0) setView(state.range, addDays(state.end ?? endOfToday(), -R.days));
    else if (state.end != null) setView(state.range, addDays(state.end, R.days));
  };
  function rebuild() {
    const d = state.drill;
    V = buildView();  // first: the drill-down checks below look at this view's plant sets
    if (d.plant) { const p = plantByName(d.plant); if (!p || (state.region !== 'NZ' && p.isl !== state.region)) d.plant = null; }
    if (d.fuel && !plantsFor(d.fuel).length) { d.fuel = null; d.plant = null; }
    if (d.group && !(setById(d.group)?.plants.length || groupById(d.group)?.f?.some(k => present[state.region].includes(k)))) { d.group = null; d.plant = null; }
    relayer(); state.hover = null; syncControls(); buildSummary(); render(); save(); report();
  }

  $('sel-region').addEventListener('change', e => { if (!['NZ', 'NI', 'SI'].includes(e.target.value)) return; state.region = e.target.value; state.hidden.clear(); rebuild(); });
  $('seg-range').addEventListener('click', e => { const b = e.target.closest('button'); if (!b || !Object.hasOwn(RANGES, b.dataset.v)) return; setView(b.dataset.v); });
  $('in-date').addEventListener('change', e => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(e.target.value);
    if (!m) return;
    const day = midnightOf(Date.UTC(+m[1], +m[2] - 1, +m[3], 12) - 12 * 36e5);  // that date's local midnight
    setView(state.range, addDays(day, 1));
  });
  $('btn-latest').addEventListener('click', () => setView(state.range, null));
  $('nav-prev').addEventListener('click', () => step(-1));
  $('nav-next').addEventListener('click', () => step(1));
  $('sel-view').addEventListener('change', e => {
    if (!Object.hasOwn(VIEWS, e.target.value)) return;
    state.view = e.target.value; state.drill = { ...TOP_LEVEL }; state.hidden.clear(); state.filter = ''; state.open.clear(); rebuild();
  });
  $('seg-unit').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !['mw', 'pct'].includes(b.dataset.v) || b.dataset.v === state.unit) return;
    state.unit = b.dataset.v; syncControls(); renderCrumbs(); render(); save();
  });
  $('mix-filter').addEventListener('input', e => { state.filter = e.target.value; applyFilter(); });
  $('seg-int').addEventListener('click', e => { const b = e.target.closest('button'); if (!b || !intsFor(state.range, state.kind).includes(b.dataset.v)) return; state.int = b.dataset.v; state.intPicked = true; rebuild(); });

  // ---------- pointer and keyboard: one time cursor across both chart panels, a tooltip that follows the mouse ----------
  const boxes = [$('charts'), $('charts-more')];
  const tip = $('tip');
  const indexAt = (cv, clientX) => {
    const r = cv.getBoundingClientRect(), x0 = PADL, x1 = r.width - PADR;
    const f = (clientX - r.left - x0) / (x1 - x0);
    return Math.max(0, Math.min(V.n - 1, Math.round(f * (V.n - 1))));
  };
  const row = (colour, name, value, extra = '', hatch = false) =>
    `<div class="tip-r"><i class="${hatch ? 'hatch' : ''}" style="--c:${colour}"></i><span>${esc(name)}</span><b>${value}</b>${extra ? `<small>${extra}</small>` : ''}</div>`;
  function tipHtml(cv, j, e) {
    const mw = isLong() ? 'MW avg' : 'MW', head = `<div class="tip-t">${esc(chip(j))}</div>`;
    switch (cv.id) {
      case 'cv-gen': {
        const l = layerAt(e.clientX, e.clientY), lv = level();
        let tot = 0;
        if (topIsAll()) tot = V.gen[j]; else for (const x of V.layers) tot += x.signed ? x.s[j] : Math.max(0, x.s[j]);
        if (!l) return head + row(C['--ink'], totalLabel(), fmt(tot), mw);
        const v = l.s[j];
        const uj = l.id === 'roof' ? V.roofU[j] : l.u ? l.u[j] : 0, pm = uj > 0.5 ? ` ± ${fmt(uj)}` : '';
        if (pctMode() && !l.signed) return head + row(colourOf(l), l.name, pctOf(v, j).toFixed(1) + '%', `of all generation · ${fmt(v)} ${mw}${pm}`, !!l.hatch);
        const extra = l.signed ? `${mw} · ${signedTxt(l, v, false)}` : `${mw}${pm}${tot > 0.5 ? ` · ${(v / tot * 100).toFixed(1)}%` : ''}`;
        return head + row(colourOf(l), l.name, fmt(v), extra, !!l.hatch);
      }
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
  for (const box of boxes) for (const cv of box.querySelectorAll('canvas')) {
    cv.addEventListener('pointermove', e => {
      const j = indexAt(cv, e.clientX), by = e.pointerType === 'touch' ? 'touch' : 'mouse';
      if (j !== state.hover || by !== state.hoverBy) { state.hover = j; state.hoverBy = by; render(); }
      if (by === 'mouse') showTip(cv, j, e);
      if (cv.id === 'cv-gen' && by === 'mouse') { const l = layerAt(e.clientX, e.clientY); cv.style.cursor = l && l.drill ? 'pointer' : ''; }
    });
    cv.addEventListener('pointerleave', hideTip);
    cv.addEventListener('pointerdown', e => { state.hover = indexAt(cv, e.clientX); state.hoverBy = e.pointerType === 'touch' ? 'touch' : 'mouse'; render(); });
  }
  $('cv-gen').addEventListener('click', e => { if (e.pointerType === 'touch') return; const l = layerAt(e.clientX, e.clientY); if (l && l.drill) { hideTip(); drillTo(l.drill); } });
  for (const box of boxes) {
    box.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { state.hover = null; hideTip(); render(); } });
    box.addEventListener('keydown', e => {
      if (e.target !== box) return;
      const by = e.shiftKey ? { '5m': 12, '30m': 2, '1d': 7, '1w': 4, '1mo': 12 }[state.int] : 1;
      state.hoverBy = 'key';
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const cur = state.hover == null ? V.n - 1 : state.hover;
        state.hover = Math.max(0, Math.min(V.n - 1, cur + (e.key === 'ArrowLeft' ? -by : by))); render();
      } else if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); step(e.key === 'PageUp' ? -1 : 1); }
      else if (e.key === 'Home') { e.preventDefault(); state.hover = 0; render(); }
      else if (e.key === 'End') { e.preventDefault(); state.hover = V.n - 1; render(); }
      else if (e.key === 'Escape') { state.hover = null; render(); }
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
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => render());

  readColours();
  rebuild();
  if (saved) setView(saved.range, saved.end, true, init.int);  // a long range or past date, once its history has loaded

  return {
    // new data: keep the viewer's region, range, interval and drill-down; drop the hover point
    update(D2) {
      models.live = buildModel(D2);
      for (const kind of ['hh', 'day']) if (models[kind]) models[kind] = merge(kind);
      if (state.end == null || state.kind === 'live') state.kind = kindFor(state.range, state.end);
      M = null; useModel(); updateAsof(); rebuild();
      // history gains days a few times a day: refresh what's loaded, at most hourly (history.load checks the age)
      for (const kind of ['hh', 'day']) if (models[kind]) history.load(kind, models.live.END - 31 * DAY, models.live.END).then(() => {
        models[kind] = merge(kind);
        if (state.kind === kind) { M = null; useModel(); rebuild(); }
      }).catch(() => {});
    },
    destroy() { window.removeEventListener('scroll', hideTip); mo.disconnect(); ro.disconnect(); if (mq) mq.removeEventListener('change', retheme); cancelAnimationFrame(raf); },
  };
}
