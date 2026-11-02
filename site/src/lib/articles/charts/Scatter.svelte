<script lang="ts">
	import { tapAway, leaveFor } from './tap.js';
	// Scatter plot: one dot per point, coloured by group, with a readout for the dot nearest the pointer.
	// The data table summarises the points (pass `table` rows); a table of every point would be too long to read.
	import Tip from './Tip.svelte';
	import Legend from './Legend.svelte';
	import { linear, ticks, nice, num } from './util';

	type Group = { name: string; tok: string };
	type Pt = [number, number, number, string]; // x, y, group index, label
	let {
		pts, groups, xfmt = (v: number) => num(v), yfmt = (v: number) => num(v), xtitle = '', unit = '', height = 320,
		xmin = undefined, xmax = undefined, ymax = undefined, ptLabel = (s: string) => s, xname = 'x', yname = 'y',
		table = undefined,
	}: {
		pts: Pt[]; groups: Group[]; xfmt?: (v: number) => string; yfmt?: (v: number) => string; xtitle?: string; unit?: string;
		height?: number; xmin?: number; xmax?: number; ymax?: number; ptLabel?: (s: string) => string; xname?: string; yname?: string;
		table?: { head: string[]; rows: string[][] };
	} = $props();

	let w = $state(680);
	const m = { l: 46, r: 14, t: 24, b: 44 };
	const pw = $derived(Math.max(100, w - m.l - m.r));
	const ph = $derived(height - m.t - m.b);
	const xe = $derived(nice(xmin ?? Math.min(...pts.map((p) => p[0])), xmax ?? Math.max(...pts.map((p) => p[0])), 6));
	const ye = $derived(nice(0, ymax ?? Math.max(...pts.map((p) => p[1])), 5));
	const x = $derived(linear(xe[0], xe[1], 0, pw));
	const y = $derived(linear(ye[0], ye[1], ph, 0));
	const xt = $derived(ticks(xe[0], xe[1], w < 520 ? 4 : 6));
	const yt = $derived(ticks(ye[0], ye[1], 5));
	// later groups are drawn on top
	const order = $derived(pts.map((p, i) => i).sort((a, b) => pts[a][2] - pts[b][2]));

	let hi = $state(-1);
	function move(e: PointerEvent) {
		const px = e.offsetX - m.l, py = e.offsetY - m.t;
		let best = -1, bd = 24 * 24;
		pts.forEach((p, i) => {
			const d = (x(p[0]) - px) ** 2 + (y(p[1]) - py) ** 2;
			if (d < bd) { bd = d; best = i; }
		});
		hi = best;
	}
</script>

<div class="ch" bind:clientWidth={w} use:tapAway={() => (hi = -1)}>
	<Legend items={groups.map((g) => ({ ...g, kind: 'dot' as const }))} />
	<div class="ch-plot">
		<svg width={w} {height} role="img" aria-label={groups.map((g) => g.name).join(', ')}>
			<g transform="translate({m.l},{m.t})">
				{#if unit}<text class="ch-unit" x={-m.l} y={-12}>{unit}</text>{/if}
				{#each yt as t}
					<line class="ch-grid" class:zero={t === 0} x1="0" x2={pw} y1={y(t)} y2={y(t)} />
					<text class="ch-tick" x="-8" y={y(t)} dy="0.32em" text-anchor="end">{num(t)}</text>
				{/each}
				{#each xt as t}<text class="ch-tick" x={x(t)} y={ph + 18} text-anchor="middle">{xfmt(t)}</text>{/each}
				{#if xtitle}<text class="ch-tick" x={pw / 2} y={ph + 36} text-anchor="middle">{xtitle}</text>{/if}
				{#each order as i}
					{@const p = pts[i]}
					<circle class="sc-dot" cx={x(p[0])} cy={y(p[1])} r="4.5" style="fill: var({groups[p[2]].tok})" class:dim={hi >= 0 && hi !== i} />
				{/each}
				{#if hi >= 0}
					{@const p = pts[hi]}
					<circle class="sc-ring" cx={x(p[0])} cy={y(p[1])} r="7" style="stroke: var({groups[p[2]].tok})" />
				{/if}
				<rect class="ch-hit" x="0" y="0" width={pw} height={ph} onpointermove={move} onpointerdown={move} onpointerleave={leaveFor(() => (hi = -1))} role="presentation" />
			</g>
		</svg>
		{#if hi >= 0}
			{@const p = pts[hi]}
			<Tip x={m.l + x(p[0])} y={m.t + y(p[1]) - 10} {w} title={ptLabel(p[3])} rows={[
				{ tok: groups[p[2]].tok, name: yname, value: yfmt(p[1]) },
				{ name: xname, value: xfmt(p[0]) },
			]} />
		{/if}
	</div>
	{#if table}
		<details class="ch-data">
			<summary>Data table</summary>
			<table>
				<thead><tr>{#each table.head as h, j}<th class:n={j > 0}>{h}</th>{/each}</tr></thead>
				<tbody>{#each table.rows as r}<tr>{#each r as c, j}<td class:n={j > 0}>{c}</td>{/each}</tr>{/each}</tbody>
			</table>
		</details>
	{/if}
</div>

<style>
	.sc-dot { stroke: var(--surface); stroke-width: 1.5; opacity: 0.9; }
	.sc-dot.dim { opacity: 0.35; }
	.sc-ring { fill: none; stroke-width: 2; }
</style>
