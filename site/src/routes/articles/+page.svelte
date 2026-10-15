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

<div class="wrap">
	<Masthead />

	<main class="a-index">
		<header>
			{#if !ARTICLES_PUBLIC}
				<p class="hidden-note"><b>Hidden.</b> This section isn't linked from the site or listed by search engines yet. Drafts are shown here for review.</p>
			{/if}
			<h1>Articles</h1>
			<p>New records, quarterly reviews and closer looks at how New Zealand's electricity system is running, written from the same data as the tracker.</p>
		</header>

		{#if listed.length}
			<ul class="a-list">
				{#each listed as a (a.slug)}
					<li>
						<a href="/articles/{a.slug}" class:has-img={a.image}>
							{#if a.image}<img class="a-thumb" src={a.image} alt="" width="1200" height="630" loading="lazy" />{/if}
							<span class="a-meta"><span class="a-kind">{a.kind}</span><time datetime={a.date}>{longDate(a.date)}</time>{#if a.draft}<span class="a-draft">Draft</span>{/if}</span>
							<h2>{a.title}</h2>
							<p>{a.dek}</p>
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
