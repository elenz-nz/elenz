<script lang="ts">
	import { onMount } from 'svelte';
	import Masthead from '#lib/site/Masthead.svelte';
	import SiteFooter from '#lib/site/SiteFooter.svelte';
	import { summarise } from '#lib/home/now.js';
	import { VIEW, NI as NI_PATH, SI as SI_PATH, PTS } from '#lib/home/nzmap.js';

	const DATA_URL = '/data/tracker.json';
	const LIVE_MINUTES = 15;

	type Fuel = { k: string; name: string; tok: string; hatch?: number; tag?: string; mw: number };
	type Region = { fuels: Record<string, number>; gen: number; ren: number; co2: number; demand: number; underlying: number;
		price?: number; roof: number; roofU: number; tiwai?: number };
	type Now = { t: number; end: number; regions: { NZ: Region; NI: Region; SI: Region }; hvdc: { mid: number; ni: number; si: number }; mix: Fuel[] };

	let now = $state<Now | null>(null);
	let error = $state('');
	let clock = $state(Date.now());

	const PARTS = new Intl.DateTimeFormat('en-NZ', {
		timeZone: 'Pacific/Auckland', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true
	});
	const parts = (t: number) => Object.fromEntries(PARTS.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
	const clockOnly = (t: number) => { const p = parts(t); return `${p.hour}:${p.minute} ${String(p.dayPeriod).toLowerCase()}`; };
	const when = (t: number) => { const p = parts(t); return `${p.hour}:${p.minute} ${String(p.dayPeriod).toLowerCase()} ${p.weekday} ${p.day} ${p.month}`; };
	const fmt = (v: number) => Math.round(v).toLocaleString('en-NZ');
	const money = (v: number) => (v < 0 ? '−$' : '$') + Math.abs(v).toLocaleString('en-NZ', { maximumFractionDigits: v >= 100 || v <= -100 ? 0 : 2, minimumFractionDigits: v >= 100 || v <= -100 ? 0 : 2 });

	const live = $derived(now !== null && (clock - now.end) / 60000 < LIVE_MINUTES);
	const nz = $derived(now?.regions.NZ);
	const hv = $derived(now ? now.hvdc.mid : 0);
	const hvDir = $derived(Math.abs(hv) < 1 ? '' : hv > 0 ? 'north' : 'south');

	// HVDC route on the map: Benmore, up the east of the South Island to the Cook Strait cable, then Haywards
	const [bx, by] = PTS.ben, [hx, hy] = PTS.hay;
	const HV_PATH = `M${bx},${by} C${bx + 60},${by - 40} ${hx - 40},${hy + 70} ${hx},${hy}`;
	const HV_MID = { x: (bx + 3 * (bx + 60) + 3 * (hx - 40) + hx) / 8, y: (by + 3 * (by - 40) + 3 * (hy + 70) + hy) / 8 };
	// the map's viewBox is wider than New Zealand, leaving room for the island cards on the right; on phones the cards
	// sit below the map, so the viewBox is cropped to the land
	let narrow = $state(false);
	const W = $derived(narrow ? VIEW.w + 20 : 640);
	const pct = (x: number, y: number) => `left:${(x / W) * 100}%;top:${(y / VIEW.h) * 100}%`;
	const hvNote = (code: string, mw: number) => {
		const m = fmt(Math.abs(mw));
		if (Math.abs(mw) < 1) return 'No transfer over the HVDC';
		return code === 'NI' ? (mw > 0 ? `Receives ${m} MW from the South Island over the HVDC` : `Sends ${m} MW south over the HVDC`)
			: (mw > 0 ? `Sends ${m} MW north over the HVDC` : `Receives ${m} MW from the North Island over the HVDC`);
	};
	const hvWidth = $derived(2 + Math.min(1, Math.abs(hv) / 1200) * 6);

	// each island's generation by fuel, as a thin stacked bar
	const barOf = (r: Region) => {
		const parts = (now?.mix ?? []).map((f) => ({ ...f, mw: Math.max(0, r.fuels[f.k] ?? 0) })).filter((f) => f.mw > 0.5);
		const total = parts.reduce((a, f) => a + f.mw, 0) || 1;
		return parts.map((f) => ({ ...f, pct: (f.mw / total) * 100 }));
	};

	onMount(() => {
		const mq = matchMedia('(max-width: 640px)');
		const fit = () => (narrow = mq.matches);
		fit();
		mq.addEventListener('change', fit);
		let stamp = 0;
		async function load() {
			const r = await fetch(DATA_URL, { cache: 'no-cache' });
			if (!r.ok) throw new Error(`The data file returned ${r.status}.`);
			const D = await r.json();
			if (D.meta.end === stamp) return;
			stamp = D.meta.end;
			now = summarise(D) as Now;
			error = '';
		}
		load().catch((e) => (error = `The data couldn't be loaded. ${e.message} Try reloading the page.`));
		// new data lands every 5 minutes; check every 2 minutes while the page is on screen, and on return
		const check = () => {
			clock = Date.now();
			if (document.visibilityState === 'visible') load().catch(() => {});
		};
		const poll = setInterval(check, 120_000);
		document.addEventListener('visibilitychange', check);
		return () => { clearInterval(poll); document.removeEventListener('visibilitychange', check); mq.removeEventListener('change', fit); };
	});
</script>

<svelte:head>
	<title>ELENZ · New Zealand's electricity, right now</title>
	<meta name="description" content="New Zealand's electricity right now: demand, prices, the generation mix, renewable share, emissions and the HVDC link, live from the Electricity Authority's market data." />
</svelte:head>

<div class="wrap">
	<Masthead />

	<main class="home">
		<section class="hero" aria-labelledby="home-h">
			<div>
				<h1 id="home-h">New Zealand's electricity, right now</h1>
				<p class="lede">Live from the Electricity Authority's dispatch data, every five minutes. <a href="/tracker">Open the tracker</a> for history back to 2020, every plant, and prices.</p>
			</div>
			<div class="status">
				{#if error}
					<span class="tstatus" role="status">{error}</span>
				{:else if !now}
					<span class="tstatus" role="status">Loading the latest data…</span>
				{:else if live}
					<span class="pill live" title="Data to {when(now.end)}, from the EMI real-time dispatch feed">Live · {clockOnly(now.end)}</span>
				{:else}
					<span class="pill stale" title="The newest data is more than {LIVE_MINUTES} minutes old">Delayed · {when(now.end)}</span>
				{/if}
			</div>
		</section>

		<section class="kpis" aria-label="New Zealand right now">
			<div class="kpi">
				<span class="k-lbl">Demand</span>
				<span class="k-val">{nz ? fmt(nz.demand) : '–'}<small>MW</small></span>
				<span class="k-sub">{nz ? `${fmt(nz.underlying)} MW with embedded solar` : ''}</span>
			</div>
			<div class="kpi">
				<span class="k-lbl">Renewable share</span>
				<span class="k-val">{nz ? nz.ren.toFixed(1) : '–'}<small>%</small></span>
				<span class="k-sub">of generation</span>
			</div>
			<div class="kpi">
				<span class="k-lbl">Wholesale price</span>
				<span class="k-val prices">
					<span><b class="isl">NI</b>{now ? money(now.regions.NI.price ?? 0) : '–'}</span>
					<span><b class="isl">SI</b>{now ? money(now.regions.SI.price ?? 0) : '–'}</span>
				</span>
				<span class="k-sub">per MWh at Haywards and Benmore</span>
			</div>
			<div class="kpi">
				<span class="k-lbl">HVDC</span>
				<span class="k-val">{now ? fmt(Math.abs(hv)) : '–'}<small>MW {hvDir}</small></span>
				<span class="k-sub">{hvDir === 'north' ? 'South Island to North Island' : hvDir === 'south' ? 'North Island to South Island' : 'between the islands'}</span>
			</div>
			<div class="kpi">
				<span class="k-lbl">Emissions intensity</span>
				<span class="k-val">{nz ? fmt(nz.co2) : '–'}<small>g CO₂e/kWh</small></span>
				<span class="k-sub">provisional factors</span>
			</div>
			<div class="kpi">
				<span class="k-lbl">Embedded solar <span class="tag">est.</span></span>
				<span class="k-val">{nz ? fmt(nz.roof) : '–'}<small>MW{nz && nz.roofU > 0.5 ? ` ± ${fmt(nz.roofU)}` : ''}</small></span>
				<span class="k-sub">rooftops and small arrays on local networks</span>
			</div>
		</section>

		<div class="grid">
			<section class="panel map-panel" aria-labelledby="map-h">
				<div class="p-head"><h2 id="map-h">The two islands</h2><span class="unit">MW, $/MWh</span></div>
				<div class="map" style="aspect-ratio: {W} / {VIEW.h}">
					<svg viewBox="0 0 {W} {VIEW.h}" role="img"
						aria-label={now ? `Map of New Zealand. North Island: generation ${fmt(now.regions.NI.gen)} MW, demand ${fmt(now.regions.NI.demand)} MW, price ${money(now.regions.NI.price ?? 0)} per MWh. South Island: generation ${fmt(now.regions.SI.gen)} MW, demand ${fmt(now.regions.SI.demand)} MW, price ${money(now.regions.SI.price ?? 0)} per MWh. HVDC ${fmt(Math.abs(hv))} MW ${hvDir}.` : 'Map of New Zealand'}>
						<path class="land" d={NI_PATH} />
						<path class="land" d={SI_PATH} />
						<path class="hv-line" d={HV_PATH} style="stroke-width:{hvWidth}" />
						{#if hvDir}
							<path class="hv-flow {hvDir}" d={HV_PATH} style="stroke-width:{hvWidth}" />
							{#if hvDir === 'north'}
								<circle class="hv-end" cx={hx} cy={hy} r={hvWidth + 2} />
							{:else}
								<circle class="hv-end" cx={bx} cy={by} r={hvWidth + 2} />
							{/if}
						{/if}
						<circle class="node" cx={bx} cy={by} r="4" /><text class="node-lbl" x={bx - 8} y={by + 18} text-anchor="middle">Benmore</text>
						<circle class="node" cx={hx} cy={hy} r="4" /><text class="node-lbl" x={hx + 8} y={hy - 9}>Haywards</text>
					</svg>
					{#if now}
						<div class="hv-tag" style={pct(HV_MID.x + 14, HV_MID.y)}>
							<b>HVDC</b> {fmt(Math.abs(hv))} MW {hvDir === 'north' ? '↑ north' : hvDir === 'south' ? '↓ south' : ''}
						</div>
						{#each [['NI', 'North Island', 'Haywards', 'ni', now.regions.NI], ['SI', 'South Island', 'Benmore', 'si', now.regions.SI]] as [code, name, node, cls, r]}
							{@const R = r as Region}
							<div class="icard {cls}">
								<h3>{name}</h3>
								<div class="ibar" aria-hidden="true">
									{#each barOf(R) as f}<span class:hatch={f.hatch} style="--c:var({f.tok});width:{f.pct}%" title="{f.name} {fmt(f.mw)} MW"></span>{/each}
								</div>
								<dl>
									<dt>Generation</dt><dd>{fmt(R.gen)} <small>MW</small></dd>
									<dt>Demand</dt><dd>{fmt(R.demand)} <small>MW</small></dd>
									<dt>Price</dt><dd>{money(R.price ?? 0)} <small>/MWh</small></dd>
									<dt>Renewables</dt><dd>{R.ren.toFixed(1)}<small>%</small></dd>
								</dl>
								<p class="inote">{hvNote(code as string, code === 'NI' ? now.hvdc.ni : now.hvdc.si)}. Price at {node}.</p>
							</div>
						{/each}
					{/if}
				</div>
			</section>

			<section class="panel mix-panel" aria-labelledby="mix-h">
				<div class="p-head"><h2 id="mix-h">Generation now</h2><span class="unit">{nz ? `${fmt(nz.gen)} MW` : ''}</span></div>
				{#if now && nz}
					<div class="stack" aria-hidden="true">
						{#each now.mix as f}<span class:hatch={f.hatch} style="--c:var({f.tok});width:{(f.mw / nz.gen) * 100}%" title="{f.name} {fmt(f.mw)} MW"></span>{/each}
					</div>
					<table class="mixtab">
						<thead><tr><th scope="col">Source</th><th scope="col" class="n">MW</th><th scope="col" class="n">Share</th></tr></thead>
						<tbody>
							{#each now.mix as f}
								<tr>
									<td><span class="sw" class:hatch={f.hatch} style="--c:var({f.tok})"></span>{f.name}{#if f.tag} <span class="tag">{f.tag}</span>{/if}</td>
									<td class="n">{fmt(f.mw)}</td>
									<td class="n"><span class="share"><span>{((f.mw / nz.gen) * 100).toFixed(1)}%</span><span class="bar" style="--c:var({f.tok});transform:scaleX({f.mw / now.mix[0].mw})"></span></span></td>
								</tr>
							{/each}
						</tbody>
						<tfoot><tr><th scope="row">Total</th><td class="n">{fmt(nz.gen)}</td><td class="n">100%</td></tr></tfoot>
					</table>
					<p class="mix-note">Battery counts while discharging. Generation is dispatch, the market's 5-minute targets; embedded solar is estimated.</p>
					<a class="cta" href="/tracker">See the last 24 hours in the tracker →</a>
				{:else}
					<p class="mix-note">{error || 'Loading…'}</p>
				{/if}
			</section>
		</div>
	</main>

	<SiteFooter />
</div>

<style>
	.home { display: grid; gap: 14px; }
	.hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px 20px; flex-wrap: wrap; padding-block: 6px 2px; }
	.hero h1 { margin: 0; font-size: 1.6rem; letter-spacing: -0.02em; line-height: 1.15; }
	.lede { margin: 6px 0 0; color: var(--ink-2); max-width: 70ch; }
	.lede a, .cta { color: var(--accent); font-weight: 600; }
	.status { margin-left: 0; }

	.kpis { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; }
	.kpi { background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 12px 14px; display: grid; gap: 3px; align-content: start; min-width: 0; }
	.k-lbl { color: var(--ink-2); font-size: 0.8rem; font-weight: 600; }
	.k-val { font-family: var(--font-data); font-size: 1.7rem; font-weight: 600; letter-spacing: -0.02em; line-height: 1.15; white-space: nowrap; }
	.k-val small { font-family: var(--font-ui); font-size: 0.78rem; font-weight: 500; color: var(--muted); margin-left: 5px; letter-spacing: 0; }
	.k-val.prices { display: grid; gap: 2px; font-size: 1.25rem; }
	.k-val .isl { font-family: var(--font-ui); font-size: 0.72rem; font-weight: 700; color: var(--muted); margin-right: 7px; letter-spacing: 0.04em; }
	.k-sub { color: var(--muted); font-size: 0.76rem; }
	.tag { font-size: 0.68rem; color: var(--muted); letter-spacing: 0.04em; font-weight: 500; margin-left: 4px; }

	.grid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 14px; align-items: start; }
	.panel { background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 14px; min-width: 0; }
	.p-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px; }
	.p-head h2 { margin: 0; font-size: 1rem; }
	.unit { color: var(--muted); font-size: 0.8rem; font-family: var(--font-data); }

	.map { position: relative; width: 100%; max-width: 680px; margin-inline: auto; }
	.map svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
	.land { fill: var(--grid); stroke: var(--line); stroke-width: 1; stroke-linejoin: round; }
	.hv-line { fill: none; stroke: color-mix(in srgb, var(--f-hvdc) 45%, transparent); stroke-linecap: round; }
	.hv-flow { fill: none; stroke: var(--f-hvdc); stroke-linecap: round; stroke-dasharray: 2 14; animation: flow 1.6s linear infinite; }
	.hv-flow.south { animation-direction: reverse; }
	@keyframes flow { to { stroke-dashoffset: -32; } }
	@media (prefers-reduced-motion: reduce) { .hv-flow { animation: none; } }
	.hv-end { fill: var(--f-hvdc); }
	.node { fill: var(--surface); stroke: var(--ink-2); stroke-width: 1.5; }
	.node-lbl { fill: var(--ink-2); font-size: 12px; font-family: var(--font-ui); }
	.hv-tag { position: absolute; transform: translateY(-50%); font-size: 0.78rem; color: var(--ink-2); background: color-mix(in srgb, var(--surface) 85%, transparent); padding: 1px 6px; border-radius: 3px; white-space: nowrap; font-family: var(--font-data); }
	.hv-tag b { font-family: var(--font-ui); color: var(--ink); }

	.icard { position: absolute; width: 35%; background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 10px 12px; box-shadow: 0 4px 14px rgb(0 0 0 / 0.06); display: grid; gap: 7px; }
	.icard.ni { left: 65%; top: 6%; }
	.icard.si { left: 65%; top: 58%; }
	.icard h3 { margin: 0; font-size: 0.92rem; }
	.icard dl { display: grid; grid-template-columns: 1fr auto; gap: 3px 10px; margin: 0; font-size: 0.84rem; }
	.icard dt { color: var(--ink-2); }
	.icard dd { margin: 0; text-align: right; font-family: var(--font-data); }
	.icard dd small, .mixtab small { color: var(--muted); font-family: var(--font-ui); }
	.inote { margin: 0; color: var(--muted); font-size: 0.74rem; }
	.ibar, .stack { display: flex; height: 8px; border-radius: 2px; overflow: hidden; background: var(--grid); }
	.stack { height: 14px; margin: 2px 0 10px; }
	.ibar span, .stack span { background: var(--c); height: 100%; }
	.hatch { background: repeating-linear-gradient(135deg, var(--c) 0 2px, color-mix(in srgb, var(--c) 30%, transparent) 2px 4px) !important; }

	.mixtab { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
	.mixtab th { text-align: left; color: var(--muted); font-weight: 600; font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; padding: 4px 0; border-bottom: 1px solid var(--line); }
	.mixtab td { padding: 6px 0; border-bottom: 1px solid var(--grid); }
	.mixtab tfoot th, .mixtab tfoot td { padding-top: 8px; border: 0; font-weight: 700; color: var(--ink); text-transform: none; letter-spacing: 0; font-size: 0.86rem; }
	.mixtab .n { text-align: right; font-family: var(--font-data); }
	.mixtab th.n { font-family: var(--font-ui); }
	.sw { display: inline-block; width: 11px; height: 11px; border-radius: 3px; background: var(--c); margin-right: 8px; vertical-align: -1px; }
	.share { display: inline-grid; justify-items: end; gap: 2px; min-width: 70px; }
	.bar { height: 3px; border-radius: 2px; background: var(--c); justify-self: stretch; transform-origin: right; }
	.mix-note { color: var(--muted); font-size: 0.76rem; margin: 10px 0 6px; }
	.cta { display: inline-block; font-size: 0.86rem; }

	@media (max-width: 1100px) {
		.kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
	}
	@media (max-width: 920px) {
		.grid { grid-template-columns: minmax(0, 1fr); }
	}
	@media (max-width: 640px) {
		.hero h1 { font-size: 1.3rem; }
		.kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
		.k-val { font-size: 1.35rem; }
		.k-val.prices { font-size: 1.05rem; }
		/* on phones the island cards sit below the map instead of over the sea */
		.map { aspect-ratio: auto !important; display: grid; gap: 10px; }
		.map svg { position: static; width: 100%; height: auto; aspect-ratio: 440 / 607; max-height: 70vh; }
		.icard { position: static; width: auto; box-shadow: none; }
		.hv-tag { position: static; transform: none; justify-self: start; }
	}
</style>
