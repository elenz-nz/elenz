// A plant page's live panel: the plant's output in tracker.json's newest interval and over the live week, by
// half-hour. Pure apart from withOemb (oemb.js), which fills in Ngāwhā's and Teviot's estimated output as Now does.
import { withOemb } from '#lib/tracker/oemb.js';

export const LIVE_URL = '/data/tracker.json';
const HALF = 6;   // 5-minute intervals in a half-hour

/**
 * {end, mw, est, half: [{t, mw}], avg, min, max} for the plant named `plant` in tracker.json, or null when the live
 * data doesn't have it (a plant that is never dispatched, or one that has closed). `est`: part of its output is a
 * calculated estimate (other embedded generation's named plants).
 */
export function livePlant(D, plant) {
  if (!D?.plants) return null;
  withOemb(D);
  const p = D.plants.find((q) => q.name === plant);
  if (!p?.s?.length) return null;
  const n = D.N, s = p.s;
  const half = [];
  // half-hours on the clock (the newest may be part of one)
  const k = (((D.t0 / D.step) % HALF) + HALF) % HALF;
  for (let j = (HALF - k) % HALF; j < n; j += HALF) {
    const xs = s.slice(j, Math.min(j + HALF, n)).filter((x) => x != null);
    if (xs.length) half.push({ t: D.t0 + j * D.step, mw: xs.reduce((a, b) => a + b, 0) / xs.length });
  }
  const vs = half.map((h) => h.mw);
  return {
    end: D.meta?.end ?? D.t0 + (n - 1) * D.step, mw: s[n - 1] ?? 0, est: !!D.oemb?.named?.[plant],
    half, avg: vs.reduce((a, b) => a + b, 0) / (vs.length || 1), min: Math.min(...vs), max: Math.max(...vs)
  };
}
