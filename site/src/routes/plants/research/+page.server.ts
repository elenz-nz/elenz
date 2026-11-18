import type { PageServerLoad } from './$types';
import RESEARCH from '#lib/plants/research.json';

// The private plant research page, prerendered from src/lib/plants/research.json (ingest/plant_research.py). A server
// load, so the data is only in this page's HTML (and its __data.json), which the Worker serves to the Elenz team only
// (worker/index.js, research); no public page or script bundles it.
export const load: PageServerLoad = () => ({ d: RESEARCH });
