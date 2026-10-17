<script lang="ts">
	// One series' method: header and "Data used" from the registry, then the page's own body (#lib/methods/pages).
	import { TOPICS, body, longDate, sourceHref, sourcesFor, topic } from '#lib/methods/registry.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const t = $derived(topic(data.slug)!);
	const Body = $derived(body(data.slug));
	const used = $derived(sourcesFor(data.slug));
	const i = $derived(TOPICS.findIndex((x) => x.slug === data.slug));
	const prev = $derived(i > 0 ? TOPICS[i - 1] : null);
	const next = $derived(i < TOPICS.length - 1 ? TOPICS[i + 1] : null);
</script>

<svelte:head>
	<title>{t.title} · Data and methods · ELENZ</title>
	<meta name="description" content={t.summary} />
</svelte:head>

<main class="mt-page" aria-labelledby="mt-h">
	<header class="mt-head">
		<p class="mt-kicker"><a href="/methods">Data and methods</a></p>
		<h1 id="mt-h">{t.title}{#if t.estimate}<span class="est-tag">Includes estimates</span>{/if}</h1>
		<p class="mt-lede">{t.summary}</p>
		<p class="mt-meta">
			<span>Shown on {#each t.shownOn as [label, href], j}{j ? (j === t.shownOn.length - 1 ? ' and ' : ', ') : ''}<a {href}>{label}</a>{/each}</span>
			<span>Checked against the code {longDate(t.updated)}</span>
		</p>
	</header>

	{#if used.length}
		<section class="mt-data" aria-labelledby="mt-data-h">
			<h2 id="mt-data-h">Data used</h2>
			<ul>
				{#each used as s (s.id)}
					<li>
						<span class="nm"><a href={sourceHref(s.id)}>{s.name}</a>{#if s.check}<span class="chk">Check</span>{/if}<small>{s.publisher}</small></span>
						<span class="use">{s.use}<small>{s.period} · {s.fresh}</small></span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<div class="mt-body">
		{#if Body}<Body />{/if}
	</div>

	<nav class="mt-pn" aria-label="More methods">
		{#if prev}<a class="prev" href="/methods/{prev.slug}"><small>Previous</small>{prev.title}</a>{/if}
		{#if next}<a class="next" href="/methods/{next.slug}"><small>Next</small>{next.title}</a>{:else}<a class="next" href="/methods/sources"><small>Next</small>Every data source</a>{/if}
	</nav>
</main>
