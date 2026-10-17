import { error } from '@sveltejs/kit';
import { DEFS } from '#lib/records/records.js';
import type { EntryGenerator, PageLoad } from './$types';

// one page per record, prerendered; the region comes from ?region= in the browser
export const entries: EntryGenerator = () => DEFS.map((d) => ({ id: d.id }));

export const load: PageLoad = ({ params }) => {
	if (!DEFS.some((d) => d.id === params.id)) error(404, 'No such record');
	return { id: params.id };
};
