<script lang="ts">
	import { tapAway, leaveFor } from './tap.js';
	// Line chart over a numeric x, with a crosshair that reads out every series at the pointer. A series can be a
	// staircase (`step`: each value held until the next x) or dots alone (`dots`); `band` shades a stretch of x and
	// `marks` picks out points with a label. A data table sits under the chart when `table` is set.
	import Tip from './Tip.svelte';
	import Legend, { type LegendItem } from './Legend.svelte';
	import { linear, ticks, nice, num, compact } from './util';

	type Series = { name: string; tok: string; values: number[]; faint?: boolean; label?: string; thin?: boolean; step?: boolean; dots?: boolean };
	type Band = { from: number; to: number; label?: string; series?: number };   // series: that line drawn in the accent inside the band
	type Mark = { i: number; series: number; label: string };
	let {
		xs, series, unit = '', xfmt = (v: number) => num(v), xtitle = '', fmt = (v: number) => num(v), height = 280, legend = [], titleFmt = undefined,
		reverse = false, ytick = undefined, ytop = '', ybottom = '', left = 46, xzero = true, xticks = undefined,
		yzero = true, band = undefined, marks = [], table = false, label = '',
	}: {
		xs: number[]; series: Series[]; unit?: string; xfmt?: (v: number) => string; xtitle?: string;
		fmt?: (v: number) => string; height?: number; legend?: LegendItem[]; titleFmt?: (v: number) => string;
		reverse?: boolean;                        // x axis runs right to left
		ytick?: (v: number) => string;            // y tick labels (default compact numbers)
		ytop?: string; ybottom?: string;          // words above the top tick and below the bottom one (e.g. North / South)
		left?: number;                            // left margin for the y tick labels
		xzero?: boolean;                          // x ticks counted from zero (false for an axis of years)
		xticks?: number[];                        // explicit x tick positions
		yzero?: boolean;                          // y axis includes zero (false: fitted to the data, for dots and lines only)
		band?: Band;                              // a shaded stretch of x, with an optional label beside it
		marks?: Mark[];                           // points picked out in the accent colour: index, series, label
		table?: boolean; label?: string;          // a data table under the chart, and its first column's heading
	} = $props();

	let w = $state(680);
	const m = $derived({ l: left, r: 24, t: 24, b: ybottom ? 52 : 40 });
	const pw = $derived(Math.max(100, w - m.l - m.r));
	const ph = $derived(height - m.t - m.b);
	const all = $derived(series.flatMap((s) => s.values));
	const ext = $derived(nice(yzero ? Math.min(0, ...all) : Math.min(...all), Math.max(...all), 5));
	const x = $derived(reverse ? linear(xs[0], xs[xs.length - 1], pw, 0) : linear(xs[0], xs[xs.length - 1], 0, pw));
	const y = $derived(linear(ext[0], ext[1], ph, 0));
	const yt = $derived(ticks(ext[0], ext[1], 5));
	const xt = $derived(xticks ?? ticks(xzero ? Math.min(0, xs[0]) : Math.ceil(xs[0]), xs[xs.length - 1], 5).filter((t) => t >= xs[0] - 1e-9 || xzero));
	const xlab = $derived(ybottom ? ph + 30 : ph + 18);
	const path = (v: number[]) => v.map((q, i) => `${i ? 'L' : 'M'}${x(xs[i]).toFixed(1)},${y(q).toFixed(1)}`).join('');
	const stairs = (v: number[]) => v.map((q, i) => (i ? `H${x(xs[i]).toFixed(1)}V${y(q).toFixed(1)}` : `M${x(xs[0]).toFixed(1)},${y(q).toFixed(1)}`)).join('');
	// draw faint series first so the emphasised ones sit on top
	const order = $derived([...series].sort((a, b) => Number(!a.faint) - Number(!b.faint)));

	let hi = $state(-1);
	function move(e: PointerEvent) {
		const px = e.offsetX - m.l;
		const f = reverse ? 1 - px / pw : px / pw;
		const t = xs[0] + f * (xs[xs.length - 1] - xs[0]);
		let best = 0;
		xs.forEach((v, i) => { if (Math.abs(v - t) < Math.abs(xs[best] - t)) best = i; });
		hi = best;
	}
</script>

