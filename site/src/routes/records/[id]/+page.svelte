<script lang="ts">
	// One record's page: the record, how it grew since 1997, the day it fell, what it beat, and the best for each
	// month of the year. The region is ?region=NI or SI (New Zealand without it).
	import Preview from '#lib/site/Preview.svelte';
	import { onMount } from 'svelte';
	import { replaceState } from '$app/navigation';
	import Masthead from '#lib/site/Masthead.svelte';
	import SiteFooter from '#lib/site/SiteFooter.svelte';
	import Progression from '#lib/records/Progression.svelte';
	import DayChart from '#lib/records/DayChart.svelte';
	import { drawRecord } from '#lib/records/shareImage.js';
	import {
		DEFS, REGIONS, LIVE_URL, MONTHS, def, get, notShown, parts, fmt, when, step, fullName, provisional, liveBeats,
		loadRecords, meteredDue, clock, dayOf, dayLong, monthOf, yearOf, daysBetween, runLength, NEW_DAYS
	} from '#lib/records/records.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const d = $derived(def(data.id)!);

	let R = $state<any>(null);
	let live = $state<any>({});
	let status = $state<'loading' | 'none' | 'ok'>('loading');
	let region = $state('NZ');
	let copied = $state(false);

	onMount(() => {
		const q = new URLSearchParams(location.search).get('region');
		if (q && ['NZ', 'NI', 'SI'].includes(q)) region = q;
		(async () => {
			R = await loadRecords();
			status = R ? 'ok' : 'none';
			if (!R) return;
			try {
				const r = await fetch(LIVE_URL, { cache: 'no-cache' });
				if (r.ok) live = liveBeats(R, await r.json());
			} catch { /* the live check is extra */ }
		})();
	});
	function setRegion(r: string) {
		region = r;
		const u = new URL(location.href);
		if (r === 'NZ') u.searchParams.delete('region');
		else u.searchParams.set('region', r);
		replaceState(u, {});
	}

	const rec = $derived(R ? get(R, d.id, region) : null);
	const na = $derived(R ? notShown(d, region, rec) : null);
	const prov = $derived(R && !na ? provisional(R, live, d.id, region) : null);
	const isNew = $derived(!!rec?.since && Date.now() - rec.since < NEW_DAYS * 864e5);
	const regionName = $derived(REGIONS.find((x) => x.id === region)!.name);
	const f = (v: number) => fmt(d, v);
	const axisFmt = (v: number) => (d.unit === '$' ? '$' + Math.round(v).toLocaleString('en-NZ') : d.unit === '%' ? `${+v.toFixed(1)}%` : Math.round(v).toLocaleString('en-NZ'));
	const ymd = (t: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(t);
	const others = $derived(DEFS.filter((x) => x.group === d.group && x.id !== d.id));

	// one more figure from the record's half-hour, the one that says most about it
	const extra = $derived.by(() => {
		const c = rec?.ctx;
		if (!c || d.kind !== 'hh') return null;
		if (d.id.startsWith('demand')) return c.ren != null ? { k: 'Renewable share then', v: `${c.ren.toFixed(1)}%` } : null;
		if (d.id.startsWith('ren') || d.id === 'fossil_min') return { k: 'Demand then', v: `${c.demand.toLocaleString('en-NZ')} MW` };
		if (['wind_max', 'solar_max', 'roof_max'].includes(d.id)) return c.gen > 0 ? { k: 'Share of generation then', v: `${((100 * rec.v) / c.gen).toFixed(1)}%` } : null;
		if (d.id === 'price_max' || d.id === 'gap_max') return { k: 'Haywards · Benmore', v: `$${Math.round(c.hay).toLocaleString('en-NZ')} · $${Math.round(c.ben).toLocaleString('en-NZ')}` };
		if (d.id.startsWith('hvdc')) return { k: 'Haywards price then', v: `$${Math.round(c.hay).toLocaleString('en-NZ')}/MWh` };
		return null;
	});
	const history = $derived(rec?.steps ? rec.steps.slice(-8).reverse().map((s: [number, number], i: number) => {
		const before = rec.steps[rec.steps.length - 2 - i];
		return { t: s[0], v: s[1], by: before ? Math.abs(s[1] - before[1]) : null, first: !before };
	}) : []);
	const moy = $derived(R && d.kind !== 'run' ? (R.moy?.[d.id]?.[region] ?? []) : []);

	async function copyLink() {
		try { await navigator.clipboard.writeText(location.href); copied = true; setTimeout(() => (copied = false), 2000); } catch { /* no clipboard: the address bar has it */ }
	}
	async function download() {
		const c = document.createElement('canvas');
		await drawRecord(c, { d, region, rec, end: R.end, isNew });
		c.toBlob((b) => {
			if (!b) return;
			const a = document.createElement('a');
			a.href = URL.createObjectURL(b);
			a.download = `elenz-record-${d.id}-${region.toLowerCase()}.png`;
			a.click();
			setTimeout(() => URL.revokeObjectURL(a.href), 1000);
		}, 'image/png');
	}
</script>

<svelte:head>
	<title>{fullName(d)} · Records · ELENZ</title>
	<meta name="description" content="New Zealand's electricity record for {fullName(d).toLowerCase()} since 1997, for New Zealand and each island: the record, how it grew, and the day it fell." />
	<Preview title="{fullName(d)} · New Zealand electricity records" description="New Zealand's electricity record for {fullName(d).toLowerCase()} since 1997, for New Zealand and each island: the record, how it grew, and the day it fell." path="/records/{data.id}" />
</svelte:head>

<div class="wrap">
	<Masthead />

	<main class="rec-one">
		<div class="head">
			<p class="crumb"><a href="/records{region === 'NZ' ? '' : `?region=${region}`}">Records</a> › {d.group}</p>
			<div class="h-row">
				<h1><span class="dot" style="--c:var({d.tok})"></span>{fullName(d)}{#if d.est}<span class="tag est">Estimate</span>{/if}</h1>
				<div class="seg" role="group" aria-label="Region">
					{#each REGIONS as r}
						<button type="button" aria-pressed={region === r.id} onclick={() => setRegion(r.id)}>{r.name}</button>
					{/each}
				</div>
			</div>
			<p class="sub">{d.sub}</p>
		</div>

		{#if status === 'loading'}
			<p class="note" role="status">Loading the record…</p>
		{:else if status === 'none'}
			<section class="panel"><p>The records will appear once the history rebuild finishes, in the next few days.</p></section>
		{:else if na || !rec}
			<section class="panel"><p>{na ?? 'No record yet'} ({regionName}).</p><p><a href="/records">All records</a></p></section>
		{:else}
			<section class="panel hero-rec" aria-label="The record">
				<div class="big">
					<span class="lbl">{regionName}{#if isNew} <span class="tag new">New</span>{/if}</span>
					<span class="val">{parts(d, rec.v).n}<small>{parts(d, rec.v).u}</small></span>
					<span class="when">{d.kind === 'run' ? runLength(rec.v) + ', ' : ''}{when(d, rec, true)}</span>
				</div>
				<dl class="stats">
					{#if d.kind === 'run'}
						{#if rec.top?.[1]}<div><dt>Next longest</dt><dd>{parts(d, rec.top[1][1]).n} hours</dd><dd class="s">from {dayOf(rec.top[1][0])}</dd></div>{/if}
					{:else if rec.prev}
						<div><dt>Previous record</dt><dd>{f(rec.prev[1])}</dd><dd class="s">{d.kind === 'month' ? monthOf(rec.prev[0]) : dayOf(rec.prev[0])}</dd></div>
					{/if}
					{#if !rec.ongoing}
						<div><dt>Has stood for</dt><dd>{daysBetween(d.kind === 'run' ? rec.t + rec.v * 36e5 : rec.t, Date.now()).toLocaleString('en-NZ')} days</dd><dd class="s">as of today</dd></div>
					{/if}
					<div><dt>Broken</dt><dd>{rec.n} {rec.n === 1 ? 'time' : 'times'}</dd><dd class="s">since {monthOf(R.first)}</dd></div>
					{#if extra}<div><dt>{extra.k}</dt><dd>{extra.v}</dd></div>{/if}
				</dl>
			</section>

			{#if prov}
				<section class="prov" aria-label="Provisional record">
					<span class="tag provtag">Provisional</span>
					<p>{prov.src === 'live' ? 'Live data shows' : 'Dispatch data shows'} <b>{f(prov.v)}</b>
						{d.kind === 'hh' ? `in the ${clock(prov.t)} half-hour on ${dayOf(prov.t)}` : d.kind === 'run' ? `from ${dayOf(prov.t)}` : `in ${monthOf(prov.t)}`},
						beyond the record. Dispatch data runs a little above the metered data, so it is confirmed or dropped when the EA publishes the metered data, around {meteredDue(prov.t)}.</p>
				</section>
			{/if}

			<section class="panel" aria-labelledby="grow-h">
				<div class="p-head"><h2 id="grow-h">How the record grew</h2><span class="unit">Each step is a new record</span></div>
				<Progression steps={rec.steps} first={R.first} end={R.end} tok={d.tok} fmt={axisFmt} dashed={!!d.est} prov={prov ? { t: prov.t, v: prov.v } : null}
					label="{fullName(d)}, {regionName}: the record over time, from {f(rec.steps[0][1])} in {yearOf(rec.steps[0][0])} to {f(rec.v)} in {yearOf(rec.t)}, broken {rec.n} times" />
			</section>

			<div class="two">
				{#if d.kind === 'hh' && rec.ctx}
					{@const c = rec.ctx}
					<section class="panel" aria-labelledby="day-h">
						<div class="p-head"><h2 id="day-h">The day it fell</h2><a class="link" href="/tracker?region={region}&range=30d&end={ymd(rec.t)}">Open in the tracker</a></div>
						<DayChart day={c.day} t={rec.t} tok={d.tok} fmt={axisFmt} label="{fullName(d)} through {dayLong(rec.t)}, half-hourly, peaking at {f(rec.v)} at {clock(rec.t)}" />
						<dl class="facts">
							<div><dt>Demand</dt><dd>{c.demand.toLocaleString('en-NZ')} MW</dd></div>
							<div><dt>Generation</dt><dd>{c.gen.toLocaleString('en-NZ')} MW</dd></div>
							{#if c.ren != null}<div><dt>Renewable</dt><dd>{c.ren.toFixed(1)}%</dd></div>{/if}
							<div><dt>Prices</dt><dd>HAY ${Math.round(c.hay).toLocaleString('en-NZ')} · BEN ${Math.round(c.ben).toLocaleString('en-NZ')}</dd></div>
							{#if c.hvdc != null}<div><dt>HVDC</dt><dd>{Math.abs(c.hvdc).toLocaleString('en-NZ')} MW {c.hvdc > 0 ? 'north' : c.hvdc < 0 ? 'south' : ''}</dd></div>{/if}
							{#if c.top?.length}<div class="wide"><dt>Biggest {d.id === 'wind_max' ? 'wind farms' : 'solar farms'}</dt><dd>{c.top.map((p: [string, number]) => `${p[0]} ${p[1]} MW`).join(', ')}</dd></div>{/if}
						</dl>
						<p class="note">In the {clock(rec.t)} half-hour, {regionName === 'New Zealand' ? 'across New Zealand' : `in the ${regionName}`}: metered generation and demand, final prices.</p>
					</section>
				{/if}

				<section class="panel" aria-labelledby="prev-h">
					{#if d.kind === 'run'}
						<h2 id="prev-h">Longest runs</h2>
						<table class="lst">
							<thead><tr><th scope="col">From</th><th scope="col">To</th><th scope="col" class="n">Hours</th></tr></thead>
							<tbody>
								{#each rec.top as [t, h, ongoing]}
									<tr><td>{dayOf(t)}</td><td>{ongoing ? 'still going' : dayOf(t + h * 36e5)}</td><td class="n">{parts(d, h).n}</td></tr>
								{/each}
							</tbody>
						</table>
					{:else}
						<h2 id="prev-h">Recent records</h2>
						<table class="lst">
							<thead><tr><th scope="col">{d.kind === 'month' ? 'Month' : 'Half-hour'}</th><th scope="col" class="n">Record</th><th scope="col" class="n">{d.id.endsWith('_min') ? 'Down' : 'Up'}</th></tr></thead>
							<tbody>
								{#each history as h}
									<tr><td>{d.kind === 'month' ? monthOf(h.t) : `${clock(h.t)}, ${dayOf(h.t)}`}</td><td class="n">{f(h.v)}</td><td class="n muted">{h.first ? 'first' : d.unit === '%' ? (h.by ?? 0).toFixed(1) : parts(d, h.by ?? 0).n}</td></tr>
								{/each}
							</tbody>
						</table>
						{#if rec.n > 8}<p class="note">The {rec.n - 7} before these are on the chart above.</p>{/if}
					{/if}
				</section>
			</div>

			{#if moy.length}
				<section class="panel" aria-labelledby="moy-h">
					<div class="p-head"><h2 id="moy-h">Best for each month of the year</h2><span class="unit">{regionName}</span></div>
					<div class="moy">
						{#each MONTHS as m, i}
							{@const tv = moy[i]}
							<div class="mcell"><span class="m">{m.slice(0, 3)}</span><span class="v">{tv ? parts(d, tv[1]).n : '–'}</span><span class="y">{tv ? yearOf(tv[0]) : ''}</span></div>
						{/each}
					</div>
				</section>
			{/if}

			<div class="share">
				<div class="btns">
					<button type="button" class="btn" onclick={copyLink}>{copied ? 'Link copied' : 'Copy link'}</button>
					<button type="button" class="btn" onclick={download}>Download image</button>
				</div>
				<span class="note">Half-hour averages from the EA’s metered data and final prices. <a href="/methods/records">How records work</a></span>
			</div>
		{/if}

		<nav class="others" aria-label="Other {d.group.toLowerCase()} records">
			<h2>Other {d.group.toLowerCase()} records</h2>
			<ul>
				{#each others as o}
					<li><a href="/records/{o.id}{region === 'NZ' ? '' : `?region=${region}`}"><span class="dot" style="--c:var({o.tok})"></span>{fullName(o)}</a></li>
				{/each}
				<li><a href="/records{region === 'NZ' ? '' : `?region=${region}`}">All records</a></li>
			</ul>
		</nav>
	</main>

	<SiteFooter />
</div>

<style>
	.rec-one { display: grid; gap: 14px; }
	.head { display: grid; gap: 6px; padding-block: 6px 2px; }
	.crumb { margin: 0; color: var(--muted); font-size: 0.82rem; }
	.crumb a, .link, .others a, .note a { color: var(--accent); }
	.h-row { display: flex; align-items: center; justify-content: space-between; gap: 10px 16px; flex-wrap: wrap; }
	h1 { font-size: 1.6rem; letter-spacing: -0.02em; line-height: 1.15; display: flex; align-items: center; flex-wrap: wrap; }
	.sub { margin: 0; color: var(--ink-2); }
	.seg button { min-height: 32px; padding-inline: 12px; font-size: 0.84rem; }
	.dot { display: inline-block; flex: none; width: 12px; height: 12px; border-radius: 50%; background: var(--c); margin-right: 10px; }
	.tag { display: inline-block; font-size: 0.68rem; font-weight: 600; letter-spacing: 0.03em; padding: 1px 7px; border-radius: 999px; background: var(--grid); color: var(--ink-2); margin-left: 8px; white-space: nowrap; }
	.tag.new { background: var(--warn-bg); color: var(--warn-ink); }
	.tag.est { background: transparent; border: 1px solid var(--line); color: var(--muted); }
	.tag.provtag { background: transparent; border: 1px dashed var(--warn-ink); color: var(--warn-ink); margin-left: 0; }

	.panel { background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 14px; min-width: 0; display: grid; gap: 10px; align-content: start; }
	.panel p { margin: 0; }
	.p-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
	h2 { font-size: 1rem; }
	.unit, .note { color: var(--muted); font-size: 0.8rem; }
	.note { margin: 0; }

	.hero-rec { grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 16px 32px; padding: 18px 20px; }
	.big { display: grid; gap: 6px; }
	.lbl { color: var(--ink-2); font-size: 0.82rem; font-weight: 600; }
	.big .val { font-family: var(--font-data); font-size: 3rem; font-weight: 600; letter-spacing: -0.03em; line-height: 1; }
	.big .val small { font-family: var(--font-ui); font-size: 1.1rem; font-weight: 500; color: var(--muted); margin-left: 8px; letter-spacing: 0; }
	.when { color: var(--ink-2); }
	.stats { display: grid; grid-template-columns: repeat(2, minmax(0, auto)); gap: 14px 36px; margin: 0; }
	.stats dt, .facts dt { color: var(--muted); font-size: 0.76rem; }
	.stats dd { margin: 2px 0 0; font-family: var(--font-data); font-size: 1.1rem; font-weight: 600; }
	.stats dd.s { font-family: var(--font-ui); font-size: 0.78rem; font-weight: 400; color: var(--muted); margin-top: 0; }

	.prov { display: flex; align-items: baseline; gap: 10px; padding: 10px 14px; border: 1px dashed color-mix(in srgb, var(--warn-ink) 55%, var(--line)); background: color-mix(in srgb, var(--warn-bg) 45%, var(--surface)); border-radius: 4px; }
	.prov p { margin: 0; color: var(--ink-2); font-size: 0.86rem; }

	.two { display: flex; gap: 14px; flex-wrap: wrap; align-items: start; }
	.two > :first-child { flex: 999 1 520px; }
	.two > :last-child { flex: 1 1 320px; }
	.two > .panel { min-width: 0; }
	.facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px 16px; margin: 0; }
	.facts dd { margin: 2px 0 0; font-family: var(--font-data); font-size: 0.9rem; }
	.facts .wide { grid-column: 1 / -1; }
	.facts .wide dd { font-family: var(--font-ui); }

	.lst { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
	.lst th { text-align: left; color: var(--muted); font-weight: 600; font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; padding: 4px 0; border-bottom: 1px solid var(--line); }
	.lst td { padding: 7px 0; border-bottom: 1px solid var(--grid); }
	.lst tr:last-child td { border-bottom: 0; }
	.lst .n { text-align: right; font-family: var(--font-data); padding-left: 14px; white-space: nowrap; }
	.lst th.n { font-family: var(--font-ui); }
	.muted { color: var(--muted); }

	.moy { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 6px; }
	.mcell { display: grid; gap: 2px; text-align: center; padding: 8px 2px; border-radius: 4px; background: color-mix(in srgb, var(--grid) 55%, transparent); }
	.mcell .m { font-size: 0.72rem; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
	.mcell .v { font-family: var(--font-data); font-size: 0.86rem; font-weight: 600; }
	.mcell .y { font-size: 0.72rem; color: var(--muted); }

	.share { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; border-top: 1px solid var(--line); padding-top: 14px; }
	.btns { display: flex; gap: 8px; }
	.btn { font: inherit; font-size: 0.86rem; font-weight: 600; padding: 9px 14px; min-height: 40px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 4px; cursor: pointer; }
	.btn:hover { border-color: var(--ink-2); }

	.others h2 { font-size: 0.9rem; margin-bottom: 6px; }
	.others ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px 18px; }
	.others a { display: inline-flex; align-items: center; font-size: 0.86rem; }
	.others .dot { width: 9px; height: 9px; margin-right: 6px; }

	@media (max-width: 760px) {
		.hero-rec { grid-template-columns: minmax(0, 1fr); }
		.moy { grid-template-columns: repeat(6, minmax(0, 1fr)); }
	}
	@media (max-width: 640px) {
		h1 { font-size: 1.3rem; }
		.big .val { font-size: 2.3rem; }
		.seg button { padding-inline: 9px; }
	}
</style>
