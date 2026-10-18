// /sitemap.xml: every public page, for search engines (listed in static/robots.txt; submit it in Google Search Console).
// Built at prerender from the same registries the pages use, so new records, method pages and published articles
// join it on the next build. Drafts and scheduled articles stay out (they are noindex too).
import { SITE_URL } from '#lib/site/viewurl.js';
import { DEFS } from '#lib/records/records.js';
import { TOPICS } from '#lib/methods/registry.js';
import { articles, hidden, ARTICLES_PUBLIC } from '#lib/articles/registry.js';
import type { RequestHandler } from './$types';

export const prerender = true;

type Url = { path: string; lastmod?: string };

const urls = (): Url[] => [
	{ path: '/' },
	{ path: '/now' },
	{ path: '/tracker' },
	{ path: '/tracker/prices' },
	{ path: '/records' },
	...DEFS.map((d) => ({ path: `/records/${d.id}` })),
	...(ARTICLES_PUBLIC
		? [{ path: '/articles' }, ...articles.filter((a) => !hidden(a)).map((a) => ({ path: `/articles/${a.slug}`, lastmod: a.date }))]
		: []),
	{ path: '/about' },
	{ path: '/methods' },
	{ path: '/methods/sources' },
	...TOPICS.map((t) => ({ path: `/methods/${t.slug}`, lastmod: t.updated }))
];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export const GET: RequestHandler = () => {
	const body =
		'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
		urls()
			.map((u) => `  <url><loc>${esc(SITE_URL + u.path)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`)
			.join('\n') +
		'\n</urlset>\n';
	return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
};
