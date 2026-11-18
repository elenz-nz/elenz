import { error } from '@sveltejs/kit';
import type { EntryGenerator, PageServerLoad } from './$types';

// One page per plant file, prerendered from its data (ingest/plant_pages.py writes src/lib/plants/pages/<slug>.json).
// A server load, so each page's built HTML carries only its own plant's data, not all 110 files.
const FILES = import.meta.glob('/src/lib/plants/pages/*.json', { eager: true, import: 'default' });
const PAGES: Record<string, any> = Object.fromEntries(Object.entries(FILES).map(([k, v]) => [k.split('/').pop()!.slice(0, -5), v]));

// the pages have no links in while they're hidden (#lib/plants/registry.js), so each one is listed for the prerender
export const entries: EntryGenerator = () => Object.keys(PAGES).map((slug) => ({ slug }));

export const load: PageServerLoad = ({ params }) => {
	const p = PAGES[params.slug];
	if (!p) error(404, 'No such plant');
	return { p };
};
