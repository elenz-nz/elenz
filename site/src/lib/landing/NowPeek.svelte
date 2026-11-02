<script lang="ts">
	// A glimpse of the Now page for the landing page: the two islands with their generation rings and the HVDC link,
	// and three of its figures. It builds as the hero's flying dot passes through it (Handoff.svelte): the North Island
	// ring sweeps round as the dot comes down to it, the dot draws the HVDC link from Haywards to Benmore, the South
	// Island ring fills as it passes, then the flow starts. Scrolling back up undoes it; with prefers-reduced-motion
	// (no hand-off) it shows complete.
	import { ring } from '#lib/home/now.js';
	import { build } from './build.svelte.js';
	import { VIEW, NI as NI_PATH, SI as SI_PATH } from '#lib/home/nzmap.js';
	import { RING as AT, RING_R as R, HV, HV_PATH } from '#lib/home/maplayout.js';

	let { now }: { now: any; D?: any } = $props();

	const fmt = (v: number) => Math.round(v).toLocaleString('en-NZ');
	const money = (v: number) => (v < 0 ? '−$' : '$') + Math.abs(v).toLocaleString('en-NZ', { maximumFractionDigits: 0 });
	const C = 2 * Math.PI * R;
	const hv = $derived(now.hvdc.mid as number);
	const dir = $derived(Math.abs(hv) < 1 ? '' : hv > 0 ? 'north' : 'south');

	// how far each part has built (driven by the hand-off's flying dot, Handoff.svelte; complete otherwise). The rings
	// and the link draw as it goes; the figures show in full from the start, never counting up (owner's call HOME-02)
	const fill = $derived({ NI: build.ni, SI: build.si });
	const link = $derived(build.link);
	// a segment shows the part of it the sweep has reached
	const shown = (f: any, k: number) => Math.max(0, Math.min(f.len, k * C - f.start));
</script>

<div class="now-peek">
	<svg viewBox="0 0 {VIEW.w} {VIEW.h}" aria-hidden="true" data-handoff="via">
		<defs>
			<pattern id="pk-hatch-now" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
				<rect width="4" height="4" class="hb" /><rect width="2" height="4" class="hf" />
			</pattern>
		</defs>
		<path class="land" d={NI_PATH} />
		<path class="land" d={SI_PATH} />
		<!-- the link draws behind the flying dot, from Haywards down to Benmore -->
		<path class="hv" d={HV_PATH} pathLength="1" style="stroke-dasharray:1 1;stroke-dashoffset:{-(1 - link)}" />
		{#if dir}<path class="hv-flow {dir}" class:on={link >= 1} d={HV_PATH} />{/if}
		<circle class="node" class:on={link >= 1} cx={HV.ben.x} cy={HV.ben.y} r="4" />
		<circle class="node" class:on={link > 0} cx={HV.hay.x} cy={HV.hay.y} r="4" />
		{#each [['NI', now.regions.NI], ['SI', now.regions.SI]] as [k, reg]}
			{@const P = AT[k as 'NI' | 'SI']}
			{@const kf = fill[k as 'NI' | 'SI']}
			<g transform="translate({P.x},{P.y})">
				<circle class="bg" r={R} />
				{#each ring(now.mix, reg, R) as f}
					<circle class="seg" r={R} transform="rotate(-90)"
						style="stroke:{f.hatch ? 'url(#pk-hatch-now)' : `var(${f.tok})`};stroke-dasharray:{shown(f, kf)} {C};stroke-dashoffset:{-f.start}" />
				{/each}
				<g style="opacity:{Math.min(1, kf * 5)}">
					<text class="v" y="3" text-anchor="middle">{fmt(reg.gen)}</text>
					<text class="u" y="18" text-anchor="middle">MW</text>
				</g>
			</g>
		{/each}
	</svg>
	<dl>
		<div><dt>Demand</dt><dd>{fmt(now.regions.NZ.demand)}<small>MW</small></dd></div>
		<div><dt>Price</dt><dd class="pr"><span><b>HAY</b>{money(now.regions.NI.price ?? 0)}</span><span><b>BEN</b>{money(now.regions.SI.price ?? 0)}</span></dd></div>
		<div><dt>HVDC</dt><dd>{fmt(Math.abs(hv))}<small>MW {dir}</small></dd></div>
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
