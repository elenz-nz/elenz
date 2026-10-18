<script lang="ts">
	// One article: header, the article's own body (from #lib/articles/posts), then sources and a link back.
	import Masthead from '#lib/site/Masthead.svelte';
	import SiteFooter from '#lib/site/SiteFooter.svelte';
	import { longDate, noindex, seriesOf, scheduled } from '#lib/articles/registry.js';
	import SeriesNav from '#lib/articles/SeriesNav.svelte';
	import Preview from '#lib/site/Preview.svelte';
	import '#lib/articles/articles.css';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const a = $derived(data.article);
	const Body = $derived(data.article.component);
	const S = $derived(seriesOf(data.article));
</script>

<svelte:head>
	<title>{a.title} · ELENZ</title>
	<meta name="description" content={a.dek} />
	<!-- the article's cover, or the site's card for one without -->
	<Preview title={a.title} description={a.dek} path="/articles/{a.slug}" type="article" image={a.image || undefined} alt={a.image ? `Cover of “${a.title}”` : undefined} />
	{#if noindex(a)}<meta name="robots" content="noindex" />{/if}
</svelte:head>

<div class="wrap">
	<Masthead />

	<main class="a-page">
		<a class="a-back" href="/articles">← Articles</a>
		<header class="a-head">
			<span class="a-meta"><span class="a-kind">{a.kind}</span>{#if S}<span class="a-part">Part {a.part} of {S.parts.length} · {S.name}</span>{/if}{#if a.draft}<span class="a-draft">Draft</span>{:else if scheduled(a)}<span class="a-draft">Scheduled</span>{/if}</span>
			<h1>{a.title}</h1>
			<p class="a-dek">{a.dek}</p>
			<time datetime={a.date}>{longDate(a.date)}{#if a.updated} · updated {longDate(a.updated)}{/if}</time>
		</header>

		<article class="a-body">
			<Body />
		</article>

		{#if S}<SeriesNav name={S.name} dek={S.dek} parts={S.parts} current={a.slug} prev={S.prev} next={S.next} />{/if}

		<footer class="a-foot">
			<p>Figures are from the Electricity Authority's market data as shown on the <a href="/tracker">tracker</a>; <a href="/methods">Data and methods</a> explains how each series is built and which are estimates.</p>
		</footer>
	</main>

	<SiteFooter />
</div>
