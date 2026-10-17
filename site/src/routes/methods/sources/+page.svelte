<script lang="ts">
	// Every dataset Elenz uses, from the registry (#lib/methods/registry.ts), with links to the pages that use it.
	import { SOURCES, TOPICS } from '#lib/methods/registry.js';

	const title = (slug: string) => TOPICS.find((t) => t.slug === slug)?.title ?? slug;
	const groups: [string, string[]][] = [
		['Market data', ['rtd', 'dispatch', 'final', 'offers', 'register', 'nsp', 'shapes']],
		['Metered data', ['genmd', 'embedded', 'gridexport', 'gridimport', 'tiwai', 'hvdcflows', 'reconciliation', 'guehmt']],
		['Weather', ['satellite', 'era5', 'forecast']],
		['Emission factors and national figures', ['genesis', 'mbie', 'mfe', 'nzga', 'inventory']],
	];
	const byId = Object.fromEntries(SOURCES.map((s) => [s.id, s]));
</script>

<svelte:head>
	<title>Every data source · Data and methods · ELENZ</title>
	<meta name="description" content="Every dataset Elenz uses: what it contains, what it is used for, how far back it goes, how soon it is published and its licence." />
</svelte:head>

<main class="mt-page" aria-labelledby="mt-h">
	<header class="mt-head">
		<p class="mt-kicker"><a href="/methods">Data and methods</a></p>
		<h1 id="mt-h">Every data source</h1>
		<p class="mt-lede">All {SOURCES.length} datasets behind the site, grouped by kind. Each says what it contains, what Elenz uses it for, and which method pages describe that use. Datasets marked “Check” are used only to test or fit a method, not shown directly.</p>
	</header>

	<div class="mt-body">
		{#each groups as [name, ids] (name)}
			<h2 id={name.toLowerCase().replace(/[^a-z]+/g, '-')}>{name}</h2>
			<div class="src-list">
				{#each ids.map((id) => byId[id]).filter(Boolean) as s (s.id)}
					<article class="src" id={s.id}>
						<h3><a href={s.url} target="_blank" rel="noopener">{s.name}</a><span class="pub">{s.publisher}</span>{#if s.check}<span class="est-tag" style="color: var(--muted)">Check</span>{/if}</h3>
						{#if s.dataset}<p><code>{s.dataset}</code></p>{/if}
						<dl>
							<dt>Contains</dt><dd>{s.what}</dd>
							<dt>Used for</dt><dd>{s.use}</dd>
							<dt>Covers</dt><dd>{s.period}</dd>
							<dt>Published</dt><dd>{s.fresh}</dd>
							<dt>Licence</dt><dd>{s.licence}</dd>
							{#if s.topics.length}
								<dt>Method</dt>
								<dd class="used">{#each s.topics as t, i (t)}{i ? ', ' : ''}<a href="/methods/{t}">{title(t)}</a>{/each}</dd>
							{/if}
						</dl>
					</article>
				{/each}
			</div>
		{/each}

		<h2 id="more">Also</h2>
		<p>Only data that may be republished is used. Live hydro lake storage and planned outages aren’t on the site yet, because there is no source for them that can be republished freely.</p>
		<p>Articles cite their own sources at the end of each article.</p>
	</div>
</main>
