// Other embedded generation in tracker.json (ingest/embedded.py live_block): non-solar plant on local networks that
// isn't dispatched, estimated. `days` holds the layer's typical day (48 half-hours from NZ local midnight) by island
// and fuel for each month the live week touches; `named` each named plant's output the live data lacks (Ngāwhā beyond
// Ngāwhā B, all of Teviot), per interval, with `info` giving its fuel and island.
import { nzOffset } from './series.js';

export const OEMB_REN = ['hydro', 'geo', 'wind', 'bio'];   // the layer's renewable fuels ('other' is unclassified)

const monthOf = (loc) => { const d = new Date(loc); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };

/** tracker.json -> { layer: { NI: { fuel: Float64Array }, SI: {...} }, named: [{ name, fuel, isl, s }] }, or null. */
export function liveOemb(D) {
  const oe = D?.oemb;
  if (!oe || !D.N) return null;
  const n = D.N, layer = { NI: {}, SI: {} };
  const keys = Object.keys(oe.days ?? {}).sort();
  for (let j = 0; j < n; j++) {
    const t = D.t0 + j * D.step, loc = t + nzOffset(t);
    const m = monthOf(loc), day = oe.days?.[m] ?? oe.days?.[keys[keys.length - 1]];
    if (!day) continue;
    const slot = Math.floor((loc % 864e5) / 18e5);
    for (const isl of ['NI', 'SI']) {
      for (const [f, v] of Object.entries(day[isl] ?? {})) (layer[isl][f] ??= new Float64Array(n))[j] = v[slot] ?? 0;
    }
  }
  const named = Object.entries(oe.named ?? {}).map(([name, s]) => {
    const [fuel, isl] = oe.info?.[name] ?? ['', ''];
    return { name, fuel, isl, s };
  });
  return { layer, named };
}
