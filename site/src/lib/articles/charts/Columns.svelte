<script lang="ts">
	import { tapAway, leaveFor } from './tap.js';
	// Column chart for articles: grouped or stacked (optionally as shares of 100%), negatives allowed.
	// Hover or focus a column for its values; a data table sits under the chart.
	import Tip from './Tip.svelte';
	import Legend from './Legend.svelte';
	import { linear, ticks, nice, num, compact, barPath } from './util';

	type Series = { name: string; tok: string; values: number[] };
	// an optional thin line drawn behind the columns, on its own right-hand axis starting at zero
	type Line = { name: string; tok: string; values: number[]; unit: string; fmt: (v: number) => string };
	// optional marks on the same axis as the columns: a short level line across each column (e.g. a comparison price)
	type Mark = { name: string; tok: string; values: number[]; fmt: (v: number) => string };
	let {
		cats, series, stacked = false, percent = false, colors = [], tops = [], unit = '', height = 260,
		fmt = (v: number) => num(v), label = 'Category', legend = undefined, table = true, xlabels = undefined, line = undefined, marks = undefined,
	}: {
		cats: string[]; series: Series[]; stacked?: boolean; percent?: boolean; colors?: (string | null)[];
		tops?: (string | null)[]; unit?: string; height?: number; fmt?: (v: number) => string; label?: string;
		legend?: boolean; table?: boolean; xlabels?: (string | null)[]; line?: Line; marks?: Mark;
	} = $props();

	let w = $state(680);
	const m = $derived({ l: 46, r: line ? 46 : 8, t: 26, b: 28 });
	const pw = $derived(Math.max(100, w - m.l - m.r));
	const ph = $derived(height - m.t - m.b);
	const n = $derived(cats.length);
	const band = $derived(pw / n);

	// stacked values become shares when percent is set
	const vals = $derived(series.map((s, j) => s.values.map((v, i) => {
		if (!percent) return v;
		const tot = series.reduce((a, q) => a + Math.max(0, q.values[i]), 0);
		return tot ? (100 * Math.max(0, v)) / tot : 0;
	})));
	const extent = $derived.by(() => {
		let lo = 0, hi = 0;
		for (let i = 0; i < n; i++) {
			if (stacked) hi = Math.max(hi, vals.reduce((a, s) => a + Math.max(0, s[i]), 0));
			else for (const s of vals) { hi = Math.max(hi, s[i]); lo = Math.min(lo, s[i]); }
		}
		if (marks) hi = Math.max(hi, ...marks.values);
		return percent ? [0, 100] : nice(lo, hi, 5);
	});
	const y = $derived(linear(extent[0], extent[1], ph, 0));
	const yt = $derived(ticks(extent[0], extent[1], 5));
	// right axis: zero-based, with a round step chosen so its ticks sit on the left axis's gridlines
	const rmax = $derived.by(() => {
		if (!line) return 1;
		const k = Math.max(1, yt.length - 1);
		const raw = Math.max(...line.values) / k;
		const mag = 10 ** Math.floor(Math.log10(raw));
		const step = [1, 2, 2.5, 4, 5, 10].map((q) => q * mag).find((q) => q >= raw) ?? 10 * mag;
		return step * k;
	});
	const yr = $derived(linear(0, rmax, ph, 0));
	const ns = $derived(stacked ? 1 : series.length);
	const bw = $derived(Math.min(24, (band * 0.62 - (ns - 1) * 2) / ns));
	const gw = $derived(ns * bw + (ns - 1) * 2);

	type Bar = { d: string; tok: string; i: number };
	const bars = $derived.by((): Bar[] => {
		const out: Bar[] = [];
		for (let i = 0; i < n; i++) {
			const x0 = band * i + (band - gw) / 2;
			if (stacked) {
				let acc = 0;
				const live = vals.map((s, j) => j).filter((j) => vals[j][i] > 0);
				live.forEach((j, k) => {
					const v = vals[j][i];
					// 2px surface gap between segments: each segment gives up 1px at each inner edge
					const yb = y(acc) - (k > 0 ? 1 : 0), yt2 = y(acc + v) + (k < live.length - 1 ? 1 : 0);
					out.push({ d: barPath(x0, bw, yb, yt2, 4, k === live.length - 1), tok: series[j].tok, i });
					acc += v;
				});
			} else {
				vals.forEach((s, j) => {
					const tok = (series.length === 1 && colors[i]) || series[j].tok;
					out.push({ d: barPath(x0 + j * (bw + 2), bw, y(0), y(s[i])), tok, i });
				});
			}
		}
		return out;
	});
	const topY = (i: number) => stacked
		? y(vals.reduce((a, s) => a + Math.max(0, s[i]), 0))
		: Math.min(...vals.map((s) => y(Math.max(0, s[i]))));

	let hover = $state(-1);
	let py = $state(0);
	const tipRows = $derived(hover < 0 ? [] : (() => {
		const rows = series.map((s, j) => ({
			tok: (series.length === 1 && colors[hover]) || s.tok, name: s.name,
			value: percent ? `${vals[j][hover].toFixed(1)}%` : fmt(s.values[hover]),
		}));
		if (stacked) rows.reverse();
		if (stacked && !percent && series.length > 1)
			rows.push({ tok: '', name: 'Total', value: fmt(series.reduce((a, s) => a + s.values[hover], 0)) });
		const out = rows.filter((r) => r.value !== '0' && r.value !== '0.0%');
		if (line) out.push({ tok: line.tok, name: line.name, value: line.fmt(line.values[hover]) });
		if (marks) out.push({ tok: marks.tok, name: marks.name, value: marks.fmt(marks.values[hover]) });
		return out;
	})());
	const showLegend = $derived(legend ?? (series.length > 1 || !!line || !!marks));
	const legendItems = $derived([
		...series.map((s) => ({ name: line ? `${s.name} (left)` : s.name, tok: s.tok })),
		...(line ? [{ name: `${line.name} (right)`, tok: line.tok, kind: 'line' as const }] : []),
		...(marks ? [{ name: marks.name, tok: marks.tok, kind: 'line' as const }] : []),
	]);
