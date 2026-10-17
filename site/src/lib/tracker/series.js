// Time series for the tracker, from three sources merged per range:
//   live  /data/tracker.json             the last 7 days, 5-minute (the 24 h, 3 day and 7 day views)
//   hh    /data/history/hh/YYYY-MM.json   half-hourly months since 1 Aug 1997 (the 30-day view)
//   day   /data/history/day.json         daily averages since 1 Aug 1997 (the 1-year and all-time views)
// History is metered data wherever the EA has published it (about six weeks behind), then the EA's daily dispatch
// files, which arrive 1-4 days late, so the long views end with the live week averaged to half-hours or days. Built by ingest/history.py; layout as in tracker.json, with explicit times
// (t) and hours per point (h) where the step isn't constant.

// ---------- New Zealand time (handles the NZST/NZDT change; offset cached per hour) ----------
const NZ_PARTS = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
const offCache = new Map();
export function nzOffset(t) {
  const h = Math.floor(t / 36e5);
  let o = offCache.get(h);
  if (o === undefined) {
    const p = Object.fromEntries(NZ_PARTS.formatToParts(new Date(h * 36e5)).map(x => [x.type, x.value]));
    o = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - h * 36e5;
    offCache.set(h, o);
  }
  return o;
}
export const tzName = t => nzOffset(t) === 13 * 36e5 ? 'NZDT' : 'NZST';

// Period keys in NZ local time. Day 0 of the epoch was a Thursday, so +3 starts weeks on Monday.
const local = t => t + nzOffset(t);
export const KEY = {
  hh: t => Math.floor(local(t) / 18e5),
  day: t => Math.floor(local(t) / 864e5),
  week: t => Math.floor((Math.floor(local(t) / 864e5) + 3) / 7),
  month: t => { const d = new Date(local(t)); return d.getUTCFullYear() * 12 + d.getUTCMonth(); },
  year: t => new Date(local(t)).getUTCFullYear(),
};

// roof: embedded solar (rooftops and small ground-mounted arrays, estimated); roofU: its uncertainty (one standard deviation, MW); zero in data built before it existed
const SERIES = ['geo', 'bio', 'waste', 'coal', 'gas', 'diesel', 'hydro', 'wind', 'solar', 'roof', 'roofU', 'batt', 'hvdc', 'metered', 'underlying', 'tiwai', 'price'];
const F = (a, n) => (a ? Float64Array.from(a) : new Float64Array(n));
// node prices (the Prices page) can have gaps: null in the files, NaN here
const FN = (a, n) => (a ? Float64Array.from(a, v => (v == null ? NaN : v)) : new Float64Array(n).fill(NaN));
// island series: the standard ones (zero where a file lacks them) plus any others the file carries (the daily
// history's price spread and revenue by fuel, read by the Prices page)
const islKeys = s => [...new Set([...SERIES, ...Object.keys(s || {})])];
const mapNodes = (o, fn) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, fn(v)]));
const plantKey = p => `${p.name}|${p.fuel}|${p.isl}`;

// total generation per point, including embedded solar (output only: no HVDC, no battery charging), as the page sums it
const GEN = ['geo', 'bio', 'waste', 'coal', 'gas', 'diesel', 'hydro', 'wind', 'solar', 'roof', 'batt'];
// dispatchable plant (the Generation tab's headroom chart; history's peak.disp is the same sum, ingest/history.py)
export const DISPATCHABLE = ['hydro', 'gas', 'coal', 'diesel', 'batt'];
export function genTotal(S, region, fuels = GEN) {
  const n = S.t.length, o = new Float64Array(n);
  for (const k of fuels) {
    const a = region === 'SI' ? null : S.NI[k], b = region === 'NI' ? null : S.SI[k];
    for (let i = 0; i < n; i++) o[i] += Math.max(0, (a ? a[i] : 0) + (b ? b[i] : 0));
  }
  return o;
}

/** tracker.json or a history file -> segment: Float64Array series with times t and hours per point h. */
export function fromLayout(D) {
  const n = D.N;
  const t = D.t ? Float64Array.from(D.t) : Float64Array.from({ length: n }, (_, i) => D.t0 + i * D.step);
  const h = D.h ? Float64Array.from(D.h) : new Float64Array(n).fill(D.step / 36e5);
  const isl = s => Object.fromEntries(islKeys(s).map(k => [k, F(s[k], n)]));
  const peak = D.peak ? Object.fromEntries(Object.entries(D.peak).map(([r, o]) => [r, Object.fromEntries(Object.entries(o).map(([k, v]) => [k, F(v, n)]))])) : null;
  return {
    n, t, h, NI: isl(D.NI), SI: isl(D.SI), hvdcN: F(D.hvdcN, n), peak, nodes: mapNodes(D.nodes, v => FN(v, n)),
    plants: D.plants.map(p => ({ ...p, s: F(p.s, n), units: p.units && p.units.map(u => ({ ...u, s: F(u.s, n) })) })),
  };
}

