<script lang="ts">
	// A plant page (/plants/<slug>), from the design mock-up of 17 Nov 2026: the plant's live output, its history by
	// year and month, its capacity over time, and the facts we've checked, each with its source. The static part comes
	// from src/lib/plants/pages/<slug>.json (ingest/plant_pages.py); the live panel reads tracker.json and the history
	// /data/history/plants.json (ingest/plant_history.py) in the browser. Hidden while PLANTS_PUBLIC is false
	// (#lib/plants/registry.js). docs/architecture.md, Plant pages.
	import { onMount } from 'svelte';
	import Preview from '#lib/site/Preview.svelte';
	import Masthead from '#lib/site/Masthead.svelte';
	import SiteFooter from '#lib/site/SiteFooter.svelte';
	import InfoTip from '#lib/site/InfoTip.svelte';
	import Media from '#lib/plants/Media.svelte';
	import ReportLink from '#lib/site/ReportLink.svelte';
	import { nextDue, CHECK_EVERY } from '#lib/site/poll.js';
	import { slug as toSlug } from '#lib/site/viewurl.js';
	import Bars from '#lib/plants/Bars.svelte';
	import CapSteps from '#lib/plants/CapSteps.svelte';
	import Spark from '#lib/plants/Spark.svelte';
	import { PLANTS_PUBLIC, STATUS, subtitle, description, fuelOf, kinds, islandName } from '#lib/plants/registry.js';
	import { HISTORY_URL, plantMonths, years, lastMonths, latestYear, bestYear, capChanges, monthName, fmtGwh, fmtPct, fmtMw } from '#lib/plants/history.js';
	import { LIVE_URL, livePlant } from '#lib/plants/live.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const p = $derived(data.p);
	const fuel = $derived(fuelOf(p.fuel));
	const tok = $derived(fuel.tok);
	const operating = $derived(p.status === 'operating');
	const isBatt = $derived(p.fuel === 'batt');
	const PLANTS_MD = 'https://github.com/elenz-nz/elenz/blob/main/facilities/PLANTS.md';
	const LIVE_MINUTES = 15;

	// ---------- live panel ----------
	let live = $state<ReturnType<typeof livePlant> | 'loading' | 'error'>('loading');
	let clock = $state(Date.now());
	const CLOCK = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', hour: 'numeric', minute: '2-digit', hour12: true });
	const clockOf = (t: number) => CLOCK.format(t).replace(/\s?([ap])\.?m\.?/i, ' $1m').toLowerCase();

	// ---------- history ----------
	let file = $state<any>(null);
	let hist = $state<'loading' | 'none' | 'ok'>('loading');
	let view = $state<'gwh' | 'cf'>('gwh');
	const months = $derived(file ? plantMonths(file, p.plant, p.steps) : null);
	const ys = $derived(months ? years(months) : []);
	const last24 = $derived(months ? lastMonths(months, 24) : []);
	const year12 = $derived(months ? latestYear(months) : null);
	const best = $derived(bestYear(ys));
	const lastMetered = $derived.by(() => {
		if (!file) return null;
		const i = file.src.lastIndexOf('m');
		return i >= 0 ? file.months[i] : null;
	});
	const histEnd = $derived(file?.end ? new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'long', year: 'numeric' }).format(file.end - 1) : '');
	const span = $derived(months?.length ? { first: months[0].m, last: months[months.length - 1].m } : null);
	const partYears = $derived(ys.filter((y) => y.part).map((y) => y.y));
	const yearItems = $derived(ys.map((y) => ({
		label: String(y.y), v: view === 'gwh' ? y.gwh : y.cf ?? 0, part: y.part,
		title: `${y.y}${y.part ? ' (part year)' : ''}: ${fmtGwh(y.gwh)} GWh${isBatt ? ' discharged' : ''}${y.cf != null ? `, capacity factor ${fmtPct(y.cf, 1)}` : ''}`
	})));
	const yearMarks = $derived(span ? capChanges(p.steps, span.first, span.last).map((c: any) => {
		const i = ys.findIndex((y) => y.y === +c.m.slice(0, 4));
		return { at: i + (+c.m.slice(5, 7) - 1) / 12, label: `${fmtMw(c.mw)} MW` };
	}).filter((m: any) => m.at >= 0) : []);
	const monthItems = $derived(last24.map((x: any) => ({
		label: x.m.endsWith('-01') ? monthName(x.m, true) : null, v: x.gwh ?? 0,
		title: `${monthName(x.m)}: ${fmtGwh(x.gwh)} GWh${isBatt ? ' discharged' : ''}${x.cf != null ? `, capacity factor ${fmtPct(x.cf, 1)}` : ''}${x.src === 'dispatch' ? ' (dispatch data)' : ''}`
	})));
	const dispatchFrom = $derived(last24.find((x: any) => x.src === 'dispatch')?.m ?? null);

	onMount(() => {
		let due = 0, stop = () => {};
		if (operating) {
			const load = async () => {
				const r = await fetch(LIVE_URL, { cache: 'no-cache' });
				if (!r.ok) throw new Error(String(r.status));
				const D = await r.json();
				due = nextDue(D.meta.end);
				live = livePlant(D, p.plant);
			};
			load().catch(() => { live = 'error'; });
			const check = () => { clock = Date.now(); if (document.visibilityState === 'visible' && Date.now() >= due) load().catch(() => {}); };
			const t = setInterval(check, CHECK_EVERY);
			document.addEventListener('visibilitychange', check);
			stop = () => { clearInterval(t); document.removeEventListener('visibilitychange', check); };
		}
		fetch(HISTORY_URL).then((r) => (r.ok ? r.json() : null)).then((f) => { file = f; hist = f ? 'ok' : 'none'; }).catch(() => { hist = 'none'; });
		return () => stop();
	});

	const L = $derived(live && live !== 'loading' && live !== 'error' ? live : null);
	const fresh = $derived(!!L && clock - L.end < LIVE_MINUTES * 60_000);
	const pct = $derived(L && p.mw ? Math.abs(L.mw) / p.mw : null);
	const trackerHref = $derived(`/tracker?fuel=${p.fuel}&plant=${toSlug(p.plant)}`);
	const DATE = new Intl.DateTimeFormat('en-NZ', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
	const longDate = (d: string) => DATE.format(new Date(d + 'T00:00:00Z'));
	const relatedOwner = $derived(p.related.owner.length ? (p.related.owner_all ? `${p.owner}'s other plants` : `${p.owner}'s largest other plants`) : '');
	const nSources = $derived(p.sources.length);
	// a fact's note, shown in its ⓘ as a sentence
	const sentence = (t: string) => t[0].toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? '' : '.');
