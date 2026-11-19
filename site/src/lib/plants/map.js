// A plant's checked point on the island outlines of #lib/home/nzmap.js (made by analysis/make_nz_map.py in NZTM2000,
// EPSG:2193). nztm() is the transverse Mercator projection (GRS80; central meridian 173° E, scale 0.9996, false
// easting 1,600,000 m, false northing 10,000,000 m); toView() places it on the outlines' viewBox through the five
// reference points nzmap.js carries (PTS), so it needs no copy of the map's bounds. Pure: tests/plants.test.js checks it.
import { PTS } from '#lib/home/nzmap.js';

const A = 6378137, F = 1 / 298.257222101, K0 = 0.9996, LON0 = 173, FE = 1600000, FN = 10000000;
const E2 = F * (2 - F), EP2 = E2 / (1 - E2), RAD = Math.PI / 180;

function arc(phi) {
  const e4 = E2 * E2, e6 = e4 * E2;
  return A * ((1 - E2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi - (3 * E2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * phi)
    + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * phi) - (35 * e6 / 3072) * Math.sin(6 * phi));
}

/** [easting, northing] in metres for a point in degrees. */
export function nztm(lat, lon) {
  const phi = lat * RAD, l = (lon - LON0) * RAD, s = Math.sin(phi), c = Math.cos(phi), t = Math.tan(phi);
  const n = A / Math.sqrt(1 - E2 * s * s), T = t * t, C = EP2 * c * c, a = l * c;
  const x = K0 * n * (a + (1 - T + C) * a ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * EP2) * a ** 5 / 120);
  const y = K0 * (arc(phi) + n * t * (a * a / 2 + (5 - T + 9 * C + 4 * C * C) * a ** 4 / 24
    + (61 - 58 * T + T * T + 600 * C - 330 * EP2) * a ** 6 / 720));
  return [FE + x, FN + y];
}

// the places PTS marks (make_nz_map.py's `points`), to fit the viewBox's scale and origin
const REF = { ben: [-44.57, 170.20], hay: [-41.15, 174.98], akl: [-36.85, 174.76], wlg: [-41.29, 174.78], chc: [-43.53, 172.63] };
const fit = (() => {
  // x = (E - x0) s, y = (y1 - N) s: least squares for s, then the offsets
  const rows = Object.entries(REF).map(([k, [la, lo]]) => [nztm(la, lo), PTS[k]]);
  const mE = rows.reduce((a, r) => a + r[0][0], 0) / rows.length, mN = rows.reduce((a, r) => a + r[0][1], 0) / rows.length;
  const mx = rows.reduce((a, r) => a + r[1][0], 0) / rows.length, my = rows.reduce((a, r) => a + r[1][1], 0) / rows.length;
  let num = 0, den = 0;
  for (const [[e, n], [x, y]] of rows) { num += (e - mE) * (x - mx) - (n - mN) * (y - my); den += (e - mE) ** 2 + (n - mN) ** 2; }
  const s = num / den;
  return { s, x0: mE - mx / s, y1: mN + my / s };
})();

/** [x, y] on nzmap.js's viewBox for a point in degrees. */
export function toView(lat, lon) {
  const [e, n] = nztm(lat, lon);
  return [(e - fit.x0) * fit.s, (fit.y1 - n) * fit.s];
}

/** [x, y, w, h] around one island's outline (an absolute "M…L…" path from nzmap.js), padded by `pad` on each side. */
export function islandBox(path, pad = 8) {
  const xs = [], ys = [];
  for (const m of path.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)) { xs.push(+m[1]); ys.push(+m[2]); }
  const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad;
  return [x0, y0, Math.max(...xs) + pad - x0, Math.max(...ys) + pad - y0];
}
