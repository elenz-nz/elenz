// Records: names, wording and formatting for the records the history job keeps (ingest/records.py writes
// /data/history/records.json), and the check of the live week against them.
//
// Each record's id matches records.py. kind: 'hh' (a half-hour), 'month' (a calendar month) or 'run' (the longest
// run of half-hours); fam: what makes it official (gen: metered generation and demand; price: final prices; hvdc:
// metered HVDC), as in records.py; tok: its colour token; regions it is kept for, and what to say for the others.

export const RECORDS_URL = '/data/history/records.json';
export const LIVE_URL = '/data/tracker.json';
export const NEW_DAYS = 30;        // as records.py: a record is "new" this long after it first appears
// A record is new only when it was set in recently arrived data: its period ended within NEW_LAG days (plus the
// period's own length) of the day it first appeared. A rebuild that changes old data can move a record to another
// half-hour years back; that isn't new (owner's report REC-02, 31 Oct 2026: 2009 records shown as New after BUILD 7).
export const NEW_LAG = 75;
const PERIOD_DAYS = { tp: 0, day: 1, week: 7, month: 31, year: 366 };
/** Is this record new: first seen in the last NEW_DAYS, and set in data that had just arrived then? */
export function isNew(rec, period = 'tp', now = Date.now()) {
  if (!rec?.since || now - rec.since >= NEW_DAYS * 864e5) return false;
  return rec.since - rec.t < (NEW_LAG + (PERIOD_DAYS[period] ?? 0)) * 864e5;
}
export const GROUPS = ['Demand', 'Renewables', 'Hydro', 'Wind and solar', 'Prices', 'HVDC'];
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
  { id: 'ren_month_max', old: true, kind: 'month', fam: 'gen', group: 'Renewables', name: 'Highest renewable share', sub: 'Calendar month', unit: '%', dp: 1, tok: '--g-ren', regions: ALL },
  { id: 'ren_min', kind: 'hh', fam: 'gen', group: 'Renewables', name: 'Lowest renewable share', sub: 'Half-hour', unit: '%', dp: 1, tok: '--g-ren', regions: ALL },
  { id: 'ren_month_min', old: true, kind: 'month', fam: 'gen', group: 'Renewables', name: 'Lowest renewable share', sub: 'Calendar month', unit: '%', dp: 1, tok: '--g-ren', regions: ALL },
  { id: 'ren_run', kind: 'run', fam: 'gen', group: 'Renewables', name: 'Longest run at 90% renewable or more', sub: 'Every half-hour in a row', unit: 'h', tok: '--g-ren', regions: ['NZ', 'NI'],
    na: { SI: 'The South Island’s generation is all renewable' } },
  { id: 'fossil_min', kind: 'hh', fam: 'gen', group: 'Renewables', name: 'Lowest fossil generation', sub: 'Rankines, gas, diesel and waste heat', unit: 'MW', tok: '--g-fossil', regions: ALL },
  { id: 'fossil_max', kind: 'hh', v: 4, fam: 'gen', group: 'Renewables', name: 'Most fossil generation', sub: 'Rankines, gas, diesel and waste heat', unit: 'MW', tok: '--g-fossil', regions: ['NZ', 'NI'],
    na: { SI: 'No fossil plant in the South Island' } },
  { id: 'huntly_off_run', kind: 'run', fam: 'gen', group: 'Renewables', name: 'Longest with no Huntly Rankine running', sub: 'The coal and gas units at Huntly', unit: 'h', tok: '--f-coal', regions: ['NZ'],
    na: { NI: 'Shown for New Zealand', SI: 'Huntly is in the North Island' } },
  { id: 'hydro_max', kind: 'hh', v: 4, fam: 'gen', group: 'Hydro', name: 'Peak hydro', sub: 'Half-hour', unit: 'MW', tok: '--f-hydro', regions: ALL },
  // v: the records.json version that first has a record (records.py VERSION); older files say it is being worked out
  { id: 'hydro_min', kind: 'hh', v: 4, fam: 'gen', group: 'Hydro', name: 'Lowest hydro', sub: 'Half-hour', unit: 'MW', tok: '--f-hydro', regions: ALL },
  { id: 'wind_max', kind: 'hh', fam: 'gen', group: 'Wind and solar', name: 'Peak wind', sub: 'Half-hour', unit: 'MW', tok: '--f-wind', regions: ALL },
  { id: 'wind_month_max', old: true, kind: 'month', fam: 'gen', group: 'Wind and solar', name: 'Windiest month', sub: 'Wind generation in a calendar month', unit: 'GWh', dp: 1, tok: '--f-wind', regions: ALL },
  { id: 'solar_max', kind: 'hh', fam: 'gen', group: 'Wind and solar', name: 'Peak grid solar', sub: 'Solar farms the market dispatches', unit: 'MW', tok: '--f-solar', regions: ALL },
  { id: 'roof_max', kind: 'hh', fam: 'gen', group: 'Wind and solar', name: 'Peak embedded solar', sub: 'Rooftops and small arrays, modelled', unit: 'MW', tok: '--f-solar', est: true, regions: ALL },
  { id: 'price_max', kind: 'hh', fam: 'price', group: 'Prices', name: 'Highest price', sub: 'Half-hour, final price', unit: '$', dp: 2, tok: '--accent', regions: ALL },
  { id: 'price_min', kind: 'hh', v: 4, fam: 'price', group: 'Prices', name: 'Lowest price', sub: 'Half-hour, final price', unit: '$', dp: 2, tok: '--accent', regions: ALL },
  { id: 'gap_max', kind: 'hh', fam: 'price', group: 'Prices', name: 'Biggest gap between the islands', sub: 'Haywards against Benmore, half-hour', unit: '$', dp: 2, tok: '--accent', regions: ['NZ'],
    na: { NI: 'Shown for New Zealand', SI: 'Shown for New Zealand' } },
  { id: 'low_price_run', kind: 'run', fam: 'price', group: 'Prices', name: 'Longest run of near-zero prices', sub: 'Under $5/MWh (New Zealand: both islands)', unit: 'h', tok: '--accent', regions: ALL },
  { id: 'hvdc_n_max', kind: 'hh', fam: 'hvdc', group: 'HVDC', name: 'Most sent north', sub: 'Benmore to Haywards, half-hour', unit: 'MW', tok: '--f-hvdc', regions: ['NZ'],
    na: { NI: 'Shown for New Zealand', SI: 'Shown for New Zealand' } },
  { id: 'hvdc_s_max', kind: 'hh', fam: 'hvdc', group: 'HVDC', name: 'Most sent south', sub: 'Haywards to Benmore, half-hour', unit: 'MW', tok: '--f-hvdc', regions: ['NZ'],
    na: { NI: 'Shown for New Zealand', SI: 'Shown for New Zealand' } },
];
export const def = (id) => DEFS.find((d) => d.id === id);
// The records the pages list: the month records are now the Month period of their half-hour record (Oct 2026), so
// they keep their own pages (old links) but aren't listed.
export const LISTED = DEFS.filter((d) => !d.old);

