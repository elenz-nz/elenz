<script lang="ts">
	// The plant research page (/plants/research): private, for the Elenz team (design decision, 17 Nov 2026). It replaces
	// the retired research workbook, built from the same plant files as the pages, so what the team reviews is what the
	// site will publish: every plant's state, filters for what still needs work, each plant's facts with their source,
	// grade and date checked (other sources' values beneath), the leads files, and the whole lot as an Excel workbook.
	// Data: src/lib/plants/research.json (ingest/plant_research.py). On elenz.co.nz the Worker serves it only with the
	// key (worker/index.js, research). docs/architecture.md, Plant pages (the research page).
	import { onMount } from 'svelte';
	import { replaceState } from '$app/navigation';
	import Masthead from '#lib/site/Masthead.svelte';
	import SiteFooter from '#lib/site/SiteFooter.svelte';
	import { save } from '#lib/site/download.js';
	import { islandName, fuelOf } from '#lib/plants/registry.js';
	import { fmtMw } from '#lib/plants/history.js';
	import { slug } from '#lib/site/viewurl.js';
	import { DEFAULTS, NEEDS, LOC, STATUS, fuelsOf, fuelName, ownersOf, readSettings, writeSettings, filtered, needCounts, pick, progress, workbook, type Settings } from '#lib/plants/research.js';
	import { xlsx, XLSX_TYPE } from '#lib/plants/xlsx.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const d = $derived(data.d as any);
	const plants = $derived(d.plants as any[]);
	const sources = $derived(d.sources as Record<string, any>);
	const REPO = 'https://github.com/elenz-nz/elenz/blob/main/facilities';

	let s = $state<Settings>({ ...DEFAULTS });
	let ready = false;
	let busy = $state(false);

	const prog = $derived(progress(plants));
	const base = $derived(filtered(plants, s));
	const counts = $derived(needCounts(base));
	const rows = $derived(pick(plants, s));
	const fuels = $derived(fuelsOf(plants));
	const owners = $derived(ownersOf(plants));
	const narrowed = $derived(!!(s.fuel || s.island || s.owner || s.status || s.need || s.text.trim()));
	const leadsOf = $derived(Object.fromEntries((d.photo_leads as any[]).map((r) => [r.id, r])));
	const pct = (a: number, b: number) => (b ? (100 * a) / b : 0);
	const mw = (v: number | null) => (v == null ? '–' : fmtMw(v));
	const osmUrl = (x: string) => `https://www.openstreetmap.org/${x}`;

	onMount(() => {
		s = readSettings(location.search, plants);
		ready = true;
	});
	// keep the address in step with the settings, keeping its key (replace, so Back leaves the page)
	$effect(() => {
		const qs = writeSettings(s, location.search);
		if (!ready || qs === location.search || (!qs && !location.search)) return;
		const url = location.pathname + qs + location.hash;
		Promise.resolve().then(() => replaceState(url, {})).catch(() => history.replaceState(history.state, '', url));
	});

	const natural = (by: string) => ['name', 'fuel', 'island', 'owner'].includes(by);
	function sortBy(by: string) {
		if (s.by === by) s.asc = !s.asc;
		else { s.by = by; s.asc = natural(by); }
	}
	const ariaSort = (by: string) => (s.by === by ? (s.asc ? 'ascending' : 'descending') : 'none');
	const mark = (by: string) => (s.by === by ? (s.asc ? '↑' : '↓') : '');
	const reset = () => { s = { ...DEFAULTS, open: s.open }; };
	const toggle = (k: string) => { s.open = s.open === k ? '' : k; };
	const differs = (e: any, a: any) => a.value.trim().toLowerCase() !== e.value.trim().toLowerCase();

	// the workbook is built just after the button has shown "Preparing", so the click answers at once
	function download() {
		busy = true;
		setTimeout(() => {
			try {
				const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date());
				save(new Blob([xlsx(workbook(d))], { type: XLSX_TYPE }), `elenz-plant-research-${day}.xlsx`);
			} finally {
				busy = false;
			}
		}, 30);
	}
</script>

<svelte:head>
	<title>Plant research · ELENZ</title>
	<meta name="robots" content="noindex" />
	<meta name="referrer" content="no-referrer" />
</svelte:head>

