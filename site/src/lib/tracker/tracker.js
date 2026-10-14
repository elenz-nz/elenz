// Elenz tracker: linked generation, price, demand, HVDC, emissions and renewables charts on one time axis.
// Data: tracker.json built by ingest/build_tracker.py. Drawn on <canvas>; the page supplies the markup (ids below).

import { nzOffset, tzName, KEY, fromLayout, firstAtOrAfter, historyStore } from './series.js';
export { nzOffset, tzName };

// A model: one segment (series.js) plus what the charts read. NIs/SIs are the island series (same objects).
function toModel(S, END) {
  return { ...S, N: S.n, END: END ?? S.t[S.n - 1], NIs: S.NI, SIs: S.SI };
}
export const buildModel = D => toModel(fromLayout(D));

// Ranges: the live week at 5 minutes, then history. Each lists its intervals; the first is the default.
const RANGES = {
  '1d': { model: 'live', n: 288, ints: ['5m', '30m'], span: 'Last 24 hours' },
  '3d': { model: 'live', n: 864, ints: ['5m', '30m'], span: 'Last 3 days' },
  '7d': { model: 'live', n: 2016, ints: ['5m', '30m'], span: 'Last 7 days' },
  '30d': { model: 'hh', days: 30, ints: ['30m', '1d'], span: 'Last 30 days' },
  '1y': { model: 'day', days: 365, ints: ['1d', '1w', '1mo'], def: '1w', span: 'Last 12 months' },
  'all': { model: 'day', ints: ['1d', '1w', '1mo'], def: '1mo', span: null },
};
const INTS = {
  '5m': { label: '5 min', key: null, live: true },
  '30m': { label: '30 min', key: KEY.hh },
  '1d': { label: 'Day', key: KEY.day },
  '1w': { label: 'Week', key: KEY.week },
  '1mo': { label: 'Month', key: KEY.month },
};
const OLD_RANGE = { 288: '1d', 864: '3d', 2016: '7d' };

