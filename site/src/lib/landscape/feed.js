// The power landscape's feed (/landscape): New Zealand's last 24 hours from tracker.json, the islands added together,
// in the shape dials.js reads. Grid demand is the metered field, prices are Haywards (hay) and Benmore (ben), and other
// embedded generation (oemb.js) comes with its renewable part (oembR).
//
// Embedded solar with no estimate (null in tracker.json: daylight with no irradiance) can't leave a gap in a picture,
// so the scene keeps showing the last estimate there, and roofNA marks those intervals: the numbers under the picture
// then say "No estimate" (style guide, Status labels).
import { withOemb } from '#lib/tracker/oemb.js';

const KEYS = ['hydro', 'wind', 'geo', 'solar', 'coal', 'gas', 'diesel', 'bio', 'waste', 'batt', 'oemb', 'oembR'];

/** tracker.json -> the feed; cap is installed MW by fuel (the battery dial reads cap.batt). */
export function feedFrom(D, cap = {}, hours = 24) {
  withOemb(D);
  const n = Math.min(D.N, Math.round((hours * 3600000) / D.step));
  const a = D.N - n;
  const both = (k, j) => (D.NI[k]?.[j] ?? 0) + (D.SI[k]?.[j] ?? 0);
  const out = { t0: D.t0 + a * D.step, step: D.step, n, end: D.meta?.end ?? D.t0 + (D.N - 1) * D.step, cap, roof: [], roofNA: [], demand: [], hay: [], ben: [] };
  for (const k of KEYS) out[k] = [];
  let lastRoof = 0;
  for (let j = a; j < D.N; j++) {
    for (const k of KEYS) out[k].push(both(k, j));
    const ni = D.NI.roof?.[j], si = D.SI.roof?.[j];
    const none = ni === null || si === null;
    if (!none) lastRoof = (ni ?? 0) + (si ?? 0);
    out.roof.push(lastRoof);
    out.roofNA.push(none ? 1 : 0);
    out.demand.push(both('metered', j));
    out.hay.push(D.NI.price?.[j] ?? 0);
    out.ben.push(D.SI.price?.[j] ?? 0);
  }
  out.plants = (D.plants || []).map((p) => ({ n: p.name, f: p.fuel, c: p.cap, s: (p.s || []).slice(a) }));
  return out;
}
