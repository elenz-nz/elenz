// Records: names, wording and formatting for the records the history job keeps (ingest/records.py writes
// /data/history/records.json), and the check of the live week against them.
//
// Each record's id matches records.py. kind: 'hh' (a half-hour), 'month' (a calendar month) or 'run' (the longest
// run of half-hours); fam: what makes it official (gen: metered generation and demand; price: final prices; hvdc:
// metered HVDC), as in records.py; tok: its colour token; regions it is kept for, and what to say for the others.

export const RECORDS_URL = '/data/history/records.json';
export const LIVE_URL = '/data/tracker.json';
export const NEW_DAYS = 30;        // as records.py: a record is "new" this long after it first appears
export const GROUPS = ['Demand', 'Renewables', 'Wind and solar', 'Prices', 'HVDC'];
export const REGIONS = [
  { id: 'NZ', name: 'New Zealand', short: 'NZ' },
  { id: 'NI', name: 'North Island', short: 'North' },
  { id: 'SI', name: 'South Island', short: 'South' },
];
const ALL = ['NZ', 'NI', 'SI'];

export const DEFS = [
  { id: 'demand_max', kind: 'hh', fam: 'gen', group: 'Demand', name: 'Peak demand', sub: 'Highest half-hour of grid demand', unit: 'MW', tok: '--ink', regions: ALL },
  { id: 'demand_min', kind: 'hh', fam: 'gen', group: 'Demand', name: 'Lowest demand', sub: 'Lowest half-hour of grid demand', unit: 'MW', tok: '--ink', regions: ALL },
  { id: 'ren_max', kind: 'hh', fam: 'gen', group: 'Renewables', name: 'Highest renewable share', sub: 'Half-hour', unit: '%', dp: 1, tok: '--g-ren', regions: ALL },
  { id: 'ren_month_max', kind: 'month', fam: 'gen', group: 'Renewables', name: 'Highest renewable share', sub: 'Calendar month', unit: '%', dp: 1, tok: '--g-ren', regions: ALL },
  { id: 'ren_min', kind: 'hh', fam: 'gen', group: 'Renewables', name: 'Lowest renewable share', sub: 'Half-hour', unit: '%', dp: 1, tok: '--g-ren', regions: ALL },
  { id: 'ren_month_min', kind: 'month', fam: 'gen', group: 'Renewables', name: 'Lowest renewable share', sub: 'Calendar month', unit: '%', dp: 1, tok: '--g-ren', regions: ALL },
  { id: 'ren_run', kind: 'run', fam: 'gen', group: 'Renewables', name: 'Longest run at 90% renewable or more', sub: 'Every half-hour in a row', unit: 'h', tok: '--g-ren', regions: ['NZ', 'NI'],
    na: { SI: 'The South Island’s generation is all renewable' } },
  { id: 'fossil_min', kind: 'hh', fam: 'gen', group: 'Renewables', name: 'Lowest fossil generation', sub: 'Rankines, gas, diesel and waste heat', unit: 'MW', tok: '--g-fossil', regions: ALL },
  { id: 'huntly_off_run', kind: 'run', fam: 'gen', group: 'Renewables', name: 'Longest with no Huntly Rankine running', sub: 'The coal and gas units at Huntly', unit: 'h', tok: '--f-coal', regions: ['NZ'],
    na: { NI: 'Shown for New Zealand', SI: 'Huntly is in the North Island' } },
  { id: 'wind_max', kind: 'hh', fam: 'gen', group: 'Wind and solar', name: 'Peak wind', sub: 'Half-hour', unit: 'MW', tok: '--f-wind', regions: ALL },
  { id: 'wind_month_max', kind: 'month', fam: 'gen', group: 'Wind and solar', name: 'Windiest month', sub: 'Wind generation in a calendar month', unit: 'GWh', dp: 1, tok: '--f-wind', regions: ALL },
  { id: 'solar_max', kind: 'hh', fam: 'gen', group: 'Wind and solar', name: 'Peak grid solar', sub: 'Solar farms the market dispatches', unit: 'MW', tok: '--f-solar', regions: ALL },
  { id: 'roof_max', kind: 'hh', fam: 'gen', group: 'Wind and solar', name: 'Peak embedded solar', sub: 'Rooftops and small arrays, modelled', unit: 'MW', tok: '--f-solar', est: true, regions: ALL },
  { id: 'price_max', kind: 'hh', fam: 'price', group: 'Prices', name: 'Highest price', sub: 'Half-hour, final price', unit: '$', dp: 2, tok: '--accent', regions: ALL },
  { id: 'gap_max', kind: 'hh', fam: 'price', group: 'Prices', name: 'Biggest gap between the islands', sub: 'Haywards against Benmore, half-hour', unit: '$', dp: 2, tok: '--accent', regions: ['NZ'],
    na: { NI: 'Shown for New Zealand', SI: 'Shown for New Zealand' } },
  { id: 'low_price_run', kind: 'run', fam: 'price', group: 'Prices', name: 'Longest run of near-zero prices', sub: 'Under $5/MWh (New Zealand: both islands)', unit: 'h', tok: '--accent', regions: ALL },
  { id: 'hvdc_n_max', kind: 'hh', fam: 'hvdc', group: 'HVDC', name: 'Most sent north', sub: 'Benmore to Haywards, half-hour', unit: 'MW', tok: '--f-hvdc', regions: ['NZ'],
    na: { NI: 'Shown for New Zealand', SI: 'Shown for New Zealand' } },
  { id: 'hvdc_s_max', kind: 'hh', fam: 'hvdc', group: 'HVDC', name: 'Most sent south', sub: 'Haywards to Benmore, half-hour', unit: 'MW', tok: '--f-hvdc', regions: ['NZ'],
    na: { NI: 'Shown for New Zealand', SI: 'Shown for New Zealand' } },
];
export const def = (id) => DEFS.find((d) => d.id === id);
/** "Peak wind" or, where two records share a name, "Highest renewable share, month". */
export const fullName = (d) => (DEFS.filter((x) => x.name === d.name).length > 1 ? `${d.name}, ${d.kind === 'month' ? 'month' : 'half-hour'}` : d.name);

