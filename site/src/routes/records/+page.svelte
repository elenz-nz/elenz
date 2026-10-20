<script lang="ts">
	// Records: the highest and lowest half-hours, months and runs since 1997 (ingest/records.py writes the data;
	// names, wording and the live check are in #lib/records/records.js). Each record has its own page,
	// /records/<id>?region=NI.
	import Preview from '#lib/site/Preview.svelte';
	import { onMount } from 'svelte';
	import { replaceState } from '$app/navigation';
	import Masthead from '#lib/site/Masthead.svelte';
	import SiteFooter from '#lib/site/SiteFooter.svelte';
	import Spark from '#lib/records/Spark.svelte';
	import InfoTip from '#lib/site/InfoTip.svelte';
	import {
		LISTED as DEFS, PERIODS, PERIOD_KEYS, periodOf, periodSub, GROUPS, REGIONS, LIVE_URL, MONTHS, get, notShown, parts, when, step, fmt, recent, milestones, provisional,
		liveBeats, loadRecords, meteredDue, fullName, dayOf, clock, monthOf, yearOf, periodWhen
	} from '#lib/records/records.js';

	let R = $state<any>(null);
	let live = $state<any>({});
	let status = $state<'loading' | 'none' | 'ok'>('loading');
	let region = $state('NZ');
	// the period the table lists: each half-hour record's highest trading period, day, week, month or year (?period=)
	let period = $state('tp');
	let cat = $state('all');
	let moy = $state(new Date(Date.now() + 13 * 36e5).getUTCMonth());   // this month in New Zealand

	onMount(() => {
		const qs = new URLSearchParams(location.search), q = qs.get('region'), qp = qs.get('period');
		if (q && ['NZ', 'NI', 'SI'].includes(q)) region = q;
		if (qp && PERIOD_KEYS.includes(qp)) period = qp;
		(async () => {
			R = await loadRecords();
			status = R ? 'ok' : 'none';
			if (!R) return;
			try {
				const r = await fetch(LIVE_URL, { cache: 'no-cache' });
				if (r.ok) live = liveBeats(R, await r.json());
			} catch { /* the live check is extra; the records stand without it */ }
		})();
	});

	function setRegion(r: string) { region = r; syncUrl(); }
	function setPeriod(p: string) { period = p; syncUrl(); }
	function syncUrl() {
		const u = new URL(location.href);
		if (region === 'NZ') u.searchParams.delete('region'); else u.searchParams.set('region', region);
		if (period === 'tp') u.searchParams.delete('period'); else u.searchParams.set('period', period);
		replaceState(u, {});
	}
	const href = (id: string, r = region, p = period) => {
		const q = new URLSearchParams();
		if (r !== 'NZ') q.set('region', r);
		if (p !== 'tp' && DEFS.find((x) => x.id === id)?.kind === 'hh') q.set('period', p);
		const qs = q.toString();
		return `/records/${id}${qs ? '?' + qs : ''}`;
	};
	const regionName = $derived(REGIONS.find((x) => x.id === region)!.name);

	type Row = { d: any; rec: any; na: string | null; prov: any; isNew: boolean; p: string };
	// groups with no record for this region (HVDC for an island) are left out rather than listed as not shown
	const shownGroups = $derived(GROUPS.filter((g) => DEFS.some((d) => d.group === g && d.regions.includes(region))));
	$effect(() => { if (cat !== 'all' && !shownGroups.includes(cat)) cat = 'all'; });
	const groups = $derived.by(() => {
		if (!R) return [];
		return shownGroups.filter((g) => cat === 'all' || g === cat).map((g) => ({
			name: g,
			rows: DEFS.filter((d) => d.group === g).map((d): Row => {
				const p = d.kind === 'hh' ? period : 'tp';
				const rec = get(R, d.id, region, p);
				const na = notShown(d, region, rec, R, p);
				const prov = na ? null : p === 'tp' ? provisional(R, live, d.id, region) : (rec?.prov ?? null);
				return { d, rec, na, prov, p, isNew: !na && !!rec?.since && Date.now() - rec.since < 30 * 864e5 };
			}),
		}));
	});
	const cards = $derived(R ? recent(R, live).slice(0, 6) : []);
	const miles = $derived(R ? milestones(R, region).slice(-6).reverse() : []);
	const MOY = ['demand_max', 'demand_min', 'ren_max', 'wind_max', 'solar_max', 'roof_max', 'price_max'];
	const moyRows = $derived(R ? MOY.map((id) => DEFS.find((d) => d.id === id)!).filter((d) => d.regions.includes(region))
		.map((d) => ({ d, tv: R.moy?.[d.id]?.[region]?.[moy] ?? null })).filter((x) => x.tv && !notShown(x.d, region, get(R, x.d.id, region))) : []);

	const provText = (d: any, p: any, rec: any, per = 'tp') => {
		const src = p.src === 'live' ? 'Live data shows' : 'Dispatch data shows';
		const w = per !== 'tp' && d.kind === 'hh' ? `for ${periodWhen(p.t, per).replace(/^Week/, 'the week')}` : d.kind === 'hh' ? `in the ${clock(p.t)} half-hour on ${dayOf(p.t)}` : d.kind === 'run' ? `from ${dayOf(p.t)}${p.ongoing ? ', still going' : ''}` : `in ${monthOf(p.t)}`;
		return `${src} ${fmt(d, p.v, per)} ${w}, beyond the record of ${fmt(d, rec.v, per)}. Confirmed or dropped when the EA publishes the metered data, around ${meteredDue(p.t)}.`;
	};
	const upBy = (d: any, rec: any) => {
		if (!rec?.prev) return '';
		const x = Math.abs(rec.v - rec.prev[1]);
		const p = parts(d, x);
		const verb = d.id.endsWith('_min') ? 'down' : 'up';
		return `${verb} ${d.unit === '%' ? x.toFixed(d.dp ?? 0) + ' points' : d.unit === '$' ? p.n : `${p.n} ${d.unit === 'h' ? 'h' : p.u}`}`;
	};
