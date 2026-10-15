<script lang="ts">
	// Horizontal bars, one per row, from a zero baseline (diverging when values go both ways), value at each tip.
	import Tip from './Tip.svelte';
	import Legend, { type LegendItem } from './Legend.svelte';
	import { linear, ticks, nice, hbarPath } from './util';

	type Row = { label: string; value: number; tok: string; note?: string };
	let {
		rows, fmt = (v: number) => String(v), legend = [], label = 'Row', valueLabel = 'Value', tickFmt = undefined, table = true,
	}: {
		rows: Row[]; fmt?: (v: number) => string; legend?: LegendItem[]; label?: string; valueLabel?: string;
		tickFmt?: (v: number) => string; table?: boolean;
	} = $props();

	let w = $state(680);
	const rowH = 30, barH = 18;
	const narrow = $derived(w < 520);
	const m = $derived({ l: narrow ? 104 : 132, r: 54, t: 6, b: 24 });
	const pw = $derived(Math.max(80, w - m.l - m.r));
	const ph = $derived(rows.length * rowH);
	const ext = $derived(nice(Math.min(0, ...rows.map((r) => r.value)), Math.max(0, ...rows.map((r) => r.value)), 5));
	const x = $derived(linear(ext[0], ext[1], 0, pw));
	const xt = $derived(ticks(ext[0], ext[1], narrow ? 4 : 6));
	let hover = $state(-1);
</script>

<div class="ch" bind:clientWidth={w}>
	{#if legend.length}<Legend items={legend} />{/if}
	<div class="ch-plot">
		<svg width={w} height={ph + m.t + m.b} role="img" aria-label={`${valueLabel} by ${label.toLowerCase()}`}>
			<g transform="translate({m.l},{m.t})">
				{#each xt as t}
					<line class="ch-grid" class:zero={t === 0} x1={x(t)} x2={x(t)} y1="0" y2={ph} />
					<text class="ch-tick" x={x(t)} y={ph + 16} text-anchor="middle">{tickFmt ? tickFmt(t) : fmt(t)}</text>
				{/each}
				{#each rows as r, i}
					{@const y0 = i * rowH + (rowH - barH) / 2}
					{#if hover === i}<rect class="ch-band" x={-m.l} y={i * rowH} width={w} height={rowH} />{/if}
					<text class="ch-rowlabel" x={-10} y={y0 + barH / 2} dy="0.34em" text-anchor="end">{r.label}</text>
					<path d={hbarPath(y0, barH, x(0), x(r.value))} style="fill: var({r.tok})" class:dim={hover >= 0 && hover !== i} />
					<text class="ch-val" x={x(r.value) + (r.value < 0 ? -6 : 6)} y={y0 + barH / 2} dy="0.34em" text-anchor={r.value < 0 ? 'end' : 'start'}>{fmt(r.value)}</text>
					<rect class="ch-hit" x={-m.l} y={i * rowH} width={w} height={rowH} tabindex="0" role="button" aria-label="{r.label}: {fmt(r.value)}{r.note ? ', ' + r.note : ''}"
						onpointerenter={() => (hover = i)} onpointerleave={() => (hover = -1)} onfocus={() => (hover = i)} onblur={() => (hover = -1)} />
				{/each}
			</g>
		</svg>
		{#if hover >= 0 && rows[hover].note}
			<Tip x={m.l + Math.max(x(0), x(rows[hover].value))} y={m.t + hover * rowH + rowH} {w} title={rows[hover].label}
				rows={[{ tok: rows[hover].tok, name: valueLabel, value: fmt(rows[hover].value) }, { name: '', value: rows[hover].note ?? '' }]} />
		{/if}
	</div>
	{#if table}
		<details class="ch-data">
			<summary>Data table</summary>
			<table>
				<thead><tr><th>{label}</th><th class="n">{valueLabel}</th>{#if rows.some((r) => r.note)}<th>Detail</th>{/if}</tr></thead>
				<tbody>{#each rows as r}<tr><td>{r.label}</td><td class="n">{fmt(r.value)}</td>{#if rows.some((q) => q.note)}<td>{r.note ?? ''}</td>{/if}</tr>{/each}</tbody>
			</table>
		</details>
	{/if}
</div>
