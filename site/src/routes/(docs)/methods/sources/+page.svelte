<script lang="ts">
	// The source register: which data sits behind each figure, then every dataset once, from the registry
	// (#lib/methods/registry.ts) and each page's ROLES (#lib/methods/roles.ts), with links to the pages that use it.
	import Preview from '#lib/site/Preview.svelte';
	import { ROLES } from '#lib/methods/roles.js';
	import { REFERENCES, REVIEWED, SOURCES, TOPICS, longDate, reportHref, sourceOf, topicsOf } from '#lib/methods/registry.js';

	const LEDE = 'Every dataset behind Elenz: what it contains, what it is used for, how far back it goes, how soon it is published and its licence.';
	const title = (slug: string) => TOPICS.find((t) => t.slug === slug)?.title ?? slug;
	const groups: [string, string, string[]][] = [
		['Live and recent market data', 'live-recent', ['rtd', 'dispatch']],
		['Prices and offers', 'prices-offers', ['final', 'offers']],
		['Metered data', 'metered-data', ['genmd', 'embedded', 'gridexport', 'gridimport', 'tiwai', 'hvdcflows', 'reconciliation']],
		['Plants and network', 'plants-network', ['register', 'nsp', 'shapes', 'guehmt', 'capacity']],
		['Weather', 'weather', ['satellite', 'era5', 'forecast']],
		['Emissions and national statistics', 'emissions-statistics', ['genesis', 'mbie', 'mfe', 'nzga', 'inventory']],
	];
	const byId = Object.fromEntries(SOURCES.map((s) => [s.id, s]));
	// the table at the top: each figure's datasets by what they do for it, read from its Data sources section
	const col = (label: string) => /^(Live week|Recent weeks)/.test(label) ? 1 : /^(Mapping|Check|Fill-in)/.test(label) ? 2 : 0;
	const rows = TOPICS.map((t) => {
		const cells: string[][] = [[], [], []];
		for (const [id, [label]] of Object.entries(ROLES[t.slug] ?? {})) {
			const name = sourceOf(id).name;
			if (!cells[col(label)].includes(name)) cells[col(label)].push(name);
		}
		return { t, cells };
	});
</script>

<svelte:head>
	<title>Source register · Data and methods · ELENZ</title>
	<meta name="description" content={LEDE} />
	<Preview title="Source register · ELENZ" description={LEDE} path="/methods/sources" />
</svelte:head>

<main class="mt-page" aria-labelledby="mt-h">
	<header class="mt-head">
		<p class="mt-kicker"><a href="/methods">Data and methods</a></p>
		<h1 id="mt-h">Source register</h1>
		<p class="mt-lede">This register lists the {SOURCES.length} datasets behind Elenz. Use the table below to find the data behind a figure. Each entry then explains the dataset’s role, what it covers, when it is published and how it is licensed.</p>
		<p class="mt-meta"><span>Reviewed against the code on {longDate(REVIEWED)}</span></p>
	</header>

	<div class="mt-body">
		<h2 id="by-figure">Data behind each figure</h2>
		<p>Each method page’s Data sources section says what every dataset does for that figure, period by period.</p>
		<div class="tbl">
			<table>
				<thead><tr><th>Figure</th><th>Main data</th><th>Recent and live data</th><th>Supporting data</th></tr></thead>
				<tbody>
					{#each rows as { t, cells } (t.slug)}
						<tr><td><a href="/methods/{t.slug}">{t.title}</a></td>{#each cells as c, i (i)}<td>{c.length ? c.join(', ') : 'None'}</td>{/each}</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p>Jump to a group: {#each groups as [name, id], i (id)}{i ? ', ' : ''}<a href="#{id}">{name.toLowerCase()}</a>{/each}, or the <a href="#references">reports and references</a>.</p>

		{#each groups as [name, id, ids] (id)}
			<h2 id={id}>{name}</h2>
			<div class="src-list">
				{#each ids.map((x) => byId[x]) as s (s.id)}
					<article class="src" id={s.id}>
						<h3><a href={s.url} target="_blank" rel="noopener">{s.name}</a><span class="pub">{s.publisher}</span>{#if s.check}<span class="est-tag" style="color: var(--muted)">Check</span>{/if}</h3>
						{#if s.dataset}<p><code>{s.dataset}</code></p>{/if}
						<dl>
							<dt>Role</dt><dd>{s.role}</dd>
							<dt>Contains</dt><dd>{s.what}</dd>
							<dt>Used for</dt><dd>{s.use}</dd>
							<dt>Coverage</dt><dd>{s.period}</dd>
							<dt>Publication timing</dt><dd>{s.fresh}</dd>
							<dt>Licence</dt><dd>{s.licence}</dd>
							{#if topicsOf(s.id).length}
								<dt>Method pages</dt>
								<dd class="used">{#each topicsOf(s.id) as t, i (t.slug)}{i ? ', ' : ''}<a href="/methods/{t.slug}">{t.title}</a>{/each}</dd>
							{/if}
						</dl>
					</article>
				{/each}
			</div>
		{/each}

		<h2 id="references">Reports and references</h2>
		<p>The method pages also cite these documents for facts the datasets can’t show. Each is listed again on the pages that use it.</p>
		<ul>
			{#each REFERENCES as r (r.id)}
				<li><a href={r.url} target="_blank" rel="noopener">{r.title}</a>. {r.by}{r.date ? `, ${r.date}` : ''}. {r.use} <small>({#each r.topics as t, i (t)}{i ? ', ' : ''}<a href="/methods/{t}">{title(t)}</a>{/each})</small></li>
			{/each}
		</ul>

		<h2 id="more"><span id="not-used"></span>Data Elenz doesn’t use</h2>
		<p>We use only data that may be republished. Live hydro lake storage and planned outages aren’t on Elenz, because we have found no source for them that can be republished freely.</p>
		<p>Articles cite their own sources at the end of each article.</p>
	</div>

	<p class="mt-report">Spotted a problem with a source, or know a better one? <a href={reportHref('Source register', '/methods/sources')}>Email us about it</a></p>
</main>
