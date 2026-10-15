<script lang="ts">
	// The articles index: records, quarterly reviews and analysis. Hidden while ARTICLES_PUBLIC is false (see #lib/articles/registry.ts).
	import Masthead from '#lib/site/Masthead.svelte';
	import SiteFooter from '#lib/site/SiteFooter.svelte';
	import { ARTICLES_PUBLIC, listed, longDate, noindex } from '#lib/articles/registry.js';
	import '#lib/articles/articles.css';
</script>

<svelte:head>
	<title>Articles · ELENZ</title>
	<meta name="description" content="Records, quarterly reviews and analysis of New Zealand's electricity system, from Electricity Authority data." />
	{#if noindex()}<meta name="robots" content="noindex" />{/if}
</svelte:head>

<div class="wrap fill">
	<Masthead />

	<main class="a-index">
		<header>
			<h1>Articles</h1>
			{#if !ARTICLES_PUBLIC}
				<p class="hidden-note"><b>Hidden.</b> Not linked from the site or listed by search engines yet; drafts shown for review.</p>
			{/if}
		</header>

		{#if listed.length}
			<ul class="a-grid">
				{#each listed as a (a.slug)}
					<li>
						<a href="/articles/{a.slug}">
							<span class="a-meta"><span class="a-tag">{a.kind}</span>{#if a.draft}<span class="a-draft">Draft</span>{/if}<time datetime={a.date}>{longDate(a.date)}</time></span>
							<h2>{a.title}</h2>
							{#if a.image}<img src={a.image} alt="" width="1200" height="630" loading="lazy" />{/if}
						</a>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="a-empty">No articles yet.</p>
		{/if}
	</main>

	<SiteFooter />
</div>