</script>

<svelte:head>
	<title>{p.name} · Plants · ELENZ</title>
	<meta name="description" content={description(p)} />
	{#if !PLANTS_PUBLIC}<meta name="robots" content="noindex" />{/if}
	<Preview title="{p.name} · New Zealand power plants" description={description(p)} path="/plants/{p.slug}" />
</svelte:head>

{#snippet refs(ns: number[])}{#each ns as n}<sup class="ref"><a href="#src-{n}">[{n}]</a></sup>{/each}{/snippet}

<div class="wrap">
	<Masthead />

	<main class="plant" style="--c: var({tok})">
		<div class="head">
			<p class="crumb">Plants › {fuel.name}</p>
			<h1>{p.name}</h1>
			<p class="sub">{subtitle(p)}</p>
			<ul class="tags" aria-label="About this plant">
				<li><span class="sw"></span>{fuel.name}</li>
				<li>{islandName(p.island)}</li>
				{#if p.owner}<li>{p.owner}</li>{/if}
				<li class="st {p.status}">{STATUS[p.status as keyof typeof STATUS]}</li>
				{#if p.mw && p.status !== 'pending'}<li><span class="num">{fmtMw(p.mw)} MW</span>&nbsp;{p.status === 'closed' ? 'when it closed' : 'installed'}</li>{/if}
			</ul>
		</div>

		{#if p.checking}
			<p class="checking" role="note">We’re still checking this page’s facts against their sources. The live and history figures are Elenz’s own. <a href={PLANTS_MD}>How we check plants</a></p>
		{/if}

		{#snippet coords()}<span class="num">{Math.abs(p.location.lat).toFixed(3)}° S, {p.location.lon.toFixed(3)}° E</span>{p.location.basis !== 'station' ? ` · ${p.location.basis}` : ''}{@render refs(p.location.refs)}{/snippet}

		{#if p.images.length || p.location || operating}
			<div class="top">
				{#if p.images.length || p.location}
					<div class="photo"><Media images={p.images} aerial={p.aerial} location={p.location} island={p.island} name={p.name} {tok} note={p.location ? coords : undefined} /></div>
				{/if}
				{#if operating}
					<section class="panel now" class:wide={!p.images.length && !p.location} aria-labelledby="now-h">
						<div class="p-head">
							<h2 id="now-h">Now</h2>
							{#if L}<span class="pill" class:live={fresh}>{fresh ? 'Live' : 'Delayed'}</span><span class="when">{clockOf(L.end)}</span>{/if}
							<span class="p-tip"><InfoTip>
								<p>This shows {p.name}’s output in the newest 5-minute interval and over the last 7 days.</p>
								<ul>
									<li>Output is from the market’s dispatch data, not a meter reading.</li>
									<li>The chart has one point per half-hour.</li>
									{#if p.mw}<li>Dashed line: the installed capacity, {fmtMw(p.mw)} MW.</li>{/if}
									{#if isBatt}<li>Below zero: the battery is charging.</li>{/if}
									{#if L?.est}<li>Part of this station’s output isn’t dispatched, so it is a calculated estimate.</li>{/if}
								</ul>
								<p><a href="/methods/generation">How generation is worked out</a></p>
							</InfoTip></span>
						</div>
						{#if live === 'loading'}
							<p class="quiet">Loading the live data…</p>
						{:else if live === 'error'}
							<p class="quiet">Elenz can’t reach its live data right now. It will try again every minute.</p>
						{:else if !L}
							<p class="quiet">{p.name} isn’t in the live dispatch data. Its output appears in the history once the Electricity Authority publishes each month’s metered data, about 6 weeks after the month.</p>
						{:else}
							<div class="now-body">
								<div class="now-fig">
									<p class="big"><span class="num">{fmtMw(isBatt ? Math.abs(L.mw) : L.mw)}</span> <span class="u">MW</span>{#if isBatt}<span class="dir">{L.mw < -0.05 ? 'charging' : L.mw > 0.05 ? 'discharging' : 'idle'}</span>{/if}{#if L.est}<span class="tag">est.</span>{/if}</p>
									{#if pct != null}
										<p class="of">{fmtPct(pct)} of {fmtMw(p.mw)} MW</p>
										<div class="bar" aria-hidden="true"><div style="width: {Math.min(100, pct * 100)}%"></div></div>
									{/if}
									<p class="avg">Last 7 days: average <b class="num">{fmtMw(L.avg)} MW</b>, range <b class="num">{fmtMw(L.min)}{L.min < 0 ? ' to ' : '–'}{fmtMw(L.max)} MW</b></p>
								</div>
								<Spark half={L.half} cap={p.mw} {tok} label="{p.name}’s output over the last 7 days, between {fmtMw(L.min)} and {fmtMw(L.max)} MW" />
							</div>
							<a class="link" href={trackerHref}>Open {p.name} in the tracker</a>
						{/if}
					</section>
				{/if}
			</div>
		{/if}

		{#if p.status === 'pending'}
			<p class="panel quiet">{p.name} isn’t generating yet. Its page fills in once it appears in the dispatch data.</p>
		{:else if hist === 'ok' && months}
			<div class="panel stats">
				{#if operating && year12}
					<div><span class="v">{fmtGwh(year12.gwh)} GWh</span><span class="k">{isBatt ? 'Discharged' : 'Generated'}, {monthName(year12.from)} to {monthName(year12.to)}</span></div>
					{#if year12.cf != null}<div><span class="v">{fmtPct(year12.cf)}</span><span class="k">Capacity factor, the same 12 months</span></div>{/if}
				{:else if span}
					<div><span class="v">{fmtGwh(ys.reduce((s, y) => s + y.gwh, 0))} GWh</span><span class="k">{isBatt ? 'Discharged' : 'Generated'}, {monthName(span.first)} to {monthName(span.last)}</span></div>
				{/if}
				{#if best}<div><span class="v">{fmtGwh(best.gwh)} GWh</span><span class="k">Most in a calendar year in our records ({best.y})</span></div>{/if}
				{#if p.status === 'closed' && span}<div><span class="v">{monthName(span.last)}</span><span class="k">Last month with output in our records</span></div>{/if}
			</div>
		{/if}

		<div class="cols">
			<div class="main">
				{#if p.about}
					<section aria-labelledby="about-h" class="about">
						<h2 id="about-h">About</h2>
						<p>{p.about.text}{@render refs(p.about.refs)}</p>
					</section>
				{/if}

				{#if p.status !== 'pending'}
				<section class="panel" aria-labelledby="hist-h">
					<div class="p-head">
						<h2 id="hist-h">Generation by year</h2>
						{#if !isBatt}
							<div class="seg" role="group" aria-label="Show">
								<button type="button" aria-pressed={view === 'gwh'} onclick={() => (view = 'gwh')}>Energy</button>
								<button type="button" aria-pressed={view === 'cf'} onclick={() => (view = 'cf')}>Capacity factor</button>
							</div>
						{/if}
						<span class="p-tip"><InfoTip>
							<p>This shows {p.name}’s {isBatt ? 'discharge' : 'generation'} in each calendar year{isBatt ? '' : ', or its capacity factor'}.</p>
							<ul>
								{#if partYears.length}<li>Hatched bars: part years ({partYears.join(', ')}).</li>{/if}
								{#if !isBatt}<li>Capacity factor: the year’s output as a share of what the installed capacity could make if it ran at full capacity all year.</li>{/if}
								{#if yearMarks.length}<li>Dashed lines: where the installed capacity changed.</li>{/if}
								{#if lastMetered}<li>Metered history to {monthName(lastMetered)}, then dispatch data.</li>{/if}
							</ul>
							<p><a href="/methods/history">How the history is built</a></p>
						</InfoTip></span>
					</div>
					{#if hist === 'loading'}
						<p class="quiet hold">Loading the history…</p>
					{:else if hist === 'none'}
						<p class="quiet">Each plant’s history is being worked out. It appears here after the next history update, within 6 hours.</p>
					{:else if !months}
						<p class="quiet">{p.name} has no output in the history.</p>
					{:else}
						<p class="ctx"><span class="chip">{monthName(span!.first)} to {p.status === 'closed' ? monthName(span!.last) : histEnd}</span> {view === 'gwh' ? 'GWh a year' : '% of installed capacity'}</p>
						{#if file.left}<p class="quiet">Some months are still being read into this history ({file.left} to go); it fills in over the next day.</p>{/if}
						<Bars items={yearItems} marks={yearMarks} max={view === 'cf' ? 1 : null} fmt={view === 'gwh' ? fmtGwh : (v) => fmtPct(v)} {tok}
							label="{p.name}’s {view === 'gwh' ? 'generation' : 'capacity factor'} by year, {ys[0]?.y} to {ys[ys.length - 1]?.y}" />
					{/if}
					{#if p.metered}
						<div class="metered">
							<h3>About this plant’s data</h3>
							{#each p.metered.split('\n') as para}<p>{para}</p>{/each}
						</div>
					{/if}
				</section>

				{#if hist === 'ok' && last24.length >= 2}
					<section class="panel" aria-labelledby="mon-h">
						<div class="p-head">
							<h2 id="mon-h">Last {last24.length} months{p.status === 'closed' ? ' in our records' : ''}</h2>
							<span class="p-tip"><InfoTip>
								<p>This shows {p.name}’s {isBatt ? 'discharge' : 'generation'} in each of its last {last24.length} whole months.</p>
								<ul>
									<li>Point at a bar for its figures{isBatt ? '' : ', with its capacity factor'}.</li>
									{#if dispatchFrom}<li>From {monthName(dispatchFrom)}: dispatch data, until the metered data is published.</li>{/if}
								</ul>
								<p><a href="/methods/history">How the history is built</a></p>
							</InfoTip></span>
						</div>
						<p class="ctx"><span class="chip">{monthName(last24[0].m)} to {monthName(last24[last24.length - 1].m)}</span> GWh a month</p>
						<Bars items={monthItems} fmt={fmtGwh} {tok} height={180} label="{p.name}’s generation by month, {monthName(last24[0].m)} to {monthName(last24[last24.length - 1].m)}" />
					</section>
				{/if}

				{#if p.steps.length}
					<section class="panel" id="capacity" aria-labelledby="cap-h">
						<div class="p-head">
							<h2 id="cap-h">Installed capacity over time</h2>
							<span class="p-tip"><InfoTip>
								<p>This shows the installed capacity Elenz counts for {p.name}, and when it changed.</p>
								<ul>
									{#each p.steps as s}
										<li>{fmtMw(s.mw)} MW{s.from ? ` from ${longDate(s.from)}` : ''}{s.to ? ` to ${longDate(s.to)}` : ''}: {#each s.sources as src, i}{i ? '; ' : ''}{#if src.url}<a href={src.url}>{src.label}</a>{:else}{src.label}{/if}{/each}.</li>
									{/each}
								</ul>
								<p><a href="/methods/capacity#table">How installed capacity is counted</a></p>
							</InfoTip></span>
						</div>
						<p class="ctx"><span class="chip">{span ? monthName(span.first) : 'August 1997'} to {p.status === 'closed' && span ? monthName(span.last) : 'now'}</span> MW</p>
						<CapSteps steps={p.steps} first={span?.first ?? '1997-08'} last={p.status === 'closed' && span ? span.last : new Date(clock).toISOString().slice(0, 7)} {tok}
							label="{p.name}’s installed capacity: {p.steps.map((s: any) => `${fmtMw(s.mw)} MW${s.from ? ` from ${monthName(s.from.slice(0, 7))}` : ''}`).join(', ')}" />
					</section>
				{/if}
				{/if}

			</div>

			<aside class="side">
				<section class="panel fact-card" aria-labelledby="facts-h">
					<h2 id="facts-h">Facts</h2>
					<dl class="facts">
						{#if p.mw && p.status !== 'pending'}<div><dt>Installed</dt><dd><span class="num">{fmtMw(p.mw)} MW</span>{p.status === 'closed' ? ' when it closed' : ''}</dd></div>{/if}
						{#if p.owner && !p.facts.some((f: any) => f.k === 'owner')}<div><dt>Owner</dt><dd>{p.owner}</dd></div>{/if}
						{#each p.facts as f}
							<div><dt>{f.label}</dt><dd><span>{f.value}{@render refs(f.refs)}</span>{#if f.note}<span class="f-tip"><InfoTip label="More about {f.label.toLowerCase()}"><p>{sentence(f.note)}</p></InfoTip></span>{/if}</dd></div>
						{/each}
					</dl>
					{#if p.checking}<p class="quiet">More facts appear here once they’re checked.</p>{:else if p.checked}<p class="quiet">Checked {longDate(p.checked)}</p>{/if}
				</section>

				<section class="panel ask" aria-labelledby="share-h">
					<h2 id="share-h">Know {p.name}?</h2>
					<p>If you’ve worked on or with {p.name}, we’d like to hear what you know, and see any photos you’ve taken.</p>
					<a class="link" href="/plants/share?plant={p.slug}">Share what you know</a>
				</section>
			</aside>

			{#if p.related.owner.length || p.related.scheme.length || p.related.fuel.length}
				<section class="panel related" aria-labelledby="rel-h">
					<h2 id="rel-h">Related</h2>
					{#if p.related.scheme.length}
						<div><p class="k">Other stations on the {p.scheme} hydro scheme</p><div class="chips">{#each p.related.scheme as r}<a href="/plants/{r.slug}">{r.name}</a>{/each}</div></div>
					{/if}
					{#if p.related.owner.length}
						<div><p class="k">{relatedOwner}</p><div class="chips">{#each p.related.owner as r}<a href="/plants/{r.slug}">{r.name}</a>{/each}</div></div>
					{/if}
					{#if p.related.fuel.length}
						<div><p class="k">Largest other {kinds(p.fuel)} in the {islandName(p.island)}</p><div class="chips">{#each p.related.fuel as r}<a href="/plants/{r.slug}">{r.name}</a>{/each}</div></div>
					{/if}
				</section>
			{/if}
		</div>

		<section id="sources" class="panel" aria-labelledby="src-h">
			<h2 id="src-h">Sources</h2>
			<ol class="sources">
				{#each p.sources as s}
					<li id="src-{s.n}">{s.publisher ? `${s.publisher}, ` : ''}{#if s.url}<a href={s.url}>{s.title}</a>{:else}{s.title}{/if}.{#if s.opened} Checked {longDate(s.opened)}.{/if}</li>
				{/each}
				<li value={nSources + 1}>Live and history figures, installed capacity and owner: Elenz, from Electricity Authority data (CC BY 4.0). How they’re made: <a href="/methods">Data and methods</a>.</li>
			</ol>
			<p class="report">Spotted something wrong on this page? <ReportLink label="Report it" /></p>
		</section>
	</main>

	<SiteFooter />
</div>

<style>
	.plant { display: grid; gap: 16px; }
	.head { display: grid; gap: 8px; padding-top: 6px; }
	.crumb { margin: 0; color: var(--muted); font-size: 0.82rem; }
	h1 { font-size: clamp(1.8rem, 4vw, 2.5rem); letter-spacing: -0.01em; line-height: 1.1; }
	h2 { font-size: 1.02rem; }
	.sub { margin: 0; color: var(--ink-2); font-size: 1rem; max-width: 62ch; }
	.tags { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
	.tags li { display: inline-flex; align-items: center; gap: 6px; font-size: 0.78rem; color: var(--ink-2); background: var(--grid); border-radius: 3px; padding: 3px 8px; }
	.tags .sw { width: 10px; height: 10px; border-radius: 2px; background: var(--c); }
	.tags .st.operating { background: var(--live-bg); color: var(--live-ink); font-weight: 600; }
	.tags .st.closed, .tags .st.pending { background: var(--warn-bg); color: var(--warn-ink); font-weight: 600; }
	.checking { margin: 0; background: var(--warn-bg); color: var(--warn-ink); border-radius: 4px; padding: 10px 14px; font-size: 0.9rem; line-height: 1.5; }
	.checking a { color: inherit; }

	.panel { background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 14px 16px; min-width: 0; display: grid; gap: 10px; align-content: start; }
	.panel > p, .panel p { margin: 0; }
	.p-head { display: flex; align-items: center; gap: 8px 12px; flex-wrap: wrap; }
	.p-head .p-tip { margin-left: auto; }
	.quiet { color: var(--muted); font-size: 0.86rem; line-height: 1.45; }
	.hold { min-height: 200px; }
	.ctx { color: var(--muted); font-size: 0.8rem; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
	.chip { font-size: 0.78rem; color: var(--ink-2); background: var(--grid); border-radius: 3px; padding: 1px 6px; }
	.link, .panel a { color: var(--accent); }
	.num { font-family: var(--font-data); font-variant-numeric: tabular-nums; }

	.top { display: flex; flex-wrap: wrap; gap: 16px; align-items: stretch; }
	.photo { margin: 0; flex: 999 1 520px; min-width: 0; display: grid; align-content: start; }
	.now { flex: 1 1 300px; }
	.now .when { color: var(--muted); font-size: 0.8rem; }
	.now .pill { height: 24px; font-size: 0.68rem; }
	.now-body { display: grid; gap: 12px; }
	.now.wide .now-body { grid-template-columns: minmax(220px, 300px) minmax(0, 1fr); align-items: end; gap: 12px 28px; }
	@media (max-width: 700px) { .now.wide .now-body { grid-template-columns: minmax(0, 1fr); } }
	.now-fig { display: grid; gap: 8px; }
	.big { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; }
	.big .num { font-size: 2.4rem; font-weight: 500; line-height: 1; }
	.big .u { color: var(--ink-2); font-size: 1rem; }
	.big .dir { color: var(--muted); font-size: 0.9rem; margin-left: 4px; }
	.tag { font-size: 0.68rem; border: 1px solid var(--line); color: var(--muted); border-radius: 4px; padding: 0 6px; margin-left: 4px; }
	.of { color: var(--muted); font-size: 0.86rem; }
	.bar { height: 8px; background: var(--grid); border-radius: 4px; overflow: hidden; }
	.bar div { height: 100%; background: var(--c); }
	.avg { color: var(--ink-2); font-size: 0.82rem; }
	.avg b { font-weight: 500; }

	.stats { display: flex; flex-wrap: wrap; gap: 14px 32px; }
	.stats > div { display: grid; gap: 2px; }
	.stats .v { font-family: var(--font-data); font-variant-numeric: tabular-nums; font-size: 1.35rem; font-weight: 500; }
	.stats .k { font-size: 0.8rem; color: var(--muted); }

	/* phones: the main column, Facts, Related, then the call to share (the side column's cards join the page's grid);
	   wider: Related under the main column, the side column beside both (page review, 19 Nov 2026). The second row takes
	   the side column's extra height, so Related sits right under the charts. */
	.cols { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; }
	.main, .side { min-width: 0; display: grid; gap: 16px; }
	@media (max-width: 899.98px) {
		.side { display: contents; }
		.fact-card { order: 1; }
		.cols > .related { order: 2; }
		.ask { order: 3; }
	}
	@media (min-width: 900px) {
		.cols { grid-template-columns: minmax(0, 1fr) 300px; grid-template-rows: auto 1fr; grid-template-areas: 'main side' 'related side'; }
		.main { grid-area: main; }
		.side { grid-area: side; }
		.cols > .related { grid-area: related; }
	}
	.about { display: grid; gap: 8px; }
	.about h2 { font-size: 1.15rem; }
	.about p { margin: 0; font-size: 1rem; line-height: 1.6; max-width: 68ch; }
	.ref { font-size: 0.7rem; margin-left: 1px; }
	.ref a { color: var(--accent); text-decoration: none; }
	.metered { border-top: 1px solid var(--grid); padding-top: 10px; display: grid; gap: 4px; }
	.metered h3 { font-size: 0.84rem; color: var(--ink-2); }
	.metered p { color: var(--ink-2); font-size: 0.82rem; line-height: 1.5; }

	.facts { margin: 0; }
	.facts > div { display: grid; grid-template-columns: minmax(0, 7rem) minmax(0, 1fr); gap: 4px 10px; padding: 8px 0; border-top: 1px solid var(--grid); }
	.facts dt { color: var(--muted); font-size: 0.84rem; }
	.facts dd { margin: 0; font-size: 0.88rem; line-height: 1.45; }
	.facts dd { display: flex; align-items: flex-start; gap: 4px; }
	.facts dd > span:first-child { flex: 1 1 auto; min-width: 0; }
	.f-tip { flex: none; margin: -4px -6px -4px 0; }
	.ask p { font-size: 0.88rem; line-height: 1.5; color: var(--ink-2); }
	.related > div { display: grid; gap: 6px; }
	.related .k { font-size: 0.82rem; color: var(--muted); }
	.chips { display: flex; flex-wrap: wrap; gap: 6px; }
	.chips a { font-size: 0.84rem; text-decoration: none; border: 1px solid var(--line); border-radius: 3px; padding: 5px 9px; }
	.chips a:hover { border-color: var(--accent); }
	.sources { margin: 0; padding-left: 1.4rem; display: grid; gap: 6px; font-size: 0.86rem; line-height: 1.5; color: var(--ink-2); }
	.report { font-size: 0.84rem; color: var(--ink-2); }
	.report :global(a) { color: var(--accent); }
</style>
