// Link-preview images for record pages (design decision, 16 Nov 2026). LinkedIn, Slack, Facebook and the like show
// the image a page names in og:image when the link is pasted, and a record changes with every history run (and a
// provisional one with the live data) without the site being rebuilt. So the Worker:
//   - rewrites a record page's og:image (and og:title, og:url) to /og/records/<id>.png?region=&period=&v=, where v
//     changes with the record (imageVersion), so a site that keeps one copy per image address fetches the new one; and
//   - draws that PNG on request: the same layout as the page's Download image (site/src/lib/records/recordImage.js),
//     as SVG, rendered by resvg (worker/vendor/resvg, WebAssembly) with the site's fonts (worker/fonts), in the dark
//     colours the article covers use for previews. Each image is drawn once and kept in Cloudflare's cache.
// Anything missing (KV down, no records file, a record the page doesn't show) leaves the page's own tags, the site's
// card, in place.
import { initWasm, Resvg } from './vendor/resvg/index.mjs';
import wasm from './vendor/resvg/index_bg.wasm';
import sg400 from './fonts/SchibstedGrotesk-400.ttf';
import sg500 from './fonts/SchibstedGrotesk-500.ttf';
import sg600 from './fonts/SchibstedGrotesk-600.ttf';
import sg800 from './fonts/SchibstedGrotesk-800.ttf';
import pm400 from './fonts/IBMPlexMono-400.ttf';
import pm600 from './fonts/IBMPlexMono-600.ttf';
import {
  def, get, notShown, provisional, headline, liveBeats, isNew, dropTies, fmt, fullName, periodOf, REGIONS, PERIOD_KEYS,
} from '../site/src/lib/records/records.js';
import { recordScene, sceneToSvg, imageVersion } from '../site/src/lib/records/recordImage.js';
import { SITE_URL } from '../site/src/lib/site/viewurl.js';

export const RECORD_PAGE = /^\/records\/([a-z0-9_]+)\/?$/;
export const RECORD_IMAGE = /^\/og\/records\/([a-z0-9_]+)\.png$/;

let ready = null;
function render(svg) {
  ready ??= initWasm(wasm);
  return ready.then(() => {
    const fontBuffers = [sg400, sg500, sg600, sg800, pm400, pm600].map((f) => new Uint8Array(f));
    return new Resvg(svg, { font: { fontBuffers, loadSystemFonts: false, defaultFontFamily: 'Schibsted Grotesk' } })
      .render().asPng();
  });
}

/** The region and period a record page's address asks for, as the page reads them (?region=, ?period=). */
function view(d, url) {
  const q = url.searchParams.get('region'), p = url.searchParams.get('period');
  return {
    region: q && d.regions.includes(q) ? q : 'NZ',
    period: p && PERIOD_KEYS.includes(p) ? p : 'tp',
  };
}

/** The record a page leads with, as the page works it out (records/[id]/+page.svelte): the provisional one when there
 *  is one, else the official record. null when it can't be shown. */
async function lead(env, d, region, period) {
  const read = async (key) => { try { return await env.DATA.get(key, { type: 'json', cacheTtl: 60 }); } catch { return null; } };
  const [R0, D] = await Promise.all([read('hist/records.json'), period === 'tp' ? read('tracker.json') : null]);
  if (!R0) return null;
  const R = dropTies(R0);
  const rec = get(R, d.id, region, period);
  if (!rec || notShown(d, region, rec, R, period)) return null;
  let live = null;
  try { live = D ? liveBeats(R, D) : null; } catch { /* the live check is extra, as on the page */ }
  const prov = period === 'tp' ? provisional(R, live, d.id, region) : (rec.prov ?? null);
  const top = headline(rec, prov);
  const fresh = !prov && isNew(rec, period);
  return { R, top, isNew: fresh, prov: !!prov };
}

