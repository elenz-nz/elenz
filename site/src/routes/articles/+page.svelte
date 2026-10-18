<script lang="ts">
	// The articles index: records, quarterly reviews and analysis. Hidden while ARTICLES_PUBLIC is false (see #lib/articles/registry.ts).
	import Preview from '#lib/site/Preview.svelte';
	import Masthead from '#lib/site/Masthead.svelte';
	import SiteFooter from '#lib/site/SiteFooter.svelte';
	import { ARTICLES_PUBLIC, entries, hidden, longDate, noindex, scheduled } from '#lib/articles/registry.js';
	import '#lib/articles/articles.css';
</script>

<svelte:head>
	<title>Articles · ELENZ</title>
	<meta name="description" content="Records, quarterly reviews and analysis of New Zealand's electricity system, from Electricity Authority data." />
	<Preview title="Articles · ELENZ" description="Records, quarterly reviews and analysis of New Zealand's electricity system, from Electricity Authority data." path="/articles" />
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

		{#if entries.length}
			<ul class="a-grid">
				{#each entries as e (e.kind === 'series' ? e.key : e.a.slug)}
					{#if e.kind === 'article'}
						{@const a = e.a}
						<li>
							<a href="/articles/{a.slug}">
								<span class="a-meta"><span class="a-tag">{a.kind}</span>{#if a.draft}<span class="a-draft">Draft</span>{:else if scheduled(a)}<span class="a-draft">Scheduled</span>{/if}<time datetime={a.date}>{longDate(a.date)}</time></span>
								<h2>{a.title}</h2>
								{#if a.image}<img src={a.image} alt="" width="1200" height="630" loading="lazy" />{/if}
							</a>
						</li>
					{:else}
						<li class="a-series">
							<a href="/articles/{e.lead.slug}">
								<span class="a-meta"><span class="a-tag">Series</span><span>{e.parts.length} {e.parts.length === 1 ? 'part' : 'parts'}</span><time datetime={e.latest}>{longDate(e.latest)}</time></span>
								<h2>{e.name}</h2>
								{#if e.lead.image}<img src={e.lead.image} alt="" width="1200" height="630" loading="lazy" />{/if}
							</a>
							<p class="a-sdek">{e.dek}</p>
							<ol class="a-parts">
								{#each e.parts as p (p.slug)}
									<li><a href="/articles/{p.slug}"><span>{p.part}</span>{p.title}</a>{#if hidden(p)}<span class="a-draft">{p.draft ? 'Draft' : 'Scheduled'}</span>{/if}</li>
								{/each}
							</ol>
						</li>
					{/if}
				{/each}
			</ul>
		{:else}
			<p class="a-empty">No articles yet.</p>
		{/if}
	</main>

	<SiteFooter />
</div>
