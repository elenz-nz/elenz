<script lang="ts">
	// One row per series (a year, say), each row a line across the same x axis drawn on its own level, so their shapes
	// can be compared down the page. Each row is shown as a % of its own average, centred on its label (100% = the
	// label's level), all on one scale, so a row whose line swings further really did swing further. An optional band
	// shades a stretch of the x axis. The readout gives the actual value.
	import Tip from './Tip.svelte';
	import { linear, num } from './util';

	type Row = { name: string; values: number[]; tok?: string; strong?: boolean };
	let {
		rows, xs, xticks = [], xfmt = (v: number) => num(v), titleFmt = undefined, fmt = (v: number) => num(v),
		rowH = 22, spread = 1.6, label = 'Row', band = undefined, bandLabel = '',
	}: {
		rows: Row[]; xs: number[]; xticks?: number[]; xfmt?: (v: number) => string; titleFmt?: (v: number) => string;
		fmt?: (v: number) => string; rowH?: number;
		spread?: number;   // row heights per 100 points of index (100% of the average)
		label?: string; band?: [number, number]; bandLabel?: string;
	} = $props();

	let w = $state(680);
	const pw = $derived(Math.max(100, w - 44 - 12));
	const x = $derived(linear(xs[0], xs[xs.length - 1], 0, pw));
	const k = $derived((spread * rowH) / 100);   // px per index point
	const idx = $derived(rows.map((r) => {
		const ok = r.values.filter((v) => v === v);
		const avg = ok.reduce((a, v) => a + v, 0) / ok.length;
		return r.values.map((v) => (100 * v) / avg);
	}));
	const ok = (v: number) => v === v;
	// room above the first rows for their peaks, and below the last for its dips
	const top = $derived(Math.max(14, ...idx.map((r, i) => (Math.max(...r.filter(ok)) - 100) * k - i * rowH + 8)));
	const bot = $derived(Math.max(0, (100 - Math.min(...idx[idx.length - 1].filter(ok))) * k));
	const m = $derived({ l: 44, r: 12, t: top, b: bot + 46 });
	const height = $derived(m.t + (rows.length - 1) * rowH + m.b);
	const pb = $derived(height - 40);   // bottom of the plot
	const base = (i: number) => m.t + i * rowH;   // where the row's own average sits
	const yv = (i: number, v: number) => base(i) - (v - 100) * k;
	const line = (i: number) => idx[i].map((v, j) => `${j ? 'L' : 'M'}${x(xs[j]).toFixed(1)},${yv(i, v).toFixed(1)}`).join('');
	const area = (i: number) => {
		const lo = Math.max(...idx[i].filter(ok).map((v) => yv(i, v))) + 1.5;
		return `${line(i)}L${x(xs[xs.length - 1]).toFixed(1)},${lo}L${x(xs[0]).toFixed(1)},${lo}Z`;
	};

	let hr = $state(-1), hc = $state(-1);
	function move(e: PointerEvent) {
		const px = e.offsetX - m.l;
		let best = 0;
		xs.forEach((v, j) => { if (Math.abs(x(v) - px) < Math.abs(x(xs[best]) - px)) best = j; });
		hc = best;
		// the row whose line is nearest the pointer
		let br = 0, bd = Infinity;
		rows.forEach((_, i) => { const d = Math.abs(yv(i, idx[i][best]) - e.offsetY); if (d < bd) { bd = d; br = i; } });
		hr = br;
	}
</script>

<div class="ch" bind:clientWidth={w}>
	<div class="ch-plot">
		<svg width={w} {height} role="img" aria-label="Average price by time of day, one row per {label.toLowerCase()}">
			<g transform="translate({m.l},0)">
				{#if band}
					{#if bandLabel}<text class="ch-tick" x={(x(band[0]) + x(band[1])) / 2} y={height - 6} text-anchor="middle">{bandLabel}</text>{/if}
				{/if}
				{#each xticks as t}
					<line class="ch-guide" x1={x(t)} x2={x(t)} y1={6} y2={pb} />
					<text class="ch-tick" x={x(t)} y={height - 22} text-anchor="middle">{xfmt(t)}</text>
				{/each}
				{#each rows as r, i}
					<path d={area(i)} class="rl-fill" />
					<path d={line(i)} class="ch-line" class:thin={!r.strong} style="stroke: var({r.tok ?? '--f-hvdc'})" class:dim={hr >= 0 && hr !== i} />
					<text class="ch-tick" class:rl-strong={r.strong} x={-8} y={base(i)} dy="0.32em" text-anchor="end">{r.name}</text>
				{/each}
				{#if band}<rect class="rl-band" x={x(band[0])} y={6} width={x(band[1]) - x(band[0])} height={pb - 6} />{/if}
				{#if hc >= 0}<line class="ch-cross" x1={x(xs[hc])} x2={x(xs[hc])} y1={6} y2={pb} />{/if}
				{#if hr >= 0 && hc >= 0}<circle class="ch-dot" cx={x(xs[hc])} cy={yv(hr, idx[hr][hc])} r="4" style="fill: var({rows[hr].tok ?? '--f-hvdc'})" />{/if}
				<rect class="ch-hit" x="0" y="0" width={pw} height={pb} onpointermove={move} onpointerleave={() => { hr = -1; hc = -1; }} role="presentation" />
			</g>
		</svg>
		{#if hr >= 0 && hc >= 0}
			<Tip x={m.l + x(xs[hc])} y={yv(hr, idx[hr][hc]) - 60} {w} title="{rows[hr].name}, {(titleFmt ?? xfmt)(xs[hc])}" rows={[
				{ tok: rows[hr].tok ?? '--f-hvdc', name: 'average price', value: fmt(rows[hr].values[hc]) },
				{ name: `of the ${label.toLowerCase()}'s average`, value: `${Math.round(idx[hr][hc])}%` },
			]} />
		{/if}
	</div>
	<details class="ch-data">
		<summary>Data table</summary>
		<table>
			<thead><tr><th>{label}</th>{#each xticks as t}<th class="n">{xfmt(t)}</th>{/each}<th class="n">Average</th></tr></thead>
			<tbody>
				{#each rows as r}
					{@const ok = r.values.filter((v) => v === v)}
					<tr><td>{r.name}</td>{#each xticks as t}<td class="n">{fmt(r.values[xs.indexOf(t)])}</td>{/each}<td class="n">{fmt(ok.reduce((a, v) => a + v, 0) / ok.length)}</td></tr>
				{/each}
			</tbody>
		</table>
	</details>
</div>

<style>
	.rl-fill { fill: var(--surface); }
	.rl-band { fill: var(--accent); opacity: 0.08; pointer-events: none; }
	.rl-strong { fill: var(--ink); font-weight: 700; }
</style>
