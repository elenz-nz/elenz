// A record's 1200 x 630 image, drawn in the browser for the Share and Download buttons on a record's page, in the
// page's own light or dark colours (test report REC-05/06, 31 Oct 2026: downloads were always light). The layout is
// recordImage.js's, which the Worker also draws for link previews (/og/records/...), so the two match.
import { recordScene, paintScene, W, H } from './recordImage.js';

/** Is the page showing its dark colours (the theme picked on the site, else the system's)? */
export function pageIsDark() {
  if (typeof document === 'undefined') return false;
  const t = document.documentElement.dataset.theme;
  if (t === 'dark' || t === 'light') return t === 'dark';
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Draw a record onto a canvas (1200 x 630). isNew: say "New record". A provisional record (records.js headline:
 *  rec.prov, rec.official) says "Provisional record", names the official one and ends its line dashed and hollow. */
export async function drawRecord(canvas, { d, region, rec, end, isNew, period = 'tp', dark = pageIsDark() }) {
  try { await document.fonts.ready; } catch { /* fonts are a nicety */ }
  canvas.width = W; canvas.height = H;
  paintScene(canvas.getContext('2d'), recordScene({ d, region, rec, end, isNew, period, dark }));
}