// Periods: each half-hour record also has its highest (or lowest) day, week, month and year (records.py PERIODS),
// each the period's average (the renewable share: of its generation). Runs don't have periods.
export const PERIODS = [
  { k: 'tp', label: 'Trading period', short: 'TP', word: 'half-hour' },
  { k: 'day', label: 'Day', short: 'Day', word: 'day' },
  { k: 'week', label: 'Week', short: 'Week', word: 'week' },
  { k: 'month', label: 'Month', short: 'Month', word: 'month' },
  { k: 'year', label: 'Year', short: 'Year', word: 'year' },
];
export const PERIOD_KEYS = PERIODS.map((p) => p.k);
export const periodOf = (k) => PERIODS.find((p) => p.k === k) ?? PERIODS[0];
/** What a record measures for a period: "Average over the day" ("Renewable share of the week's generation"). */
export function periodSub(d, p) {
  if (p === 'tp' || d.kind !== 'hh') return d.sub;
  const w = periodOf(p).word;
  if (d.unit === '%') return `Share of the ${w}’s generation`;
  if (d.id === 'gap_max') return `Haywards against Benmore, ${w} average`;
  return `Average over the ${w}`;
}
/** "Peak wind" or, where two records share a name, "Highest renewable share, month". */
export const fullName = (d) => (DEFS.filter((x) => x.name === d.name && (!x.old || d.old)).length > 1 ? `${d.name}, ${d.kind === 'month' ? 'month' : 'half-hour'}` : d.name);

