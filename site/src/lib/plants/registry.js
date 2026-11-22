// The plant pages (/plants/<slug>): whether they are public yet, and the words the pages build from Elenz's own data.
//
// PLANTS_PUBLIC (design decision, 17 Nov 2026): the pages were built on main but hidden while their facts and photos
// were checked batch by batch: noindex, out of the sitemap, no menu item and no links in. Switched on 23 Nov 2026 (the
// Elenz team looked over the pages): the flag is true, /plants, /plants/share and every page are in the sitemap
// (src/routes/sitemap.xml), Plants is in the menu (Masthead.svelte, between Records and Articles), plant names on Now
// and in the Tracker's plant view link to their pages (`plantHref` below), and LINZ Basemaps is named on the privacy
// page (the index map and a page's Map view load its tiles) and in the methods' source register. The index (/plants)
// drops its draft map points (its +page.server.ts). Setting this false hides everything again.
import { FUELS } from '#lib/tracker/fuels.js';
import { slug } from '#lib/site/viewurl.js';
import SLUGS from './slugs.json' with { type: 'json' };

export const PLANTS_PUBLIC = true;

const HAVE = new Set(SLUGS);
/** A plant's page address, from the tracker's plant name (its slug), or null while the pages are hidden or it has none.
 *  slugs.json is every page's slug, written with the pages by ingest/plant_pages.py (small, unlike index.json). */
export const plantHref = (/** @type {string} */ name) => (PLANTS_PUBLIC && HAVE.has(slug(name)) ? `/plants/${slug(name)}` : null);

// how the pages name a plant of each fuel: one, and several
const KIND = {
  hydro: ['Hydro station', 'hydro stations'], geo: ['Geothermal station', 'geothermal stations'],
  wind: ['Wind farm', 'wind farms'], solar: ['Solar farm', 'solar farms'], gas: ['Gas-fired station', 'gas-fired stations'],
  coal: ['Coal and gas station', 'coal and gas stations'], diesel: ['Diesel station', 'diesel stations'],
  batt: ['Battery', 'batteries'], bio: ['Bioenergy plant', 'bioenergy plants'], waste: ['Waste heat plant', 'waste heat plants']
};
export const kind = (fuel) => KIND[fuel]?.[0] ?? 'Power station';
export const kinds = (fuel) => KIND[fuel]?.[1] ?? 'power stations';
export const islandName = (isl) => (isl === 'SI' ? 'South Island' : 'North Island');
export const fuelOf = (k) => FUELS.find((f) => f.k === k) ?? { k, name: k, tok: '--muted' };
export const STATUS = { operating: 'Operating', closed: 'Closed', pending: 'Not generating yet' };

/** The line under a page's name: "Hydro station in the South Island, part of the Waitaki hydro scheme". */
export function subtitle(p) {
  const closed = p.status === 'closed' ? 'Closed ' + kind(p.fuel).toLowerCase() : kind(p.fuel);
  const scheme = p.scheme && p.scheme !== p.name ? `, part of the ${p.scheme} hydro scheme` : '';
  return `${closed} in the ${islandName(p.island)}${scheme}`;
}

/** The page's description for search results and link previews (110 to 160 characters, scripts/check-previews.js). */
export function description(p) {
  const what = p.status === 'closed' ? `a closed ${kind(p.fuel).toLowerCase()}` : `a ${kind(p.fuel).toLowerCase()}`;
  const now = p.status === 'operating' ? 'its output now and in every year in our records' : 'its output in every year in our records';
  const full = `${p.name}, ${what} in the ${islandName(p.island)}: ${now}, its capacity factor and installed capacity.`;
  // a long name ("Fonterra Dairy – Whareroa") would pass 160 characters: drop the second "its"
  return full.length <= 160 ? full : full.replace(', its capacity factor', ', capacity factor');
}
