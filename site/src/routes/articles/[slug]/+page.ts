import { error } from '@sveltejs/kit';
import { articles, find } from '#lib/articles/registry.js';
import type { EntryGenerator, PageLoad } from './$types';

// prerender every article, including drafts, so each has a working address
export const entries: EntryGenerator = () => articles.map((a) => ({ slug: a.slug }));

export const load: PageLoad = ({ params }) => {
	const article = find(params.slug);
	if (!article) error(404, 'No such article');
	return { article };
};
