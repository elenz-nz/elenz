// Articles: record write-ups, quarterly reviews and other analysis pieces.
//
// Each article is one Svelte file in ./posts/, named by its URL slug (posts/winter-peak-2026.svelte →
// /articles/winter-peak-2026). The file exports its details from a module script:
//
//   <script module lang="ts">
//     export const meta = { title: '…', dek: 'One-line summary', date: '2026-10-20', kind: 'Record', draft: true };
//   </script>
//
// and its body is ordinary markup, with Record, Figure and Note from this folder for callouts and charts.
//
// While ARTICLES_PUBLIC is false the section is hidden: no link in the navigation, and every article page and the
// index tell search engines not to list them. The pages still work at /articles for anyone with the address.
// Set it to true to put Articles in the navigation; drafts then drop off the index (their own address still works,
// marked as a draft and not indexed) until their `draft` flag is removed.
export const ARTICLES_PUBLIC = true;

export type Kind = 'Record' | 'Quarterly review' | 'Analysis' | 'Guide';

export type Meta = {
	title: string;
	dek: string; // one-sentence summary under the title and on the index
	date: string; // publication date, YYYY-MM-DD (NZ)
	kind: Kind;
	draft?: boolean;
	updated?: string; // YYYY-MM-DD, if revised after publishing
	image?: string; // link-preview image under site/static, e.g. '/articles/winter-2026.png' (analysis/cover_png.py)
};

export type Article = Meta & { slug: string; component: any };

const modules = import.meta.glob<{ meta: Meta; default: any }>('./posts/*.svelte', { eager: true });

export const articles: Article[] = Object.entries(modules)
	.map(([path, m]) => ({ ...m.meta, slug: path.replace(/^.*\/(.+)\.svelte$/, '$1'), component: m.default }))
	.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));

// what the index lists: everything while hidden (so drafts can be reviewed), published articles once public
export const listed = articles.filter((a) => !ARTICLES_PUBLIC || !a.draft);

export const find = (slug: string) => articles.find((a) => a.slug === slug);

// the site's public address, for absolute links in link previews; change it when elenz.nz is attached
export const SITE_URL = 'https://elenz.elenz.workers.dev';

// search engines skip the whole section while hidden, and drafts always
export const noindex = (a?: Article) => !ARTICLES_PUBLIC || !!a?.draft;

const DATE = new Intl.DateTimeFormat('en-NZ', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
export const longDate = (iso: string) => DATE.format(new Date(iso + 'T00:00:00Z'));
