<script lang="ts">
	// The big-number dashboard's screen (/dashboard): a background with one or two large values and up to four small
	// ones over it. Sized by its own width (container query units), so the same layout fills a phone, a laptop or a
	// wall screen. Horizon draws the last 24 hours of New Zealand's generation; Live mix is the generation mix right now;
	// the other backgrounds are drawn scenes (backgrounds.js, loaded only when picked).
	import { BACKGROUNDS } from './layout.js';
	import { FUEL_COLOUR } from './values.js';

	type Tile = { label: string; region: string | null; v: string; u: string; s: string; c: string; est: boolean; none: boolean; txt: boolean };
	let { bg, big, small, live, fresh = true, line, mix, hvdc = 0, windLoad = 0.3 }: {
		bg: string; big: Tile[]; small: Tile[]; live: string; fresh?: boolean;
		line: number[];                       // the last 24 hours of generation, oldest first
		mix: { k: string; mw: number }[];     // the mix right now, largest first
		hvdc?: number;                        // HVDC transfer, MW, northward positive (Cook Strait's cable)
		windLoad?: number;                    // wind output ÷ installed, 0 to 1 (Aurora's turbines)
	} = $props();

	const pal = $derived(BACKGROUNDS.find((b) => b.k === bg) ?? BACKGROUNDS[0]);
	const RN: Record<string, string> = { NZ: 'New Zealand', NI: 'North Island', SI: 'South Island' };

	// drawn scenes: loaded on first use
	let svg = $state<Record<string, string> | null>(null);
	$effect(() => {
		if (!svg && !['horizon', 'light', 'mix'].includes(bg)) import('./backgrounds.js').then((m) => (svg = m.SVG));
	});

	// Horizon: the line of the last 24 hours, its newest point pulsing at the right edge
	const horizon = $derived.by(() => {
		const v = line.filter((x) => Number.isFinite(x));
		if (v.length < 2) return null;
		const lo = Math.min(...v), hi = Math.max(...v), span = Math.max(hi - lo, 200);
		const pts = v.map((x, i) => [(i / (v.length - 1)) * 1600, 780 - ((x - lo) / span) * 250]);
		const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(0)} ${y.toFixed(0)}`).join(' ');
		return { d, area: `${d} L1600 900 L0 900 Z`, end: pts[pts.length - 1] };
	});
	const mixRects = $derived.by(() => {
		const total = mix.reduce((a, f) => a + f.mw, 0) || 1;
		let x = 0;
		return mix.map((f) => { const w = (f.mw / total) * 1600; const r = { x, w, c: (FUEL_COLOUR as Record<string, string>)[f.k] ?? '#7f909b' }; x += w; return r; });
	});
	const flow = $derived(Math.abs(hvdc) < 5 ? 'none' : hvdc > 0 ? 'north' : 'south');
	const spin = $derived(windLoad < 0.03 ? 0 : 9 - 7 * Math.min(1, windLoad));   // seconds a turn
</script>

<div class="stage" style="--ink:{pal.ink};--sub:{pal.sub};--tile:{pal.tile};--edge:{pal.edge};--spin:{spin || 1}s"
	data-hvdc={flow} class:still={!spin}>
	<div class="bg" aria-hidden="true">
		{#if bg === 'horizon' || bg === 'light'}
			{@const dark = bg === 'horizon'}
			{@const c = dark ? '#5cc2d2' : '#0d6275'}
			<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" focusable="false">
				<defs>
					<pattern id="dash-dots-{bg}" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.3" fill={dark ? '#ffffff' : '#132020'} fill-opacity={dark ? 0.07 : 0.09} /></pattern>
					<linearGradient id="dash-hz-{bg}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color={c} stop-opacity={dark ? 0.22 : 0.14} /><stop offset="1" stop-color={c} stop-opacity="0" /></linearGradient>
				</defs>
				<rect width="1600" height="900" fill={dark ? '#131c1c' : '#f2f5f5'} />
				<rect width="1600" height="900" fill="url(#dash-dots-{bg})" />
				{#if horizon}
					<path d={horizon.area} fill="url(#dash-hz-{bg})" />
					<path d={horizon.d} fill="none" stroke={c} stroke-opacity=".75" stroke-width="3" stroke-linejoin="round" />
					<circle class="pulse" cx={horizon.end[0] - 6} cy={horizon.end[1]} r="16" fill={c} fill-opacity=".35" style="transform-origin:{horizon.end[0] - 6}px {horizon.end[1]}px" />
					<circle cx={horizon.end[0] - 6} cy={horizon.end[1]} r="7" fill={c} />
				{/if}
			</svg>
		{:else if bg === 'mix'}
			<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" focusable="false">
				<rect width="1600" height="900" fill="#0e1515" />
				{#each mixRects as r}<rect x={r.x} y="0" width={r.w + 1} height="900" fill={r.c} />{/each}
				<rect width="1600" height="900" fill="#071012" fill-opacity=".62" />
				{#each { length: 14 } as _, i}<path d="M0 {(i + 1) * 60} H1600" stroke="#ffffff" stroke-opacity=".05" stroke-width="1" />{/each}
			</svg>
		{:else if svg?.[bg]}
			{@html svg[bg]}
		{/if}
	</div>
	<div class="fg nb{big.length} ns{small.length}">
		<div class="top">
			<b>elenz</b>
			<span class="live" class:late={!fresh}><i></i>{live}</span>
		</div>
		<div class="bigrow">
			{#each big as t}
				<div class="tile big" class:txt={t.txt}>
					<div class="lab"><i style="background:{t.c}"></i><span>{t.label}{#if t.region}<em>{' · '}{RN[t.region]}</em>{/if}{#if t.est && !t.none}<span class="etag">est.</span>{/if}</span></div>
					<div class="row" class:none={t.none}><span class="num">{t.v}</span>{#if t.u}<span class="unit">{t.u}</span>{/if}</div>
					<div class="sub">{t.s}</div>
				</div>
			{/each}
		</div>
		{#if small.length}
			<div class="smallrow">
				{#each small as t}
					<div class="tile small" class:txt={t.txt}>
						<div class="lab"><i style="background:{t.c}"></i><span>{t.label}{#if t.region}<em>{' · '}{t.region}</em>{/if}{#if t.est && !t.none}<span class="etag">est.</span>{/if}</span></div>
						<div class="row" class:none={t.none}><span class="num">{t.v}</span>{#if t.u}<span class="unit">{t.u}</span>{/if}</div>
						<div class="sub">{t.s}</div>
					</div>
				{/each}
			</div>
		{/if}
		<div class="foot">Elenz (elenz.co.nz), from Electricity Authority data</div>
	</div>
</div>

<style>
	.stage { position: relative; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; border-radius: 14px; background: #131c1c; color: var(--ink);
		font-family: var(--font-ui); container-type: inline-size; }
	.bg, .bg :global(svg) { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
	.fg { position: absolute; inset: 0; display: grid; grid-template-rows: auto 1fr auto auto; gap: 2.2cqw; padding: 2.8cqw 3.4cqw 2cqw; }
	.top { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 1cqw 2cqw; }
	.top b { font-weight: 800; font-size: 2.3cqw; letter-spacing: -0.02em; }
	.live { display: inline-flex; align-items: center; gap: 0.7cqw; font: 500 1.35cqw var(--font-data); color: var(--sub); font-variant-numeric: tabular-nums; }
	.live i { width: 0.8cqw; height: 0.8cqw; border-radius: 50%; background: #3fd18b; box-shadow: 0 0 0 0.35cqw rgba(63, 209, 139, 0.18); }
	.live.late i { background: #e0b44c; box-shadow: 0 0 0 0.35cqw rgba(224, 180, 76, 0.18); }
	.bigrow { align-self: end; display: grid; gap: 2cqw; grid-template-columns: repeat(var(--n, 1), minmax(0, 1fr)); }
	.nb2 .bigrow { --n: 2; }
	.smallrow { display: grid; gap: 1.4cqw; grid-template-columns: repeat(var(--m, 1), minmax(0, 1fr)); }
	.ns2 .smallrow { --m: 2; } .ns3 .smallrow { --m: 3; } .ns4 .smallrow { --m: 4; }
	.tile { min-width: 0; background: var(--tile); border: 1px solid var(--edge); border-radius: 1.4cqw; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
	.tile.big { padding: 1.8cqw 2.2cqw 2cqw; }
	.tile.small { padding: 1.2cqw 1.5cqw 1.3cqw; }
	.lab { display: flex; align-items: center; gap: 0.8cqw; color: var(--sub); font-weight: 600; min-width: 0; }
	.lab > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.lab i { flex: none; border-radius: 50%; }
	.lab em { font-style: normal; font-weight: 500; }
	.etag { margin-left: 0.6em; font: 500 0.8em var(--font-data); padding: 0 0.4em; border: 1px solid var(--edge); border-radius: 0.3em; }
	.big .lab { font-size: 1.55cqw; } .big .lab i { width: 1.1cqw; height: 1.1cqw; }
	.small .lab { font-size: 1.1cqw; } .small .lab i { width: 0.8cqw; height: 0.8cqw; }
	.row { display: flex; align-items: baseline; gap: 0.8cqw; min-width: 0; }
	.num { font-weight: 600; letter-spacing: -0.03em; line-height: 1.02; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
	.unit { color: var(--sub); font-weight: 500; white-space: nowrap; }
	.big .num { font-size: 9.5cqw; } .big .unit { font-size: 2.4cqw; }
	.nb1 .big .num { font-size: 12.5cqw; } .nb1 .big .unit { font-size: 3cqw; }
	.small .num { font-size: 3.9cqw; } .small .unit { font-size: 1.3cqw; }
	.ns4 .small .num { font-size: 3.4cqw; }
	/* names rather than numbers (a plant, the possible price setter) are long: a smaller size, in the text face */
	.txt .num, .row.none .num { font-family: var(--font-ui); letter-spacing: -0.02em; }
	.big.txt .num { font-size: 6.4cqw; } .nb2 .big.txt .num { font-size: 5cqw; }
	.small.txt .num { font-size: 2.5cqw; }
	.row.none .num { font-size: 4cqw; color: var(--sub); }
	.small .row.none .num { font-size: 2.2cqw; }
	.sub { color: var(--sub); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.big .sub { font-size: 1.5cqw; margin-top: 0.4cqw; } .small .sub { font-size: 1.05cqw; margin-top: 0.2cqw; }
	.foot { font-size: 1cqw; color: var(--sub); opacity: 0.85; }

	/* phones, upright: the tiles stack and everything is sized up; the screen is as tall as its tiles need */
	@media (max-width: 640px) { .stage { aspect-ratio: auto; min-height: 70vh; } }
	@container (max-width: 640px) {
		.fg { position: relative; grid-template-rows: auto auto auto auto; gap: 4cqw; padding: 5cqw 5cqw 4cqw; min-height: 100%; }
		.top b { font-size: 6cqw; } .live { font-size: 3cqw; gap: 2cqw; } .live i { width: 2cqw; height: 2cqw; }
		.bigrow, .nb2 .bigrow { grid-template-columns: minmax(0, 1fr); gap: 3cqw; margin-top: 10cqw; }
		.smallrow, .ns3 .smallrow, .ns4 .smallrow { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3cqw; }
		.ns1 .smallrow { grid-template-columns: minmax(0, 1fr); }
		.tile { border-radius: 4cqw; } .tile.big { padding: 4.5cqw 5cqw; } .tile.small { padding: 3.5cqw 4cqw; }
		.big .lab { font-size: 3.8cqw; gap: 2cqw; } .big .lab i { width: 2.6cqw; height: 2.6cqw; }
		.small .lab { font-size: 3cqw; gap: 1.6cqw; } .small .lab i { width: 2cqw; height: 2cqw; }
		.big .num, .nb1 .big .num { font-size: 19cqw; } .big .unit, .nb1 .big .unit { font-size: 5cqw; }
		.nb2 .big .num { font-size: 15cqw; }
		.small .num, .ns4 .small .num { font-size: 9cqw; } .small .unit { font-size: 3.2cqw; }
		.big.txt .num, .nb2 .big.txt .num { font-size: 10cqw; } .small.txt .num { font-size: 5.5cqw; }
		.row.none .num { font-size: 8cqw; } .small .row.none .num { font-size: 5cqw; }
		.big .sub { font-size: 3.4cqw; } .small .sub { font-size: 2.8cqw; white-space: normal; }
		.foot { font-size: 2.6cqw; }
	}

	/* the drawn scenes' motion; still for viewers who ask for less */
	.stage :global(.tw) { animation: dash-tw 3.2s ease-in-out infinite alternate; }
	.stage :global(.sway) { animation: dash-sway 22s ease-in-out infinite alternate; }
	.stage :global(.sway2) { animation: dash-sway 31s ease-in-out infinite alternate-reverse; }
	.stage :global(.blade) { animation: dash-spin var(--spin) linear infinite; }
	.stage.still :global(.blade) { animation: none; }
	.stage :global(.pulse) { animation: dash-pulse 2.4s ease-out infinite; }
	.stage :global(.ripple) { animation: dash-tw 4s ease-in-out infinite alternate; }
	.stage :global(.swell) { animation: dash-swell 16s ease-in-out infinite alternate; }
	.stage :global(.cable) { animation: dash-cable 1.4s linear infinite; }
	.stage[data-hvdc='south'] :global(.cable) { animation-direction: reverse; }
	.stage[data-hvdc='none'] :global(.cable) { animation: none; }
	@keyframes -global-dash-tw { from { opacity: 0.25; } to { opacity: 1; } }
	@keyframes -global-dash-sway { from { transform: translateX(-40px); } to { transform: translateX(40px); } }
	@keyframes -global-dash-spin { to { transform: rotate(360deg); } }
	@keyframes -global-dash-pulse { from { transform: scale(0.6); opacity: 0.9; } to { transform: scale(2); opacity: 0; } }
	@keyframes -global-dash-swell { from { transform: translateX(-50px); } to { transform: translateX(50px); } }
	@keyframes -global-dash-cable { to { stroke-dashoffset: -32; } }
	@media (prefers-reduced-motion: reduce) {
		.stage :global(*) { animation: none !important; }
	}
</style>
