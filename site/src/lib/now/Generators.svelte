<script lang="ts">
	// "Every generator right now" on /now: each plant's output at the newest interval, its share of installed capacity,
	// fuel, island and owner. Sortable and filterable, with the settings in /now's address so a view can be linked;
	// each plant links to its history in the tracker. Rows and settings: #lib/now/generators.js.
	import { onMount } from 'svelte';
	import { replaceState } from '$app/navigation';
	import { generatorRows, readSettings, writeSettings, pick } from './generators.js';
	import { slug } from '#lib/site/viewurl.js';

	let { D, when }: { D: any; when: string } = $props();

	const SHOW = 20;   // rows before "Show all", while no filter is set
	const rows = $derived(generatorRows(D));
	let s = $state({ fuel: '', island: '', owner: '', by: 'mw', asc: false, text: '', on: false });
	let ready = false;
	let all = $state(false);
	let open = $state(new Set<string>());

	onMount(() => { s = readSettings(location.search, rows); ready = true; });
	// keep the address in step with the settings (replace, so Back leaves the page rather than undoing filters)
	$effect(() => {
		const qs = writeSettings(s);
		if (!ready || qs === location.search || (!qs && !location.search)) return;
		const url = location.pathname + qs + location.hash;
		// as #lib/site/view.js: the router's replaceState, or the browser's if the router can't take it yet
		Promise.resolve().then(() => replaceState(url, {})).catch(() => history.replaceState(history.state, '', url));
	});

	const fuels = $derived([...new Map(rows.map((r) => [r.fuel, r.fuelName])).entries()].sort((a, b) => a[1].localeCompare(b[1])));
	const owners = $derived([...new Set(rows.map((r) => r.owner))].sort((a, b) => (a === 'Other generators' ? 1 : b === 'Other generators' ? -1 : a.localeCompare(b))));
	const shown = $derived(pick(rows, s));
	const filtered = $derived(!!(s.fuel || s.island || s.owner || s.text.trim() || s.on));
	const visible = $derived(all || filtered ? shown : shown.slice(0, SHOW));
	const total = $derived(shown.reduce((a, r) => a + r.mw, 0));
	const running = $derived(rows.filter((r) => r.mw >= 0.5).length);

	const fmt = (v: number) => Math.round(v).toLocaleString('en-NZ').replace('-', '−');
	const pctText = (r: { pct: number | null; charging: boolean }) => (r.charging ? 'charging' : r.pct == null ? '–' : `${Math.round(Math.max(0, r.pct))}%`);
	function sortBy(by: string) {
		if (s.by === by) s.asc = !s.asc;
		else { s.by = by; s.asc = by === 'name'; }
	}
	const ariaSort = (by: string) => (s.by === by ? (s.asc ? 'ascending' : 'descending') : 'none');
	function toggle(key: string) {
		const n = new Set(open);
		n.has(key) ? n.delete(key) : n.add(key);
		open = n;
	}
	const reset = () => { s = { fuel: '', island: '', owner: '', by: 'mw', asc: false, text: '', on: false }; };
</script>

