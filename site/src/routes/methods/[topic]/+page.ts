import { error } from '@sveltejs/kit';
import { TOPICS, topic } from '#lib/methods/registry.js';
import type { EntryGenerator, PageLoad } from './$types';

// one page per series, prerendered
export const entries: EntryGenerator = () => TOPICS.map((t) => ({ topic: t.slug }));

export const load: PageLoad = ({ params }) => {
	const t = topic(params.topic);
	if (!t) error(404, 'No such page');
	return { slug: t.slug };
};
