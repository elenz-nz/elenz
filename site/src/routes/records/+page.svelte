<script lang="ts">
	// Records: the highest and lowest half-hours, months and runs since 1997 (ingest/records.py writes the data;
	// names, wording and the live check are in #lib/records/records.js). Each record has its own page,
	// /records/<id>?region=NI.
	import Preview from '#lib/site/Preview.svelte';
	import { onMount } from 'svelte';
	import { replaceState, goto } from '$app/navigation';
	import Masthead from '#lib/site/Masthead.svelte';
	import SiteFooter from '#lib/site/SiteFooter.svelte';
	import Spark from '#lib/records/Spark.svelte';
	import InfoTip from '#lib/site/InfoTip.svelte';
	import RecordIcon from '#lib/records/RecordIcon.svelte';
	import { energy, pace, soFar, paceAt, periodWhen,
		LISTED as DEFS, PERIODS, PERIOD_KEYS, periodOf, periodSub, GROUPS, REGIONS, LIVE_URL, MONTHS, get, notShown, parts, when, step, fmt, recent, milestones, provisional,
		liveBeats, loadRecords, fullName, dayOf, clock, yearOf, isNew
	} from '#lib/records/records.js';

	let R = $state<any>(null);
	let live = $state<any>({});
	let status = $state<'loading' | 'none' | 'ok'>('loading');
	let region = $state('NZ');
	// the period the table lists: each half-hour record's highest trading period, day, week, month or year (?period=)
	let period = $state('tp');
	let cat = $state('all');
	// the page's three lists as tabs under Heading for a record and New and provisional (owner's call REC-01, 31 Oct
	// 2026: the page had too many lines; ?tab=milestones|months in the address)
	const TABS = [{ k: 'all', label: 'All-time records' }, { k: 'milestones', label: 'Milestones' }, { k: 'months', label: 'By month' }];
	let tab = $state('all');
	let liveD = $state.raw<any>(null);   // tracker.json: the live week, for the live check and the pace
	let paceAll = $state(false);          // the pace cards beyond the first PACE_CARDS
	const PACE_CARDS = 8;   // owner's call, 31 Oct 2026
	let moy = $state(new Date(Date.now() + 13 * 36e5).getUTCMonth());   // this month in New Zealand

	onMount(() => {
		const qs = new URLSearchParams(location.search), q = qs.get('region'), qp = qs.get('period');
		if (q && ['NZ', 'NI', 'SI'].includes(q)) region = q;
		if (qp && PERIOD_KEYS.includes(qp)) period = qp;
		const qt = qs.get('tab');
		if (qt && TABS.some((x) => x.k === qt)) tab = qt;
		(async () => {
			R = await loadRecords();
			status = R ? 'ok' : 'none';
			if (!R) return;
			try {
				const r = await fetch(LIVE_URL, { cache: 'no-cache' });
				if (r.ok) { liveD = await r.json(); live = liveBeats(R, liveD); }
			} catch { /* the live check is extra; the records stand without it */ }
		})();
	});

	function setRegion(r: string) { region = r; syncUrl(); }
	function setPeriod(p: string) { period = p; syncUrl(); }
	function setTab(k: string) { tab = k; syncUrl(); }
	function syncUrl() {
		const u = new URL(location.href);
		if (region === 'NZ') u.searchParams.delete('region'); else u.searchParams.set('region', region);
		if (period === 'tp') u.searchParams.delete('period'); else u.searchParams.set('period', period);
		if (tab === 'all') u.searchParams.delete('tab'); else u.searchParams.set('tab', tab);
		replaceState(u, {});
	}
	// the whole row opens its record (the name and description are the link itself, for keyboards and new tabs; a click
	// anywhere else in the row follows it too, but not a text selection or a click on another link)
	function rowClick(e: MouseEvent, link: string) {
		if ((e.target as HTMLElement).closest('a, button') || window.getSelection()?.toString()) return;
		if (e.metaKey || e.ctrlKey) { window.open(link, '_blank'); return; }
		goto(link);
	}
	const href = (id: string, r = region, p = period) => {
		const q = new URLSearchParams();
		if (r !== 'NZ') q.set('region', r);
		if (p !== 'tp' && DEFS.find((x) => x.id === id)?.kind === 'hh') q.set('period', p);
		const qs = q.toString();
		return `/records/${id}${qs ? '?' + qs : ''}`;
	};
	const regionName = $derived(REGIONS.find((x) => x.id === region)!.name);

	// link: the record's page
	type Row = { d: any; rec: any; na: string | null; prov: any; isNew: boolean; p: string; link: string | null };
	// every row for this region and period; records that can't apply here (a South Island renewable share that is always
	// 100%, fossil records where there's no fossil plant, a "most sent south" year when no year was) are left out, and
	// so are groups left empty (owner's report REC-03, 31 Oct 2026); a record still being worked out keeps its row
	const allGroups = $derived.by(() => {
		if (!R) return [];
		return GROUPS.map((g) => ({
			name: g,
			rows: DEFS.filter((d) => d.group === g).map((d): Row => {
				const p = d.kind !== 'hh' ? 'tp' : period;
				const rec = get(R, d.id, region, p);
				const na = notShown(d, region, rec, R, p);
				const prov = na ? null : p === 'tp' ? provisional(R, live, d.id, region) : (rec?.prov ?? null);
				const link = na ? null : href(d.id);
				return { d, rec, na, prov, p, link, isNew: !na && isNew(rec, p) };
			}).filter((row) => !row.na || /^Being worked out/.test(row.na)),
		})).filter((g) => g.rows.length);
	});
	const shownGroups = $derived(allGroups.map((g) => g.name));
	$effect(() => { if (cat !== 'all' && R && !shownGroups.includes(cat)) cat = 'all'; });
	const groups = $derived(allGroups.filter((g) => cat === 'all' || g.name === cat));
	// new and provisional: four, a row of them at full width, then Show all (owner's call REC-09, 31 Oct 2026)
	const CARDS = 4;
	let cardsAll = $state(false);
	const allCards = $derived(R ? recent(R, live) : []);
	const cards = $derived(cardsAll ? allCards : allCards.slice(0, CARDS));
	// heading for a record: one card per record and period, New Zealand's where it is on pace, otherwise an island's
	const paces = $derived.by(() => {
		if (!R || !liveD) return [];
		const seen = new Set<string>();
		return pace(R, liveD).sort((a, b) => (a.region === 'NZ' ? 0 : 1) - (b.region === 'NZ' ? 0 : 1))
			.filter((x) => { const k = x.d.id + x.period; return !seen.has(k) && !!seen.add(k); });
	});
	// every half-hour record has a best for each month of the year (records.py by_month_of_year), for each region
	const moyFor = (r: string) => (R ? DEFS.filter((d) => d.kind === 'hh' && d.regions.includes(r))
		.map((d) => ({ d, tv: R.moy?.[d.id]?.[r]?.[moy] ?? null })).filter((x) => x.tv && !notShown(x.d, r, get(R, x.d.id, r))) : []);

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
			<h1 id="rec-h">Records</h1>
			<a class="how" href="/methods/records">How records work</a>
		</section>

		{#if status === 'loading'}
			<p class="note" role="status">Loading the records…</p>
		{:else if status === 'none'}
			<section class="panel empty">
				<h2>The records are being worked out</h2>
				<p>They come from the full history back to 1997, which is being rebuilt from the EA’s metered data. They will appear here once the rebuild finishes, in the next few days.</p>
			</section>
		{:else}
			{#if paces.length}
				<section aria-labelledby="pace-h" class="sec">
					<div class="ttl-row"><h2 id="pace-h">Heading for a record</h2><InfoTip label="About records on pace">
						<ul>
							<li>A day, week, month or year still running, ahead of its record at the same point.</li>
							<li>Listed once half of it has gone, and only while it stays ahead.</li>
							<li>From dispatch data, so provisional: the rest of the period can still change it.</li>
							<li>One tile per record: New Zealand's where it's on pace, otherwise an island's.</li>
						</ul>
						<p><a href="/methods/records#pace">How records work</a></p>
					</InfoTip></div>
					<!-- simple tiles, almost buttons: the record's picture and name; the detail is on its page (owner's call, 30 Oct 2026) -->
					<div class="paces">
						{#each paceAll ? paces : paces.slice(0, PACE_CARDS) as p}
							<a class="pt" href={href(p.d.id, p.region, p.period)} style="--c:var({p.d.tok})"
								title="{fullName(p.d)}: {soFar(p)}, {paceAt(p)}, ahead of the record {periodOf(p.period).word}">
								<span class="pt-ic"><RecordIcon id={p.d.id} /></span>
								<span class="pt-txt"><b>{fullName(p.d)}</b><small>This {periodOf(p.period).word}{p.region === 'NZ' ? '' : ` · ${p.region === 'NI' ? 'North Island' : 'South Island'}`}</small></span>
								<svg class="pt-go" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
							</a>
						{/each}
					</div>
					{#if paces.length > PACE_CARDS}<button type="button" class="more-btn" onclick={() => (paceAll = !paceAll)}>{paceAll ? 'Show fewer' : `Show all ${paces.length}`}</button>{/if}
				</section>
			{/if}

			{#if cards.length}
				<section aria-labelledby="new-h" class="sec">
					<div class="ttl-row"><h2 id="new-h">New and provisional</h2><InfoTip label="About new and provisional records">
						<ul>
							<li>Records set in the last 30 days, and newer ones still waiting on the metered data, for New Zealand or either island.</li>
							<li>Dashed border: provisional, from dispatch data.</li>
							<li>Struck through: a provisional record the metered data didn't confirm.</li>
						</ul>
						<p><a href="/methods/records">How records work</a></p>
					</InfoTip></div>
					<div class="cards">
						{#each cards as c}
							{@const p = c.prov}
							{@const shown = p ?? c.rec}
							<!-- kept bare: name, value, when and the progression; the dashed border marks a provisional record, and the
							     record's own page explains it -->
							<a class="card" class:prov={!!p} href={href(c.d.id, c.region, 'tp')} title={p ? 'Provisional: not yet confirmed by the metered data' : undefined}>
								<span class="c-name"><span class="dot" style="--c:var({c.d.tok})"></span>{fullName(c.d)} · {c.region}</span>
								<span class="c-row">
									<span>
										{#if c.settled}
											<span class="c-val gone">{parts(c.d, c.settled.pv).n}<small>{parts(c.d, c.settled.pv).u}</small></span>
											<span class="c-sub">Not confirmed</span>
										{:else}
											<span class="c-val">{parts(c.d, shown.v).n}<small>{parts(c.d, shown.v).u}</small></span>
											<span class="c-sub">{when(c.d, shown)}</span>
										{/if}
									</span>
									{#if c.rec}<Spark steps={p ? [...c.rec.steps, [p.t, p.v]] : c.rec.steps} end={R.end} tok={c.d.tok} w={110} h={40} dashed={!!c.d.est} hollow={!!p} />{/if}
								</span>
							</a>
						{/each}
					</div>
					{#if allCards.length > CARDS}<button type="button" class="more-btn" onclick={() => (cardsAll = !cardsAll)}>{cardsAll ? 'Show fewer' : `Show all ${allCards.length}`}</button>{/if}
				</section>
			{/if}

			<div class="rec-tabs" role="tablist" aria-label="Records">
				{#each TABS as t}
					<button type="button" role="tab" id="tab-{t.k}" aria-selected={tab === t.k} aria-controls="panel-{t.k}" onclick={() => setTab(t.k)}>{t.label}</button>
				{/each}
			</div>

			{#if tab === 'all'}
			<section aria-labelledby="all-h" class="sec" id="panel-all">
				<!-- the list's title bar: its heading, the region (only the list, milestones and month records follow it) and how
				     far the official data goes; it sticks while the list scrolls (owner's call, 30 Oct 2026) -->
				<div class="toolbar list-bar">
					<div class="ttl-row"><h2 id="all-h">All-time records</h2><InfoTip label="About these records">
						<ul>
							<li>Official records use the EA's metered generation and HVDC, and its final prices.</li>
							<li>Official to: the last day the metered data covers. It arrives 5–6 weeks after each month (final prices a day or two).</li>
							<li>Anything newer comes from dispatch data and stays provisional (dashed edge) until the metered month confirms it.</li>
							<li>Day to year records are the period's average MW, with its energy beside it.</li>
							<li>Embedded solar is modelled, so its records are estimates.</li>
						</ul>
						<p><a href="/methods/records">How records work</a></p>
					</InfoTip></div>
					<!-- region and period together, like the tracker's region and range; on phones a row of their own, the
					     periods' short names -->
					<div class="bar-ctl">
						<label for="rec-region" class="vh">Region</label>
						<select class="pick" id="rec-region" value={region} onchange={(e) => setRegion((e.currentTarget as HTMLSelectElement).value)}>
							{#each REGIONS as r}<option value={r.id}>{r.name}</option>{/each}
						</select>
						<div class="seg per" role="group" aria-label="Records for each">
							{#each PERIODS as p}
								<button type="button" aria-pressed={period === p.k} title={p.label} onclick={() => setPeriod(p.k)}><span class="lg">{p.label}</span><span class="sh" aria-hidden="true">{p.short}</span></button>
							{/each}
						</div>
					</div>
					{#if R?.final_to?.gen}<span class="pill official">Official to {dayOf(R.final_to.gen)}</span>{/if}
				</div>
				<div class="sec-head">
					<span class="unit">{period === 'tp' ? 'Half-hour averages unless stated' : `Averages over each ${periodOf(period).word}; runs are any length`}</span>
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
									<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions (the name is the row's link for keyboards) -->
									<tr class:na={!!row.na} class:prov={!!(row.prov && rec)} class:go={!!row.link} title={row.prov && rec ? 'A provisional record beyond this one: see its page' : undefined}
										onclick={row.link ? (e) => rowClick(e, row.link!) : undefined}>
										<th scope="row">
											<svelte:element this={row.link ? 'a' : 'span'} class="r-name" href={row.link ?? undefined}>
												<span class="dot" style="--c:var({d.tok})"></span>
												<span>
													<span class="nm">{d.name}</span>
													{#if d.est}<span class="tag est">Estimate</span>{/if}
													{#if row.isNew}<span class="tag new">New</span>{/if}
													<small>{periodSub(d, row.p)}</small>
												</span>
											</svelte:element>
										</th>
										{#if row.na}
											<td colspan="4" class="na-note">{row.na}</td>
										{:else}
											<td class="n val">{parts(d, rec.v, row.p).n}<small>{parts(d, rec.v, row.p).u}</small>{#if energy(d, rec.t, rec.v, row.p)}<span class="en">{energy(d, rec.t, rec.v, row.p)}</span>{/if}</td>
											<td>{when(d, rec, false, row.p)}</td>
											<td class="muted">{d.kind === 'run' ? (rec.top?.[1] ? `${parts(d, rec.top[1][1]).n} hours, ${dayOf(rec.top[1][0])}` : '') : step(d, rec.prev, row.p)}</td>
											<td><Spark steps={row.prov ? [...rec.steps, [row.prov.t, row.prov.v]] : rec.steps} end={R.end} tok={d.tok} dashed={!!d.est} hollow={!!row.prov} /></td>
										{/if}
									</tr>
								{/each}
							</tbody>
						{/each}
					</table>
				</div>
			</section>

			{/if}

			<!-- Milestones and By month: a card for each region side by side (owner's call, 31 Oct 2026), the full lists -->
			{#if tab === 'milestones'}
				<section class="sec" id="panel-milestones" aria-labelledby="mile-h">
					<div class="ttl-row"><h2 id="mile-h">Milestones</h2><InfoTip label="About milestones">
						<ul>
							<li>The first half-hour each round level was passed: wind, grid and embedded solar, renewable share and peak demand.</li>
							<li>Newest first, for New Zealand and each island.</li>
						</ul>
					</InfoTip></div>
					<div class="regions">
						{#each REGIONS as rg}
							{@const ms = milestones(R, rg.id).reverse()}
							<section class="panel" aria-label="Milestones, {rg.name}">
								<h3>{rg.name}</h3>
								{#if ms.length}
									<ul class="miles">
										{#each ms as m}
											<li>
												<span class="dot" style="--c:var({m.d.tok})"></span>
												<span><b>{m.d.unit === '%' ? `${m.level}% renewable` : `${m.level.toLocaleString('en-NZ')} MW of ${m.d.id === 'wind_max' ? 'wind' : m.d.id === 'solar_max' ? 'grid solar' : m.d.id === 'roof_max' ? 'embedded solar' : 'demand'}`}</b>
													first passed {clock(m.t)}, {dayOf(m.t)}{#if m.d.est} <span class="tag est">Estimate</span>{/if}</span>
											</li>
										{/each}
									</ul>
								{:else}
									<p class="note">None yet.</p>
								{/if}
							</section>
						{/each}
					</div>
				</section>
			{/if}

			{#if tab === 'months'}
				<section class="sec" id="panel-months" aria-labelledby="moy-h">
					<div class="sec-head">
						<div class="ttl-row"><h2 id="moy-h">Records for
							<select class="pick" bind:value={moy} aria-label="Month of the year">
								{#each MONTHS as m, i}<option value={i}>{m}</option>{/each}
							</select>
						</h2><InfoTip label="About month records">
							<ul>
								<li>Trading period records: the highest or lowest half-hour of any {MONTHS[moy]} since 1997, and the year it was set.</li>
								<li>A month can set one even when the all-time record holds.</li>
							</ul>
						</InfoTip></div>
						<span class="unit">Trading periods</span>
					</div>
					<div class="regions">
						{#each REGIONS as rg}
							{@const rows = moyFor(rg.id)}
							<section class="panel" aria-label="{MONTHS[moy]} records, {rg.name}">
								<h3>{rg.name}</h3>
								<table class="moy">
									<tbody>
										{#each rows as x}
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
						{/each}
					</div>
				</section>
			{/if}

		{/if}
	</main>

	<SiteFooter />
</div>

<style>
	.rec-page { display: grid; gap: 14px; }
	.hero { display: flex; align-items: baseline; justify-content: space-between; gap: 10px 20px; flex-wrap: wrap; padding-block: 6px 2px; }
	.hero h1 { font-size: 1.6rem; letter-spacing: -0.02em; line-height: 1.15; }
	.how { color: var(--accent); font-weight: 600; font-size: 0.86rem; }
	/* the main list's title bar: sticks to the top of the window while the list shows (.toolbar in tracker.css) */
	.list-bar { gap: 6px 14px; }
	.bar-ctl { display: flex; align-items: center; gap: 8px; min-width: 0; }
	.bar-ctl .seg { flex: none; }
	.per .sh { display: none; }
	.official { margin-left: auto; white-space: nowrap; }
	.official::before { display: none; }

	.sec { display: grid; gap: 10px; }
	/* the three lists' tabs: underlined like the tracker's Generation and Prices tabs */
	.rec-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); overflow-x: auto; scrollbar-width: none; margin-top: 6px; }
	.rec-tabs button { font: inherit; font-size: 0.95rem; font-weight: 600; color: var(--muted); background: none; border: 0; border-bottom: 2px solid transparent; padding: 8px 12px; margin-bottom: -1px; min-height: 40px; white-space: nowrap; cursor: pointer; }
	.rec-tabs button:hover { color: var(--ink); }
	.rec-tabs button[aria-selected='true'] { color: var(--ink); border-bottom-color: var(--accent); }
	.rec-tabs button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
	@media (max-width: 420px) { .rec-tabs button { font-size: 0.86rem; padding-inline: 9px; } }
	.sec h2, .panel h2 { font-size: 1rem; }
	.sec-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
	.unit { color: var(--muted); font-size: 0.8rem; }
	.note { color: var(--muted); font-size: 0.8rem; margin: 0; }
	.panel { background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 14px; min-width: 0; display: grid; gap: 10px; align-content: start; }
	.empty p { margin: 0; color: var(--ink-2); max-width: 70ch; }

	.dot { display: inline-block; flex: none; width: 10px; height: 10px; border-radius: 50%; background: var(--c); margin-right: 8px; }
	.tag { display: inline-block; font-size: 0.68rem; font-weight: 600; letter-spacing: 0.03em; padding: 1px 7px; border-radius: 999px; background: var(--grid); color: var(--ink-2); margin-left: 6px; vertical-align: 1px; white-space: nowrap; }
	.tag.new { background: var(--warn-bg); color: var(--warn-ink); }
	.tag.est { background: transparent; border: 1px solid var(--line); color: var(--muted); }

	.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 10px; }
	.card { background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 12px 14px; display: grid; gap: 8px; align-content: start; color: inherit; text-decoration: none; }
	.card:hover { border-color: var(--ink-2); }
	/* Heading for a record: one small tile each, the record's colour on a tint of it */
	.paces { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 8px; }
	.pt { display: flex; align-items: center; gap: 10px; padding: 8px 12px 8px 8px; border-radius: 6px; color: var(--ink); text-decoration: none;
		background: color-mix(in srgb, var(--c) 16%, var(--surface)); border: 1px solid color-mix(in srgb, var(--c) 45%, var(--line));
		transition: transform 0.15s, border-color 0.15s, background 0.15s; }
	.pt:hover, .pt:focus-visible { transform: translateY(-2px); border-color: var(--c); background: color-mix(in srgb, var(--c) 24%, var(--surface)); }
	.pt:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
	.pt-ic { position: relative; display: grid; place-items: center; flex: none; width: 36px; height: 36px; border-radius: 50%; color: var(--c); }
	/* a slow ring: it's still going */
	.pt-ic::after { content: ""; position: absolute; inset: 0; border-radius: 50%; animation: pt-ring 2.6s ease-out infinite; }
	@keyframes pt-ring { from { box-shadow: 0 0 0 0 color-mix(in srgb, var(--c) 45%, transparent); } to { box-shadow: 0 0 0 9px color-mix(in srgb, var(--c) 0%, transparent); } }
	.pt-txt { display: grid; min-width: 0; line-height: 1.25; }
	.pt-txt b { font-size: 0.88rem; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.pt-txt small { font-size: 0.74rem; color: var(--ink-2); }
	.pt-go { margin-left: auto; flex: none; color: var(--muted); transition: transform 0.15s, color 0.15s; }
	.pt:hover .pt-go { transform: translateX(2px); color: var(--c); }
	@media (prefers-reduced-motion: reduce) { .pt-ic::after { animation: none; } .pt, .pt-go { transition: none; } .pt:hover { transform: none; } }
	/* phones: two to a row, the name free to wrap, no arrow */
	@media (max-width: 560px) {
		.paces { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
		.pt { gap: 8px; padding: 6px 10px 6px 6px; border-radius: 6px; }
		.pt-ic { width: 30px; height: 30px; }
		.pt-ic :global(svg) { width: 18px; height: 18px; }
		.pt-txt b { font-size: 0.8rem; white-space: normal; }
		.pt-txt small { font-size: 0.7rem; }
		.pt-go { display: none; }
	}
	.more-btn { justify-self: start; margin-top: 8px; font: inherit; font-size: 0.84rem; font-weight: 600; color: var(--accent); background: none; border: 1px solid var(--line); border-radius: 4px; padding: 6px 12px; min-height: 36px; cursor: pointer; }
	.more-btn:hover { border-color: var(--accent); }
	.card.prov { border-style: dashed; border-color: color-mix(in srgb, var(--warn-ink) 55%, var(--line)); }
	.c-name { display: flex; align-items: center; font-size: 0.82rem; color: var(--ink-2); font-weight: 600; }
	.c-row { display: flex; justify-content: space-between; align-items: flex-end; gap: 10px; }
	.c-val { display: block; font-family: var(--font-data); font-size: 1.6rem; font-weight: 600; letter-spacing: -0.02em; line-height: 1.1; }
	.c-val small, .val small { font-family: var(--font-ui); font-size: 0.75rem; font-weight: 500; color: var(--muted); margin-left: 4px; letter-spacing: 0; }
	.c-sub { display: block; color: var(--muted); font-size: 0.78rem; margin-top: 4px; }
	.c-val.gone { color: var(--muted); text-decoration: line-through; text-decoration-thickness: 1px; }

	.chips { display: flex; gap: 6px; flex-wrap: wrap; }
	.chip { font: inherit; font-size: 0.8rem; font-weight: 500; padding: 5px 11px; min-height: 32px; border-radius: 999px; border: 1px solid var(--line); background: var(--surface); color: var(--ink-2); cursor: pointer; }
	.chip:hover { color: var(--ink); border-color: var(--ink-2); }
	.chip[aria-pressed='true'] { background: var(--ink); border-color: var(--ink); color: var(--surface); }

	.tbl { position: relative; background: var(--surface); border: 1px solid var(--line); border-radius: 4px; overflow-x: auto; }
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
	a.r-name { color: inherit; text-decoration: none; }
	tr.go { cursor: pointer; }
	tr.go:hover > * { background: color-mix(in srgb, var(--ink) 5%, transparent); }
	tr.go:hover .nm, a.r-name:focus-visible .nm { color: var(--accent); text-decoration: underline; }
	td.n { text-align: right; }
	.val { font-family: var(--font-data); font-size: 1rem; font-weight: 600; white-space: nowrap; }
	.val .en { display: block; font-size: 0.74rem; font-weight: 400; color: var(--muted); }
	.muted { color: var(--muted); }
	tr.na .nm { color: var(--ink-2); }
	.na-note { color: var(--muted); font-size: 0.8rem; }
	/* a record with a provisional one beyond it: a dashed edge, like the provisional cards (its page says more) */
	tr.prov > th[scope='row'] { border-left: 2px dashed color-mix(in srgb, var(--warn-ink) 65%, var(--line)); padding-left: 10px; }

	/* Milestones and By month: a card per region, three across; one under another below 900 px */
	.regions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; align-items: start; }
	.regions h3 { margin: 0; font-size: 0.82rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
	@media (max-width: 900px) { .regions { grid-template-columns: minmax(0, 1fr); } }
	.miles { list-style: none; margin: 0; padding: 0; display: grid; }
	.miles li { display: flex; align-items: baseline; gap: 2px; padding: 7px 0; border-bottom: 1px solid var(--grid); font-size: 0.86rem; color: var(--ink-2); }
	.miles li:last-child { border-bottom: 0; }
	.miles b { color: var(--ink); font-weight: 600; }
	.moy th[scope='row'] { display: flex; align-items: center; padding-left: 0; font-weight: 500; }
	.moy td.n:last-child { padding-right: 0; width: 4em; }
	.moy tr:last-child td, .moy tr:last-child th { border-bottom: 0; }
	#moy-h select.pick { font-size: 1rem; }

	@media (max-width: 640px) {
		/* phones: each record a short block (name and value, then when) instead of a wide table */
		.tbl { overflow: visible; }
		.tbl table { min-width: 0; }
		.tbl thead { display: none; }
		.tbl table, .tbl tbody { display: block; }
		.tbl tbody tr { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 3px 12px; padding: 10px 12px; border-bottom: 1px solid var(--grid); }
		/* phones: each row is a card, shaded whole while pressed */
		.tbl tbody tr.go:hover > * { background: none; }
		.tbl tbody tr.go:active { background: color-mix(in srgb, var(--ink) 7%, transparent); }
		.tbl tbody tr.grp { display: block; padding: 0; }
		.tbl tbody tr.prov { border-left: 2px dashed color-mix(in srgb, var(--warn-ink) 65%, var(--line)); padding-left: 10px; }
		.tbl tbody tr.prov > th[scope='row'] { border-left: 0; padding-left: 0; }
		.tbl tbody td, .tbl tbody th[scope='row'] { padding: 0; border: 0; }
		.tbl .grp th { display: block; }
		.tbl td.val { grid-column: 2; grid-row: 1; align-self: start; }
		.tbl tbody tr > td:nth-child(3) { grid-column: 1 / -1; color: var(--ink-2); font-size: 0.8rem; padding-left: 18px; }
		.tbl tbody tr > td:nth-child(4), .tbl tbody tr > td:nth-child(5) { display: none; }
		.tbl .na-note { grid-column: 1 / -1; padding-left: 18px; }
		.hero h1 { font-size: 1.3rem; }
	}
	/* narrower screens: the bar in two rows, the heading and Official to, then the region and periods */
	@media (max-width: 900px) {
		.list-bar .ttl-row { order: 0; }
		.official { order: 1; }
		.bar-ctl { order: 2; flex-basis: 100%; }
	}
	/* phones: the periods' short names, as the tracker's range buttons */
	@media (max-width: 560px) {
		.per .lg { display: none; }
		.per .sh { display: inline; }
		.official { font-size: 0.68rem; padding-inline: 7px; letter-spacing: 0.02em; }
	}
	/* small phones (360 px): a little tighter so region and periods keep to one row; on the very smallest the periods
	   wrap under the region */
	@media (max-width: 400px) {
		.list-bar { column-gap: 8px; }
		.bar-ctl { gap: 6px; flex-wrap: wrap; row-gap: 6px; }
		.list-bar select.pick { font-size: 0.85rem; padding-inline: 7px 22px; background-position: right 11px center, right 7px center; }
		.list-bar .per button { font-size: 0.74rem; padding-inline: 4px; }
		.official { text-transform: none; letter-spacing: 0; font-size: 0.72rem; }
	}
	@media (max-width: 340px) {
		.list-bar h2 { font-size: 0.92rem; }
		.official { font-size: 0.68rem; padding-inline: 6px; }
	}
</style>