<div class="ch" bind:clientWidth={w} use:tapAway={() => (hi = -1)}>
	{#if legend.length}<Legend items={legend} />{/if}
	<div class="ch-plot">
		<svg width={w} {height} role="img" aria-label={series.map((s) => s.name).join(', ')}>
			<g transform="translate({m.l},{m.t})">
				{#if unit}<text class="ch-unit" x={-m.l} y={-12}>{unit}</text>{/if}
				{#if band}
					<rect class="ch-band hl" x={Math.min(x(band.from), x(band.to))} y="0" width={Math.abs(x(band.to) - x(band.from))} height={ph} />
					{#if band.label}<text class="ch-endlabel" x={Math.max(x(band.from), x(band.to)) + 6} y="10" dy="0.32em">{band.label}</text>{/if}
				{/if}
				{#each yt as t}
					<line class="ch-grid" class:zero={t === 0} x1="0" x2={pw} y1={y(t)} y2={y(t)} />
					<text class="ch-tick" x="-8" y={y(t)} dy="0.32em" text-anchor="end">{ytick ? ytick(t) : compact(t)}</text>
				{/each}
				{#if ytop}<text class="ch-axisword" x="-8" y={y(ext[1]) - 16} dy="0.32em" text-anchor="end">{ytop}</text>{/if}
				{#if ybottom}<text class="ch-axisword" x="-8" y={y(ext[0]) + 16} dy="0.32em" text-anchor="end">{ybottom}</text>{/if}
				{#each xt as t}<text class="ch-tick" x={x(t)} y={xlab} text-anchor="middle">{xfmt(t)}</text>{/each}
				{#if xtitle}<text class="ch-tick" x={pw / 2} y={xlab + 16} text-anchor="middle">{xtitle}</text>{/if}
				{#each order as s}
					{#if s.dots}
						{#each s.values as q, i}<circle class="ch-pt" class:faint={s.faint} cx={x(xs[i])} cy={y(q)} r="3" style="fill: var({s.tok})" />{/each}
					{:else}
						<path d={s.step ? stairs(s.values) : path(s.values)} class="ch-line" class:faint={s.faint} class:thin={s.thin} style="stroke: var({s.tok})" />
					{/if}
					{#if s.label}<text class="ch-endlabel" x={pw + 6} y={y(s.values[s.values.length - 1])} dy="0.32em">{s.label}</text>{/if}
				{/each}
				{#if band && band.series !== undefined}
					{@const s = series[band.series]}
					{@const lo = Math.min(band.from, band.to) - 1e-6}
					{@const hi2 = Math.max(band.from, band.to) + 1e-6}
					<path d={xs.map((v, i) => [v, i] as const).filter(([v]) => v >= lo && v <= hi2).map(([v, i], k) => `${k ? 'L' : 'M'}${x(v).toFixed(1)},${y(s.values[i]).toFixed(1)}`).join('')}
						class="ch-line emph" style="stroke: var(--accent)" />
				{/if}
				{#each marks as mk}
					{@const s = series[mk.series]}
					<circle class="ch-dot" cx={x(xs[mk.i])} cy={y(s.values[mk.i])} r="5" style="fill: var(--accent)" />
					<text class="ch-endlabel" x={x(xs[mk.i]) - 9} y={y(s.values[mk.i])} dy="0.32em" text-anchor="end">{mk.label}</text>
				{/each}
				{#if hi >= 0}
					<line class="ch-cross" x1={x(xs[hi])} x2={x(xs[hi])} y1="0" y2={ph} />
					{#each series as s}{#if !s.faint}<circle class="ch-dot" cx={x(xs[hi])} cy={y(s.values[hi])} r="4" style="fill: var({s.tok})" />{/if}{/each}
				{/if}
				<rect class="ch-hit" x="0" y="0" width={pw} height={ph} onpointermove={move} onpointerdown={move} onpointerleave={leaveFor(() => (hi = -1))} role="presentation" />
			</g>
		</svg>
		{#if hi >= 0}
			<Tip x={m.l + x(xs[hi])} y={m.t} {w} title={(titleFmt ?? xfmt)(xs[hi])}
				rows={[...series].sort((a, b) => b.values[hi] - a.values[hi]).map((s) => ({ tok: s.tok, name: s.name, value: fmt(s.values[hi]) }))} />
		{/if}
	</div>
	{#if table}
		<details class="ch-data">
			<summary>Data table</summary>
			<table>
				<thead><tr><th>{label}</th>{#each series as s}<th class="n">{s.name}</th>{/each}</tr></thead>
				<tbody>
					{#each xs as v, i}<tr><td>{(titleFmt ?? xfmt)(v)}</td>{#each series as s}<td class="n">{fmt(s.values[i])}</td>{/each}</tr>{/each}
				</tbody>
			</table>
		</details>
	{/if}
</div>
