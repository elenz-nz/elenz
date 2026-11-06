// Other embedded generation (ingest/embedded.py): non-solar plant on local networks that isn't dispatched, from
// January 2009, estimated. Both tracker.json and the history files carry it in an `oemb` block outside the island
// series; withOemb() folds it into a layout so the rest of the site sees ordinary series:
//   NI.oemb, SI.oemb    the layer, MW (all its fuels; a fuel of its own in fuels.js, hatched)
//   NI.oembR, SI.oembR  its renewable part (hydro, geothermal, wind, landfill gas; 'other' is unclassified)
//   NI.oembE, SI.oembE  its emissions, t CO₂e/h (gas 0.46 and diesel 0.80 t/MWh, geothermal the fleet average;
//                       hydro, wind, landfill gas and unclassified output none)
//   underlying          demand with embedded generation: the layer added (embedded solar is already in)
// and the named plants' fill (Ngāwhā beyond Ngāwhā B, Teviot; months without their metered data) joins the plant's own
// series and its fuel. In the history the layer is by island and fuel per point; in tracker.json it is a typical day
// for each month (48 half-hours from NZ local midnight), laid over the week here.
import { nzOffset } from './series.js';
import { GEO_DEFAULT } from './emissions.js';

export const OEMB_REN = ['hydro', 'geo', 'wind', 'bio'];
const EF = { gas: 0.46, diesel: 0.8, geo: GEO_DEFAULT / 1000 };
// fuel and island of the named plants, for files that don't say (history files; tracker.json carries `info`)
const NAMED = { 'Ngāwhā': ['geo', 'NI'], Teviot: ['hydro', 'SI'] };
const POC = { 'Ngāwhā': ['KOE1101'], Teviot: ['CYD0331'] };

const monthOf = (loc) => { const d = new Date(loc); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
const timeAt = (D, j) => (D.t ? D.t[j] : D.t0 + j * D.step);

/** The layer by island and fuel, { NI: { fuel: number[] }, SI: {...} }, on the layout's own points. */
function layerOf(D) {
  const oe = D.oemb, n = D.N, out = { NI: {}, SI: {} };
  if (oe.days) {
    const keys = Object.keys(oe.days).sort();
    for (let j = 0; j < n; j++) {
      const t = timeAt(D, j), loc = t + nzOffset(t), day = oe.days[monthOf(loc)] ?? oe.days[keys[keys.length - 1]];
      if (!day) continue;
      const slot = Math.floor((((loc % 864e5) + 864e5) % 864e5) / 18e5);
      for (const isl of ['NI', 'SI']) for (const [f, v] of Object.entries(day[isl] ?? {})) (out[isl][f] ??= new Array(n).fill(0))[j] = v[slot] ?? 0;
    }
  } else {
    for (const isl of ['NI', 'SI']) for (const [f, v] of Object.entries(oe[isl] ?? {})) out[isl][f] = v;
  }
  return out;
}

/** A layout (tracker.json or a history file) with its `oemb` block folded into ordinary series, changed in place
 *  and returned; a layout without one gets zero series. Safe to call twice. */
export function withOemb(D) {
  if (!D || !D.NI || D.oembDone) return D;
  const n = D.N, z = () => new Array(n).fill(0);
  for (const isl of ['NI', 'SI']) { D[isl].oemb = z(); D[isl].oembR = z(); D[isl].oembE = z(); }
  D.oembDone = true;
  if (!D.oemb) return D;
  const lay = layerOf(D);
  for (const isl of ['NI', 'SI']) {
    const tot = D[isl].oemb, ren = D[isl].oembR, em = D[isl].oembE;
    for (const [f, v] of Object.entries(lay[isl])) {
      const r = OEMB_REN.includes(f), ef = EF[f] ?? 0;
      for (let j = 0; j < n; j++) { const x = Math.max(0, v[j] ?? 0); tot[j] += x; if (r) ren[j] += x; em[j] += x * ef; }
    }
    if (D[isl].underlying) D[isl].underlying = D[isl].underlying.map((x, j) => (x ?? 0) + tot[j]);
  }
  for (const [name, s] of Object.entries(D.oemb.named ?? {})) {
    const [fuel, isl] = D.oemb.info?.[name]?.[0] ? D.oemb.info[name] : NAMED[name] ?? ['', ''];
    if (!fuel || !D[isl]) continue;
    const base = D[isl][fuel] ?? z();
    D[isl][fuel] = base.map((x, j) => (x ?? 0) + (s[j] ?? 0));
    let p = (D.plants ?? []).find((q) => q.name === name && q.fuel === fuel);
    if (!p) { p = { name, fuel, isl, poc: POC[name] ?? [], cap: null, s: z() }; (D.plants ??= []).push(p); }
    p.s = p.s.map((x, j) => (x ?? 0) + (s[j] ?? 0));
    if (p.units) p.units = [...p.units, { name: `${name} (rest of the station, est.)`, cap: null, s: s.slice(0, n) }];
  }
  return D;
}