</script>

<div class="ch" bind:clientWidth={w} use:tapAway={() => (hover = -1)}>
	{#if showLegend}<Legend items={legendItems} />{/if}
	<div class="ch-plot">
		<svg width={w} {height} role="img" aria-label={`${series.map((s) => s.name).join(', ')} by ${label.toLowerCase()}`}>
			<g transform="translate({m.l},{m.t})">
				{#if unit}<text class="ch-unit" x={-m.l} y={-12}>{unit}</text>{/if}
				{#each yt as t}
					<line class="ch-grid" class:zero={t === 0} x1="0" x2={pw} y1={y(t)} y2={y(t)} />
					<text class="ch-tick" x="-8" y={y(t)} dy="0.32em" text-anchor="end">{percent ? `${t}%` : compact(t)}</text>
				{/each}
				{#if line}
					<text class="ch-unit" x={pw + m.r} y={-12} text-anchor="end">{line.unit}</text>
					{#each yt as t, k}
						{@const v = (rmax * k) / Math.max(1, yt.length - 1)}
						<text class="ch-tick" x={pw + 8} y={yr(v)} dy="0.32em">{compact(v)}</text>
					{/each}
				{/if}
				{#if hover >= 0}<rect class="ch-band" x={band * hover} y="0" width={band} height={ph} />{/if}
				{#if line}
					<path class="ch-line thin" style="stroke: var({line.tok})" d={line.values.map((v, i) => `${i ? 'L' : 'M'}${band * i + band / 2},${yr(v)}`).join('')} />
					{#each line.values as v, i}<circle class="ch-dot small" cx={band * i + band / 2} cy={yr(v)} r="3" style="fill: var({line.tok})" />{/each}
				{/if}
				{#each bars as b}
					<path d={b.d} style="fill: var({b.tok})" class:dim={hover >= 0 && hover !== b.i} />
				{/each}
				{#if marks}
					{#each marks.values as v, i}
						{@const x0 = band * i + (band - gw) / 2}
						<line class="ch-mark" x1={x0 - 6} x2={x0 + gw + 6} y1={y(v)} y2={y(v)} style="stroke: var({marks.tok})" />
					{/each}
				{/if}
				{#each cats as c, i}
					<text class="ch-tick" x={band * i + band / 2} y={ph + 18} text-anchor="middle">{xlabels ? (xlabels[i] ?? '') : c}</text>
					{#if tops[i]}<text class="ch-top" x={band * i + band / 2} y={topY(i) - 7} text-anchor="middle">{tops[i]}</text>{/if}
					<rect class="ch-hit" x={band * i} y="0" width={band} height={ph} tabindex="0" role="button" aria-label="{c}: {series.map((s) => `${s.name} ${fmt(s.values[i])}`).join(', ')}{line ? `, ${line.name} ${line.fmt(line.values[i])}` : ''}{marks ? `, ${marks.name} ${marks.fmt(marks.values[i])}` : ''}"
						onpointerenter={() => (hover = i)} onpointerdown={() => (hover = i)} onpointermove={(e) => (py = e.offsetY - 10)} onpointerleave={leaveFor(() => (hover = -1))}
						onfocus={() => { hover = i; py = m.t; }} onblur={() => (hover = -1)} />
				{/each}
			</g>
		</svg>
		{#if hover >= 0}
			<Tip x={m.l + band * hover + band / 2} y={py} {w} title={cats[hover]} rows={tipRows} />
		{/if}
	</div>
	{#if table}
		<details class="ch-data">
			<summary>Data table</summary>
			<table>
				<thead><tr><th>{label}</th>{#each series as s}<th class="n">{s.name}</th>{/each}{#if line}<th class="n">{line.name}</th>{/if}{#if marks}<th class="n">{marks.name}</th>{/if}</tr></thead>
				<tbody>
					{#each cats as c, i}<tr><td>{c}</td>{#each series as s}<td class="n">{fmt(s.values[i])}</td>{/each}{#if line}<td class="n">{line.fmt(line.values[i])}</td>{/if}{#if marks}<td class="n">{marks.fmt(marks.values[i])}</td>{/if}</tr>{/each}
				</tbody>
			</table>
		</details>
	{/if}
</div>