export function mountTracker(D, hooks = {}) {
  const models = { live: buildModel(D), hh: null, day: null };
  const history = historyStore();
  let M = models.live;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // Stack order, bottom to top: geothermal (baseload) first, then thermal, hydro and the variable sources.
  const FUELS = [
    { k: 'geo', name: 'Geothermal', tok: '--f-geo', ef: 0.07, ren: 1 },
    { k: 'coal', name: 'Coal/gas, Rankine', tok: '--f-coal', ef: 0.95 },
    { k: 'gas', name: 'Gas', tok: '--f-gas', ef: 0.50 },
    { k: 'diesel', name: 'Diesel', tok: '--f-diesel', ef: 0.80 },
    { k: 'hydro', name: 'Hydro', tok: '--f-hydro', ren: 1 },
    { k: 'wind', name: 'Wind', tok: '--f-wind', ren: 1 },
    { k: 'solar', name: 'Solar, grid', tok: '--f-solar', ren: 1 },
    { k: 'roof', name: 'Rooftop solar', tok: '--f-solar', hatch: 1, ren: 1, tag: 'est.' },
    { k: 'batt', name: 'Battery', tok: '--f-batt', signed: 1 },
    { k: 'hvdc', name: 'HVDC', tok: '--f-hvdc', hatch: 1, signed: 1 },
  ];
  const FUEL = Object.fromEntries(FUELS.map(f => [f.k, f]));
  // Source groupings for the generation chart, after Open Electricity's. Each group lists its fuels in stack order.
  // Battery and HVDC are signed (charging, export), so they stay separate layers in every view.
  const REN = { id: 'ren', name: 'Renewables', tok: '--g-ren', f: ['geo', 'hydro', 'wind', 'solar', 'roof'] };
  const FOSSIL = f => ({ id: 'fossil', name: f, tok: '--g-fossil', f: ['coal', 'gas', 'diesel'] });
  const VRE = name => ({ id: 'vre', name, tok: '--g-vre', f: ['wind', 'solar', 'roof'] });
  const one = k => ({ id: k, name: FUEL[k].name, tok: FUEL[k].tok, f: [k] });
  const VIEWS = {
    detailed: { groups: null },
    simple: { groups: [one('geo'), FOSSIL('Thermal'), one('hydro'), one('wind'), { id: 'solar', name: 'Solar', tok: '--f-solar', f: ['solar', 'roof'] }] },
    cgr: { groups: [REN, one('coal'), one('gas'), one('diesel')] },
    flex: { groups: [
      { id: 'slow', name: 'Slow flexible', tok: '--g-slow', f: ['geo', 'coal'] },
      { id: 'fast', name: 'Fast flexible', tok: '--g-fast', f: ['gas', 'diesel', 'hydro'] },
      VRE('Variable'),
    ] },
    rf: { groups: [REN, FOSSIL('Fossils')] },
    vre: { groups: [{ id: 'resid', name: 'Residual', tok: '--g-resid', f: ['geo', 'coal', 'gas', 'diesel', 'hydro'] }, VRE('Variable renewables')] },
  };
  const SIGNED = FUELS.filter(f => f.signed).map(f => f.k);
  const groupById = id => (VIEWS[state.view].groups || []).find(g => g.id === id);
  const TOP_LEVEL = { group: null, fuel: null, plant: null };

  // National series = sum of islands
  const add = (a, b) => a.map((v, i) => v + b[i]);
  let NZ, SRC, present;
  function derive() {
    NZ = {};
    FUELS.forEach(f => NZ[f.k] = f.k === 'hvdc' ? new Float64Array(M.N) : add(M.NI[f.k], M.SI[f.k]));
    NZ.metered = add(M.NIs.metered, M.SIs.metered);
    NZ.underlying = add(M.NIs.underlying, M.SIs.underlying);
    NZ.tiwai = M.SIs.tiwai;
    SRC = { NZ, NI: { ...M.NI, ...M.NIs }, SI: { ...M.SI, ...M.SIs } };
    present = {};
    for (const r of ['NZ', 'NI', 'SI']) present[r] = FUELS.filter(f => SRC[r][f.k].some(v => Math.abs(v) > 0.5)).map(f => f.k);
  }
  derive();
  const plantsFor = (fuel, r = state.region) => M.plants.filter(p => p.fuel === fuel && (r === 'NZ' || p.isl === r));
  const plantByName = name => M.plants.find(p => p.name === name);

  const state = { region: 'NZ', range: '1d', int: '5m', view: 'detailed', hover: null, hidden: new Set(), drill: { ...TOP_LEVEL } };
  let saved = null;
  try {
    const s = JSON.parse(localStorage.getItem('elenz-view') || 'null');
    if (s && ['NZ', 'NI', 'SI'].includes(s.region)) state.region = s.region;
    const r = OLD_RANGE[s?.range] || s?.range;
    if (Object.hasOwn(RANGES, r)) saved = r;  // a long range needs history loaded first (see below)
    if (s && Object.hasOwn(INTS, s.int)) state.int = s.int;
    else if (s?.agg === 6) state.int = '30m';
    if (s && Object.hasOwn(VIEWS, s.view)) state.view = s.view;
  } catch (e) {}
  if (saved && RANGES[saved].model === 'live') { state.range = saved; saved = null; }
  if (!RANGES[state.range].ints.includes(state.int)) state.int = RANGES[state.range].def || RANGES[state.range].ints[0];
  const save = () => { try { localStorage.setItem('elenz-view', JSON.stringify({ region: state.region, range: state.range, int: state.int, view: state.view })); } catch (e) {} };

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
    return { '1d': `${DOW[p.dow]} ${p.dom} ${MON[p.mon]}`, '1w': `w/c ${p.dom} ${MON[p.mon]}`, '1mo': `${MON[p.mon]} ${p.y}` }[state.int] || `${DOW[p.dow]} ${clock(p)}`;
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
        out.push({ j, line: midnight, strong: midnight,
                   label: midnight ? `${DOW[p.dow]} ${p.dom}` : r === '1d' || (r === '3d' && p.h === 12) ? hourLbl(p) : null });
      } else if (r === '30d') {
        if (!q || p.dom === q.dom) continue;
        const monday = p.dow === 1;
        out.push({ j, line: monday, strong: monday, label: monday ? `${p.dom} ${MON[p.mon]}` : null });
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
    const R = RANGES[state.range], key = INTS[state.int].key, groups = [];
    let start = 0;
    if (R.n) start = Math.max(0, M.N - R.n);
    else if (R.days) start = firstAtOrAfter(M.t, M.END - R.days * 864e5 + (R.model === 'day' ? 36e5 : 0));
    if (!key) for (let i = start; i < M.N; i++) groups.push([i, i + 1]);
    else for (let a = start, i = start + 1; i <= M.N; i++) if (i === M.N || key(M.t[i]) !== key(M.t[a])) { groups.push([a, i]); a = i; }
    const n = groups.length;
    // averages weighted by each point's hours (days are 23-25 hours at the daylight-saving changes)
    const hrs = groups.map(([a, b]) => { let h = 0; for (let i = a; i < b; i++) h += M.h[i]; return h; });
    const avg = arr => { const o = new Float64Array(n); groups.forEach(([a, b], j) => { let s = 0; for (let i = a; i < b; i++) s += arr[i] * M.h[i]; o[j] = s / hrs[j]; }); return o; };
    const max = arr => { const o = new Float64Array(n); groups.forEach(([a, b], j) => { let m = -Infinity; for (let i = a; i < b; i++) m = Math.max(m, arr[i]); o[j] = m; }); return o; };
    const S = SRC[state.region];
    const v = { n, avg, t: groups.map(([a]) => M.t[a]), hrs, fuels: {} };
    FUELS.forEach(f => v.fuels[f.k] = avg(S[f.k]));
    v.metered = avg(S.metered); v.underlying = avg(S.underlying); v.tiwai = avg(S.tiwai);
    // peak demand: the highest 5-minute or half-hour value, which daily history keeps alongside its averages
    const pk = M.peak && M.peak[state.region];
    v.pkMet = max(pk ? pk.metered : S.metered); v.pkUnd = max(pk ? pk.underlying : S.underlying);
    // the last day, week or month is incomplete when it runs up to the newest data
    v.partial = isLong() && n > 0 && key(M.END + 3e5) === key(v.t[n - 1]);
    v.pNI = avg(M.NIs.price); v.pSI = avg(M.SIs.price); v.hvdc = avg(M.hvdcN);
    v.marks = marks(v);
    v.gen = new Float64Array(n); v.co2 = new Float64Array(n); v.ren = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      let tot = 0, em = 0, re = 0;
      for (const f of FUELS) {
        if (f.k === 'hvdc') continue;
        const x = v.fuels[f.k][j];
        if (x > 0) { tot += x; if (f.ef) em += x * f.ef; if (f.ren) re += x; }
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
      ps.forEach((p, i) => L.push({ id: p.name, name: p.name, tok: f.tok, shade: i < TOP ? i : null, muted: i >= TOP, signed: !!f.signed, s: V.avg(p.s), plant: p, drill: { group: d.group, fuel: d.fuel, plant: p.name } }));
    } else if (d.group) {
      for (const k of groupById(d.group).f) if (present[r].includes(k)) L.push(fuelLayer(k, d.group));
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
    state.drill = d; state.hidden.clear(); relayer(); buildSummary(); render();
  }

  // ---------- colours ----------
  let C = {}, PAT = {};
  function readColours() {
    const cs = getComputedStyle(document.documentElement);
    for (const t of ['--ink', '--ink-2', '--muted', '--line', '--grid', '--surface', '--accent', '--accent-soft', '--co2', '--p-ni', '--p-si', '--f-coal', '--f-gas', '--f-diesel', '--f-geo', '--f-hydro', '--f-wind', '--f-solar', '--f-batt', '--f-hvdc', '--g-fossil', '--g-ren', '--g-slow', '--g-fast', '--g-vre', '--g-resid'])
      C[t] = cs.getPropertyValue(t).trim();
    PAT = {};
    for (const f of FUELS) if (f.hatch) {
      const s = 6, oc = document.createElement('canvas'); oc.width = oc.height = s * 4;
      const x = oc.getContext('2d'); x.scale(4, 4);
      x.globalAlpha = 0.3; x.fillStyle = C[f.tok]; x.fillRect(0, 0, s, s);
      x.globalAlpha = 1; x.strokeStyle = C[f.tok]; x.lineWidth = 1.4;
      x.beginPath(); for (let k = -s; k <= s; k += s) { x.moveTo(k, s); x.lineTo(k + s, 0); } x.stroke();
      PAT[f.k] = oc;
    }
  }
  const alpha = (hex, a) => { const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
  // lightness steps of the fuel hue for plants and units, alternating so neighbours differ
  const SHADE = [0, 15, -13, 26, -22, 8, -6];
  function shade(hex, i) {
    let r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0, l = (mx + mn) / 2;
    if (mx !== mn) { const dd = mx - mn; s = l > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn); h = mx === r ? (g - b) / dd + (g < b ? 6 : 0) : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4; h /= 6; }
    l = Math.max(0.16, Math.min(0.84, l + SHADE[i % SHADE.length] / 100));
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return '#' + [f(h + 1 / 3), f(h), f(h - 1 / 3)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
  }
  const colourOf = l => l.muted ? alpha(C['--muted'], 0.5) : l.shade != null ? shade(C[l.tok], l.shade) : C[l.tok];

  // ---------- chart frame ----------
  const PADL = 50, PADR = 12;
  const FONT = '11px "IBM Plex Mono", ui-monospace, Menlo, monospace';
  function setup(cv) {
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    return { ctx, w, h, dpr };
  }
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
    const top = 8, bottom = h - (opt.axis ? 24 : 6);
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
    if (opt.axis) drawAxis(ctx, X, bottom, x0, x1);
    return { X, Y, Yinv, x0, x1, top, bottom };
  }
  function drawAxis(ctx, X, bottom, x0, x1) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.font = FONT;
    let lastX = -1e9;
    for (const mk of V.marks) {
      const x = X(mk.j);
      ctx.strokeStyle = C['--line']; ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, bottom); ctx.lineTo(Math.round(x) + 0.5, bottom + 4); ctx.stroke();
      if (!mk.label) continue;
      const tw = ctx.measureText(mk.label).width;
      if (x - tw / 2 < lastX + 10 || x - tw / 2 < x0 - 30 || x + tw / 2 > x1 + 10) continue;
      ctx.fillStyle = mk.strong ? C['--ink-2'] : C['--muted'];
      ctx.fillText(mk.label, x, bottom + 7); lastX = x + tw / 2;
    }
  }
  function line(ctx, X, Y, arr, color, width = 1.75, dash) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath(); for (let j = 0; j < V.n; j++) { const x = X(j), y = Y(arr[j]); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); ctx.restore();
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
  function drawGen() {
    const c = setup($('cv-gen')), { ctx } = c, n = V.n;
    const layers = V.layers.filter(l => !state.hidden.has(l.id));
    const pos = new Float64Array(n), neg = new Float64Array(n), tops = [];
    for (const l of layers) {
      const a = l.s, p0 = Float64Array.from(pos), n0 = Float64Array.from(neg);
      for (let j = 0; j < n; j++) { const v = a[j]; if (v > 0) pos[j] += v; else neg[j] += v; }
      tops.push({ l, p0, p1: Float64Array.from(pos), n0, n1: Float64Array.from(neg) });
    }
    let mx = 0, mn = 0; for (let j = 0; j < n; j++) { mx = Math.max(mx, pos[j]); mn = Math.min(mn, neg[j]); }
    const cap = capacityOf();
    if (cap) mx = Math.max(mx, cap * 1.04);
    const dom = nice(0, Math.max(mx, 1), 5);
    if (mn < 0) dom.lo = mn * 1.2;
    const F = frame(c, dom, v => fmt(v));
    const { X, Y } = F;
    for (const L of tops) {
      let fill = L.l.hatch ? ctx.createPattern(PAT[L.l.hatch], 'repeat') : colourOf(L.l);
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
    if (state.hover != null) {
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
    const dom = nice(0, mx * 1.08, 3);
    const F = frame(c, dom, v => '$' + fmt(v)), { X, Y } = F;
    const r = state.region, aNI = r === 'SI' ? 0.35 : 1, aSI = r === 'NI' ? 0.35 : 1;
    line(ctx, X, Y, V.pSI, alpha(C['--p-si'], aSI));
    line(ctx, X, Y, V.pNI, alpha(C['--p-ni'], aNI));
    const prim = r === 'SI' ? V.pSI : V.pNI; let jm = 0; for (let j = 1; j < V.n; j++) if (prim[j] > prim[jm]) jm = j;
    const lbl = `High ${money(prim[jm])} · ${chip(jm)}`;
    ctx.font = FONT; const tw = ctx.measureText(lbl).width, x = X(jm), y = Y(prim[jm]);
    ctx.fillStyle = C['--ink-2']; ctx.textBaseline = 'middle';
    if (x + 10 + tw < F.x1) { ctx.textAlign = 'left'; ctx.fillText(lbl, x + 9, Math.max(F.top + 6, y)); }
    else { ctx.textAlign = 'right'; ctx.fillText(lbl, x - 9, Math.max(F.top + 6, y)); }
    if (state.hover == null) dot(ctx, x, y, r === 'SI' ? C['--p-si'] : C['--p-ni']);
    cursor(ctx, F);
    if (state.hover != null) { const j = state.hover; dot(ctx, X(j), Y(V.pSI[j]), alpha(C['--p-si'], aSI)); dot(ctx, X(j), Y(V.pNI[j]), alpha(C['--p-ni'], aNI)); }
  }
  function drawDemand() {
    const c = setup($('cv-demand')), { ctx } = c, showXT = state.region !== 'NI';
    const xt = V.metered.map((v, j) => v - V.tiwai[j]);
    let mn = Infinity, mx = 0;
    for (let j = 0; j < V.n; j++) { mx = Math.max(mx, V.underlying[j], V.metered[j]); mn = Math.min(mn, showXT ? xt[j] : V.metered[j]); }
    const dom = nice(mn * 0.95, mx * 1.02, 3);
    const F = frame(c, dom, v => fmt(v)), { X, Y } = F;
    if (showXT) line(ctx, X, Y, xt, C['--accent']);
    line(ctx, X, Y, V.underlying, C['--ink-2'], 1.5, [4, 3]);
    line(ctx, X, Y, V.metered, C['--ink']);
    cursor(ctx, F);
    if (state.hover != null) { const j = state.hover; if (showXT) dot(ctx, X(j), Y(xt[j]), C['--accent']); dot(ctx, X(j), Y(V.underlying[j]), C['--ink-2']); dot(ctx, X(j), Y(V.metered[j]), C['--ink']); }
  }
  function drawHvdc() {
    const c = setup($('cv-hvdc')), { ctx } = c;
    let mn = 0, mx = 0; for (let j = 0; j < V.n; j++) { mn = Math.min(mn, V.hvdc[j]); mx = Math.max(mx, V.hvdc[j]); }
    const dom = nice(mn, mx, 2);
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
    const dom = nice(0, Math.max(mx, 10) * 1.1, 2);
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
    const dom = { lo, hi: 100, ticks: lo <= 50 ? [lo, 50, 100].filter((v, i, a) => a.indexOf(v) === i) : [lo, Math.round((lo + 100) / 2 / 5) * 5, 100] };
    const F = frame(c, dom, v => v + '%', { axis: true }), { X, Y } = F;
    area(ctx, X, Y, V.ren, lo, alpha(C['--accent'], 0.14));
    line(ctx, X, Y, V.ren, C['--accent']);
    cursor(ctx, F);
    if (state.hover != null) dot(ctx, X(state.hover), Y(V.ren[state.hover]), C['--accent']);
  }

  // ---------- summary ----------
  const REGION = { NZ: 'New Zealand', NI: 'North Island', SI: 'South Island' };
  function crumbs() {
    const d = state.drill, parts = [{ label: 'Generation', to: d.group || d.fuel ? { ...TOP_LEVEL } : null }];
    if (d.group) parts.push({ label: groupById(d.group).name, to: d.fuel ? { group: d.group, fuel: null, plant: null } : null });
    if (d.fuel) parts.push({ label: FUEL[d.fuel].name, to: d.plant ? { group: d.group, fuel: d.fuel, plant: null } : null });
    if (d.plant) parts.push({ label: d.plant, to: null });
    return parts;
  }
  function renderCrumbs() {
    const parts = crumbs(), h = $('gen-title'), d = state.drill;
    h.innerHTML = parts.map((p, i) => (i ? '<span class="sep" aria-hidden="true">›</span>' : '') + (p.to ? `<button type="button" data-i="${i}">${esc(p.label)}</button>` : `<span aria-current="${i === parts.length - 1 ? 'page' : 'false'}">${esc(p.label)}</span>`)).join('');
    h.querySelectorAll('button').forEach(b => b.addEventListener('click', () => drillTo(parts[+b.dataset.i].to)));
    const lv = level();
    $('gen-unit').textContent = {
      top: VIEWS[state.view].groups ? 'MW, stacked by group' : 'MW, stacked by fuel',
      fuel: 'MW, stacked by fuel', plant: 'MW, stacked by plant',
      unit: V.layers.length > 1 ? 'MW, by grid connection' : 'MW',
    }[lv];
    const up = lv !== 'top' ? parts[parts.length - 2] : null;
    $('sum-level').hidden = !up;
    if (up) {
      $('sum-level-txt').textContent = {
        fuel: () => `${groupById(d.group).name} · ${REGION[state.region]}`,
        plant: () => `${FUEL[d.fuel].name} plants · ${REGION[state.region]}`,
        unit: () => V.layers.length > 1 ? `${d.plant} · by grid connection` : d.plant,
      }[lv]();
      $('sum-back').textContent = `‹ ${up.label === 'Generation' ? 'All sources' : up.label}`;
      $('sum-back').onclick = () => drillTo(up.to);
    }
  }
  function buildSummary() {
    renderCrumbs();
    const body = $('mix-body'); body.innerHTML = '';
    $('col-name').textContent = { top: 'Source', fuel: 'Fuel', plant: 'Plant', unit: V.layers.length > 1 ? 'Connection' : 'Plant' }[level()];
    for (const l of V.layers) {
      const tr = document.createElement('tr'); tr.style.setProperty('--c', colourOf(l));
      if (state.hidden.has(l.id)) tr.className = 'off';
      const nameHtml = `${esc(l.name)}${l.tag ? ` <span class="tag">${l.tag}</span>` : ''}`;
      const canHide = V.layers.length > 1;
      tr.innerHTML = `<td><div class="row-name">${canHide ? `<button type="button" class="sw-btn" aria-pressed="${!state.hidden.has(l.id)}" aria-label="Show ${esc(l.name)} in the chart"><span class="sw${l.hatch ? ' hatch' : ''}"></span></button>` : `<span class="sw-btn"><span class="sw"></span></span>`}${l.drill ? `<button type="button" class="drill">${nameHtml}</button>` : `<span class="nm">${nameHtml}</span>`}</div></td><td class="n" data-q></td><td class="n"><div class="share"><span data-s></span><span class="bar" data-b></span></div></td>`;
      if (canHide) tr.querySelector('.sw-btn').addEventListener('click', () => {
        state.hidden.has(l.id) ? state.hidden.delete(l.id) : state.hidden.add(l.id);
        tr.classList.toggle('off', state.hidden.has(l.id));
        tr.querySelector('.sw-btn').setAttribute('aria-pressed', String(!state.hidden.has(l.id)));
        drawGen();
      });
      if (l.drill) tr.querySelector('.drill').addEventListener('click', () => drillTo(l.drill));
      l.row = tr;
      body.appendChild(tr);
    }
    $('lg-xt').hidden = state.region === 'NI';
  }
  const setSys = rows => { $('sys').innerHTML = rows.filter(Boolean).map(([k, v, s]) => `<dt>${k}</dt><dd>${v}${s ? `<small>${s}</small>` : ''}</dd>`).join(''); };
  const hvTxt = v => Math.abs(v) < 1 ? '0' : `${fmt(Math.abs(v))}`;
  const hvDir = v => Math.abs(v) < 1 ? '' : v > 0 ? 'MW north' : 'MW south';
  const signedTxt = (l, v, range) => range ? (l.id === 'hvdc' ? (v >= 0 ? 'net in' : 'net out') : 'net')
    : l.id === 'hvdc' ? (Math.abs(v) < 1 ? '—' : v > 0 ? 'import' : 'export') : (Math.abs(v) < 1 ? 'idle' : v > 0 ? 'output' : 'charging');
  function totalLabel() {
    const lv = level(), d = state.drill;
    return lv === 'top' ? 'Total generation' : lv === 'fuel' ? `Total ${groupById(d.group).name.toLowerCase()}`
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
      const pe = lp(M.END), p0 = lp(V.t[0]);
      $('sum-when').textContent = RANGES[state.range].span || `Since ${p0.dom} ${MON[p0.mon]} ${p0.y}`;
      $('sum-sub').textContent = `to ${clock(pe)} ${dayLbl(pe)}${RANGES[state.range].model === 'live' ? '' : ' ' + pe.y} · energy and averages`;
      const E = new Map(); let tot = 0;
      for (const l of layers) { let s = 0; for (let i = 0; i < V.n; i++) s += l.s[i] * V.hrs[i]; E.set(l, s / 1000); }
      if (level() === 'top') { for (let i = 0; i < V.n; i++) tot += V.gen[i] * V.hrs[i]; tot /= 1000; }
      else for (const l of layers) tot += l.signed ? E.get(l) : Math.max(0, E.get(l));
      // energy in GWh, or TWh once totals run past 10,000 GWh
      const tw = Math.abs(tot) >= 1e4, en = v => gwh(tw ? v / 1000 : v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      $('col-q').textContent = tw ? 'TWh' : 'GWh';
      for (const l of layers) {
        const e = E.get(l);
        l.row.querySelector('[data-q]').textContent = en(e);
        l.row.querySelector('[data-s]').textContent = l.signed ? signedTxt(l, e, true) : tot > 0 ? (e / tot * 100).toFixed(1) + '%' : '—';
        l.row.querySelector('[data-b]').style.transform = `scaleX(${l.signed || tot <= 0 ? 0 : Math.max(0, e / tot)})`;
      }
      $('tot-q').textContent = en(tot); $('tot-s').textContent = layers.some(l => l.signed) && level() !== 'top' ? 'net' : '100%';
      let pn = 0, ps = 0, pk = 0, pku = 0, ti = 0, hv = 0, em = 0, gw = 0, re = 0, hs = 0;
      for (let i = 0; i < V.n; i++) {
        const w = V.hrs[i]; hs += w; pn += V.pNI[i] * w; ps += V.pSI[i] * w; ti += V.tiwai[i] * w; hv += V.hvdc[i] * w;
        pk = Math.max(pk, V.pkMet[i]); pku = Math.max(pku, V.pkUnd[i]);
        em += V.co2[i] * V.gen[i] * w; re += V.ren[i] * V.gen[i] * w; gw += V.gen[i] * w;
      }
      setSys([
        ...plantRows(true),
        ['Price, North Island', money(pn / hs), 'avg'],
        ['Price, South Island', money(ps / hs), 'avg'],
        ['Peak demand, metered', fmt(pk), 'MW'],
        ['Peak, with rooftop solar', fmt(pku), 'MW'],
        showT && ['Tiwai smelter', fmt(ti / hs), 'MW avg'],
        Math.abs(hv) >= 1e7 ? ['HVDC, net transfer', (Math.abs(hv) / 1e6).toFixed(2), hv >= 0 ? 'TWh north' : 'TWh south']
          : ['HVDC, net transfer', (Math.abs(hv) / 1000).toFixed(1), hv >= 0 ? 'GWh north' : 'GWh south'],
        ['Emissions intensity', fmt(em / gw), 'g/kWh'],
        ['Renewable share', (re / gw).toFixed(1) + '%', ''],
      ]);
      for (const id of ['v-gen', 'v-pni', 'v-psi', 'v-met', 'v-und', 'v-xt', 'v-hv', 'v-co2', 'v-ren']) $(id).textContent = '';
      return;
    }
    const [when, sub] = heading(j), long = isLong();
    $('sum-when').textContent = when;
    $('sum-sub').textContent = sub;
    $('col-q').textContent = long ? 'MW avg' : 'MW';
    let tot = 0;
    if (level() === 'top') tot = V.gen[j]; else for (const l of layers) tot += l.signed ? l.s[j] : Math.max(0, l.s[j]);
    for (const l of layers) {
      const v = l.s[j];
      l.row.querySelector('[data-q]').textContent = fmt(v);
      l.row.querySelector('[data-s]').textContent = l.signed ? signedTxt(l, v, false) : tot > 0.5 ? (v / tot * 100).toFixed(1) + '%' : '—';
      l.row.querySelector('[data-b]').style.transform = `scaleX(${l.signed || tot <= 0.5 ? 0 : Math.max(0, v / tot)})`;
    }
    $('tot-q').textContent = fmt(tot); $('tot-s').textContent = layers.some(l => l.signed) && level() !== 'top' ? '' : '100%';
    setSys([
      ...plantRows(false, j),
      ['Price, North Island', money(V.pNI[j]), '/MWh'],
      ['Price, South Island', money(V.pSI[j]), '/MWh'],
      ['Demand, metered', fmt(V.metered[j]), long ? 'MW avg' : 'MW'],
      ['With rooftop solar', fmt(V.underlying[j]), long ? 'MW avg' : 'MW'],
      long && ['Peak demand, metered', fmt(V.pkMet[j]), 'MW'],
      showT && ['Tiwai smelter', fmt(V.tiwai[j]), long ? 'MW avg' : 'MW'],
      ['HVDC', hvTxt(V.hvdc[j]), hvDir(V.hvdc[j])],
      ['Emissions intensity', fmt(V.co2[j]), 'g/kWh'],
      ['Renewable share', V.ren[j].toFixed(1) + '%', ''],
    ]);
    $('v-gen').textContent = fmt(tot) + ' MW';
    $('v-pni').textContent = money(V.pNI[j]); $('v-psi').textContent = money(V.pSI[j]);
    $('v-met').textContent = fmt(V.metered[j]); $('v-und').textContent = fmt(V.underlying[j]);
    $('v-xt').textContent = showT ? fmt(V.metered[j] - V.tiwai[j]) : '';
    $('v-hv').textContent = `${hvTxt(V.hvdc[j])} ${V.hvdc[j] > 0.5 ? 'north' : V.hvdc[j] < -0.5 ? 'south' : ''}`;
    $('v-co2').textContent = fmt(V.co2[j]); $('v-ren').textContent = V.ren[j].toFixed(1) + '%';
  }

  // ---------- orchestration ----------
  let raf = 0;
  function drawAll() { drawGen(); drawPrice(); drawDemand(); drawHvdc(); drawCo2(); drawRen(); }
  function render() { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { drawAll(); updateSummary(); }); }
  function syncControls() {
    const seg = $('seg-int');
    if (seg.dataset.for !== state.range) {  // each range offers its own intervals
      seg.innerHTML = RANGES[state.range].ints.map(k => `<button type="button" data-v="${k}">${INTS[k].label}</button>`).join('');
      seg.dataset.for = state.range;
    }
    for (const [id, val] of [['seg-region', state.region], ['seg-range', state.range], ['seg-int', state.int]])
      for (const b of $(id).querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === val));
    $('sel-view').value = state.view;
  }

  // ---------- models: the live week, and history merged with it (loaded when a long range is first chosen) ----------
  const merge = kind => toModel(history.merged(kind, models.live), models.live.END);
  function useModel() {
    const m = models[RANGES[state.range].model];
    if (m !== M) { M = m; derive(); }
  }
  function report(extra = {}) {
    const kind = RANGES[state.range].model, ix = history.index;
    hooks.status?.({ range: state.range, kind, loading: false, error: '', liveEnd: models.live.END,
                     histFirst: kind !== 'live' && V ? V.t[0] : null, histEnd: kind !== 'live' ? M.histEnd : null,
                     histBuilt: ix && ix.built, ...extra });
  }
  let pending = 0;
  async function setRange(r) {
    const kind = RANGES[r].model, ticket = ++pending;
    if (kind !== 'live' && !models[kind]) {
      report({ range: r, kind, loading: true });
      for (const b of $('seg-range').querySelectorAll('button')) b.setAttribute('aria-busy', String(b.dataset.v === r));
      try {
        await history.load(kind, models.live.END);
        models[kind] = merge(kind);
      } catch (e) {
        if (ticket === pending) report({ range: r, kind, error: e.message || String(e) });
        return;
      } finally {
        for (const b of $('seg-range').querySelectorAll('button')) b.removeAttribute('aria-busy');
      }
      if (ticket !== pending) return;  // another range was chosen while this one loaded
    }
    state.range = r;
    if (!RANGES[r].ints.includes(state.int)) state.int = RANGES[r].def || RANGES[r].ints[0];
    useModel(); rebuild();
  }
  function rebuild() {
    const d = state.drill;
    if (d.plant) { const p = plantByName(d.plant); if (state.region !== 'NZ' && p.isl !== state.region) d.plant = null; }
    if (d.fuel && !plantsFor(d.fuel).length) { d.fuel = null; d.plant = null; }
    if (d.group && !groupById(d.group)?.f.some(k => present[state.region].includes(k))) d.group = null;
    V = buildView(); relayer(); state.hover = null; syncControls(); buildSummary(); render(); save(); report();
  }

  $('seg-region').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; state.region = b.dataset.v; state.hidden.clear(); rebuild(); });
  $('seg-range').addEventListener('click', e => { const b = e.target.closest('button'); if (!b || !Object.hasOwn(RANGES, b.dataset.v)) return; setRange(b.dataset.v); });
  $('sel-view').addEventListener('change', e => {
    if (!Object.hasOwn(VIEWS, e.target.value)) return;
    state.view = e.target.value; state.drill = { ...TOP_LEVEL }; state.hidden.clear(); rebuild();
  });
  $('seg-int').addEventListener('click', e => { const b = e.target.closest('button'); if (!b || !RANGES[state.range].ints.includes(b.dataset.v)) return; state.int = b.dataset.v; rebuild(); });

  const charts = $('charts');
  const indexAt = (cv, clientX) => {
    const r = cv.getBoundingClientRect(), x0 = PADL, x1 = r.width - PADR;
    const f = (clientX - r.left - x0) / (x1 - x0);
    return Math.max(0, Math.min(V.n - 1, Math.round(f * (V.n - 1))));
  };
  for (const cv of charts.querySelectorAll('canvas')) {
    cv.addEventListener('pointermove', e => {
      const j = indexAt(cv, e.clientX); if (j !== state.hover) { state.hover = j; render(); }
      if (cv.id === 'cv-gen' && e.pointerType === 'mouse') { const l = layerAt(e.clientX, e.clientY); cv.style.cursor = l && l.drill ? 'pointer' : ''; cv.title = l ? l.name + (l.drill ? ' — click to see ' + (l.drill.plant ? 'grid connections' : l.drill.fuel ? 'plants' : 'fuels') : '') : ''; }
    });
    cv.addEventListener('pointerdown', e => { state.hover = indexAt(cv, e.clientX); render(); });
  }
  $('cv-gen').addEventListener('click', e => { if (e.pointerType === 'touch') return; const l = layerAt(e.clientX, e.clientY); if (l && l.drill) drillTo(l.drill); });
  charts.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { state.hover = null; render(); } });
  charts.addEventListener('keydown', e => {
    const step = e.shiftKey ? { '5m': 12, '30m': 2, '1d': 7, '1w': 4, '1mo': 12 }[state.int] : 1;
    if (e.target !== charts) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const cur = state.hover == null ? V.n - 1 : state.hover;
      state.hover = Math.max(0, Math.min(V.n - 1, cur + (e.key === 'ArrowLeft' ? -step : step))); render();
    } else if (e.key === 'Home') { e.preventDefault(); state.hover = 0; render(); }
    else if (e.key === 'End') { e.preventDefault(); state.hover = V.n - 1; render(); }
    else if (e.key === 'Escape') { state.hover = null; render(); }
  });

  const updateAsof = () => { const pe = lp(M.END); $('asof').textContent = `Data to ${clock(pe)} ${dayLbl(pe)} ${tzName(M.END)}`; };
  updateAsof();

  const retheme = () => { readColours(); buildSummary(); render(); };
  const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  if (mq) mq.addEventListener('change', retheme);
  const mo = new MutationObserver(retheme);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const ro = new ResizeObserver(() => render());
  ro.observe(charts);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => render());

  readColours();
  rebuild();
  if (saved) setRange(saved);  // reopen on the viewer's last long range once its history has loaded

  return {
    // new data: keep the viewer's region, range, interval and drill-down; drop the hover point
    update(D2) {
      models.live = buildModel(D2);
      for (const kind of ['hh', 'day']) if (models[kind]) models[kind] = merge(kind);
      M = null; useModel(); updateAsof(); rebuild();
      // history gains days a few times a day: refresh what's loaded, at most hourly (history.load checks the age)
      for (const kind of ['hh', 'day']) if (models[kind]) history.load(kind, models.live.END).then(() => {
        models[kind] = merge(kind);
        if (RANGES[state.range].model === kind) { M = null; useModel(); rebuild(); }
      }).catch(() => {});
    },
    destroy() { mo.disconnect(); ro.disconnect(); if (mq) mq.removeEventListener('change', retheme); cancelAnimationFrame(raf); },
  };
}
