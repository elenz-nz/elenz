<script lang="ts">
	// One series' method: header from the registry, then the page's own body (#lib/methods/pages). A `structured` topic
	// follows the standard structure, so its body places Data sources and References itself; for the others this page
	// adds them around the body.
	import Preview from '#lib/site/Preview.svelte';
	import DataSources from '#lib/methods/DataSources.svelte';
	import References from '#lib/methods/References.svelte';
	import { TOPICS, body, longDate, reportHref, topic } from '#lib/methods/registry.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const t = $derived(topic(data.slug)!);
	const Body = $derived(body(data.slug));
	const i = $derived(TOPICS.findIndex((x) => x.slug === data.slug));
	const prev = $derived(i > 0 ? TOPICS[i - 1] : null);
	const next = $derived(i < TOPICS.length - 1 ? TOPICS[i + 1] : null);
</script>

<svelte:head>
	<title>{t.title} · Data and methods · ELENZ</title>
	<meta name="description" content={t.summary} />
	<Preview title="{t.title} · Data and methods · ELENZ" description={t.summary} path="/methods/{data.slug}" />
</svelte:head>

<main class="mt-page" aria-labelledby="mt-h">
	<header class="mt-head">
		<p class="mt-kicker"><a href="/methods">Data and methods</a></p>
		<h1 id="mt-h">{t.title}{#if t.estimate && !t.structured}<span class="est-tag">Includes estimates</span>{/if}</h1>
		<p class="mt-lede">{t.summary}</p>
		<p class="mt-meta">
			<span>Shown on {#each t.shownOn as [label, href], j}{j ? (j === t.shownOn.length - 1 ? ' and ' : ', ') : ''}<a {href}>{label}</a>{/each}</span>
			<span>{t.structured ? 'Reviewed' : 'Checked'} against the code {t.structured ? 'on ' : ''}{longDate(t.updated)}</span>
		</p>
	</header>

	{#if !t.structured}<DataSources slug={t.slug} />{/if}

	<div class="mt-body">
		{#if Body}<Body />{/if}
	</div>

	{#if !t.structured}<References slug={t.slug} />{/if}

	<p class="mt-report">Spotted a problem with this page, or know a better source? <a href={reportHref(t.title, `/methods/${t.slug}`)}>Email us about it</a></p>

	<nav class="mt-pn" aria-label="More methods">
		{#if prev}<a class="prev" href="/methods/{prev.slug}"><small>Previous</small>{prev.title}</a>{/if}
		{#if next}<a class="next" href="/methods/{next.slug}"><small>Next</small>{next.title}</a>{:else}<a class="next" href="/methods/sources"><small>Next</small>Every data source</a>{/if}
	</nav>
</main>
