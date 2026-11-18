<script lang="ts">
	// The plant index (/plants), from the design mock-up of 17 Nov 2026: every plant Elenz tracks on a map and in a
	// table, filtered by fuel, island, owner and status, with the settings in the address so a view can be linked.
	// Rows from src/lib/plants/index.json (ingest/plant_pages.py); the Now column from tracker.json. Hidden while
	// PLANTS_PUBLIC is false (#lib/plants/registry.js). docs/architecture.md, Plant pages.
	import { onMount } from 'svelte';
	import { replaceState } from '$app/navigation';
	import Preview from '#lib/site/Preview.svelte';
	import Masthead from '#lib/site/Masthead.svelte';
	import SiteFooter from '#lib/site/SiteFooter.svelte';
	import InfoTip from '#lib/site/InfoTip.svelte';
	import { retitle } from '#lib/site/view.js';
	import { nextDue, CHECK_EVERY } from '#lib/site/poll.js';
	import { slug } from '#lib/site/viewurl.js';
	import PlantMap from '#lib/plants/PlantMap.svelte';
	import { PLANTS_PUBLIC, islandName, fuelOf } from '#lib/plants/registry.js';
	import { fmtMw } from '#lib/plants/history.js';
	import { LIVE_URL } from '#lib/plants/live.js';
	import { DEFAULTS, fuelsOf, fuelName, ownersOf, readSettings, writeSettings, filtered, pick, nowMw, dotSize, statusText, type Plant, type Settings } from '#lib/plants/list.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const plants = $derived(data.plants as Plant[]);
	const PLANTS_MD = 'https://github.com/elenz-nz/elenz/blob/main/facilities/PLANTS.md';
	const SHOW = 20;   // rows before "Show all", while no filter is set
	const DESC = 'Every power plant Elenz tracks in New Zealand, on a map and in a table: fuel, island, owner, installed capacity and output now, with a page for each.';

	let s = $state<Settings>({ ...DEFAULTS });
	let ready = false;
	let all = $state(false);
	let now = $state(new Map<string, number>());
	let nowAt = $state<number | null>(null);

	const operating = $derived(plants.filter((p) => p.status !== 'closed').length);
	const closedN = $derived(plants.length - operating);
	const reviewed = $derived(plants.filter((p) => p.reviewed).length);
	const drafts = $derived(plants.some((p) => p.pt && !p.pt.checked));
	const noPoint = $derived(plants.filter((p) => !p.pt).length);
	const base = $derived(filtered(plants, s));
	const fuels = $derived(fuelsOf(plants).map((f) => ({ ...f, count: base.filter((p) => p.fuel === f.k).length })));
	const owners = $derived(ownersOf(plants));
	const rows = $derived(pick(plants, s, now));
	const narrowed = $derived(!!(s.fuel || s.island || s.owner || s.text.trim()));
	const visible = $derived(all || narrowed ? rows : rows.slice(0, SHOW));
	const sel = $derived(plants.find((p) => p.slug === s.sel) ?? null);
	const CLOCK = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', hour: 'numeric', minute: '2-digit', hour12: true });
	const clockOf = (t: number) => CLOCK.format(t).replace(/\s?([ap])\.?m\.?/i, ' $1m').toLowerCase();
	const mw = (v: number | null | undefined) => (v == null ? '–' : `${fmtMw(v)} MW`);
	const nowOf = (p: Plant) => (p.status !== 'operating' ? '–' : nowAt == null ? '' : mw(now.get(p.plant) ?? 0));

	onMount(() => {
		s = readSettings(location.search, plants);
		ready = true;
		let due = 0;
		const load = async () => {
			const r = await fetch(LIVE_URL, { cache: 'no-cache' });
			if (!r.ok) throw new Error(String(r.status));
			const D = await r.json();
			due = nextDue(D.meta.end);
			now = nowMw(D);
			nowAt = D.meta?.end ?? null;
		};
		load().catch(() => {});
		const check = () => { if (document.visibilityState === 'visible' && Date.now() >= due) load().catch(() => {}); };
		const t = setInterval(check, CHECK_EVERY);
		document.addEventListener('visibilitychange', check);
		return () => { clearInterval(t); document.removeEventListener('visibilitychange', check); };
	});
	// keep the address in step with the settings (replace, so Back leaves the page rather than undoing filters)
	$effect(() => {
		const qs = writeSettings(s);
		if (!ready || qs === location.search || (!qs && !location.search)) return;
		const url = location.pathname + qs + location.hash;
		Promise.resolve().then(() => replaceState(url, {})).catch(() => history.replaceState(history.state, '', url)).then(retitle);
	});

	const natural = (by: string) => ['name', 'fuel', 'island', 'owner'].includes(by);
	function sortBy(by: string) {
		if (s.by === by) s.asc = !s.asc;
		else { s.by = by; s.asc = natural(by); }
	}
	const ariaSort = (by: string) => (s.by === by ? (s.asc ? 'ascending' : 'descending') : 'none');
	const mark = (by: string) => (s.by === by ? (s.asc ? '↑' : '↓') : '');
	const reset = () => { s = { ...DEFAULTS, sel: s.sel }; all = false; };
	const pickPlant = (k: string) => { s.sel = s.sel === k ? '' : k; };
