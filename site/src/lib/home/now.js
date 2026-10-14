// The home page's figures: the newest interval of tracker.json, by island and for New Zealand.
// Totals follow the tracker: generation is the sum of each fuel's output (battery discharge only, no HVDC), the
// renewable share and emissions intensity are of that total.
import { FUELS } from '#lib/tracker/fuels.js';

const GEN = FUELS.filter((f) => f.k !== 'hvdc');

/** tracker.json -> { t, regions: { NZ, NI, SI }, hvdc: { mid, ni, si }, mix } for its newest interval. */
export function summarise(D) {
  const j = D.N - 1;
  const at = (isl, k) => (D[isl][k] ? D[isl][k][j] ?? 0 : 0);
  const region = (pick) => {
    const fuels = Object.fromEntries(GEN.map((f) => [f.k, pick(f.k)]));
    let gen = 0, ren = 0, co2 = 0;
    for (const f of GEN) {
      const x = fuels[f.k];
      if (x <= 0) continue;
      gen += x;
      if (f.ren) ren += x;
      if (f.ef) co2 += x * f.ef;
    }
    return { fuels, gen, ren: gen > 0 ? (ren / gen) * 100 : 0, co2: gen > 0 ? (co2 / gen) * 1000 : 0 };
  };
  const isl = (r) => ({
    ...region((k) => at(r, k)),
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
    t: D.t0 + j * D.step,
    end: D.meta?.end ?? D.t0 + j * D.step,
    regions: { NZ, NI, SI },
    // northward positive: mid-link, arriving at Haywards (NI), leaving Benmore (SI)
    hvdc: { mid: D.hvdcN ? D.hvdcN[j] : 0, ni: at('NI', 'hvdc'), si: -at('SI', 'hvdc') },
    mix,
  };
}