/** Points [a, b) of a segment. */
export function slice(S, a, b) {
  const cut = x => x.slice(a, b);
  const isl = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, cut(v)]));
  return {
    n: Math.max(0, b - a), t: cut(S.t), h: cut(S.h), NI: isl(S.NI), SI: isl(S.SI), hvdcN: cut(S.hvdcN), nodes: isl(S.nodes || {}),
    peak: S.peak && Object.fromEntries(Object.entries(S.peak).map(([r, o]) => [r, isl(o)])),
    plants: S.plants.map(p => ({ ...p, s: cut(p.s), units: p.units && p.units.map(u => ({ ...u, s: cut(u.s) })) })),
  };
}

/** Average consecutive points with the same period key (weighted by hours); peaks are the period maxima. */
export function aggregate(S, key) {
  const groups = [];
  let a = 0;
  for (let i = 1; i <= S.n; i++) if (i === S.n || key(S.t[i]) !== key(S.t[a])) { groups.push([a, i]); a = i; }
  const n = groups.length, h = new Float64Array(n);
  groups.forEach(([a, b], j) => { for (let i = a; i < b; i++) h[j] += S.h[i]; });
  const avg = arr => {
    const o = new Float64Array(n);
    groups.forEach(([a, b], j) => { let s = 0; for (let i = a; i < b; i++) s += arr[i] * S.h[i]; o[j] = s / h[j]; });
    return o;
  };
  const avgNaN = arr => {  // node prices: gaps don't count
    const o = new Float64Array(n);
    groups.forEach(([a, b], j) => { let s = 0, w = 0; for (let i = a; i < b; i++) if (arr[i] === arr[i]) { s += arr[i] * S.h[i]; w += S.h[i]; } o[j] = w ? s / w : NaN; });
    return o;
  };
  const max = arr => { const o = new Float64Array(n); groups.forEach(([a, b], j) => { let m = -Infinity; for (let i = a; i < b; i++) m = Math.max(m, arr[i]); o[j] = m; }); return o; };
  const isl = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, avg(v)]));
  let peak;
  if (S.peak) peak = Object.fromEntries(Object.entries(S.peak).map(([r, o]) => [r, Object.fromEntries(Object.entries(o).map(([k, v]) => [k, max(v)]))]));
  else {
    const nz = k => S.NI[k].map((v, i) => v + S.SI[k][i]);
    peak = {};
    for (const [r, met, und] of [['NZ', nz('metered'), nz('underlying')], ['NI', S.NI.metered, S.NI.underlying], ['SI', S.SI.metered, S.SI.underlying]])
      peak[r] = { metered: max(met), underlying: max(und), gen: max(genTotal(S, r)), disp: max(genTotal(S, r, DISPATCHABLE)) };
  }
  return {
    n, t: Float64Array.from(groups, ([a]) => S.t[a]), h, NI: isl(S.NI), SI: isl(S.SI), hvdcN: avg(S.hvdcN), peak, nodes: mapNodes(S.nodes, avgNaN),
    plants: S.plants.map(p => ({ ...p, s: avg(p.s), units: p.units && p.units.map(u => ({ ...u, s: avg(u.s) })) })),
  };
}

/** Join segments end to end. Plants are matched by name, fuel and island; one missing from a segment is zero there. */
export function concat(segs) {
  segs = segs.filter(s => s.n > 0);
  const n = segs.reduce((a, s) => a + s.n, 0);
  const join = (get, gap = 0) => { const o = new Float64Array(n).fill(gap); let pos = 0; for (const s of segs) { const v = get(s); if (v) o.set(v, pos); pos += s.n; } return o; };
  const keys = side => [...new Set(segs.flatMap(s => Object.keys(s[side] || {})).concat(side === 'nodes' ? [] : SERIES))];
  const isl = side => Object.fromEntries(keys(side).map(k => [k, join(s => s[side][k])]));
  const nodes = Object.fromEntries(keys('nodes').map(k => [k, join(s => s.nodes && s.nodes[k], NaN)]));
  const out = { n, t: join(s => s.t), h: join(s => s.h), NI: isl('NI'), SI: isl('SI'), hvdcN: join(s => s.hvdcN), nodes, peak: null, plants: [] };
  if (segs.length && segs.every(s => s.peak)) {
    out.peak = {};
    // a series some segments lack (peak generation in history built before it was added) is dropped
    for (const r of Object.keys(segs[0].peak))
      out.peak[r] = Object.fromEntries(Object.keys(segs[0].peak[r]).filter(k => segs.every(s => s.peak[r][k])).map(k => [k, join(s => s.peak[r][k])]));
  }
  const plants = new Map();
  let pos = 0;
  for (const s of segs) {
    for (const p of s.plants) {
      const k = plantKey(p);
      let q = plants.get(k);
      if (!q) plants.set(k, (q = { name: p.name, fuel: p.fuel, isl: p.isl, poc: [], cap: null, s: new Float64Array(n), units: new Map() }));
      q.s.set(p.s, pos);
      q.poc = [...new Set([...q.poc, ...p.poc])].sort();
      if (p.cap != null) q.cap = p.cap;  // the latest capacity
      for (const u of p.units || []) {
        if (!q.units.has(u.name)) q.units.set(u.name, { name: u.name, cap: u.cap, s: new Float64Array(n) });
        q.units.get(u.name).s.set(u.s, pos);
      }
    }
    pos += s.n;
  }
  for (const q of plants.values()) out.plants.push({ ...q, units: q.units.size > 1 ? [...q.units.values()].sort((a, b) => a.name < b.name ? -1 : 1) : undefined });
  out.plants.sort((a, b) => (a.fuel < b.fuel ? -1 : a.fuel > b.fuel ? 1 : 0) || b.s.reduce((x, y) => x + y, 0) - a.s.reduce((x, y) => x + y, 0));
  return out;
}