{#snippet srcs(ids: string[])}{#each ids as id, i (id)}{i ? '; ' : ''}{#if sources[id]?.url}<a href={sources[id].url}>{sources[id].title || id}</a>{:else}{sources[id]?.title || id}{/if}{#if sources[id]?.kind === 'research'}<span class="tag">research only</span>{/if}{/each}{/snippet}

<div class="wrap">
	<Masthead />

	<main class="res">
		<div class="head">
			<h1>Plant research</h1>
			<p class="sub">Private, for the Elenz team. Built from the plant files in the repository, so it shows exactly what the plant pages will publish: a fact appears on its page once it has a date checked, a grade A or B and public sources. <a href="{REPO}/PLANTS.md">How to check a plant</a></p>
		</div>

		<div class="cards">
			{#each [['Pages reviewed', prog.reviewed, prog.plants], ['Facts checked', prog.checked, prog.facts], ['Locations checked', prog.located, prog.plants], ['With a photo', prog.photos, prog.plants]] as [k, a, b] (k)}
				<div class="panel card">
					<span class="k">{k}</span>
					<span class="v num">{a} <small>of {b}</small></span>
					<span class="bar"><span style="width:{pct(+a, +b)}%"></span></span>
				</div>
			{/each}
			<div class="panel card">
				<span class="k">Still to do</span>
				<span class="v small">{prog.todo} with something to check</span>
				<span class="v small">{prog.disagree} where sources disagree</span>
			</div>
		</div>

		<div class="panel ctl">
			<div class="row">
				<label class="lab">Fuel
					<select bind:value={s.fuel}><option value="">All fuels</option>{#each fuels as f (f.k)}<option value={f.k}>{f.name}</option>{/each}</select>
				</label>
				<div class="seg" role="group" aria-label="Island">
					{#each [['', 'Both islands'], ['NI', 'North'], ['SI', 'South']] as [k, name] (k)}
						<button type="button" aria-pressed={s.island === k} onclick={() => (s.island = k)}>{name}</button>
					{/each}
				</div>
				<label class="lab">Owner
					<select bind:value={s.owner}><option value="">All owners</option>{#each owners as o (o)}<option value={slug(o)}>{o}</option>{/each}</select>
				</label>
				<label class="lab">Status
					<select bind:value={s.status}><option value="">Any</option>{#each Object.entries(STATUS) as [k, name] (k)}<option value={k}>{name}</option>{/each}</select>
				</label>
			</div>
			<div class="row">
				<label class="lab need">Needs
					<select bind:value={s.need}><option value="">Show all</option>{#each NEEDS as [k, name] (k)}<option value={k}>{name} ({counts[k]})</option>{/each}</select>
				</label>
				<label class="lab find">Find
					<input type="search" placeholder="Plant name" bind:value={s.text} maxlength="40" autocomplete="off" />
				</label>
				{#if narrowed}<button type="button" class="btn" onclick={reset}>Clear</button>{/if}
				<button type="button" class="btn dl" onclick={download} disabled={busy}>{busy ? 'Preparing…' : 'Download workbook (.xlsx)'}</button>
			</div>
		</div>

		<section class="panel tbl" aria-labelledby="tbl-h">
			<div class="p-head">
				<h2 id="tbl-h">{rows.length} of {plants.length} plants</h2>
				<span class="quiet">Tap a plant for its facts and sources.</span>
			</div>
			<div class="scroll">
				<table>
					<thead>
						<tr>
							{#each [['name', 'Plant', ''], ['fuel', 'Fuel', 'w'], ['island', 'Island', 'w'], ['owner', 'Owner', 'w'], ['mw', 'MW', 'n'], ['facts', 'Checked', 'n'], ['todo', 'To check', 'n']] as [k, name, cls] (k)}
								<th scope="col" class={cls} aria-sort={ariaSort(k)}><button type="button" onclick={() => sortBy(k)} data-sort={mark(k)}>{name}</button></th>
							{/each}
							<th scope="col" class="w">Location</th>
							<th scope="col" class="w">Photo</th>
							<th scope="col" class="w">Disagree</th>
							<th scope="col" class="w" aria-sort={ariaSort('reviewed')}><button type="button" onclick={() => sortBy('reviewed')} data-sort={mark('reviewed')}>Reviewed</button></th>
						</tr>
					</thead>
					<tbody>
						{#each rows as p (p.slug)}
							<tr class:on={p.slug === s.open} class:shut={p.status === 'closed'}>
								<td class="c-name"><span class="sw" style="--c:var({fuelOf(p.fuel).tok})" title={fuelName(p.fuel)}></span><button type="button" class="open" aria-expanded={p.slug === s.open} onclick={() => toggle(p.slug)}>{p.name}</button></td>
								<td class="w">{fuelName(p.fuel)}</td>
								<td class="w">{p.island ? islandName(p.island).replace(' Island', '') : '–'}</td>
								<td class="w">{p.owner}</td>
								<td class="n">{mw(p.mw)}</td>
								<td class="n" class:all={p.facts && p.checked === p.facts}>{p.checked}/{p.facts}</td>
								<td class="n" class:zero={!p.to_check.length}>{p.to_check.length}</td>
								<td class="w loc {p.loc}">{LOC[p.loc as keyof typeof LOC]}</td>
								<td class="w">{p.images.length ? 'Yes' : p.photo_leads.length ? `${p.photo_leads.length} lead${p.photo_leads.length > 1 ? 's' : ''}` : '–'}</td>
								<td class="w">{p.disagree.join(', ') || '–'}</td>
								<td class="w num">{p.reviewed || '–'}</td>
							</tr>
							{#if p.slug === s.open}
								<tr class="more"><td colspan="11">
									<div class="detail">
										<p class="links">
											<a href="/plants/{p.slug}">Plant page</a>
											<a href="{REPO}/plants/{p.slug}.toml">Plant file</a>
											{#if p.wikidata}<a href="https://www.wikidata.org/wiki/{p.wikidata}">Wikidata {p.wikidata}</a>{/if}
											{#each p.osm as x (x)}<a href={osmUrl(x)}>OpenStreetMap {x}</a>{/each}
											{#if p.plant}<a href="/tracker?fuel={p.fuel}&plant={slug(p.plant)}">Tracker</a>{/if}
										</p>
										<p class="quiet">{STATUS[p.status as keyof typeof STATUS]}{p.scheme && p.scheme !== p.name ? ` · ${p.scheme} scheme` : ''}{p.register.length ? ` · register ${p.register.join(', ')}` : ''} · {p.reviewed ? `reviewed ${p.reviewed}` : 'not reviewed yet'}</p>
										{#if p.to_check.length}
											<div><h3>To check</h3><ul>{#each p.to_check as t, i (i)}<li>{t}</li>{/each}</ul></div>
										{/if}
										{#if p.notes.length}
											<div><h3>Research notes</h3><ul>{#each p.notes as t, i (i)}<li>{t}</li>{/each}</ul></div>
										{/if}
										<div class="facts">
											<h3>Facts</h3>
											<table>
												<thead><tr><th>Fact</th><th>Value</th><th>Source</th><th>Grade</th><th>Checked</th></tr></thead>
												<tbody>
													{#each p.entries as e, i (i)}
														<tr class:pub={e.published}>
															<td class="fk">{e.label}</td>
															<td>{e.value || '(empty)'}{#if e.note}<span class="note">{e.note}</span>{/if}</td>
															<td>{@render srcs(e.source)}</td>
															<td class="g g{e.grade}">{e.grade}</td>
															<td class="num">{e.checked || '–'}</td>
														</tr>
														{#each e.alt as a, j (j)}
															<tr class="alt" class:diff={differs(e, a)}>
																<td class="fk">↳ other source</td>
																<td>{a.value}{#if differs(e, a)}<span class="tag">differs</span>{/if}{#if a.note}<span class="note">{a.note}</span>{/if}</td>
																<td>{@render srcs(a.source)}</td>
																<td class="g g{a.grade}">{a.grade}</td>
																<td></td>
															</tr>
														{/each}
													{/each}
												</tbody>
											</table>
										</div>
										{#if p.images.length || p.photo_leads.length}
											<div>
												<h3>Photos</h3>
												<ul>
													{#each p.images as im (im.file)}<li>In use: <a href={im.source_url}>{im.title}</a>, {im.author}, {im.licence} (checked {im.checked})</li>{/each}
													{#each p.photo_leads as id (id)}<li>Lead {id}: {#if leadsOf[id]}<a href={leadsOf[id].url}>{leadsOf[id].subject}, {leadsOf[id].collection}</a> · {leadsOf[id].rights_lead}{:else}not in plant_photo_leads.csv{/if}</li>{/each}
												</ul>
											</div>
										{/if}
									</div>
								</td></tr>
							{/if}
						{:else}
							<tr><td colspan="11" class="none">No plant matches. <button type="button" class="btn" onclick={reset}>Clear the filters</button></td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<details class="panel leads">
			<summary><h2>Photo leads ({d.photo_leads.length})</h2></summary>
			<p class="quiet">Photos worth checking, not yet cleared for use (<code>facilities/plant_photo_leads.csv</code>). Read the licence on the file’s own page before adding a row to <code>plant_images.csv</code>.</p>
			<div class="scroll">
				<table>
					<thead><tr><th>ID</th><th>Plants</th><th>Subject</th><th>Collection</th><th>Rights</th><th>What it shows</th></tr></thead>
					<tbody>
						{#each d.photo_leads as r (r.id)}
							<tr><td class="num">{r.id}</td><td>{r.slugs}</td><td><a href={r.url}>{r.subject}</a></td><td>{r.collection}</td><td>{r.rights_lead}</td><td>{r.description}</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		</details>

		<details class="panel leads">
			<summary><h2>Station leads ({d.station_leads.length})</h2></summary>
			<p class="quiet">Stations without a page yet: embedded stations, stations not in Elenz’s data, and new-station leads (<code>facilities/station_leads.csv</code>).</p>
			<div class="scroll">
				<table>
					<thead><tr><th>ID</th><th>Station</th><th>Technology</th><th>Region</th><th>Status</th><th class="n">MW</th><th>Owner</th><th>In Elenz</th><th>Grid exit point</th><th>Notes</th></tr></thead>
					<tbody>
						{#each d.station_leads as r (r.id)}
							<tr>
								<td class="num">{r.id}</td><td>{r.name}</td><td>{r.technology ?? ''}</td><td>{r.region ?? ''}</td><td>{r.status ?? ''}</td>
								<td class="n">{r.mw ?? ''}</td><td>{r.owner ?? ''}</td><td>{r.shown_in_elenz ?? ''}</td><td>{r.grid_exit_point ?? ''}</td>
								<td class="notes">{r.notes ?? ''}{#if r.to_check}<span class="note">To check: {r.to_check}</span>{/if}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</details>
	</main>

	<SiteFooter />
</div>

<style>
	.res { display: grid; gap: 16px; }
	.head { display: grid; gap: 8px; padding-top: 6px; }
	h1 { font-size: clamp(1.8rem, 4vw, 2.5rem); letter-spacing: -0.01em; line-height: 1.1; }
	h2 { font-size: 1.02rem; margin: 0; display: inline; }
	h3 { font-size: 0.84rem; color: var(--ink-2); margin: 0 0 4px; }
	.sub { margin: 0; color: var(--ink-2); font-size: 1rem; line-height: 1.55; max-width: 72ch; }
	.sub a, .panel a { color: var(--accent); }
	.num { font-family: var(--font-data); font-variant-numeric: tabular-nums; }
	.quiet { color: var(--muted); font-size: 0.84rem; line-height: 1.45; margin: 0; }
	.panel { background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 14px 16px; min-width: 0; display: grid; gap: 10px; align-content: start; }
	.sw { display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: var(--c); flex: none; margin-right: 8px; }
	.tag { font-size: 0.68rem; border: 1px solid var(--line); color: var(--muted); border-radius: 4px; padding: 0 5px; margin-left: 6px; white-space: nowrap; }
	.note { display: block; color: var(--muted); font-size: 0.78rem; line-height: 1.4; }
	code { font-family: var(--font-data); font-size: 0.85em; }

	.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
	.card { gap: 4px; }
	.card .k { font-size: 0.8rem; color: var(--muted); }
	.card .v { font-size: 1.35rem; font-weight: 500; }
	.card .v small { font-size: 0.8rem; color: var(--muted); font-weight: 400; }
	.card .v.small { font-family: var(--font-ui); font-size: 0.86rem; font-weight: 400; color: var(--ink-2); }
	.bar { height: 6px; border-radius: 3px; background: var(--grid); overflow: hidden; margin-top: 4px; }
	.bar span { display: block; height: 100%; background: var(--accent); }

	.ctl { padding: 12px 14px; }
	.row { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: center; }
	.seg { display: inline-flex; gap: 2px; border-radius: 4px; padding: 2px; background: var(--grid); }
	.seg button { font: inherit; font-size: 0.8rem; font-weight: 500; border: 1px solid transparent; background: transparent; color: var(--ink); padding: 2px 10px; min-height: 30px; border-radius: 3px; cursor: pointer; }
	.seg button[aria-pressed='true'] { background: var(--surface); border-color: var(--line); }
	.lab { display: inline-flex; align-items: center; gap: 6px; font-size: 0.82rem; color: var(--ink-2); }
	.lab select, .lab input[type='search'] { font: inherit; font-size: 0.86rem; color: var(--ink); background: var(--bg); border: 1px solid var(--line); border-radius: 4px; padding: 4px 8px; min-height: 32px; max-width: 100%; }
	.find input { width: 180px; }
	.btn { font: inherit; cursor: pointer; border: 1px solid var(--line); background: var(--surface); color: var(--accent); border-radius: 4px; font-size: 0.8rem; font-weight: 600; padding: 3px 10px; min-height: 32px; }
	.btn:disabled { color: var(--muted); cursor: progress; }
	.dl { margin-left: auto; }

	.tbl { padding: 14px 0 6px; }
	.p-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; padding: 0 16px; }
	.scroll { overflow-x: auto; }
	table { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
	th { text-align: left; color: var(--muted); font-weight: 600; font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; padding: 6px 10px; border-bottom: 1px solid var(--line); white-space: nowrap; }
	th button { all: unset; cursor: pointer; }
	th button:hover { color: var(--ink); }
	th button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
	th button[data-sort]:not([data-sort=''])::after { content: ' ' attr(data-sort); color: var(--accent); }
	td { padding: 7px 10px; border-bottom: 1px solid var(--grid); vertical-align: top; }
	th:first-child, td:first-child { padding-left: 16px; }
	th:last-child, td:last-child { padding-right: 16px; }
	.n { text-align: right; font-family: var(--font-data); font-variant-numeric: tabular-nums; white-space: nowrap; }
	th.n { font-family: var(--font-ui); }
	td.w { color: var(--ink-2); }
	.c-name { white-space: nowrap; }
	.open { all: unset; cursor: pointer; font-weight: 600; color: var(--ink); white-space: normal; }
	.open:hover { color: var(--accent); text-decoration: underline; }
	.open:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
	tr.on td { background: var(--accent-soft); }
	tr.shut td { color: var(--muted); }
	td.all { color: var(--live-ink); font-weight: 600; }
	td.zero { color: var(--muted); }
	.loc.checked { color: var(--live-ink); }
	.loc.grid, .loc.none { color: var(--warn-ink); }
	.none { color: var(--muted); padding: 14px 16px; }

	tr.more > td { background: var(--bg); padding: 12px 16px 16px; }
	.detail { display: grid; gap: 12px; max-width: 100ch; white-space: normal; }
	.detail ul { margin: 0; padding-left: 1.2rem; display: grid; gap: 3px; font-size: 0.86rem; line-height: 1.45; }
	.links { margin: 0; display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 0.86rem; }
	.facts table { font-size: 0.82rem; background: var(--surface); border: 1px solid var(--line); border-radius: 3px; }
	.facts td, .facts th { padding: 6px 8px; }
	.facts .fk { color: var(--ink-2); white-space: nowrap; }
	.facts tr.pub td:first-child { box-shadow: inset 3px 0 var(--live-ink); }
	.facts tr.alt td { color: var(--ink-2); background: var(--bg); }
	.facts tr.alt.diff td { background: var(--warn-bg); color: var(--warn-ink); }
	.g { font-family: var(--font-data); font-weight: 600; text-align: center; }
	.gC { color: var(--muted); }

	.leads summary { cursor: pointer; list-style-position: inside; }
	.leads table { min-width: 760px; }
	.leads .notes { min-width: 280px; font-size: 0.8rem; color: var(--ink-2); line-height: 1.45; }

	/* phones: plant, MW, checked and to check; tap a plant for the rest */
	@media (max-width: 700px) {
		.w { display: none; }
		.dl { margin-left: 0; }
		.find { flex: 1 1 100%; }
		.find input { flex: 1; width: auto; min-width: 0; }
		/* the opened plant fits the screen: each fact a small card, grade and date checked on its first line */
		.detail { max-width: calc(100vw - 40px); overflow-wrap: anywhere; }
		.facts thead { display: none; }
		.facts table, .facts tbody { display: block; border: none; background: none; }
		.facts tr { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 2px 10px; padding: 8px 10px; margin-bottom: 6px; border: 1px solid var(--line); border-radius: 3px; background: var(--surface); }
		.facts tr td { display: block; padding: 0; border: none; background: none; }
		.facts tr td.fk { grid-column: 1; grid-row: 1; white-space: normal; font-weight: 600; }
		.facts tr td.g { grid-column: 2; grid-row: 1; }
		.facts tr td:last-child { grid-column: 3; grid-row: 1; }
		.facts tr td:nth-child(2), .facts tr td:nth-child(3) { grid-column: 1 / -1; }
		.facts tr.pub { box-shadow: inset 3px 0 var(--live-ink); }
		.facts tr.pub td:first-child { box-shadow: none; }
		.facts tr.alt { background: var(--bg); margin-left: 14px; }
		.facts tr.alt.diff { background: var(--warn-bg); }
	}
</style>
