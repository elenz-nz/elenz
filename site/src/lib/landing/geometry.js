// Shared geometry for the landing page's two 24-hour charts, so the hero's horizon line can hand off to the
// Tracker preview (Handoff.svelte) and land exactly on the top of its stack.
import { recent } from '#lib/home/now.js';

// the hero horizon: total generation as one outline, sampled every 2 intervals
export const HZ = { W: 1000, H: 220 };
// the Tracker preview: generation stacked by fuel, sampled every 3 intervals
export const TK = { W: 600, H: 210, TOP: 8 };

export const totals = (S) => S.t.map((_, i) => S.layers.reduce((a, l) => a + l.v[i], 0));

export function horizon(D) {
  const S = recent(D, 24, 2);
  const tot = totals(S);
  const hi = Math.max(...tot), lo = Math.min(...tot);
  // the daily swing fills most of the height; the floor sits a little below the overnight low
  const floor = lo - (hi - lo) * 0.6;
  return { t: S.t, tot, y: (v) => HZ.H - ((v - floor) / (hi - floor || 1)) * (HZ.H * 0.85) };
}

export function tracker(D) {
  const S = recent(D, 24, 3);
  const tot = totals(S);
  const max = Math.ceil(Math.max(0, ...tot) / 1000) * 1000 || 1000;
  return { S, tot, max, t0: S.t[0], t1: S.t[S.t.length - 1], y: (v) => TK.H - (v / max) * (TK.H - TK.TOP) };
}