// milestones: the first time a record passed each level (from its progression)
export const MILESTONES = [
  { id: 'wind_max', at: [100, 250, 500, 750, 1000, 1250, 1500] },
  { id: 'solar_max', at: [100, 250, 500, 750, 1000] },
  { id: 'roof_max', at: [100, 250, 500, 750, 1000] },
  { id: 'ren_max', at: [90, 95, 98, 99] },
  { id: 'demand_max', at: [6000, 6500, 7000, 7500] },
];

// ---------- the file ----------

/** The record (or month record, or run) for one id and region, or null. */
export function get(R, id, region) {
  const d = def(id);
  if (!R || !d) return null;
  const group = d.kind === 'hh' ? R.records : d.kind === 'month' ? R.months : R.runs;
  return group?.[id]?.[region] ?? null;
}

/** Why a record isn't shown for a region: the definition's note, or what its data says (always the same value). */
export function notShown(d, region, rec) {
  if (!d.regions.includes(region)) return d.na?.[region] ?? 'Shown for New Zealand';
  if (!rec) return 'No data yet';
  if (rec.constant) {
    if (d.id.startsWith('ren') && rec.v === 100) return 'Always 100%: no fossil plant in the South Island';
    if (d.id === 'fossil_min' && rec.v === 0) return 'No fossil plant in the South Island';
    if (rec.v === 0) return 'None in the official data yet';
  }
  return null;
}

// ---------- formatting ----------

