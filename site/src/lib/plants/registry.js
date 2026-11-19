// The plant pages (/plants/<slug>): whether they are public yet, and the words the pages build from Elenz's own data.
//
// PLANTS_PUBLIC (design decision, 17 Nov 2026): the pages are built on main but hidden while their facts and photos
// are checked batch by batch: noindex, out of the sitemap, no menu item and no links in. Switching them on is one
// small pull request once wave 1's facts are checked: set this true, add /plants and the pages to the sitemap
// (src/routes/sitemap.xml) and Plants to the menu (Masthead.svelte, between Records and Articles), link plant names
// from Now and the tracker, and name LINZ Basemaps on the privacy page (the index map loads its tiles) and in the
// methods' source register. The index (/plants) then drops its draft map points (its +page.server.ts). /plants/share
// (the call for first-hand knowledge) goes in the sitemap too.
import { FUELS } from '#lib/tracker/fuels.js';

export const PLANTS_PUBLIC = false;

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
  return `${p.name}, ${what} in the ${islandName(p.island)}: ${now}, its capacity factor and installed capacity.`;
}
