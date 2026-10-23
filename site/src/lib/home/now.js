// The home page's figures: the newest interval of tracker.json, by island and for New Zealand.
// Totals follow the tracker: generation is the sum of each fuel's output (battery discharge only, no HVDC), the
// renewable share and emissions intensity are of that total less battery discharge.
import { FUELS } from '#lib/tracker/fuels.js';
import { efAt, geoFactor } from '#lib/tracker/emissions.js';

const GEN = FUELS.filter((f) => f.k !== 'hvdc');

/** tracker.json -> { t, regions: { NZ, NI, SI }, hvdc: { mid, ni, si }, mix } for its newest interval. */
export function summarise(D) {
  const j = D.N - 1;
  const at = (isl, k) => (D[isl][k] ? D[isl][k][j] ?? 0 : 0);
  const t = D.t0 + j * D.step;
  // geothermal: each station's own factor, weighted by its output now (falls back to the fuel's factor)
  const geoPlants = (isl) => (D.plants || []).filter((p) => p.fuel === 'geo' && (!isl || p.isl === isl));
  const efOf = (f, isl) => (f.k === 'geo' ? geoFactor(geoPlants(isl), j, t) ?? efAt(f, t) : efAt(f, t));
  const region = (pick, isl) => {
    const fuels = Object.fromEntries(GEN.map((f) => [f.k, pick(f.k)]));
    // battery discharge counts in generation but not in the renewable share or emissions intensity (as em6): it was
    // generated, and counted, once already when the battery charged
    let gen = 0, base = 0, ren = 0, co2 = 0;
    for (const f of GEN) {
      const x = fuels[f.k];
      if (x <= 0) continue;
      gen += x;
      if (f.k === 'batt') continue;
      base += x;
      if (f.ren) ren += x;
      co2 += x * efOf(f, isl);
    }
    return { fuels, gen, ren: base > 0 ? (ren / base) * 100 : 0, co2: base > 0 ? (co2 / base) * 1000 : 0 };
  };
  const isl = (r) => ({
    ...region((k) => at(r, k), r),
    demand: at(r, 'metered'), underlying: at(r, 'underlying'), price: at(r, 'price'),
    roof: at(r, 'roof'), roofU: at(r, 'roofU'),
  });
  const NI = isl('NI'), SI = isl('SI');
  const NZ = {
    ...region((k) => at('NI', k) + at('SI', k)),
    demand: NI.demand + SI.demand, underlying: NI.underlying + SI.underlying, tiwai: at('SI', 'tiwai'),
    roof: NI.roof + SI.roof, roofU: NI.roofU + SI.roofU,
  };
  // the generation mix: fuels with output, largest first; battery only while discharging
  const mix = GEN.map((f) => ({ ...f, mw: NZ.fuels[f.k] })).filter((f) => f.mw > 0.5).sort((a, b) => b.mw - a.mw);
  return {
    t,
    end: D.meta?.end ?? D.t0 + j * D.step,
    regions: { NZ, NI, SI },
    // northward positive: mid-link, arriving at Haywards (NI), leaving Benmore (SI)
    hvdc: { mid: D.hvdcN ? D.hvdcN[j] : 0, ni: at('NI', 'hvdc'), si: -at('SI', 'hvdc') },
    mix,
  };
}

/** One region's generation as ring segments (largest first, in `mix` order), for an SVG circle of radius r:
 * each { k, name, tok, hatch, mw, pct, start, len } with start and len along the circumference. */
export function ring(mix, region, r) {
  const C = 2 * Math.PI * r;
  const parts = mix.map((f) => ({ ...f, mw: Math.max(0, region.fuels[f.k] ?? 0) })).filter((f) => f.mw > 0.5);
  const total = parts.reduce((a, f) => a + f.mw, 0) || 1;
  let start = 0;
  return parts.map((f) => {
    const full = (f.mw / total) * C;
    const seg = { ...f, pct: (f.mw / total) * 100, start, len: Math.max(0.5, full - (parts.length > 1 ? 1.2 : 0)) };
    start += full;
    return seg;
  });
}

/** New Zealand's generation by fuel over the last `hours`, every `every`th interval, for a small stacked chart:
 * { t: [ms], layers: [{ ...fuel, v: [MW] }] } in stack order, fuels with no output dropped. Battery is discharge only
 * (each island's charging counted as zero, so the stack never dips below the axis); HVDC is left out. */
export function recent(D, hours = 24, every = 3) {
  const n = Math.min(D.N, Math.round((hours * 3600000) / D.step) + 1);
  const idx = [];
  for (let j = D.N - 1; j >= D.N - n; j -= every) idx.unshift(j);
  const val = (k, j) => Math.max(0, D.NI[k]?.[j] ?? 0) + Math.max(0, D.SI[k]?.[j] ?? 0);
  const layers = GEN.filter((f) => !f.signed || f.k === 'batt').map((f) => ({ ...f, v: idx.map((j) => val(f.k, j)) }))
    .filter((f) => f.v.some((x) => x > 0.5));
  return { t: idx.map((j) => D.t0 + j * D.step), layers };
}