const imagePath = (d, region, period, v) => {
  const q = new URLSearchParams();
  if (region !== 'NZ') q.set('region', region);
  if (period !== 'tp') q.set('period', period);
  q.set('v', v);
  return `/og/records/${d.id}.png?${q}`;
};

/** A record page with its own og:image, og:title and og:url; the page as it is when anything is missing. */
export async function recordPage(res, env, url) {
  const id = url.pathname.match(RECORD_PAGE)?.[1];
  const d = id ? def(id) : null;
  if (!d || !env.DATA || !res.ok || !(res.headers.get('content-type') || '').includes('text/html')) return res;
  const { region, period } = view(d, url);
  const L = await lead(env, d, region, period);
  if (!L) return res;
  const regionName = REGIONS.find((r) => r.id === region)?.name ?? region;
  const label = `${fullName(d)}${period !== 'tp' ? ` (${periodOf(period).label.toLowerCase()})` : ''}, ${regionName}`;
  const title = `${L.prov ? 'Provisional record' : L.isNew ? 'New record' : 'Record'}: ${label}, ${fmt(d, L.top.v, period)} · ELENZ`;
  const image = SITE_URL + imagePath(d, region, period, imageVersion({ rec: L.top, isNew: L.isNew, period }));
  const q = new URLSearchParams();
  if (region !== 'NZ') q.set('region', region);
  if (period !== 'tp') q.set('period', period);
  const qs = q.toString();
  const page = `${SITE_URL}/records/${d.id}${qs ? '?' + qs : ''}`;
  const set = (v) => ({ element(el) { el.setAttribute('content', v); } });
  const out = new HTMLRewriter()
    .on('meta[property="og:title"]', set(title))
    .on('meta[property="og:url"]', set(page))
    .on('meta[property="og:image"]', set(image))
    .on('meta[property="og:image:width"]', set('1200'))
    .on('meta[property="og:image:height"]', set('630'))
    .on('meta[property="og:image:alt"]', set(`${label}: ${fmt(d, L.top.v, period)}, and how the record grew since 1997`))
    .transform(res);
  // the tags follow the data, so the page isn't cached for long anywhere
  const r = new Response(out.body, out);
  r.headers.set('cache-control', 'public, max-age=300');
  return r;
}

/** The record's PNG for /og/records/<id>.png. Kept a year in Cloudflare's cache when its v is the current one (a new
 *  record gives a new address); an old v gets the current image, kept briefly. The site's card if it can't be drawn. */
export async function recordImage(request, env, url, ctx) {
  const id = url.pathname.match(RECORD_IMAGE)?.[1];
  const d = id ? def(id) : null;
  const fallback = () => env.ASSETS.fetch(new Request(new URL('/og/elenz.png', url), request));
  if (!d || !env.DATA) return fallback();
  const { region, period } = view(d, url);
  const L = await lead(env, d, region, period);
  if (!L) return fallback();
  const v = imageVersion({ rec: L.top, isNew: L.isNew, period });
  const control = url.searchParams.get('v') === v ? 'public, max-age=31536000, immutable' : 'public, max-age=600';
  // kept under the image's tidy address (record, region, period and the current v), whatever else the address
  // carries, so each image is drawn once however the address is written
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const key = new Request(new URL(imagePath(d, region, period, v), url));
  const hit = cache ? await cache.match(key).catch(() => null) : null;
  if (hit) {
    const r = new Response(hit.body, hit);
    r.headers.set('cache-control', control);
    return r;
  }
  let png;
  try {
    png = await render(sceneToSvg(recordScene({ d, region, rec: L.top, end: L.R.end, isNew: L.isNew, period, dark: true })));
  } catch (e) {
    console.log(`record image failed: ${e && e.message}`);
    return fallback();
  }
  if (cache && ctx?.waitUntil) {
    const kept = new Response(png, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=31536000, immutable' } });
    ctx.waitUntil(cache.put(key, kept).catch(() => {}));
  }
  return new Response(png, { headers: { 'content-type': 'image/png', 'cache-control': control } });
}
