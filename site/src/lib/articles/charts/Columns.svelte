<script lang="ts">
	// Column chart for articles: grouped or stacked (optionally as shares of 100%), negatives allowed.
	// Hover or focus a column for its values; a data table sits under the chart.
	import Tip from './Tip.svelte';
	import Legend from './Legend.svelte';
	import { linear, ticks, nice, num, compact, barPath } from './util';

	type Series = { name: string; tok: string; values: number[] };
	let {
		cats, series, stacked = false, percent = false, colors = [], tops = [], unit = '', height = 260,
		fmt = (v: number) => num(v), label = 'Category', legend = undefined, table = true, xlabels = undefined,
	}: {
		cats: string[]; series: Series[]; stacked?: boolean; percent?: boolean; colors?: (string | null)[];
		tops?: (string | null)[]; unit?: string; height?: number; fmt?: (v: number) => string; label?: string;
		legend?: boolean; table?: boolean; xlabels?: (string | null)[];
	} = $props();

	let w = $state(680);
	const m = { l: 46, r: 8, t: 26, b: 28 };
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
		return percent ? [0, 100] : nice(lo, hi, 5);
	});
	const y = $derived(linear(extent[0], extent[1], ph, 0));
	const yt = $derived(ticks(extent[0], extent[1], 5));
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
		return rows.filter((r) => r.value !== '0' && r.value !== '0.0%');
	})());
	const showLegend = $derived(legend ?? series.length > 1);
</script>

<div class="ch" bind:clientWidth={w}>
	{#if showLegend}<Legend items={series.map((s) => ({ name: s.name, tok: s.tok }))} />{/if}
	<div class="ch-plot">
		<svg width={w} {height} role="img" aria-label={`${series.map((s) => s.name).join(', ')} by ${label.toLowerCase()}`}>
			<g transform="translate({m.l},{m.t})">
				{#if unit}<text class="ch-unit" x={-m.l} y={-12}>{unit}</text>{/if}
				{#each yt as t}
					<line class="ch-grid" class:zero={t === 0} x1="0" x2={pw} y1={y(t)} y2={y(t)} />
					<text class="ch-tick" x="-8" y={y(t)} dy="0.32em" text-anchor="end">{percent ? `${t}%` : compact(t)}</text>
				{/each}
				{#if hover >= 0}<rect class="ch-band" x={band * hover} y="0" width={band} height={ph} />{/if}
				{#each bars as b}
					<path d={b.d} style="fill: var({b.tok})" class:dim={hover >= 0 && hover !== b.i} />
				{/each}
				{#each cats as c, i}
					<text class="ch-tick" x={band * i + band / 2} y={ph + 18} text-anchor="middle">{xlabels ? (xlabels[i] ?? '') : c}</text>
					{#if tops[i]}<text class="ch-top" x={band * i + band / 2} y={topY(i) - 7} text-anchor="middle">{tops[i]}</text>{/if}
					<rect class="ch-hit" x={band * i} y="0" width={band} height={ph} tabindex="0" role="button" aria-label="{c}: {series.map((s) => `${s.name} ${fmt(s.values[i])}`).join(', ')}"
						onpointerenter={() => (hover = i)} onpointermove={(e) => (py = e.offsetY - 10)} onpointerleave={() => (hover = -1)}
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
				<thead><tr><th>{label}</th>{#each series as s}<th class="n">{s.name}</th>{/each}</tr></thead>
				<tbody>
					{#each cats as c, i}<tr><td>{c}</td>{#each series as s}<td class="n">{fmt(s.values[i])}</td>{/each}</tr>{/each}
				</tbody>
			</table>
		</details>
	{/if}
</div>