// milestones: the first time a record passed each level (from its progression)
export const MILESTONES = [
  { id: 'wind_max', at: [100, 250, 500, 750, 1000, 1250, 1500] },
  { id: 'solar_max', at: [100, 250, 500, 750, 1000] },
  { id: 'roof_max', at: [100, 250, 500, 750, 1000] },
  { id: 'ren_max', at: [90, 95, 98, 99] },
  { id: 'demand_max', at: [6000, 6500, 7000, 7500] },
];

// ---------- the file ----------

/** The record (or month record, or run) for one id and region, or null; for a half-hour record, its day, week, month
 *  or year record when `period` says so. */
export function get(R, id, region, period = 'tp') {
  const d = def(id);
  if (!R || !d) return null;
  if (period !== 'tp' && d.kind === 'hh') return R.periods?.[period]?.[id]?.[region] ?? null;
  const group = d.kind === 'hh' ? R.records : d.kind === 'month' ? R.months : R.runs;
  return group?.[id]?.[region] ?? null;
}

/** Why a record isn't shown for a region: the definition's note, or what its data says (always the same value). */
export function notShown(d, region, rec, R = null, period = 'tp') {
  if (!d.regions.includes(region)) return d.na?.[region] ?? 'Shown for New Zealand';
  if (!rec && d.v && R && (R.v ?? 0) < d.v) return 'Being worked out from the history; back in a day or so';
  if (!rec && period !== 'tp' && d.kind === 'hh' && R && !R.periods) return 'Being worked out from the history; back in a day or so';
  if (!rec) return 'No data yet';
  // a period's net transfer: "most sent south" is only a record if some period's net flow was south at all
  if (period !== 'tp' && d.id.startsWith('hvdc_') && rec.v <= 0) return `Never a net ${d.id === 'hvdc_s_max' ? 'south' : 'north'}ward ${periodOf(period).word}`;
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

/** A value as {n, u}: the number and its unit, for a table cell (a period's MW and $ are averages: "MW avg"). */
export function parts(d, v, period = 'tp') {
  if (v == null) return { n: '–', u: '' };
  const dp = d.dp ?? 0, avg = period !== 'tp' && d.kind === 'hh' ? ' avg' : '';
  if (d.unit === '$') {
    const big = Math.abs(v) >= 100;
    return { n: (v < 0 ? '−$' : '$') + Math.abs(v).toLocaleString('en-NZ', { minimumFractionDigits: big ? 0 : 2, maximumFractionDigits: big ? 0 : 2 }), u: '/MWh' + avg };
  }
  if (avg && d.unit === 'MW') return { n: v.toLocaleString('en-NZ', { minimumFractionDigits: dp, maximumFractionDigits: dp }), u: 'MW avg' };
  if (d.unit === '%') return { n: v.toFixed(dp), u: '%' };
  if (d.unit === 'h') return { n: v.toLocaleString('en-NZ', { maximumFractionDigits: 1 }), u: v === 1 ? 'hour' : 'hours' };
  return { n: v.toLocaleString('en-NZ', { minimumFractionDigits: dp, maximumFractionDigits: dp }), u: d.unit };
}
/** A value as one string: "1,148 MW", "98.9%", "$12,019/MWh", "354 hours". */
export function fmt(d, v, period = 'tp') {
  const p = parts(d, v, period);
  return d.unit === '%' ? p.n + p.u : d.unit === '$' ? p.n + p.u : `${p.n} ${p.u}`;
}
// A period record's energy (owner's call, 23 Oct 2026): records are ranked by the period's average MW, which is fair
// across months of 28-31 days, years of 365-366 and clock-change days of 23-25 hours, and the energy is shown beside
// it as the more familiar figure: average MW x the period's hours (from its NZ local midnights).
const P_NZ = new Intl.DateTimeFormat('en-CA', { timeZone: NZ, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
function nzMidnight(y, mo, d) {   // mo from 0; Date.UTC rolls over days and months
  const want = Date.UTC(y, mo, d);
  let g = want - 13 * 36e5;
  for (let i = 0; i < 2; i++) {
    const p = Object.fromEntries(P_NZ.formatToParts(g).map((x) => [x.type, +x.value]));
    g += want - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  }
  return g;
}
/** Hours in the day, week, month or year starting at t (an NZ local midnight). */
export function periodHours(t, period) {
  const p = Object.fromEntries(P_NZ.formatToParts(t + 6 * 36e5).map((x) => [x.type, +x.value]));
  const y = p.year, m = p.month - 1, d = p.day;
  const end = period === 'day' ? nzMidnight(y, m, d + 1) : period === 'week' ? nzMidnight(y, m, d + 7)
    : period === 'month' ? nzMidnight(y, m + 1, 1) : period === 'year' ? nzMidnight(y + 1, 0, 1) : t;
  return (end - nzMidnight(y, m, d)) / 36e5;
}
/** The energy of a period record held as an average in MW: "412 GWh", "3,812 GWh", "43.1 TWh"; '' when it isn't one. */
export function energy(d, t, v, period) {
  if (period === 'tp' || d.kind !== 'hh' || d.unit !== 'MW' || v == null || t == null) return '';
  const gwh = Math.abs(v) * periodHours(t, period) / 1000;
  if (gwh >= 10000) return `${(gwh / 1000).toFixed(1)} TWh`;
  if (gwh >= 100) return `${Math.round(gwh).toLocaleString('en-NZ')} GWh`;
  return `${gwh.toFixed(1)} GWh`;
}

/** "354 hours (14.8 days)" for a long run. */
export const runLength = (h) => (h >= 48 ? `${h.toLocaleString('en-NZ', { maximumFractionDigits: 1 })} hours (${(h / 24).toFixed(1)} days)` : `${h} hours`);

/** When a record was set: "5:30 pm, 29 May 2001", "May 2001", or a run's start and end. */
export function when(d, rec, long = false, period = 'tp') {
  if (!rec) return '';
  if (period !== 'tp' && d.kind === 'hh') return periodWhen(rec.t, period, long);
  if (d.kind === 'month') return monthOf(rec.t);
  if (d.kind === 'run') {
    const end = rec.t + rec.v * 36e5 - 1800e3;   // the start of its last half-hour
    return `${long ? clock(rec.t) + ', ' : ''}${dayOf(rec.t)} to ${long ? clock(end + 1800e3) + ', ' : ''}${dayOf(end + 1800e3)}${rec.ongoing ? ' (still going)' : ''}`;
  }
  return `${clock(rec.t)}, ${long ? dayLong(rec.t) : dayOf(rec.t)}`;
}
/** A previous record or progression step: "1,112 MW, 14 Aug 2025". */
export function step(d, tv, period = 'tp') {
  if (!tv) return '';
  const w = period !== 'tp' && d.kind === 'hh' ? periodWhen(tv[0], period, false, true) : d.kind === 'month' ? monthShort(tv[0]) : dayOf(tv[0]);
  return `${fmt(d, tv[1], period)}, ${w}`;
}
/** A period from its start: "Thursday 24 September 2026", "Week of 21 Sept 2026", "September 2026", "2025". */
export function periodWhen(t, period, long = false, short = false) {
  if (period === 'day') return long ? dayLong(t) : dayOf(t);
  if (period === 'week') return `${short ? 'Wk of' : 'Week of'} ${dayOf(t)}`;
  if (period === 'month') return short ? monthShort(t) : monthOf(t);
  if (period === 'year') return yearOf(t);
  return dayOf(t);
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
    // the renewable share leaves battery discharge out (as records.py and the rest of the site)
    const gen = new Array(n).fill(0), ren = new Array(n).fill(0), fos = new Array(n).fill(0);
    for (let j = 0; j < n; j++) {
      for (const f of GEN) if (f !== 'batt') gen[j] += F[f][j];
      for (const f of REN) ren[j] += F[f][j];
      for (const f of FOSSIL) fos[j] += F[f][j];
    }
    const dem = r === 'NZ' ? a('NI', 'metered').map((x, j) => x + a('SI', 'metered')[j]) : a(r, 'metered');
    const G = avg(gen), Rn = avg(ren);
    const S = {
      demand_max: avg(dem), demand_min: avg(dem),
      ren_max: G.map((g, i) => (g > 0 ? (100 * Rn[i]) / g : NaN)), fossil_min: avg(fos),
      wind_max: avg(F.wind), solar_max: avg(F.solar), roof_max: avg(F.roof), hydro_max: avg(F.hydro),
    };
    S.ren_min = S.ren_max;
    S.fossil_max = S.fossil_min;
    S.hydro_min = S.hydro_max;
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

// ---------- the record pages' detail (hist/records-detail.json, records.py build_detail) ----------
export const DETAIL_URL = '/data/history/records-detail.json';
/** The detail file: each record's best by month (the progression's background line) and the record periods
 *  themselves (their charts); null if it isn't published yet. */
export async function loadDetail(fetchFn = fetch) {
  try {
    const r = await fetchFn(DETAIL_URL);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}
/** The background line for a record: [[t, v | null], ...], one point a month (a year for year records), at the
 *  start of each. */
export function bgOf(det, id, period, region) {
  return lineOf(det, det?.bg?.[id]?.[period]?.[region], period);
}
/** For the demand records: the same line for demand with embedded solar added back (records.py build_detail `udem`),
 *  drawn dashed for information only; null for other records, or before the detail file has it. */
export function udemOf(det, id, period, region) {
  return lineOf(det, det?.udem?.[id]?.[period]?.[region], period);
}
function lineOf(det, v, period) {
  if (!v) return null;
  if (period === 'year') return v.map((x, i) => [nzMidnight(+det.years[i], 0, 1), x]);
  return v.map((x, i) => { const [y, m] = det.months[i].split('-').map(Number); return [nzMidnight(y, m - 1, 1), x]; });
}
/** When the month (or year) of a point of the faint best-by-month line ends: the next NZ local midnight starting one. */
export function bgEnd(t, year) {
  const p = Object.fromEntries(P_NZ.formatToParts(t + 6 * 36e5).map((x) => [x.type, +x.value]));
  return year ? nzMidnight(p.year + 1, 0, 1) : nzMidnight(p.year, p.month, 1);
}
/** The record period's own series, if the detail has it for this record: { t, t0, step, v }. */
export function periodSeries(det, id, period, region, rec) {
  const x = det?.period?.[period]?.[id]?.[region];
  return x && rec && x.t === rec.t ? x : null;
}
const F2 = {
  wd: new Intl.DateTimeFormat('en-NZ', { timeZone: NZ, weekday: 'short', day: 'numeric' }),
  wdh: new Intl.DateTimeFormat('en-NZ', { timeZone: NZ, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', hour12: true }),
  dm: new Intl.DateTimeFormat('en-NZ', { timeZone: NZ, day: 'numeric', month: 'short' }),
  mon: new Intl.DateTimeFormat('en-NZ', { timeZone: NZ, month: 'short' }),
};
/** The x axis of a record period's chart: ticks [{ i, l }], what a point is called in the tooltip, and lab(i), a short
 *  label for any point (for ticks when the chart is zoomed in past the usual ones). */
export function periodAxis(period, ser) {
  const at = (i) => ser.t0 + i * ser.step, n = ser.v.length;
  if (period === 'day') {
    return { ticks: [0, 12, 24, 36].filter((i) => i < n).map((i) => ({ i, l: clock(at(i)) })), tip: (i) => `${clock(at(i))}–${clock(at(i + 1))}`, lab: (i) => clock(at(i)) };
  }
  if (period === 'week') {
    // each day at its NZ midnight (a clock change shifts the hours by one)
    const ticks = [];
    for (let i = 0; i < n; i++) if (Number(P_NZ.formatToParts(at(i)).find((x) => x.type === 'hour')?.value) % 24 === 0) ticks.push({ i, l: F2.wd.format(at(i)) });
    const tip = (i) => F2.wdh.format(at(i)).replace(/\s?([ap])\.?m\.?/i, (_, x) => ` ${x.toLowerCase()}m`);
    return { ticks, tip, lab: (i) => `${F2.wd.format(at(i))} ${clock(at(i))}` };
  }
  if (period === 'month') {
    return { ticks: [0, 7, 14, 21, 28].filter((i) => i < n).map((i) => ({ i, l: F2.dm.format(at(i) + 6 * 36e5) })), tip: (i) => dayOf(at(i) + 6 * 36e5), lab: (i) => F2.dm.format(at(i) + 6 * 36e5) };
  }
  const ticks = [];
  for (let i = 0; i < n; i++) { const a = new Date(at(i) + 13 * 36e5), b = new Date(at(i) + 7 * 864e5 + 13 * 36e5); if (i === 0 || (a.getUTCMonth() !== b.getUTCMonth() && b.getUTCMonth() % 3 === 0)) ticks.push({ i: i === 0 ? 0 : i + 1, l: F2.mon.format(i === 0 ? at(0) + 6 * 36e5 : b) }); }
  return { ticks: ticks.filter((x) => x.i < n), tip: (i) => `Week of ${F2.dm.format(at(i) + 6 * 36e5)}`, lab: (i) => F2.dm.format(at(i) + 6 * 36e5) };
}

/** New and provisional records for the "recent" cards: newest first. Each { d, region, rec, prov, settled }. */
export function recent(R, live, now = Date.now()) {
  if (!R) return [];
  const out = [];
  for (const d of LISTED) {
    for (const r of d.regions) {
      const rec = get(R, d.id, r);
      if (!rec || notShown(d, r, rec)) continue;
      const prov = provisional(R, live, d.id, r);
      const fresh = isNew(rec, 'tp', now);
      if (fresh || prov) out.push({ d, region: r, rec, prov, isNew: fresh, at: Math.max(prov?.t ?? 0, fresh ? rec.since : 0) });
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

// ---------- heading for a record ----------
// "On record pace" (owner's call, 23 Oct 2026): the current day, week, month or year is ahead of where its record
// period was at the same point, as in a race. Shown once half of the period has gone, and only while it is ahead.
// The record's figure through its period is its `curve` (records.py period_curve: after each half-hour for a day,
// after each day otherwise); the current period's comes from the history (records.json `pace`, every day of the period
// the history has) and the live week after it (tracker.json, 5-minute dispatch data), so it is provisional. Weeks,
// months and years compare whole days (a part day would tilt it by the time of day); a day compares whole half-hours.
// Each record's figure, as records.py PERIOD_OF: [sum key, sign] for an average, 'ren' for the renewable share.
const PACE_OF = {
  demand_max: ['dem', 1], demand_min: ['dem', 1], ren_max: 'ren', ren_min: 'ren', fossil_min: ['fossil', 1],
  fossil_max: ['fossil', 1], hydro_max: ['hydro', 1], hydro_min: ['hydro', 1], wind_max: ['wind', 1],
  solar_max: ['solar', 1], roof_max: ['roof', 1], price_max: ['price', 1], price_min: ['price', 1],
  gap_max: ['gap', 1], hvdc_n_max: ['hvdc', 1], hvdc_s_max: ['hvdc', -1],
};
export const PACE_SHARE = 0.5;   // shown once this share of the period has gone

/** The NZ local midnight starting the day, week (Monday), month or year that holds t. */
export function periodStart(t, period) {
  const p = Object.fromEntries(P_NZ.formatToParts(t).map((x) => [x.type, +x.value]));
  if (period === 'week') { const wd = (new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay() + 6) % 7; return nzMidnight(p.year, p.month - 1, p.day - wd); }
  if (period === 'month') return nzMidnight(p.year, p.month - 1, 1);
  if (period === 'year') return nzMidnight(p.year, 0, 1);
  return nzMidnight(p.year, p.month - 1, p.day);
}

// the live week's sums per region in half-hours ([sum, count] per key), for intervals in [from, to)
function liveSums(D, from, to) {
  const out = { NZ: {}, NI: {}, SI: {} };
  if (!D?.N) return out;
  const w = D.step / 1800e3;
  const add = (r, k, v) => { if (v == null || !Number.isFinite(v)) return; const x = (out[r][k] ??= [0, 0]); x[0] += v * w; x[1] += w; };
  const at = (isl, k, j) => { const a = D[isl]?.[k]; return a ? a[j] : null; };
  for (let j = 0; j < D.N; j++) {
    const t = D.t0 + j * D.step;
    if (t < from || t >= to) continue;
    const isl = {};
    for (const s of ['NI', 'SI']) {
      const F = Object.fromEntries(GEN.map((f) => [f, Math.max(0, at(s, f, j) ?? 0)]));
      isl[s] = {
        dem: at(s, 'metered', j), gen: GEN.reduce((a, f) => a + (f === 'batt' ? 0 : F[f]), 0), ren: REN.reduce((a, f) => a + F[f], 0),
        fossil: FOSSIL.reduce((a, f) => a + F[f], 0), hydro: F.hydro, wind: F.wind, solar: F.solar, roof: F.roof, price: at(s, 'price', j),
      };
    }
    for (const s of ['NI', 'SI']) for (const [k, v] of Object.entries(isl[s])) add(s, k, v);
    const a = isl.NI, b = isl.SI;
    for (const k of ['dem', 'gen', 'ren', 'fossil', 'hydro', 'wind', 'solar', 'roof']) add('NZ', k, a[k] == null || b[k] == null ? null : a[k] + b[k]);
    // New Zealand's price is the dearer island's, as records.py; the gap and HVDC are New Zealand's only
    if (a.price != null && b.price != null) { add('NZ', 'price', Math.max(a.price, b.price)); add('NZ', 'gap', Math.abs(a.price - b.price)); }
    add('NZ', 'hvdc', D.hvdcN?.[j]);
  }
  return out;
}

/** Records the current periods are on pace to break: [{ d, region, period, start, hours, elapsed, steps, v, ref,
 *  best, bestT, need }], longest periods first. v: the period so far (to the last whole day, or half-hour for a day);
 *  ref: the record period's figure at the same point; best: the record (or a provisional one beyond it) and bestT its
 *  period; need: what the rest of the period can average and still beat it (null where it can't be said simply). */
export function pace(R, D) {
  const out = [];
  for (const period of ['year', 'month', 'week', 'day']) {
    const c = periodNow(R, D, period);
    if (!c || c.steps < c.all * PACE_SHARE || c.steps >= c.all) continue;
    const { start, hours, elapsed, steps } = c;
    for (const d of LISTED) {
      if (!PACE_OF[d.id] || d.kind !== 'hh') continue;
      for (const r of d.regions) {
        const rec = get(R, d.id, r, period);
        if (!rec || notShown(d, r, rec, R, period)) continue;
        const min = d.id.endsWith('_min');
        const beats = (a, b) => (min ? a < b : a > b);
        const tgt = rec.prov && beats(rec.prov.v, rec.v) ? rec.prov : rec;
        const ref = tgt.curve?.[Math.min(steps, tgt.curve.length) - 1];
        if (ref == null) continue;
        const f = figureSoFar(c, d, r, tgt.v);
        if (!f) continue;
        const { v, need } = f;
        if (!beats(v, ref)) continue;
        out.push({ d, region: r, period, start, hours, elapsed, steps, v, ref, best: tgt.v, bestT: tgt.t, provBest: tgt !== rec, need });
      }
    }
  }
  return out;
}

/** The current day, week, month or year as far as the data goes: { period, start, hours, elapsed, steps, all, sum },
 *  sum(region, key) the history's sums for it plus the live week's ([total, half-hours]). Null without both files. */
export function periodNow(R, D, period) {
  const P = R?.pace;
  if (!P || !D?.N) return null;
  const dataEnd = D.t0 + D.N * D.step;
  const start = periodStart(dataEnd - 1, period), hours = periodHours(start, period);
  // up to the last whole day (weeks, months, years) or half-hour (a day); steps: how many, and how many in all
  const day = period === 'day';
  const upTo = day ? start + Math.floor((dataEnd - start) / 1800e3) * 1800e3 : periodStart(dataEnd - 1, 'day');
  const steps = day ? Math.round((upTo - start) / 1800e3) : Math.round((upTo - start) / 864e5);
  const all = day ? Math.round(hours * 2) : Math.round(hours / 24);
  const elapsed = (upTo - start) / 36e5;
  // the history's sums count only if they are for this same period and end by `upTo`; the live week fills the rest
  const hist = P[period]?.start === start && P.to <= upTo ? P[period].sums : null;
  const live = liveSums(D, hist ? P.to : start, upTo);
  const sum = (r, k) => {
    const h = hist?.[r]?.[k] ?? [0, 0], l = live[r]?.[k] ?? [0, 0];
    return [h[0] + l[0], h[1] + l[1]];
  };
  return { period, start, hours, elapsed, steps, all, sum };
}

/** A record's figure for the period so far (periodNow's c): { v, need }, need being what the rest of the period can
 *  average and still beat `best` (when given); null when the record has no such figure or too little is covered. */
export function figureSoFar(c, d, r, best = null) {
  const how = PACE_OF[d.id];
  if (!how || d.kind !== 'hh' || !(c.elapsed > 0)) return null;
  const { sum, hours, elapsed } = c;
  let v, need = null, n;
  if (how === 'ren') {
    const [re] = sum(r, 'ren'), [g, cn] = sum(r, 'gen');
    if (!(g > 0)) return null;
    v = (100 * re) / g; n = cn;
    // the rest's generation at the rate so far; the share it needs to keep the period's above (or below) the record
    const gRest = (g / cn) * (hours - elapsed) * 2;
    need = best != null && gRest > 0 ? ((best / 100) * (g + gRest) - re) / gRest * 100 : null;
  } else {
    const [s, cn] = sum(r, how[0]);
    if (!(cn > 0)) return null;
    v = (how[1] * s) / cn; n = cn;
    need = best != null ? (best * hours - v * elapsed) / (hours - elapsed) : null;
  }
  // most of the time so far must be covered (the history and the live week can leave a gap between them)
  if (n / 2 < 0.9 * elapsed) return null;
  const f = 10 ** (d.dp ?? 0);
  return { v: Math.round(v * f) / f, need };
}

/** "after 22 days", "by 3:30 pm": the point both periods are compared at. */
export function paceAt(p) {
  if (p.period === 'day') return `by ${F.clock.format(p.start + p.steps * 1800e3)}`;
  return `after ${p.steps} day${p.steps === 1 ? '' : 's'}`;
}
/** "October so far", "This week so far", "2026 so far", "Today so far". */
export function soFar(p) {
  if (p.period === 'day') return 'Today so far';
  if (p.period === 'week') return 'This week so far';
  if (p.period === 'month') return `${F.monthName.format(p.start + 6 * 36e5)} so far`;
  return `${yearOf(p.start + 6 * 36e5)} so far`;
}
/** What is left of the period: "8 days to go", "5 hours to go". */
export function toGo(p) {
  return hoursToGo(p.hours - p.elapsed);
}
/** "8 days to go", "5 hours to go", "40 minutes to go" for a number of hours left. */
export function hoursToGo(h) {
  if (h < 1) { const x = Math.max(1, Math.round(h * 60)); return `${x} minute${x === 1 ? '' : 's'} to go`; }
  if (h < 36) { const x = Math.round(h); return `${x} hour${x === 1 ? '' : 's'} to go`; }
  const x = Math.round(h / 24); return `${x} day${x === 1 ? '' : 's'} to go`;
}
/** The pace line's second sentence: what the rest of the period can average and still beat the record. */
export function needText(p) {
  const { d, need } = p;
  if (need == null || !Number.isFinite(need)) return '';
  const min = d.id.endsWith('_min');
  // so far ahead that the rest can't undo it: a highest record needing nothing (or less than nothing), a lowest one
  // a share above 100%
  if ((!min && need <= 0) || (min && d.unit === '%' && need >= 100)) return 'It is far enough ahead to hold whatever the rest brings.';
  // "only" when the rest can ease off from the pace so far; otherwise it has to do better than it has
  if (min) return need >= p.v ? `The rest can average up to ${fmt(d, need, p.period)} and still beat it.` : `The rest has to average under ${fmt(d, need, p.period)} to beat it.`;
  return need <= p.v ? `The rest needs only ${fmt(d, need, p.period)} to beat it.` : `The rest has to average ${fmt(d, need, p.period)} to beat it.`;
}
