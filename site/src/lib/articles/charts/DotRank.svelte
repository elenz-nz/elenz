<script lang="ts">
	// Ranked dot plot: one row per item, a dot at its value on an axis that needn't start at zero
	// (dots encode position, not length, so a narrow window is honest). Value beside each dot.
	import Legend, { type LegendItem } from './Legend.svelte';
	import { linear, ticks, num } from './util';

	type Row = { label: string; value: number; tok: string; tag?: string };
	let {
		rows, lo, hi, unit = '', legend = [], label = 'Rank', valueLabel = 'Value', fmt = (v: number) => num(v),
	}: {
		rows: Row[]; lo: number; hi: number; unit?: string; legend?: LegendItem[]; label?: string; valueLabel?: string;
		fmt?: (v: number) => string;
	} = $props();

	let w = $state(680);
	const rowH = 26;
	const narrow = $derived(w < 520);
	const m = $derived({ l: narrow ? 150 : 176, r: 60, t: 6, b: 24 });
	const pw = $derived(Math.max(80, w - m.l - m.r));
	const ph = $derived(rows.length * rowH);
	const x = $derived(linear(lo, hi, 0, pw));
	const xt = $derived(ticks(lo, hi, narrow ? 3 : 5));
	let hover = $state(-1);
</script>

<div class="ch" bind:clientWidth={w}>
	{#if legend.length}<Legend items={legend} />{/if}
	<div class="ch-plot">
		<svg width={w} height={ph + m.t + m.b} role="img" aria-label={`${valueLabel}, ranked`}>
			<g transform="translate({m.l},{m.t})">
				{#each xt as t}
					<line class="ch-grid" x1={x(t)} x2={x(t)} y1="0" y2={ph} />
					<text class="ch-tick" x={x(t)} y={ph + 16} text-anchor="middle">{num(t)}{unit && !narrow && t === xt[xt.length - 1] ? ` ${unit}` : ''}</text>
				{/each}
				{#each rows as r, i}
					{@const cy = i * rowH + rowH / 2}
					{#if hover === i}<rect class="ch-band" x={-m.l} y={i * rowH} width={w} height={rowH} />{/if}
					<text class="ch-rank" x={-m.l} y={cy} dy="0.34em">{i + 1}</text>
					<text class="ch-rowlabel" x={-10} y={cy} dy="0.34em" text-anchor="end">{r.label}</text>
					<line class="ch-guide" x1="0" x2={x(r.value)} y1={cy} y2={cy} />
					<circle cx={x(r.value)} {cy} r="5.5" class="ch-dot" style="fill: var({r.tok})" />
					<text class="ch-val" x={x(r.value) + 11} y={cy} dy="0.34em">{fmt(r.value)}</text>
					<rect class="ch-hit" x={-m.l} y={i * rowH} width={w} height={rowH} tabindex="0" role="button" aria-label="{i + 1}. {r.label}: {fmt(r.value)} {unit}"
						onpointerenter={() => (hover = i)} onpointerleave={() => (hover = -1)} onfocus={() => (hover = i)} onblur={() => (hover = -1)} />
				{/each}
			</g>
		</svg>
	</div>
	<details class="ch-data">
		<summary>Data table</summary>
		<table>
			<thead><tr><th>#</th><th>{label}</th><th class="n">{valueLabel}</th></tr></thead>
			<tbody>{#each rows as r, i}<tr><td>{i + 1}</td><td>{r.label}</td><td class="n">{fmt(r.value)}</td></tr>{/each}</tbody>
		</table>
	</details>
</div>