<section class="gens" aria-labelledby="gens-h">
	<div class="p-head">
		<h2 id="gens-h">Every generator right now</h2>
		<span class="unit">{when} · {running} of {rows.length} generating</span>
	</div>

	<div class="g-ctl">
		<label class="g-find"><span class="sr">Find a plant</span>
			<input type="search" placeholder="Find a plant" bind:value={s.text} maxlength="40" autocomplete="off" />
		</label>
		<label><span class="sr">Fuel</span>
			<select bind:value={s.fuel}><option value="">All fuels</option>{#each fuels as [k, name] (k)}<option value={k}>{name}</option>{/each}</select>
		</label>
		<label><span class="sr">Island</span>
			<select bind:value={s.island}><option value="">Both islands</option><option value="NI">North Island</option><option value="SI">South Island</option></select>
		</label>
		<label><span class="sr">Owner</span>
			<select bind:value={s.owner}><option value="">All owners</option>{#each owners as o (o)}<option value={slug(o)}>{o}</option>{/each}</select>
		</label>
		<label class="g-on"><input type="checkbox" bind:checked={s.on} /> Generating only</label>
		{#if filtered}<button type="button" class="g-reset" onclick={reset}>Clear</button>{/if}
	</div>

	<div class="g-scroll">
		<table class="gtab">
			<thead>
				<tr>
					<th scope="col" aria-sort={ariaSort('name')}><button type="button" onclick={() => sortBy('name')}>Plant</button></th>
					<th scope="col" class="c-fuel">Fuel</th>
					<th scope="col" class="c-isl">Island</th>
					<th scope="col" class="c-own">Owner</th>
					<th scope="col" class="n" aria-sort={ariaSort('mw')}><button type="button" onclick={() => sortBy('mw')}>MW</button></th>
					<th scope="col" class="n c-pct" aria-sort={ariaSort('pct')}><button type="button" onclick={() => sortBy('pct')}>Of capacity</button></th>
				</tr>
			</thead>
			<tbody>
				{#each visible as r (r.key + r.isl)}
					<tr class:off={Math.abs(r.mw) < 0.5}>
						<td class="c-name">
							<span class="dot" style="--c:var({r.tok})" title={r.fuelName}></span>
							<a href={r.href} title="{r.name} in the tracker">{r.name}</a>
							{#if r.units.length > 1}
								<button type="button" class="g-units" aria-expanded={open.has(r.key)} onclick={() => toggle(r.key)}
									aria-label="{open.has(r.key) ? 'Hide' : 'Show'} {r.name}'s {r.part}">{r.units.length} {r.part}</button>
							{/if}
						</td>
						<td class="c-fuel">{r.fuelName}</td>
						<td class="c-isl" title={r.isl === 'NI' ? 'North Island' : 'South Island'}>{r.isl}</td>
						<td class="c-own">{r.owner}</td>
						<td class="n">{fmt(r.mw)}</td>
						<td class="n c-pct">
							<span class="pc"><span>{pctText(r)}</span>{#if r.pct != null && !r.charging}<span class="pbar"><span style="--c:var({r.tok});width:{Math.min(100, Math.max(0, r.pct))}%"></span></span>{/if}</span>
						</td>
					</tr>
					{#if open.has(r.key)}
						{#each r.units as u (u.name)}
							<tr class="unit-row">
								<td class="c-name">{u.name}</td>
								<td class="c-fuel"></td><td class="c-isl"></td><td class="c-own"></td>
								<td class="n">{fmt(u.mw)}</td>
								<td class="n c-pct">{u.cap ? `${Math.round(Math.max(0, (u.mw / u.cap) * 100))}%` : '–'}</td>
							</tr>
						{/each}
					{/if}
				{:else}
					<tr><td colspan="6" class="none">No plant matches. <button type="button" class="g-reset" onclick={reset}>Clear the filters</button></td></tr>
				{/each}
			</tbody>
			{#if shown.length}
				<tfoot>
					<tr><th scope="row">{filtered ? `Total of ${shown.length} shown` : 'Total'}</th><td class="c-fuel"></td><td class="c-isl"></td><td class="c-own"></td><td class="n">{fmt(total)}</td><td class="c-pct"></td></tr>
				</tfoot>
			{/if}
		</table>
	</div>
	{#if !all && !filtered && shown.length > SHOW}
		<button type="button" class="g-more" onclick={() => (all = true)}>Show all {shown.length} plants</button>
	{/if}
	<p class="g-note">
		MW is dispatch, the market's 5-minute target for each plant, against its installed capacity. On rivers dispatched as one block,
		the Waikato above all, the owner can split the total between stations differently. Batteries show negative while charging.
		Embedded solar isn't listed. Tap a plant for its history in the tracker.
	</p>
</section>

<style>
	/* the same card as /now's other panels (their styles are scoped to that page) */
	.gens { display: grid; gap: 10px; background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 14px; min-width: 0; }
	.p-head { display: flex; align-items: baseline; gap: 4px 10px; flex-wrap: wrap; }
	.p-head h2 { margin: 0; font-size: 1rem; }
	.unit { color: var(--muted); font-size: 0.8rem; font-family: var(--font-data); }
	.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
	.g-ctl { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
	.g-ctl select, .g-ctl input[type='search'] { font: inherit; font-size: 0.86rem; color: var(--ink); background: var(--bg); border: 1px solid var(--line); border-radius: 4px; padding: 5px 8px; min-height: 32px; }
	.g-find input { width: 170px; }
	.g-on { display: inline-flex; align-items: center; gap: 6px; font-size: 0.86rem; color: var(--ink-2); }
	.g-reset, .g-more, .g-units { font: inherit; cursor: pointer; border: 1px solid var(--line); background: var(--surface); color: var(--accent); border-radius: 999px; }
	.g-reset { font-size: 0.8rem; font-weight: 600; padding: 3px 10px; }
	.g-more { justify-self: start; font-size: 0.84rem; font-weight: 600; padding: 5px 14px; }
	.g-units { font-size: 0.7rem; padding: 0 7px; margin-left: 6px; color: var(--ink-2); vertical-align: 1px; }
	.g-units[aria-expanded='true'] { background: var(--accent-soft); color: var(--accent); border-color: transparent; }
	.g-scroll { overflow-x: auto; }
	.gtab { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
	.gtab th { text-align: left; color: var(--muted); font-weight: 600; font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; padding: 4px 8px 4px 0; border-bottom: 1px solid var(--line); white-space: nowrap; }
	.gtab th button { all: unset; cursor: pointer; }
	.gtab th button:hover { color: var(--ink); }
	.gtab th button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
	.gtab th[aria-sort='ascending'] button::after { content: ' ↑'; color: var(--accent); }
	.gtab th[aria-sort='descending'] button::after { content: ' ↓'; color: var(--accent); }
	.gtab td { padding: 6px 8px 6px 0; border-bottom: 1px solid var(--grid); }
	.gtab .n { text-align: right; font-family: var(--font-data); padding-right: 0; padding-left: 8px; }
	.gtab th.n { font-family: var(--font-ui); }
	.c-name a { color: var(--ink); text-decoration: none; font-weight: 600; }
	.c-name a:hover { color: var(--accent); text-decoration: underline; }
	.c-fuel, .c-own { color: var(--ink-2); }
	td.c-isl { color: var(--ink-2); font-family: var(--font-data); font-size: 0.8rem; }
	.dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: var(--c); margin-right: 8px; vertical-align: 0; }
	tr.off td { color: var(--muted); }
	tr.off .c-name a { color: var(--ink-2); font-weight: 500; }
	.unit-row td { font-size: 0.8rem; color: var(--ink-2); padding-block: 4px; }
	.unit-row .c-name { padding-left: 17px; }
	.pc { display: inline-grid; justify-items: end; gap: 2px; min-width: 64px; }
	.pbar { justify-self: stretch; height: 3px; border-radius: 2px; background: var(--grid); overflow: hidden; }
	.pbar span { display: block; height: 100%; background: var(--c); }
	.none { color: var(--muted); padding: 14px 0; }
	.gtab tfoot th, .gtab tfoot td { padding-top: 8px; border: 0; font-weight: 700; color: var(--ink) !important; text-transform: none !important; letter-spacing: 0 !important; font-size: 0.86rem !important; }
	.g-note { color: var(--muted); font-size: 0.76rem; margin: 0; max-width: 90ch; }
	/* phones: plant, MW and share of capacity; fuel stays as the dot, island and owner as filters */
	@media (max-width: 640px) {
		.c-fuel, .c-isl, .c-own { display: none; }
		.g-find { flex: 1 1 100%; }
		.g-find input { width: 100%; box-sizing: border-box; }
		.g-ctl select { flex: 1 1 30%; min-width: 0; }
		tfoot th { text-align: left; }
	}
</style>