</script>

<svelte:head>
	<title>Records · ELENZ</title>
	<meta name="description" content="New Zealand's electricity records since 1997: peak demand, renewable share, wind and solar, prices and the HVDC link, for New Zealand and each island, from the Electricity Authority's metered data." />
	<Preview title="New Zealand's electricity records since 1997 · ELENZ" description="New Zealand's electricity records since 1997: peak demand, renewable share, wind and solar, prices and the HVDC link, for New Zealand and each island, from the Electricity Authority's metered data." path="/records" />
</svelte:head>

<div class="wrap">
	<Masthead />

	<main class="rec-page">
		<section class="hero" aria-labelledby="rec-h">
			<div>
				<h1 id="rec-h">Records</h1>
				<p class="lede">The highest and lowest trading periods, days, weeks, months and years, and the longest runs, since 1 August 1997, from the Electricity Authority’s metered data and final prices.</p>
			</div>
			{#if R?.final_to?.gen}
				<span class="pill" title="Records rest on the EA's metered data, published 5–6 weeks after each month. Anything newer is provisional.">Official to {dayOf(R.final_to.gen)}</span>
			{/if}
		</section>

		<div class="toolbar">
			<div class="ctl">
				<label for="rec-region" class="vh">Region</label>
				<select class="pick" id="rec-region" value={region} onchange={(e) => setRegion((e.currentTarget as HTMLSelectElement).value)}>
					{#each REGIONS as r}<option value={r.id}>{r.name}</option>{/each}
				</select>
			</div>
			<a class="how" href="/methods/records">How records work</a>
		</div>

		{#if status === 'loading'}
			<p class="note" role="status">Loading the records…</p>
		{:else if status === 'none'}
			<section class="panel empty">
				<h2>The records are being worked out</h2>
				<p>They come from the full history back to 1997, which is being rebuilt from the EA’s metered data. They will appear here once the rebuild finishes, in the next few days.</p>
			</section>
		{:else}
			{#if cards.length}
				<section aria-labelledby="new-h" class="sec">
					<h2 id="new-h">New and provisional</h2>
					<div class="cards">
						{#each cards as c}
							{@const p = c.prov}
							{@const shown = p ?? c.rec}
							<a class="card" class:prov={!!p} href={href(c.d.id, c.region, 'tp')}>
								<span class="c-top">
									<span class="c-name"><span class="dot" style="--c:var({c.d.tok})"></span>{fullName(c.d)} · {c.region}</span>
									<span class="tags">
										{#if c.d.est}<span class="tag est">Estimate</span>{/if}
										{#if c.settled}<span class="tag">Not confirmed</span>{:else if p}<span class="tag provtag">Provisional</span>{:else}<span class="tag new">New</span>{/if}
									</span>
								</span>
								{#if c.settled}
									<span class="c-val">{fmt(c.d, c.settled.pv)}</span>
									<span class="c-sub">The metered data had {c.settled.v != null ? fmt(c.d, c.settled.v) : 'less'}, short of the record of {fmt(c.d, c.settled.rec)}. The record stands.</span>
								{:else}
									<span class="c-row">
										<span>
											<span class="c-val">{parts(c.d, shown.v).n}<small>{parts(c.d, shown.v).u}</small></span>
											<span class="c-sub">{when(c.d, shown) + (!p && c.rec.prev ? ` · ${upBy(c.d, c.rec)}` : '')}</span>
										</span>
										<Spark steps={p ? [...c.rec.steps, [p.t, p.v]] : c.rec.steps} end={R.end} tok={c.d.tok} w={110} h={40} dashed={!!c.d.est} />
									</span>
									{#if p}<span class="c-foot">{p.src === 'live' ? 'From live data' : 'From dispatch data'}: confirmed or dropped when the metered data arrives, around {meteredDue(p.t)}.</span>{/if}
								{/if}
							</a>
						{/each}
					</div>
				</section>
			{/if}

			<section aria-labelledby="all-h" class="sec">
				<div class="sec-head">
					<div class="ttl-row"><h2 id="all-h">All-time records · {regionName}</h2><InfoTip label="About these records">Official records use the EA’s metered data and final prices, which arrive 5–6 weeks after each month (final prices a day or two). Newer records come from dispatch data and stay provisional until the metered month confirms them. Embedded solar is modelled, and days the clocks change are left out of the generation and demand records. <a href="/methods/records">How records work</a></InfoTip></div>
					<span class="unit">{period === 'tp' ? 'Half-hour averages unless stated' : `Averages over each ${periodOf(period).word}; runs are any length`}</span>
				</div>
				<div class="seg per" role="group" aria-label="Records for each">
					{#each PERIODS as p}
						<button type="button" aria-pressed={period === p.k} onclick={() => setPeriod(p.k)}>{p.label}</button>
					{/each}
				</div>
				<div class="chips" role="group" aria-label="Show records about">
					{#each ['all', ...shownGroups] as g}
						<button type="button" class="chip" aria-pressed={cat === g} onclick={() => (cat = g)}>{g === 'all' ? 'All' : g}</button>
					{/each}
				</div>
				<div class="tbl">
					<table>
						<thead>
							<tr><th scope="col">Record</th><th scope="col" class="n">Value</th><th scope="col">When</th><th scope="col">Previous record</th><th scope="col"><span class="vh">Progression </span>Since 1997</th></tr>
						</thead>
						{#each groups as g}
							<tbody>
								<tr class="grp"><th colspan="5" scope="colgroup">{g.name}</th></tr>
								{#each g.rows as row}
									{@const d = row.d}
									{@const rec = row.rec}
									<tr class:na={!!row.na}>
										<th scope="row">
											<span class="r-name">
												<span class="dot" style="--c:var({d.tok})"></span>
												<span>
													{#if row.na}<span class="nm">{d.name}</span>{:else}<a class="nm" href={href(d.id)}>{d.name}</a>{/if}
													{#if d.est}<span class="tag est">Estimate</span>{/if}
													{#if row.isNew}<span class="tag new">New</span>{/if}
													<small>{periodSub(d, row.p)}</small>
												</span>
											</span>
										</th>
										{#if row.na}
											<td colspan="4" class="na-note">{row.na}</td>
										{:else}
											<td class="n val">{parts(d, rec.v, row.p).n}<small>{parts(d, rec.v, row.p).u}</small></td>
											<td>{when(d, rec, false, row.p)}</td>
											<td class="muted">{d.kind === 'run' ? (rec.top?.[1] ? `${parts(d, rec.top[1][1]).n} hours, ${dayOf(rec.top[1][0])}` : '') : step(d, rec.prev, row.p)}</td>
											<td><Spark steps={rec.steps} end={R.end} tok={d.tok} dashed={!!d.est} /></td>
										{/if}
									</tr>
									{#if row.prov && rec}
										<tr class="prov-row"><td colspan="5"><span class="tag provtag">Provisional</span> {provText(d, row.prov, rec, row.p)}</td></tr>
									{/if}
								{/each}
							</tbody>
						{/each}
					</table>
				</div>
			</section>

			<div class="two">
				{#if miles.length}
					<section class="panel" aria-labelledby="mile-h">
						<h2 id="mile-h">Milestones · {regionName}</h2>
						<ul class="miles">
							{#each miles as m}
								<li>
									<span class="dot" style="--c:var({m.d.tok})"></span>
									<span><b>{m.d.unit === '%' ? `${m.level}% renewable` : `${m.level.toLocaleString('en-NZ')} MW of ${m.d.id === 'wind_max' ? 'wind' : m.d.id === 'solar_max' ? 'grid solar' : m.d.id === 'roof_max' ? 'embedded solar' : 'demand'}`}</b>
										first passed {clock(m.t)}, {dayOf(m.t)}{#if m.d.est} <span class="tag est">Estimate</span>{/if}</span>
								</li>
							{/each}
						</ul>
					</section>
				{/if}

				<section class="panel" aria-labelledby="moy-h">
					<div class="sec-head">
						<div class="ttl-row"><h2 id="moy-h">Records for
							<select class="pick" bind:value={moy} aria-label="Month of the year">
								{#each MONTHS as m, i}<option value={i}>{m}</option>{/each}
							</select>
						</h2><InfoTip label="About month records">The best {MONTHS[moy]} on record, so a month can be a record even when the all-time ones hold.</InfoTip></div>
						<span class="unit">{regionName}</span>
					</div>
					<table class="moy">
						<tbody>
							{#each moyRows as x}
								<tr>
									<th scope="row"><span class="dot" style="--c:var({x.d.tok})"></span>{fullName(x.d)}{#if x.d.est} <span class="tag est">Est.</span>{/if}</th>
									<td class="n val">{parts(x.d, x.tv[1]).n}<small>{parts(x.d, x.tv[1]).u}</small></td>
									<td class="n muted">{yearOf(x.tv[0])}</td>
								</tr>
							{:else}
								<tr><td class="muted">No records for this month yet.</td></tr>
							{/each}
						</tbody>
					</table>
				</section>
			</div>

<<<<<<< HEAD
=======
			<p class="foot">Official records use the EA’s metered data and final prices, which arrive 5–6 weeks after each month (final prices a day or two). Newer records come from dispatch data and stay provisional until the metered month confirms them. Embedded solar is modelled. <a href="/methods/records">How records work</a></p>
>>>>>>> 26147f0 (Next rebuild: Generation_MD's clock-numbered change days before 2009 renumbered (BUILD 7))
		{/if}
	</main>

	<SiteFooter />
</div>

<style>
	.rec-page { display: grid; gap: 14px; }
	.hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px 20px; flex-wrap: wrap; padding-block: 6px 2px; }
	.hero h1 { font-size: 1.6rem; letter-spacing: -0.02em; line-height: 1.15; }
	.lede { margin: 6px 0 0; color: var(--ink-2); max-width: 70ch; }
	.pill::before { display: none; }
	.how { margin-left: auto; color: var(--accent); font-weight: 600; font-size: 0.86rem; }

	.sec { display: grid; gap: 10px; }
	.sec h2, .panel h2 { font-size: 1rem; }
	.sec-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
	.unit { color: var(--muted); font-size: 0.8rem; }
	.note { color: var(--muted); font-size: 0.8rem; margin: 0; }
	.panel { background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 14px; min-width: 0; display: grid; gap: 10px; align-content: start; }
	.empty p { margin: 0; color: var(--ink-2); max-width: 70ch; }

	.dot { display: inline-block; flex: none; width: 10px; height: 10px; border-radius: 50%; background: var(--c); margin-right: 8px; }
	.tag { display: inline-block; font-size: 0.68rem; font-weight: 600; letter-spacing: 0.03em; padding: 1px 7px; border-radius: 999px; background: var(--grid); color: var(--ink-2); margin-left: 6px; vertical-align: 1px; white-space: nowrap; }
	.tag.new { background: var(--warn-bg); color: var(--warn-ink); }
	.tag.provtag { background: transparent; border: 1px dashed var(--warn-ink); color: var(--warn-ink); margin-left: 0; }
	.tag.est { background: transparent; border: 1px solid var(--line); color: var(--muted); }

	.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 10px; }
	.card { background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 12px 14px; display: grid; gap: 8px; align-content: start; color: inherit; text-decoration: none; }
	.card:hover { border-color: var(--ink-2); }
	.card.prov { border-style: dashed; border-color: color-mix(in srgb, var(--warn-ink) 55%, var(--line)); }
	.c-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
	.c-name { display: flex; align-items: center; font-size: 0.82rem; color: var(--ink-2); font-weight: 600; }
	.c-row { display: flex; justify-content: space-between; align-items: flex-end; gap: 10px; }
	.c-val { display: block; font-family: var(--font-data); font-size: 1.6rem; font-weight: 600; letter-spacing: -0.02em; line-height: 1.1; }
	.c-val small, .val small { font-family: var(--font-ui); font-size: 0.75rem; font-weight: 500; color: var(--muted); margin-left: 4px; letter-spacing: 0; }
	.c-sub { display: block; color: var(--muted); font-size: 0.78rem; margin-top: 4px; }
	.c-foot { color: var(--ink-2); font-size: 0.78rem; border-top: 1px solid var(--grid); padding-top: 8px; }

	.per { justify-self: start; flex-wrap: wrap; }
	.per button { min-height: 32px; padding-inline: 12px; font-size: 0.84rem; }
	.chips { display: flex; gap: 6px; flex-wrap: wrap; }
	.chip { font: inherit; font-size: 0.8rem; font-weight: 500; padding: 5px 11px; min-height: 32px; border-radius: 999px; border: 1px solid var(--line); background: var(--surface); color: var(--ink-2); cursor: pointer; }
	.chip:hover { color: var(--ink); border-color: var(--ink-2); }
	.chip[aria-pressed='true'] { background: var(--ink); border-color: var(--ink); color: var(--surface); }

	.tbl { background: var(--surface); border: 1px solid var(--line); border-radius: 4px; overflow-x: auto; }
	table { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
	.tbl table { min-width: 860px; }
	thead th { text-align: left; color: var(--muted); font-weight: 600; font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; padding: 8px 12px; border-bottom: 1px solid var(--line); }
	thead th.n { text-align: right; }
	.grp th { text-align: left; padding: 8px 12px; background: color-mix(in srgb, var(--grid) 55%, transparent); color: var(--muted); font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600; border-bottom: 1px solid var(--grid); }
	tbody td, tbody th[scope='row'] { padding: 9px 12px; border-bottom: 1px solid var(--grid); vertical-align: middle; text-align: left; font-weight: 400; }
	.r-name { display: flex; align-items: flex-start; }
	.r-name .dot { margin-top: 5px; }
	.r-name small { display: block; color: var(--muted); font-size: 0.76rem; margin-top: 1px; }
	.nm { font-weight: 600; color: var(--ink); }
	a.nm { text-decoration: none; }
	a.nm:hover { color: var(--accent); text-decoration: underline; }
	td.n { text-align: right; }
	.val { font-family: var(--font-data); font-size: 1rem; font-weight: 600; white-space: nowrap; }
	.muted { color: var(--muted); }
	tr.na .nm { color: var(--ink-2); }
	.na-note { color: var(--muted); font-size: 0.8rem; }
	.prov-row td { padding: 0 12px 10px 30px; color: var(--ink-2); font-size: 0.8rem; border-bottom: 1px solid var(--grid); }
	tr:has(+ .prov-row) td, tr:has(+ .prov-row) th { border-bottom: 0; }

	.two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; align-items: start; }
	.miles { list-style: none; margin: 0; padding: 0; display: grid; }
	.miles li { display: flex; align-items: baseline; gap: 2px; padding: 7px 0; border-bottom: 1px solid var(--grid); font-size: 0.86rem; color: var(--ink-2); }
	.miles li:last-child { border-bottom: 0; }
	.miles b { color: var(--ink); font-weight: 600; }
	.moy th[scope='row'] { display: flex; align-items: center; padding-left: 0; font-weight: 500; }
	.moy td.n:last-child { padding-right: 0; width: 4em; }
	.moy tr:last-child td, .moy tr:last-child th { border-bottom: 0; }
	select.pick { font-size: 1rem; }

	@media (max-width: 860px) {
		.two { grid-template-columns: minmax(0, 1fr); }
	}
	@media (max-width: 640px) {
		/* phones: each record a short block (name and value, then when) instead of a wide table */
		.tbl { overflow: visible; }
		.tbl table { min-width: 0; }
		.tbl thead { display: none; }
		.tbl table, .tbl tbody { display: block; }
		.tbl tbody tr { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 3px 12px; padding: 10px 12px; border-bottom: 1px solid var(--grid); }
		.tbl tbody tr.grp { display: block; padding: 0; }
		.tbl tbody tr.prov-row { display: block; padding: 0 12px 10px; }
		.tbl tbody td, .tbl tbody th[scope='row'] { padding: 0; border: 0; }
		.tbl .grp th { display: block; }
		.tbl td.val { grid-column: 2; grid-row: 1; align-self: start; }
		.tbl tbody tr > td:nth-child(3) { grid-column: 1 / -1; color: var(--ink-2); font-size: 0.8rem; padding-left: 18px; }
		.tbl tbody tr > td:nth-child(4), .tbl tbody tr > td:nth-child(5) { display: none; }
		.tbl .na-note { grid-column: 1 / -1; padding-left: 18px; }
		.prov-row td { padding: 0; }
		.hero h1 { font-size: 1.3rem; }
		.how { margin-left: 0; }
	}
</style>
