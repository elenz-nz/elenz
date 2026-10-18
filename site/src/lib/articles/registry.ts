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

// Series: articles published as numbered parts. An article joins one with `series: '<key>'` and `part: <n>` in its
// meta; each part then shows "Part n of N", the list of parts and previous/next links, and the index shows the series
// as one card.
export const SERIES: { [key: string]: { name: string; dek: string } } = {
	'wholesale-market': {
		name: 'Inside the wholesale market',
		dek: "How New Zealand's electricity is bought and sold, what sets the price, and how it reaches your bill.",
	},
};

export type Meta = {
	title: string;
	dek: string; // one-sentence summary under the title and on the index
	date: string; // publication date, YYYY-MM-DD (NZ)
	kind: Kind;
	draft?: boolean;
	updated?: string; // YYYY-MM-DD, if revised after publishing
	image?: string; // link-preview image under site/static, e.g. '/articles/winter-2026.png' (analysis/cover_png.py)
	imageLight?: string; // its light-mode version, shown on the landing page in light mode ('/articles/winter-2026-light.png')
	series?: string; // a key of SERIES
	part?: number; // its part number in that series, from 1
};

export type Article = Meta & { slug: string; component: any };

const modules = import.meta.glob<{ meta: Meta; default: any }>('./posts/*.svelte', { eager: true });

export const articles: Article[] = Object.entries(modules)
	.map(([path, m]) => ({ ...m.meta, slug: path.replace(/^.*\/(.+)\.svelte$/, '$1'), component: m.default }))
	.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));

// Today in New Zealand at build time. An article dated after it is scheduled: like a draft, it stays off the index and
// out of search until a build on or after its date (any push rebuilds the site).
export const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date());
export const scheduled = (a: { draft?: boolean; date: string }) => !a.draft && a.date > TODAY;
export const hidden = (a: { draft?: boolean; date: string }) => !!a.draft || scheduled(a);

// what the index lists: everything while hidden (so drafts can be reviewed), published articles once public
export const listed = articles.filter((a) => !ARTICLES_PUBLIC || !hidden(a));

// the parts of an article's series in order, each marked with whether a reader of `a` may follow a link to it: a
// published part links only to published parts; a draft or scheduled part (under review) links to every part
export function seriesOf(a: Article) {
	if (!a.series || !SERIES[a.series]) return null;
	const parts = articles.filter((p) => p.series === a.series).sort((p, q) => (p.part ?? 0) - (q.part ?? 0));
	const open = (p: Article) => hidden(a) || !ARTICLES_PUBLIC || !hidden(p);
	const i = parts.findIndex((p) => p.slug === a.slug);
	const prev = parts.slice(0, i).reverse().find(open);
	const next = parts.slice(i + 1).find(open);
	return { key: a.series, ...SERIES[a.series], parts: parts.map((p) => ({ ...p, open: open(p) })), prev, next };
}

// the index: articles, with each series folded into one entry, placed by its newest listed part
export type Entry = { kind: 'article'; a: Article } | { kind: 'series'; key: string; name: string; dek: string; parts: Article[]; lead: Article; latest: string };
export const entries: Entry[] = (() => {
	const out: Entry[] = [];
	const seen = new Set<string>();
	for (const a of listed) {
		if (a.series && SERIES[a.series]) {
			if (seen.has(a.series)) continue;
			seen.add(a.series);
			const parts = listed.filter((p) => p.series === a.series).sort((p, q) => (p.part ?? 0) - (q.part ?? 0));
			out.push({ kind: 'series', key: a.series, ...SERIES[a.series], parts, lead: parts[0], latest: parts.reduce((m, p) => (p.date > m ? p.date : m), '') });
		} else out.push({ kind: 'article', a });
	}
	return out;
})();

export const find = (slug: string) => articles.find((a) => a.slug === slug);

// the site's public address, for absolute links in link previews (set once, in #lib/site/viewurl.js)
export { SITE_URL } from '#lib/site/viewurl.js';

// search engines skip the whole section while hidden, and drafts and scheduled articles always
export const noindex = (a?: Article) => !ARTICLES_PUBLIC || (!!a && hidden(a));

const DATE = new Intl.DateTimeFormat('en-NZ', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
export const longDate = (iso: string) => DATE.format(new Date(iso + 'T00:00:00Z'));
