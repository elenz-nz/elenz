import type { PageServerLoad } from './$types';
import INDEX from '#lib/plants/index.json';
import { PLANTS_PUBLIC } from '#lib/plants/registry.js';

// The plant index's rows (ingest/plant_pages.py writes src/lib/plants/index.json). While the pages are hidden the map
// also shows draft points, marked as not checked yet (design decision, 18 Nov 2026); once PLANTS_PUBLIC is true only
// checked points reach the page.
export const load: PageServerLoad = () => {
	const plants = (INDEX.plants as any[]).map((p) => (PLANTS_PUBLIC && p.pt && !p.pt.checked ? { ...p, pt: null } : p));
	return { plants };
};
