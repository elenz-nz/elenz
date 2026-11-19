import type { PageServerLoad } from './$types';
import INDEX from '#lib/plants/index.json';

// The share page's plant names, so ?plant=<slug> can name the station in the email (the page is prerendered, so the
// address is read in the browser). Just slug and name: the page needs nothing else from the index.
export const load: PageServerLoad = () => ({ names: Object.fromEntries((INDEX.plants as any[]).map((p) => [p.slug, p.name])) as Record<string, string> });