</script>

<svelte:head>
	<title>Plants · ELENZ</title>
	<meta name="description" content={DESC} />
	{#if !PLANTS_PUBLIC}<meta name="robots" content="noindex" />{/if}
	<Preview title="New Zealand power plants · ELENZ" description={DESC} path="/plants" />
</svelte:head>

<div class="wrap">
	<Masthead />

	<main class="idx">
		<div class="head">
			<div class="intro">
				<h1>Plants</h1>
				<p class="sub">Every plant Elenz tracks: {operating} operating and {closedN} closed. Each has a page with its output now, its history back to 1997 where the data has it, and facts with their sources.</p>
			</div>
			<div class="progress">
				<span class="quiet">Pages checked so far</span>
				<div class="bar-row"><span class="bar"><span style="width:{(100 * reviewed) / plants.length}%"></span></span><span class="num">{reviewed} of {plants.length}</span></div>
			</div>
		</div>

		{#if !PLANTS_PUBLIC}
			<p class="checking" role="note">These pages aren’t public yet: we’re still checking their facts and locations.{#if drafts}{' '}Faded dots are at a location we haven’t checked yet, from Wikidata, Wikipedia or the plant’s grid connection.{/if}{#if noPoint}{' '}{noPoint === 1 ? 'One plant has' : `${noPoint} plants have`} no point yet.{/if}{' '}<a href={PLANTS_MD}>How we check plants</a></p>
		{/if}

		<div class="panel ctl">
			<div class="fuels" role="group" aria-label="Fuel">
				<button type="button" aria-pressed={!s.fuel} onclick={() => { s.fuel = ''; all = false; }}><span class="sw" style="--c:var(--muted)"></span>All fuels<span class="n">{base.length}</span></button>
				{#each fuels as f (f.k)}
					{#if f.count || s.fuel === f.k}
						<button type="button" aria-pressed={s.fuel === f.k} onclick={() => { s.fuel = s.fuel === f.k ? '' : f.k; all = false; }}><span class="sw" style="--c:var({f.tok})"></span>{f.name}<span class="n">{f.count}</span></button>
					{/if}
				{/each}
			</div>
			<div class="row">
				<div class="seg" role="group" aria-label="Island">
					{#each [['', 'New Zealand'], ['NI', 'North Island'], ['SI', 'South Island']] as [k, name] (k)}
						<button type="button" aria-pressed={s.island === k} onclick={() => { s.island = k; all = false; }}>{name}</button>
					{/each}
				</div>
				<label class="lab">Owner
					<select bind:value={s.owner}><option value="">All owners</option>{#each owners as o (o)}<option value={slug(o)}>{o}</option>{/each}</select>
				</label>
				<label class="lab"><input type="checkbox" bind:checked={s.closed} /> Show closed</label>
				{#if narrowed || s.closed}<button type="button" class="clear" onclick={reset}>Clear</button>{/if}
				<label class="lab find">Find
					<input type="search" placeholder="Plant name" bind:value={s.text} maxlength="40" autocomplete="off" />
				</label>
			</div>
		</div>

		<div class="split">
			<section class="panel mapcard" aria-label="Map of plants">
				<PlantMap plants={rows} sel={s.sel} island={s.island} onpick={pickPlant} />
			</section>

			<aside class="side">
				<section class="panel" aria-labelledby="sel-h" aria-live="polite">
					{#if sel}
						<p class="ctx"><span class="sw" style="--c:var({fuelOf(sel.fuel).tok})"></span>{fuelName(sel.fuel)} · {islandName(sel.island)}</p>
						<h2 id="sel-h">{sel.name}</h2>
						<dl>
							<dt>Owner</dt><dd>{sel.owner}</dd>
							<dt>Installed</dt><dd class="num">{mw(sel.mw)}</dd>
							{#if sel.status === 'operating'}<dt>Now</dt><dd class="num">{nowOf(sel) || '…'}</dd>{/if}
							{#if sel.commissioned}<dt>Commissioned</dt><dd class="num">{sel.commissioned}</dd>{/if}
							<dt>Status</dt><dd>{statusText(sel)}</dd>
							<dt>Location</dt><dd>{#if !sel.pt}Not known yet{:else if sel.pt.checked}Checked{sel.pt.basis !== 'station' ? ` (${sel.pt.basis})` : ''}{:else}Not checked yet{sel.pt.basis === 'grid connection' ? ': shown at its grid connection' : ''}{/if}</dd>
						</dl>
						<a class="link" href="/plants/{sel.slug}">Open {sel.name}’s page</a>
					{:else}
						<h2 id="sel-h">Pick a plant</h2>
						<p class="quiet">Tap a dot on the map to see the plant here, or open any plant’s page from the table.</p>
					{/if}
				</section>
				<section class="panel key" aria-label="Map key">
					<span class="quiet">Size shows installed MW</span>
					<div class="sizes">
						{#each [10, 100, 500] as m (m)}<span><i style="width:{dotSize(m)}px;height:{dotSize(m)}px"></i><span class="num">{m}{m === 500 ? ' MW' : ''}</span></span>{/each}
						<span class="closed"><i style="width:15px;height:15px"></i>Closed</span>
						{#if drafts}<span class="draft"><i style="width:15px;height:15px"></i>Not checked</span>{/if}
					</div>
					<span class="quiet">Colour shows fuel, as on the tracker</span>
				</section>
			</aside>
		</div>

		<section class="panel tbl" aria-labelledby="tbl-h">
			<div class="p-head">
				<h2 id="tbl-h">{rows.length} {rows.length === 1 ? 'plant' : 'plants'}</h2>
				<span class="quiet">{#if nowAt}Now is the 5-minute dispatch at {clockOf(nowAt)}{/if}</span>
				<span class="p-tip"><InfoTip label="About this table">
					<p>Every plant Elenz tracks. Installed is its capacity today (or when it closed); Now is its dispatch in the newest 5-minute interval, the same figure as Now’s “Every generator right now”.</p>
					<p>Commissioned shows once we’ve checked it against a source. Click a column heading to sort by it.</p>
				</InfoTip></span>
			</div>
			<div class="scroll">
				<table>
					<thead>
						<tr>
							{#each [['name', 'Plant', ''], ['fuel', 'Fuel', 'c-fuel'], ['island', 'Island', 'c-isl'], ['owner', 'Owner', 'c-own'], ['mw', 'Installed', 'n'], ['now', 'Now', 'n'], ['commissioned', 'Commissioned', 'n c-com']] as [k, name, cls] (k)}
								<th scope="col" class={cls} aria-sort={ariaSort(k)}><button type="button" onclick={() => sortBy(k)} data-sort={mark(k)}>{name}</button></th>
							{/each}
							<th scope="col" class="c-st">Status</th>
						</tr>
					</thead>
					<tbody>
						{#each visible as p (p.slug)}
							<tr class:on={p.slug === s.sel} class:shut={p.status === 'closed'}>
								<td class="c-name"><span class="sw" style="--c:var({fuelOf(p.fuel).tok})" title={fuelName(p.fuel)}></span><a href="/plants/{p.slug}">{p.name}</a></td>
								<td class="c-fuel">{fuelName(p.fuel)}</td>
								<td class="c-isl">{islandName(p.island)}</td>
								<td class="c-own">{p.owner}</td>
								<td class="n">{mw(p.mw)}</td>
								<td class="n">{nowOf(p)}</td>
								<td class="n c-com">{p.commissioned ?? '–'}</td>
								<td class="c-st">{statusText(p)}</td>
							</tr>
						{:else}
							<tr><td colspan="8" class="none">No plant matches. <button type="button" class="clear" onclick={reset}>Clear the filters</button></td></tr>
						{/each}
					</tbody>
				</table>
			</div>
			{#if !all && !narrowed && rows.length > SHOW}
				<button type="button" class="more" onclick={() => (all = true)}>Show all {rows.length}</button>
			{/if}
		</section>
	</main>

	<SiteFooter />
</div>

<style>
	.idx { display: grid; gap: 16px; }
	.head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 12px 32px; padding-top: 6px; }
	.intro { display: grid; gap: 8px; flex: 1 1 420px; min-width: 0; }
	h1 { font-size: clamp(1.8rem, 4vw, 2.5rem); letter-spacing: -0.01em; line-height: 1.1; }
	h2 { font-size: 1.02rem; margin: 0; }
	.sub { margin: 0; color: var(--ink-2); font-size: 1rem; line-height: 1.55; max-width: 64ch; }
	.progress { display: grid; gap: 5px; flex: 0 1 260px; min-width: 200px; }
	.bar-row { display: flex; align-items: center; gap: 10px; }
	.bar { flex: 1; height: 8px; border-radius: 4px; background: var(--grid); overflow: hidden; }
	.bar span { display: block; height: 100%; background: var(--accent); }
	.num { font-family: var(--font-data); font-variant-numeric: tabular-nums; }
	.quiet { color: var(--muted); font-size: 0.84rem; line-height: 1.45; }
	.checking { margin: 0; background: var(--warn-bg); color: var(--warn-ink); border-radius: 4px; padding: 10px 14px; font-size: 0.9rem; line-height: 1.5; }
	.checking a { color: inherit; }
	.panel { background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 14px 16px; min-width: 0; display: grid; gap: 10px; align-content: start; }
	.sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; background: var(--c); flex: none; }

	.ctl { padding: 12px 14px; }
	.fuels { display: flex; flex-wrap: wrap; gap: 6px; }
	.fuels button { font: inherit; font-size: 0.8rem; font-weight: 500; display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 2px 10px; border-radius: 4px; cursor: pointer; border: 1px solid var(--line); background: var(--surface); color: var(--ink); }
	.fuels button[aria-pressed='true'] { background: var(--accent-soft); border-color: var(--accent); }
	.fuels .n { font-family: var(--font-data); font-size: 0.74rem; color: var(--muted); }
	.row { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: center; }
	.seg { display: inline-flex; gap: 2px; border-radius: 4px; padding: 2px; background: var(--grid); }
	.seg button { font: inherit; font-size: 0.8rem; font-weight: 500; border: 1px solid transparent; background: transparent; color: var(--ink); padding: 2px 10px; min-height: 30px; border-radius: 3px; cursor: pointer; }
	.seg button[aria-pressed='true'] { background: var(--surface); border-color: var(--line); }
	.lab { display: inline-flex; align-items: center; gap: 6px; font-size: 0.82rem; color: var(--ink-2); }
	.lab select, .lab input[type='search'] { font: inherit; font-size: 0.86rem; color: var(--ink); background: var(--bg); border: 1px solid var(--line); border-radius: 4px; padding: 4px 8px; min-height: 32px; }
	.lab input[type='checkbox'] { width: 16px; height: 16px; accent-color: var(--accent); }
	.find { margin-left: auto; }
	.find input { width: 180px; }
	.clear, .more { font: inherit; cursor: pointer; border: 1px solid var(--line); background: var(--surface); color: var(--accent); border-radius: 4px; font-size: 0.8rem; font-weight: 600; padding: 3px 10px; min-height: 30px; }
	.more { justify-self: start; margin: 0 16px 6px; padding: 5px 14px; }

	.split { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
	.mapcard { flex: 999 1 520px; padding: 10px; gap: 0; }
	.side { flex: 1 1 300px; min-width: 0; display: grid; gap: 16px; }
	.ctx { margin: 0; display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 0.8rem; }
	#sel-h { font-size: 1.35rem; }
	dl { margin: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 6px 14px; font-size: 0.88rem; }
	dt { color: var(--muted); }
	dd { margin: 0; }
	.link { color: var(--accent); font-size: 0.9rem; }
	.key .sizes { display: flex; align-items: flex-end; flex-wrap: wrap; gap: 12px 16px; }
	.key .sizes > span { display: grid; justify-items: center; gap: 4px; font-size: 0.74rem; color: var(--muted); }
	.key i { display: block; border-radius: 50%; background: var(--muted); }
	.key .closed i { background: none; border: 2px solid var(--muted); box-sizing: border-box; }
	.key .draft i { opacity: 0.45; }

	.tbl { padding: 14px 0 6px; }
	.p-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; padding: 0 16px; }
	.p-head .p-tip { margin-left: auto; align-self: center; }
	.scroll { overflow-x: auto; }
	table { width: 100%; border-collapse: collapse; font-size: 0.88rem; min-width: 720px; }
	th { text-align: left; color: var(--muted); font-weight: 600; font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; padding: 6px 10px; border-bottom: 1px solid var(--line); white-space: nowrap; }
	th button { all: unset; cursor: pointer; }
	th button:hover { color: var(--ink); }
	th button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
	th button[data-sort]:not([data-sort=''])::after { content: ' ' attr(data-sort); color: var(--accent); }
	td { padding: 8px 10px; border-bottom: 1px solid var(--grid); }
	th:first-child, td:first-child { padding-left: 16px; }
	th:last-child, td:last-child { padding-right: 16px; }
	.n { text-align: right; font-family: var(--font-data); font-variant-numeric: tabular-nums; }
	th.n { font-family: var(--font-ui); }
	.c-name { white-space: nowrap; }
	.c-name .sw { margin-right: 8px; border-radius: 50%; width: 9px; height: 9px; }
	.c-name a { color: var(--ink); font-weight: 600; text-decoration: none; white-space: normal; }
	.c-name a:hover { color: var(--accent); text-decoration: underline; }
	.c-fuel, .c-isl, .c-own, .c-st { color: var(--ink-2); }
	tr.on td { background: var(--accent-soft); }
	tr.shut td { color: var(--muted); }
	.none { color: var(--muted); padding: 14px 16px; }
	/* phones: plant, installed and now; fuel shows as the dot, island and owner as filters */
	@media (max-width: 640px) {
		table { min-width: 0; }
		.c-fuel, .c-isl, .c-own, .c-com, .c-st { display: none; }
		.fuels { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin: 0 -14px; padding: 0 14px; }
		.fuels button { flex: none; }
		.find { margin-left: 0; flex: 1 1 100%; }
		.find input { flex: 1; width: auto; min-width: 0; }
	}
</style>
