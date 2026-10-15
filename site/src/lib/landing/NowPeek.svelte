<script lang="ts">
	// A glimpse of the Now page for the landing page: the two islands with their generation rings and the HVDC link,
	// and three of its figures.
	import { ring } from '#lib/home/now.js';
	import { VIEW, NI as NI_PATH, SI as SI_PATH, PTS } from '#lib/home/nzmap.js';

	let { now }: { now: any; D?: any } = $props();

	const fmt = (v: number) => Math.round(v).toLocaleString('en-NZ');
	const money = (v: number) => (v < 0 ? '−$' : '$') + Math.abs(v).toLocaleString('en-NZ', { maximumFractionDigits: 0 });
	const [bx, by] = PTS.ben, [hx, hy] = PTS.hay;
	const HV_PATH = `M${bx},${by} C${bx + 60},${by - 40} ${hx - 40},${hy + 70} ${hx},${hy}`;
	const R = 46, C = 2 * Math.PI * R;
	const AT = { NI: { x: 300, y: 190 }, SI: { x: 133, y: 402 } };
	const hv = $derived(now.hvdc.mid as number);
	const dir = $derived(Math.abs(hv) < 1 ? '' : hv > 0 ? 'north' : 'south');
</script>

<div class="now-peek">
	<svg viewBox="0 0 {VIEW.w} {VIEW.h}" aria-hidden="true">
		<defs>
			<pattern id="pk-hatch-now" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
				<rect width="4" height="4" class="hb" /><rect width="2" height="4" class="hf" />
			</pattern>
		</defs>
		<path class="land" d={NI_PATH} />
		<path class="land" d={SI_PATH} />
		<path class="hv" d={HV_PATH} />
		{#if dir}<path class="hv-flow {dir}" d={HV_PATH} />{/if}
		{#each [['NI', now.regions.NI], ['SI', now.regions.SI]] as [k, reg]}
			{@const P = AT[k as 'NI' | 'SI']}
			<g transform="translate({P.x},{P.y})">
				<circle class="bg" r={R} />
				{#each ring(now.mix, reg, R) as f}
					<circle class="seg" r={R} transform="rotate(-90)"
						style="stroke:{f.hatch ? 'url(#pk-hatch-now)' : `var(${f.tok})`};stroke-dasharray:{f.len} {C - f.len};stroke-dashoffset:{-f.start}" />
				{/each}
				<text class="v" y="3" text-anchor="middle">{fmt(reg.gen)}</text>
				<text class="u" y="18" text-anchor="middle">MW</text>
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
	.hv-flow { fill: none; stroke: var(--f-hvdc); stroke-width: 4; stroke-linecap: round; stroke-dasharray: 2 14; animation: flow 1.6s linear infinite; }
	.hv-flow.south { animation-direction: reverse; }
	@keyframes flow { to { stroke-dashoffset: -32; } }
	@media (prefers-reduced-motion: reduce) { .hv-flow { animation: none; } }
	.bg { fill: color-mix(in srgb, var(--surface) 82%, transparent); }
	.seg { fill: none; stroke-width: 15; }
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
