<script lang="ts">
	// One article: header, the article's own body (from #lib/articles/posts), then sources and a link back.
	import Masthead from '#lib/site/Masthead.svelte';
	import SiteFooter from '#lib/site/SiteFooter.svelte';
	import { longDate, noindex } from '#lib/articles/registry.js';
	import '#lib/articles/articles.css';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const a = $derived(data.article);
	const Body = $derived(data.article.component);
</script>

<svelte:head>
	<title>{a.title} · ELENZ</title>
	<meta name="description" content={a.dek} />
	<meta property="og:title" content={a.title} />
	<meta property="og:description" content={a.dek} />
	<meta property="og:type" content="article" />
	{#if noindex(a)}<meta name="robots" content="noindex" />{/if}
</svelte:head>

<div class="wrap">
	<Masthead />

	<main class="a-page">
		<a class="a-back" href="/articles">← Articles</a>
		<header class="a-head">
			<span class="a-meta"><span class="a-kind">{a.kind}</span>{#if a.draft}<span class="a-draft">Draft</span>{/if}</span>
			<h1>{a.title}</h1>
			<p class="a-dek">{a.dek}</p>
			<time datetime={a.date}>{longDate(a.date)}{#if a.updated} · updated {longDate(a.updated)}{/if}</time>
		</header>

		<article class="a-body">
			<Body />
		</article>

		<footer class="a-foot">
			<p>Figures are from the Electricity Authority's market data as shown on the <a href="/tracker">tracker</a>; <a href="/about#sources">About</a> explains how each series is built and which are estimates.</p>
		</footer>
	</main>

	<SiteFooter />
</div>
