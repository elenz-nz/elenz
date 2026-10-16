<script lang="ts">
	// One chart on the Prices page's shared time axis, drawn as SVG. Layers (bottom to top):
	//   band    { lo, hi, tok, opacity }      a filled range between two series
	//   posneg  { values, pos, neg }          an area from zero, coloured by sign (the island spread)
	//   area    { values, tok, opacity }      an area from zero
	//   bars    { values, tok, opacity }      one bar per point (long ranges)
	//   line    { values, tok, width, dash }  a line; NaN leaves a gap
	// shade: [a, b) index ranges shaded behind everything (islands priced apart); marks: labels at the top edge.
	import { firstAtOrAfter } from '#lib/tracker/series.js';

	type Scale = { f: (v: number) => number; lo: number; hi: number; ticks: number[] };
	type Layer = { kind: string; values?: ArrayLike<number>; lo?: ArrayLike<number>; hi?: ArrayLike<number>; tok?: string; pos?: string; neg?: string; width?: number; dash?: string; opacity?: number; dot?: boolean };

	let {
		t, t0, t1, height = 200, y, fmt = (v: number) => String(v), layers = [], shade = [], marks = [], hover = $bindable(-1),
		xTicks = [], showX = false, label = '', zero = false
	}: {
		t: ArrayLike<number>; t0: number; t1: number; height?: number; y: Scale; fmt?: (v: number) => string; layers?: Layer[];
		shade?: [number, number][]; marks?: { i: number; label: string }[]; hover?: number; xTicks?: { t: number; label: string; minor?: boolean }[];
		showX?: boolean; label?: string; zero?: boolean;
	} = $props();

	let W = $state(600);
	const L = 52, R = 10, T = 8;
	const B = $derived(showX ? 22 : 6);
	const n = $derived(t.length);
	const X = (v: number) => L + ((v - t0) / (t1 - t0 || 1)) * (W - L - R);
	const Y = (v: number) => T + ((y.hi - y.f(v)) / (y.hi - y.lo || 1)) * (height - T - B);
	const x0 = $derived(L), x1 = $derived(W - R), yTop = T, yBot = $derived(height - B);
	// half the gap to the next point: bar width and shading edges
	const half = (i: number) => (i + 1 < n ? (X(t[i + 1]) - X(t[i])) / 2 : i > 0 ? (X(t[i]) - X(t[i - 1])) / 2 : 4);

	function linePath(v: ArrayLike<number>) {
		let d = '', pen = false;
		for (let i = 0; i < n; i++) {
			const val = v[i];
			if (val !== val) { pen = false; continue; }
			d += (pen ? 'L' : 'M') + X(t[i]).toFixed(1) + ' ' + Y(val).toFixed(1);
			pen = true;
		}
		return d;
	}
	function areaPath(v: ArrayLike<number>, clip = (x: number) => x) {
		if (!n) return '';
		const y0 = Y(0).toFixed(1);
		let d = 'M' + X(t[0]).toFixed(1) + ' ' + y0;
		for (let i = 0; i < n; i++) d += 'L' + X(t[i]).toFixed(1) + ' ' + Y(clip(v[i] === v[i] ? v[i] : 0)).toFixed(1);
		return d + 'L' + X(t[n - 1]).toFixed(1) + ' ' + y0 + 'Z';
	}
	function bandPath(lo: ArrayLike<number>, hi: ArrayLike<number>) {
		if (!n) return '';
		let d = '';
		for (let i = 0; i < n; i++) d += (i ? 'L' : 'M') + X(t[i]).toFixed(1) + ' ' + Y(hi[i]).toFixed(1);
		for (let i = n - 1; i >= 0; i--) d += 'L' + X(t[i]).toFixed(1) + ' ' + Y(lo[i]).toFixed(1);
		return d + 'Z';
	}

	function move(e: PointerEvent) {
		const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
		const px = ((e.clientX - r.left) / r.width) * W;
		const tv = t0 + ((px - L) / (W - L - R)) * (t1 - t0);
		let i = firstAtOrAfter(t as Float64Array, tv);
		if (i >= n) i = n - 1;
		if (i > 0 && Math.abs(t[i - 1] - tv) < Math.abs(t[i] - tv)) i--;
		if (i >= 0 && i !== hover) hover = i;
	}
	const hx = $derived(hover >= 0 && hover < n ? X(t[hover]) : null);
</script>

