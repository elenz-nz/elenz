<script lang="ts">
	// A glimpse of the Now page for the landing page: the two islands with their generation rings and the HVDC link,
	// and three of its figures. It builds as it scrolls into view: each island's ring sweeps round and its figure counts
	// up (South Island first), then the HVDC link draws from the sending end to the receiving end and the flow starts.
	// Scrolling back up undoes it; with prefers-reduced-motion it shows complete.
	import { onMount } from 'svelte';
	import { ring } from '#lib/home/now.js';
	import { VIEW, NI as NI_PATH, SI as SI_PATH } from '#lib/home/nzmap.js';
	import { RING as AT, RING_R as R, HV, HV_PATH } from '#lib/home/maplayout.js';

	let { now }: { now: any; D?: any } = $props();

	const fmt = (v: number) => Math.round(v).toLocaleString('en-NZ');
	const money = (v: number) => (v < 0 ? '−$' : '$') + Math.abs(v).toLocaleString('en-NZ', { maximumFractionDigits: 0 });
	const C = 2 * Math.PI * R;
	const hv = $derived(now.hvdc.mid as number);
	const dir = $derived(Math.abs(hv) < 1 ? '' : hv > 0 ? 'north' : 'south');

	// p: 0 while the map's middle is near the bottom of the screen, 1 once it is a little above the middle
	let map: SVGSVGElement;
	let p = $state(0);
	const smooth = (v: number) => (v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v));
	const fill = $derived({ SI: smooth(p / 0.5), NI: smooth((p - 0.12) / 0.5) });
	const link = $derived(smooth((p - 0.45) / 0.45));
	// a segment shows the part of it the sweep has reached
	const shown = (f: any, k: number) => Math.max(0, Math.min(f.len, k * C - f.start));

	onMount(() => {
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) { p = 1; return; }
		let raf = 0;
		const update = () => {
			raf = 0;
			const r = map.getBoundingClientRect(), vh = innerHeight;
			const mid = r.top + r.height / 2, from = vh * 0.92, to = vh * 0.45;
			p = Math.min(1, Math.max(0, (from - mid) / (from - to)));
		};
		const go = () => { if (!raf) raf = requestAnimationFrame(update); };
		update();
		addEventListener('scroll', go, { passive: true });
		addEventListener('resize', go, { passive: true });
		return () => { cancelAnimationFrame(raf); removeEventListener('scroll', go); removeEventListener('resize', go); };
	});
</script>

<div class="now-peek">
	<svg viewBox="0 0 {VIEW.w} {VIEW.h}" aria-hidden="true" bind:this={map}>
		<defs>
			<pattern id="pk-hatch-now" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
				<rect width="4" height="4" class="hb" /><rect width="2" height="4" class="hf" />
			</pattern>
		</defs>
		<path class="land" d={NI_PATH} />
		<path class="land" d={SI_PATH} />
		<!-- the link draws from the end power leaves (Benmore when flowing north) -->
		<path class="hv" d={HV_PATH} pathLength="1" style="stroke-dasharray:1 1;stroke-dashoffset:{dir === 'south' ? -(1 - link) : 1 - link}" />
		{#if dir}<path class="hv-flow {dir}" class:on={link >= 1} d={HV_PATH} />{/if}
		<circle class="node" class:on={link > 0 && (dir !== 'south' || link >= 1)} cx={HV.ben.x} cy={HV.ben.y} r="4" />
		<circle class="node" class:on={link > 0 && (dir === 'south' || link >= 1)} cx={HV.hay.x} cy={HV.hay.y} r="4" />
		{#each [['NI', now.regions.NI], ['SI', now.regions.SI]] as [k, reg]}
			{@const P = AT[k as 'NI' | 'SI']}
			{@const kf = fill[k as 'NI' | 'SI']}
			<g transform="translate({P.x},{P.y})">
				<circle class="bg" r={R} />
				{#each ring(now.mix, reg, R) as f}
					<circle class="seg" r={R} transform="rotate(-90)"
						style="stroke:{f.hatch ? 'url(#pk-hatch-now)' : `var(${f.tok})`};stroke-dasharray:{shown(f, kf)} {C};stroke-dashoffset:{-f.start}" />
				{/each}
				<text class="v" y="3" text-anchor="middle">{fmt(reg.gen * kf)}</text>
				<text class="u" y="18" text-anchor="middle">MW</text>
			</g>
		{/each}
	</svg>
	<dl>
		<div><dt>Demand</dt><dd>{fmt(now.regions.NZ.demand)}<small>MW</small></dd></div>
		<div><dt>Price</dt><dd class="pr"><span><b>HAY</b>{money(now.regions.NI.price ?? 0)}</span><span><b>BEN</b>{money(now.regions.SI.price ?? 0)}</span></dd></div>
		<div><dt>HVDC</dt><dd>{fmt(Math.abs(hv) * link)}<small>MW {dir}</small></dd></div>
	</dl>
</div>

<style>
	.now-peek { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 18px; align-items: center; }
	svg { width: 100%; max-height: 340px; }
	.land { fill: var(--land, var(--grid)); stroke: var(--line); stroke-linejoin: round; }
	.hv { fill: none; stroke: color-mix(in srgb, var(--f-hvdc) 50%, transparent); stroke-width: 4; stroke-linecap: round; }
	.hv-flow { fill: none; stroke: var(--f-hvdc); stroke-width: 4; stroke-linecap: round; stroke-dasharray: 2 14; animation: flow 1.6s linear infinite;
		opacity: 0; transition: opacity 0.4s; }
	.hv-flow.on { opacity: 1; }
	.hv-flow.south { animation-direction: reverse; }
	@keyframes flow { to { stroke-dashoffset: -32; } }
	@media (prefers-reduced-motion: reduce) { .hv-flow { animation: none; } .hv-flow, .node { transition: none; } }
	.bg { fill: color-mix(in srgb, var(--surface) 82%, transparent); }
	.seg { fill: none; stroke-width: 13; }
	.node { fill: var(--surface); stroke: var(--ink-2); stroke-width: 1.5; opacity: 0; transform-box: fill-box; transform-origin: center;
		transform: scale(0.4); transition: opacity 0.25s, transform 0.3s cubic-bezier(0.3, 1.6, 0.5, 1); }
	.node.on { opacity: 1; transform: none; }
	.v { fill: var(--ink); font-family: var(--font-data); font-size: 17px; font-weight: 600; }
	.u { fill: var(--muted); font-size: 11px; }
	.hb { fill: color-mix(in srgb, var(--f-solar) 30%, transparent); }
	.hf { fill: var(--f-solar); }
	dl { margin: 0; display: grid; gap: 12px; min-width: 150px; }
	dt { color: var(--muted); font-size: 0.74rem; font-weight: 600; }
	dd { margin: 0; font-family: var(--font-data); font-size: 1.05rem; font-weight: 600; white-space: nowrap; }
	dd small { font-family: var(--font-ui); font-size: 0.72rem; font-weight: 500; color: var(--muted); margin-left: 4px; }
	dd b { font-family: var(--font-ui); font-size: 0.66rem; color: var(--muted); letter-spacing: 0.04em; margin-right: 4px; }
	.pr { display: grid; gap: 1px; }
	@media (max-width: 520px) {
		.now-peek { grid-template-columns: minmax(0, 1fr); }
		dl { grid-template-columns: repeat(3, auto); justify-content: space-between; min-width: 0; }
		dd { font-size: 0.92rem; }
	}
</style>