/** First index with t >= x (t ascending). */
export function firstAtOrAfter(t, x) {
  let lo = 0, hi = t.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (t[m] < x) lo = m + 1; else hi = m; }
  return lo;
}

// ---------- history files ----------

async function getJSON(path) {
  const r = await fetch(path, { cache: 'no-cache' });
  if (r.status === 404) throw Object.assign(new Error('History is still being prepared. Please check back later.'), { missing: true });
  if (!r.ok) throw new Error(`The history file returned ${r.status}.`);
  return r.json();
}

/** Loads and caches the history files; merges them with the live week. */
export function historyStore(base = '/data/history') {
  const H = { index: null, at: 0, day: null, hh: new Map() };
  async function index() {
    if (!H.index || Date.now() - H.at > 3600e3) {
      const ix = await getJSON(`${base}/index.json`);
      if (H.index && ix.built !== H.index.built) { H.day = null; H.hh.clear(); }  // rebuilt since: drop cached files
      H.index = ix; H.at = Date.now();
    }
    return H.index;
  }
  const monthOf = t => { const d = new Date(local(t)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
  return {
    get index() { return H.index; },
    /** Months of half-hourly history covering [from, to], among those published. */
    monthsFor(from, to) {
      const ix = H.index, want = [];
      if (!ix) return want;
      to = Math.min(to, ix.end);
      for (let t = Math.max(from, ix.first); ; t += 20 * 864e5) {
        const m = monthOf(Math.min(t, to));
        if (!want.includes(m)) want.push(m);
        if (t >= to) break;
      }
      return want.filter(m => ix.months.includes(m));
    },
    /** True if what a view of [from, to] needs is already loaded. */
    has(kind, from, to) {
      if (!H.index || Date.now() - H.at > 3600e3) return false;
      return kind === 'day' ? !!H.day : this.monthsFor(from, to).every(m => H.hh.has(m));
    },
    /** Fetch what a view of [from, to] needs: 'hh' the half-hourly months covering it, 'day' the daily file. */
    async load(kind, from, to) {
      await index();
      if (kind === 'day') { if (!H.day) H.day = fromLayout(await getJSON(`${base}/day.json`)); return; }
      const want = this.monthsFor(from, to).filter(m => !H.hh.has(m));
      await Promise.all(want.map(async m => H.hh.set(m, fromLayout(await getJSON(`${base}/hh/${m}.json`)))));
    },
    /** History of one kind followed by the live week (5-minute segment) averaged to the same step. */
    merged(kind, live) {
      const ix = H.index;
      const hist = kind === 'day' ? [H.day] : [...H.hh.keys()].sort().map(m => H.hh.get(m));
      if (!hist.length || !hist[0]) throw new Error('History is still being prepared. Please check back later.');
      const step = kind === 'day' ? KEY.day : KEY.hh;
      const last = hist[hist.length - 1], histEnd = Math.min(ix.end, last.t[last.n - 1]);
      // the live tail starts at the first period wholly after the history
      const from = firstAtOrAfter(live.t, kind === 'day' ? histEnd + 864e5 - 36e5 : histEnd + 18e5);
      let a = from;
      while (a < live.n && step(live.t[a]) === step(histEnd)) a++;
      const tail = aggregate(slice(live, a, live.n), step);
      return { ...concat([...hist.map(s => slice(s, 0, firstAtOrAfter(s.t, histEnd + 1))), tail]), histEnd };
    },
  };
}