const NZ = 'Pacific/Auckland';
const F = {
  clock: new Intl.DateTimeFormat('en-NZ', { timeZone: NZ, hour: 'numeric', minute: '2-digit', hour12: true }),
  day: new Intl.DateTimeFormat('en-NZ', { timeZone: NZ, day: 'numeric', month: 'short', year: 'numeric' }),
  dayLong: new Intl.DateTimeFormat('en-NZ', { timeZone: NZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  month: new Intl.DateTimeFormat('en-NZ', { timeZone: NZ, month: 'long', year: 'numeric' }),
  monthShort: new Intl.DateTimeFormat('en-NZ', { timeZone: NZ, month: 'short', year: 'numeric' }),
  monthName: new Intl.DateTimeFormat('en-NZ', { timeZone: NZ, month: 'long' }),
  year: new Intl.DateTimeFormat('en-NZ', { timeZone: NZ, year: 'numeric' }),
};
export const clock = (t) => F.clock.format(t).replace(/\s?([ap])\.?m\.?/i, (_, x) => ` ${x.toLowerCase()}m`);
export const dayOf = (t) => F.day.format(t);
export const dayLong = (t) => F.dayLong.format(t);
export const monthOf = (t) => F.month.format(t);
export const monthShort = (t) => F.monthShort.format(t);
export const yearOf = (t) => F.year.format(t);
export const MONTHS = Array.from({ length: 12 }, (_, i) => F.monthName.format(Date.UTC(2026, i, 15)));

/** A value as {n, u}: the number and its unit, for a table cell. */
export function parts(d, v) {
  if (v == null) return { n: '–', u: '' };
  const dp = d.dp ?? 0;
  if (d.unit === '$') {
    const big = Math.abs(v) >= 100;
    return { n: (v < 0 ? '−$' : '$') + Math.abs(v).toLocaleString('en-NZ', { minimumFractionDigits: big ? 0 : 2, maximumFractionDigits: big ? 0 : 2 }), u: '/MWh' };
  }
  if (d.unit === '%') return { n: v.toFixed(dp), u: '%' };
  if (d.unit === 'h') return { n: v.toLocaleString('en-NZ', { maximumFractionDigits: 1 }), u: v === 1 ? 'hour' : 'hours' };
  return { n: v.toLocaleString('en-NZ', { minimumFractionDigits: dp, maximumFractionDigits: dp }), u: d.unit };
}
/** A value as one string: "1,148 MW", "98.9%", "$12,019/MWh", "354 hours". */
export function fmt(d, v) {
  const p = parts(d, v);
  return d.unit === '%' ? p.n + p.u : d.unit === '$' ? p.n + p.u : `${p.n} ${p.u}`;
}
/** "354 hours (14.8 days)" for a long run. */
export const runLength = (h) => (h >= 48 ? `${h.toLocaleString('en-NZ', { maximumFractionDigits: 1 })} hours (${(h / 24).toFixed(1)} days)` : `${h} hours`);

/** When a record was set: "5:30 pm, 29 May 2001", "May 2001", or a run's start and end. */
export function when(d, rec, long = false) {
  if (!rec) return '';
  if (d.kind === 'month') return monthOf(rec.t);
  if (d.kind === 'run') {
    const end = rec.t + rec.v * 36e5 - 1800e3;   // the start of its last half-hour
    return `${long ? clock(rec.t) + ', ' : ''}${dayOf(rec.t)} to ${long ? clock(end + 1800e3) + ', ' : ''}${dayOf(end + 1800e3)}${rec.ongoing ? ' (still going)' : ''}`;
  }
  return `${clock(rec.t)}, ${long ? dayLong(rec.t) : dayOf(rec.t)}`;
}
/** A previous record or progression step: "1,112 MW, 14 Aug 2025". */
export function step(d, tv) {
  if (!tv) return '';
  const w = d.kind === 'month' ? monthShort(tv[0]) : dayOf(tv[0]);
  return `${fmt(d, tv[1])}, ${w}`;
}

/** Roughly when the EA publishes metered data for the month containing t (5-6 weeks after it ends). */
export function meteredDue(t) {
  const d = new Date(t + 13 * 36e5);
  const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  const due = new Date(end + 38 * 864e5);
  const part = due.getUTCDate() <= 10 ? 'early' : due.getUTCDate() <= 20 ? 'mid' : 'late';
  return `${part} ${F.monthName.format(due)}`;
}

/** Whole days between two times. */
export const daysBetween = (a, b) => Math.floor((b - a) / 864e5);

// ---------- the live week ----------
// The live 5-minute data (tracker.json, dispatch) averaged to half-hours, checked against the official records for
// generation and demand, as records.py's series() works them out. Prices and HVDC are left to the history job: live
// prices are dispatch prices (final prices arrive a day later and often differ), and live HVDC is an estimate.

const GEN = ['geo', 'bio', 'waste', 'coal', 'gas', 'diesel', 'hydro', 'wind', 'solar', 'roof', 'batt'];
const REN = ['geo', 'bio', 'hydro', 'wind', 'solar', 'roof'];
const FOSSIL = ['coal', 'gas', 'diesel', 'waste'];

/** tracker.json -> { id: { region: Float64Array } } of half-hourly averages, and their times. */
function halfHours(D) {
  const n = D.N, step = D.step, k = Math.round(1800e3 / step);
  const t = (j) => D.t0 + j * step;
  // complete half-hours only: the first interval on a :00 or :30 boundary, k intervals each
  let j0 = 0;
  while (j0 < n && t(j0) % 1800e3 !== 0) j0++;
  const m = Math.floor((n - j0) / k);
  const T = Array.from({ length: m }, (_, i) => t(j0 + i * k));
  const avg = (arr) => {
    const out = new Float64Array(m);
    for (let i = 0; i < m; i++) { let s = 0; for (let q = 0; q < k; q++) s += arr[j0 + i * k + q]; out[i] = s / k; }
    return out;
  };
  const z = new Array(n).fill(0);
  const a = (isl, key) => D[isl][key] ?? z;
  const out = {};
  for (const r of ['NZ', 'NI', 'SI']) {
    const fuel = (f) => (r === 'NZ' ? a('NI', f).map((x, j) => x + a('SI', f)[j]) : a(r, f));
    const F = Object.fromEntries(GEN.map((f) => [f, fuel(f).map((x) => Math.max(0, x))]));
    const gen = new Array(n).fill(0), ren = new Array(n).fill(0), fos = new Array(n).fill(0);
    for (let j = 0; j < n; j++) {
      for (const f of GEN) gen[j] += F[f][j];
      for (const f of REN) ren[j] += F[f][j];
      for (const f of FOSSIL) fos[j] += F[f][j];
    }
    const dem = r === 'NZ' ? a('NI', 'metered').map((x, j) => x + a('SI', 'metered')[j]) : a(r, 'metered');
    const G = avg(gen), Rn = avg(ren);
    const S = {
      demand_max: avg(dem), demand_min: avg(dem),
      ren_max: G.map((g, i) => (g > 0 ? (100 * Rn[i]) / g : NaN)), fossil_min: avg(fos),
      wind_max: avg(F.wind), solar_max: avg(F.solar), roof_max: avg(F.roof),
    };
    S.ren_min = S.ren_max;
    for (const [id, v] of Object.entries(S)) (out[id] ??= {})[r] = v;
  }
  return { T, S: out };
}

/** Records the live week beats: { id: { region: { t, v, src: 'live' } } }, against the official record and any
 *  provisional one the history already has. */
export function liveBeats(R, D) {
  if (!R || !D || !D.N) return {};
  let H;
  try { H = halfHours(D); } catch { return {}; }
  const out = {};
  for (const d of DEFS) {
    if (d.kind !== 'hh' || d.fam !== 'gen' || !H.S[d.id]) continue;
    for (const r of d.regions) {
      const rec = get(R, d.id, r), v = H.S[d.id][r];
      if (!rec || !v) continue;
      const min = d.id.endsWith('_min');
      const dp = d.dp ?? 0, f = 10 ** dp;
      let best = null;
      for (let i = 0; i < v.length; i++) {
        const x = Math.round(v[i] * f) / f;
        if (!Number.isFinite(x)) continue;
        if (best === null || (min ? x < best.v : x > best.v)) best = { t: H.T[i], v: x };
      }
      if (!best) continue;
      const beats = (a, b) => (min ? a < b : a > b);
      if (beats(best.v, rec.v) && (!rec.prov || beats(best.v, rec.prov.v)) && best.t > (R.final_to?.gen ?? 0)) {
        (out[d.id] ??= {})[r] = { ...best, src: 'live' };
      }
    }
  }
  return out;
}

/** The provisional record for an id and region: the live week's if it beats the history's, else the history's. */
export function provisional(R, live, id, region) {
  return live?.[id]?.[region] ?? get(R, id, region)?.prov ?? null;
}

/** Fetch the records file; null if it isn't published yet (404) or can't be read. */
export async function loadRecords(fetchFn = fetch) {
  try {
    const r = await fetchFn(RECORDS_URL);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/** New and provisional records for the "recent" cards: newest first. Each { d, region, rec, prov, settled }. */
export function recent(R, live, now = Date.now()) {
  if (!R) return [];
  const out = [];
  for (const d of DEFS) {
    for (const r of d.regions) {
      const rec = get(R, d.id, r);
      if (!rec || notShown(d, r, rec)) continue;
      const prov = provisional(R, live, d.id, r);
      const isNew = rec.since && now - rec.since < NEW_DAYS * 864e5;
      if (isNew || prov) out.push({ d, region: r, rec, prov, isNew, at: Math.max(prov?.t ?? 0, rec.since ?? 0) });
    }
  }
  for (const x of R.resolved ?? []) {
    const d = def(x.k);
    if (d && !x.ok) out.push({ d, region: x.r, rec: get(R, x.k, x.r), settled: x, at: x.at });
  }
  // one card per record: New Zealand's where it has one, otherwise the newest island's
  out.sort((a, b) => (a.region === 'NZ') - (b.region === 'NZ') || a.at - b.at).reverse();
  const seen = new Set();
  return out.filter((x) => !seen.has(x.d.id) && seen.add(x.d.id)).sort((a, b) => b.at - a.at);
}

/** The first time each milestone was passed, for a region: [{ d, level, t, v }], oldest first. */
export function milestones(R, region) {
  const out = [];
  for (const m of MILESTONES) {
    const d = def(m.id), rec = get(R, m.id, region);
    if (!d || !rec || notShown(d, region, rec)) continue;
    for (const level of m.at) {
      const s = rec.steps.find((x) => x[1] >= level);
      if (s) out.push({ d, level, t: s[0], v: s[1] });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/** A step chart's points from a progression: [[t, v], ...] -> an SVG path in a w x h box (y down), with the
 *  progression running on to `end` (the data's end). */
/** A progression without its leading zeros (grid solar's record was 0 MW from 1997 until the first farm): from the
 *  first step above zero, so the chart isn't mostly a flat line at the bottom. Unchanged if it never leaves zero. */
export function trimZeros(steps) {
  if (!steps?.length || steps[0][1] !== 0) return steps;
  const k = steps.findIndex((s) => s[1] !== 0);
  return k > 0 ? steps.slice(k) : steps;
}

export function stepPath(steps, w, h, { end, t0, lo, hi } = {}) {
  if (!steps?.length) return { d: '', x: () => 0, y: () => 0 };
  steps = trimZeros(steps);
  const a = t0 ?? steps[0][0], b = Math.max(end ?? steps[steps.length - 1][0], a + 1);
  const vs = steps.map((s) => s[1]);
  const min = lo ?? Math.min(...vs), max = hi ?? Math.max(...vs);
  const x = (t) => ((t - a) / (b - a)) * w;
  const y = (v) => (max === min ? h / 2 : h - ((v - min) / (max - min)) * h);
  let d = `M${x(steps[0][0]).toFixed(1)} ${y(steps[0][1]).toFixed(1)}`;
  for (const [t, v] of steps.slice(1)) d += ` H${x(t).toFixed(1)} V${y(v).toFixed(1)}`;
  d += ` H${x(b).toFixed(1)}`;
  return { d, x, y, min, max };
}

/** Records the live week has beaten in the last `hours` (for /now): [{ d, region, p, rec }], New Zealand first and
 *  one region per record. */
export function freshLive(R, D, hours = 24) {
  const live = liveBeats(R, D), out = [];
  const end = D?.meta?.end ?? Date.now();
  for (const d of DEFS) {
    for (const r of ['NZ', 'NI', 'SI']) {
      const p = live[d.id]?.[r];
      if (!p || end - p.t > hours * 36e5) continue;
      out.push({ d, region: r, p, rec: get(R, d.id, r) });
      break;   // the first region with it (New Zealand, then the islands)
    }
  }
  return out;
}
