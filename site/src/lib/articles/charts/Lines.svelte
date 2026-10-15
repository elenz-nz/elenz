<script lang="ts">
	// Line chart over a numeric x, with a crosshair that reads out every series at the pointer.
	import Tip from './Tip.svelte';
	import Legend, { type LegendItem } from './Legend.svelte';
	import { linear, ticks, nice, num, compact } from './util';

	type Series = { name: string; tok: string; values: number[]; faint?: boolean; label?: string };
	let {
		xs, series, unit = '', xfmt = (v: number) => num(v), xtitle = '', fmt = (v: number) => num(v), height = 280, legend = [], titleFmt = undefined,
	}: {
		xs: number[]; series: Series[]; unit?: string; xfmt?: (v: number) => string; xtitle?: string;
		fmt?: (v: number) => string; height?: number; legend?: LegendItem[]; titleFmt?: (v: number) => string;
	} = $props();

	let w = $state(680);
	const m = { l: 46, r: 46, t: 24, b: 40 };
	const pw = $derived(Math.max(100, w - m.l - m.r));
	const ph = $derived(height - m.t - m.b);
	const all = $derived(series.flatMap((s) => s.values));
	const ext = $derived(nice(Math.min(0, ...all), Math.max(...all), 5));
	const x = $derived(linear(xs[0], xs[xs.length - 1], 0, pw));
	const y = $derived(linear(ext[0], ext[1], ph, 0));
	const yt = $derived(ticks(ext[0], ext[1], 5));
	const xt = $derived(ticks(xs[0], xs[xs.length - 1], 5));
	const path = (v: number[]) => v.map((q, i) => `${i ? 'L' : 'M'}${x(xs[i]).toFixed(1)},${y(q).toFixed(1)}`).join('');
	// draw faint series first so the emphasised ones sit on top
	const order = $derived([...series].sort((a, b) => Number(!a.faint) - Number(!b.faint)));

	let hi = $state(-1);
	function move(e: PointerEvent) {
		const px = e.offsetX - m.l;
		const t = xs[0] + (px / pw) * (xs[xs.length - 1] - xs[0]);
		let best = 0;
		xs.forEach((v, i) => { if (Math.abs(v - t) < Math.abs(xs[best] - t)) best = i; });
		hi = best;
	}
</script>

<div class="ch" bind:clientWidth={w}>
	{#if legend.length}<Legend items={legend} />{/if}
	<div class="ch-plot">
		<svg width={w} {height} role="img" aria-label={series.map((s) => s.name).join(', ')}>
			<g transform="translate({m.l},{m.t})">
				{#if unit}<text class="ch-unit" x={-m.l} y={-12}>{unit}</text>{/if}
				{#each yt as t}
					<line class="ch-grid" class:zero={t === 0} x1="0" x2={pw} y1={y(t)} y2={y(t)} />
					<text class="ch-tick" x="-8" y={y(t)} dy="0.32em" text-anchor="end">{compact(t)}</text>
				{/each}
				{#each xt as t}<text class="ch-tick" x={x(t)} y={ph + 18} text-anchor="middle">{xfmt(t)}</text>{/each}
				{#if xtitle}<text class="ch-tick" x={pw / 2} y={ph + 34} text-anchor="middle">{xtitle}</text>{/if}
				{#each order as s}
					<path d={path(s.values)} class="ch-line" class:faint={s.faint} style="stroke: var({s.tok})" />
					{#if s.label}<text class="ch-endlabel" x={pw + 6} y={y(s.values[s.values.length - 1])} dy="0.32em">{s.label}</text>{/if}
				{/each}
				{#if hi >= 0}
					<line class="ch-cross" x1={x(xs[hi])} x2={x(xs[hi])} y1="0" y2={ph} />
					{#each series as s}{#if !s.faint}<circle class="ch-dot" cx={x(xs[hi])} cy={y(s.values[hi])} r="4" style="fill: var({s.tok})" />{/if}{/each}
				{/if}
				<rect class="ch-hit" x="0" y="0" width={pw} height={ph} onpointermove={move} onpointerleave={() => (hi = -1)} role="presentation" />
			</g>
		</svg>
		{#if hi >= 0}
			<Tip x={m.l + x(xs[hi])} y={m.t} {w} title={(titleFmt ?? xfmt)(xs[hi])}
				rows={[...series].sort((a, b) => b.values[hi] - a.values[hi]).map((s) => ({ tok: s.tok, name: s.name, value: fmt(s.values[hi]) }))} />
		{/if}
	</div>
</div>