<div class="tc" bind:clientWidth={W}>
	<svg width={W} {height} viewBox="0 0 {W} {height}" role="img" aria-label={label} onpointermove={move} onpointerdown={move}>
		{#each shade as [a, b]}
			<rect class="shade" x={Math.max(x0, X(t[a]) - half(a))} y={yTop} width={Math.max(1, X(t[b - 1]) + half(b - 1) - Math.max(x0, X(t[a]) - half(a)))} height={yBot - yTop}></rect>
		{/each}
		{#each y.ticks as tk}
			<line class={tk === 0 && zero ? 'zero' : 'grid'} x1={x0} x2={x1} y1={Y(tk)} y2={Y(tk)}></line>
			<text class="yl" x={x0 - 6} y={Y(tk) + 4} text-anchor="end">{fmt(tk)}</text>
		{/each}
		{#each layers as ly}
			{#if ly.kind === 'band' && ly.lo && ly.hi}
				<path d={bandPath(ly.lo, ly.hi)} style="fill: var({ly.tok}); opacity: {ly.opacity ?? 0.25}"></path>
			{:else if ly.kind === 'posneg' && ly.values}
				<path d={areaPath(ly.values, (v) => Math.max(v, 0))} style="fill: var({ly.pos}); opacity: {ly.opacity ?? 0.8}"></path>
				<path d={areaPath(ly.values, (v) => Math.min(v, 0))} style="fill: var({ly.neg}); opacity: {ly.opacity ?? 0.8}"></path>
			{:else if ly.kind === 'area' && ly.values}
				<path d={areaPath(ly.values)} style="fill: var({ly.tok}); opacity: {ly.opacity ?? 0.5}"></path>
			{:else if ly.kind === 'bars' && ly.values}
				{#each { length: n } as _, i}
					{#if ly.values[i] === ly.values[i] && ly.values[i] !== 0}
						<rect x={X(t[i]) - half(i) * 0.8} width={Math.max(1, half(i) * 1.6)} y={Math.min(Y(ly.values[i]), Y(0))} height={Math.abs(Y(0) - Y(ly.values[i]))}
							style="fill: var({ly.values[i] < 0 && ly.neg ? ly.neg : ly.tok}); opacity: {ly.opacity ?? 1}"></rect>
					{/if}
				{/each}
			{:else if ly.kind === 'line' && ly.values}
				<path d={linePath(ly.values)} style="fill: none; stroke: var({ly.tok}); stroke-width: {ly.width ?? 1.5}; stroke-linejoin: round; {ly.dash ? `stroke-dasharray: ${ly.dash}` : ''}"></path>
			{/if}
		{/each}
		{#each marks as m}
			<path class="mark" d="M{X(t[m.i]) - 5} {yTop + 8} L{X(t[m.i]) + 5} {yTop + 8} L{X(t[m.i])} {yTop} Z"></path>
			<text class="ml" x={X(t[m.i]) + (X(t[m.i]) > W * 0.7 ? -8 : 8)} y={yTop + 10} text-anchor={X(t[m.i]) > W * 0.7 ? 'end' : 'start'}>{m.label}</text>
		{/each}
		{#if hx !== null}
			<line class="cursor" x1={hx} x2={hx} y1={yTop} y2={yBot}></line>
			{#each layers as ly}
				{#if ly.kind === 'line' && ly.dot !== false && ly.values && ly.values[hover] === ly.values[hover]}
					<circle cx={hx} cy={Y(ly.values[hover])} r="3.2" style="stroke: var({ly.tok})" class="dot"></circle>
				{/if}
			{/each}
		{/if}
		{#if showX}
			{#each xTicks as tk}
				{#if X(tk.t) >= x0 - 1 && X(tk.t) <= x1 + 1}
					<line class="xt" x1={X(tk.t)} x2={X(tk.t)} y1={yBot} y2={yBot + 4}></line>
					<text class="xl" class:minor={tk.minor} x={X(tk.t)} y={height - 5} text-anchor="middle">{tk.label}</text>
				{/if}
			{/each}
		{/if}
	</svg>
</div>

<style>
	.tc { width: 100%; touch-action: pan-y; }
	svg { display: block; cursor: crosshair; overflow: hidden; }
	text { font-family: var(--font-data); font-size: 10.5px; fill: var(--muted); }
	.grid { stroke: var(--grid); }
	.zero { stroke: var(--ink-2); stroke-width: 1; }
	.shade { fill: var(--warn-bg); }
	.cursor { stroke: var(--ink); stroke-dasharray: 3 3; }
	.dot { fill: var(--surface); stroke-width: 2; }
	.xt { stroke: var(--line); }
	.xl.minor { opacity: 0.75; }
	.mark { fill: var(--o1); }
	.ml { fill: var(--ink); font-weight: 500; }
</style>
