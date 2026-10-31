<script lang="ts">
	// One chart on the Prices page's shared time axis, drawn as SVG. Layers (bottom to top):
	//   band    { lo, hi, tok, opacity }      a filled range between two series
	//   posneg  { values, pos, neg }          an area from zero, coloured by sign (the island spread)
	//   area    { values, tok, opacity }      an area from zero
	//   bars    { values, tok, opacity }      one bar per point (long ranges)
	//   line    { values, tok, width, dash }  a line; NaN leaves a gap
	// shade: [a, b) index ranges shaded behind everything (islands priced apart); marks: labels at the top edge;
	// note: a label beside one point (the range's high) with a dot on it; stamp: the cursor's time in a chip at the top
	// (touch and keys, where there's no tooltip), as on the Generation tab.
	// onpoint(e, i) fires as the pointer moves (for the page's tooltip), onleave when it leaves. onpin(i): a click (not a
	// touch) at point i, to pin the time line there; while pinned the line ignores the pointer. onzoom(from, to): a mouse
	// drag across the chart, as times (to exclusive: the end of the last point dragged over), to zoom into that span.
	// unit: the axis's unit ($/MWh, MW ...) in small type under its top label (owner's call, 29 Oct 2026: replaces a unit
	// beside the card's title, which took a row on phones); a label it would sit on is left out.
	import { firstAtOrAfter } from '#lib/tracker/series.js';

	type Scale = { f: (v: number) => number; lo: number; hi: number; ticks: number[] };
	type Layer = { kind: string; values?: ArrayLike<number>; lo?: ArrayLike<number>; hi?: ArrayLike<number>; tok?: string; pos?: string; neg?: string; width?: number; dash?: string; opacity?: number; dot?: boolean };

	let {
		t, t0, t1, height = 200, y, fmt = (v: number) => String(v), layers = [], shade = [], marks = [], hover = $bindable(-1),
		xTicks = [], showX = false, label = '', zero = false, note = null, stamp = null, pinned = false, onpoint, onleave, onpin, onunpin, onzoom, unit = ''
	}: {
		t: ArrayLike<number>; t0: number; t1: number; height?: number; y: Scale; fmt?: (v: number) => string; layers?: Layer[];
		shade?: [number, number][]; marks?: { i: number; label: string }[]; hover?: number; xTicks?: { t: number; label: string; minor?: boolean }[];
		showX?: boolean; label?: string; zero?: boolean; note?: { i: number; v: number; text: string; tok?: string } | null; stamp?: string | null;
		onpoint?: (e: PointerEvent, i: number) => void; onleave?: (e: PointerEvent) => void; pinned?: boolean; onpin?: (i: number) => void; onunpin?: () => void;
		onzoom?: (from: number, to: number) => void; unit?: string;
	} = $props();

	let W = $state(600);
	const L = 52, R = 10, T = 8;
	const B = $derived(showX ? 22 : 6);
	const n = $derived(t.length);
	const X = (v: number) => L + ((v - t0) / (t1 - t0 || 1)) * (W - L - R);
	const Y = (v: number) => T + ((y.hi - y.f(v)) / (y.hi - y.lo || 1)) * (height - T - B);
	const x0 = $derived(L), x1 = $derived(W - R), yTop = T, yBot = $derived(height - B);
	// where the unit sits (just under the top tick label) and which labels it would cover
	const unitAt = $derived.by(() => {
		if (!unit) return null;
		const ys = y.ticks.map((tk) => Y(tk));
		let k = -1;
		ys.forEach((v, i) => { if (v >= yTop - 1 && v <= yBot + 1 && (k < 0 || v < ys[k])) k = i; });
		if (k < 0) return null;
		const uy = Math.max(ys[k], yTop + 3) + 12;
		return { y: uy, skip: new Set(ys.flatMap((v, i) => (i !== k && Math.abs(v - uy) < 11 ? [i] : []))) };
	});
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

	function indexAt(e: MouseEvent) {
		const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
		const px = ((e.clientX - r.left) / r.width) * W;
		const tv = t0 + ((px - L) / (W - L - R)) * (t1 - t0);
		let i = firstAtOrAfter(t as Float64Array, tv);
		if (i >= n) i = n - 1;
		if (i > 0 && Math.abs(t[i - 1] - tv) < Math.abs(t[i] - tv)) i--;
		return i;
	}
	let downBy = '';   // how the last press came: a touch keeps its point without pinning (it scrubs instead)
	// a mouse drag: from where it was pressed to where the pointer is ([a, b] in px); a few pixels is still a click
	let drag = $state<{ a: number; b: number; i: number } | null>(null);
	let dragged = false;
	const pxOf = (e: MouseEvent) => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); return Math.max(x0, Math.min(x1, ((e.clientX - r.left) / r.width) * W)); };
	// where a touch went down, so a tap (no slide) can be told from a scrub, and where the line was before it
	let downX = 0, downHx: number | null = null;
	function down(e: PointerEvent) {
		downX = e.clientX; downHx = hx;
		if (onzoom && e.pointerType === 'mouse' && e.button === 0) { const px = pxOf(e); drag = { a: px, b: px, i: indexAt(e) }; dragged = false; }
		move(e);
	}
	function up(e: PointerEvent) {
		if (!drag) return;
		const d = drag; drag = null;
		if (Math.abs(d.b - d.a) < 6) return;
		const j = indexAt(e), lo = Math.min(d.i, j), hi = Math.max(d.i, j);
		if (hi - lo < 1) return;
		dragged = true;
		const step = hi + 1 < n ? t[hi + 1] - t[hi] : hi > 0 ? t[hi] - t[hi - 1] : 0;
		onzoom?.(t[lo], t[hi] + step);
	}
	function move(e: PointerEvent) {
		if (e.type === 'pointerdown') downBy = e.pointerType;
		if (drag && e.type === 'pointermove') drag.b = pxOf(e);
		if (pinned) return;
		const i = indexAt(e);
		if (i >= 0 && i !== hover) hover = i;
		if (i >= 0) onpoint?.(e, i);
	}
	// a tap on the line, pinned or left by a touch, lets it go, as on the Generation tab (owner's report SHR-07,
	// 31 Oct 2026: on a phone a pin, even one opened from a shared link, couldn't be released)
	const TAP_PX = 24;
	function click(e: MouseEvent) {
		if (dragged) { dragged = false; return; }   // the end of a zoom drag, not a click
		if (downBy === 'touch') {
			const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
			const px = ((e.clientX - r.left) / r.width) * W;
			if (downHx != null && Math.abs(e.clientX - downX) < 8 && Math.abs(px - downHx) <= TAP_PX) onunpin?.();
			return;
		}
		if (!onpin) return;
		const i = indexAt(e);
		if (i >= 0) onpin(i);
	}
	// marks: a triangle at every clipped point (one per few pixels), and labels only where they don't overlap;
	// marks come highest first, so the highest prices get their labels
	const placed = $derived.by(() => {
		const tri: number[] = [], labels: { x: number; anchor: string; text: string }[] = [], boxes: [number, number][] = [];
		for (const m of marks) {
			if (m.i < 0 || m.i >= n) continue;
			const x = X(t[m.i]);
			if (!tri.some((v) => Math.abs(v - x) < 6)) tri.push(x);
			if (!m.label) continue;
			const w = m.label.length * 6.4, right = x + 8 + w < x1;
			const a = right ? x + 8 : x - 8 - w, b = a + w;
			if (a < x0 || boxes.some(([p, q]) => a < q + 10 && b > p - 10)) continue;
			boxes.push([a, b]);
			labels.push({ x: right ? x + 8 : x - 8, anchor: right ? 'start' : 'end', text: m.label });
		}
		return { tri, labels, boxes };
	});
	// the note sits beside its point, kept inside the plot
	const noteX = $derived.by(() => {
		if (!note || note.i < 0 || note.i >= n) return 0;
		const x = X(t[note.i]), w = note.text.length * 6.4;
		const lx = x + 10 + w < x1 ? x + 9 : x - 9 - w;
		return Math.max(x0 + 4, Math.min(x1 - w, lx));
	});
	const hx = $derived(hover >= 0 && hover < n ? X(t[hover]) : null);
	// time labels that fit: all of them when there's room; otherwise every k-th main label (no minor ones), so they
	// don't run into each other on a narrow screen
	const ticks = $derived.by(() => {
		const main = xTicks.filter((x) => !x.minor);
		if (!main.length) return xTicks;
		const fits = (list: typeof xTicks) => list.every((x, i) => !i || X(x.t) - X(list[i - 1].t) >= (x.label.length + list[i - 1].label.length) * 3.3 + 12);
		if (fits(xTicks)) return xTicks;
		for (let k = 1; k <= main.length; k++) {
			const keep = main.filter((_, i) => i % k === 0);
			if (fits(keep)) return keep;
		}
		return main.slice(0, 1);
	});
</script>

<div class="tc" bind:clientWidth={W}>
	<!-- a click pins the time line; the keyboard moves it with the arrow keys on the page's focusable chart panel -->
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
	<svg width={W} {height} viewBox="0 0 {W} {height}" role="img" aria-label={label} onpointermove={move} onpointerdown={down} onpointerup={up} onpointerleave={(e) => { drag = null; onleave?.(e); }} onclick={click} class:pinnable={!!onpin}>
		{#each shade as [a, b]}
			<rect class="shade" x={Math.max(x0, X(t[a]) - half(a))} y={yTop} width={Math.max(1, X(t[b - 1]) + half(b - 1) - Math.max(x0, X(t[a]) - half(a)))} height={yBot - yTop}></rect>
		{/each}
		{#each y.ticks as tk, i}
			<line class={tk === 0 && zero ? 'zero' : 'grid'} x1={x0} x2={x1} y1={Y(tk)} y2={Y(tk)}></line>
			{#if !unitAt?.skip.has(i)}<text class="yl" x={x0 - 6} y={Y(tk) + 4} text-anchor="end">{fmt(tk)}</text>{/if}
		{/each}
		{#if unitAt}<text class="yu" x={x0 - 6} y={unitAt.y + 4} text-anchor="end">{unit}</text>{/if}
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
		{#each placed.tri as x}
			<path class="mark" d="M{x - 5} {yTop + 8} L{x + 5} {yTop + 8} L{x} {yTop} Z"></path>
		{/each}
		{#each placed.labels as l}
			<text class="ml" x={l.x} y={yTop + 10} text-anchor={l.anchor}>{l.text}</text>
		{/each}
		{#if note && note.i >= 0 && note.i < n && note.v === note.v}
			<text class="note" x={noteX} y={Math.max(yTop + 10, Math.min(yBot - 4, Y(note.v) + 4))}>{note.text}</text>
			<circle cx={X(t[note.i])} cy={Y(note.v)} r="4" style="fill: var({note.tok ?? '--ink'})" class="dot"></circle>
		{/if}
		{#if hx !== null}
			<line class="cursor" class:pinned x1={Math.round(hx) + 0.5} x2={Math.round(hx) + 0.5} y1={yTop} y2={yBot}></line>
			{#each layers as ly}
				{#if ly.kind === 'line' && ly.dot !== false && ly.values && ly.values[hover] === ly.values[hover]}
					<circle cx={hx} cy={Y(ly.values[hover])} r="4" style="fill: var({ly.tok})" class="dot"></circle>
				{/if}
			{/each}
		{/if}
		{#if stamp && hx !== null}
			{@const sw = stamp.length * 6.6 + 12}
			{@const sx = Math.max(x0, Math.min(x1 - sw, hx - sw / 2))}
			<g class="stamp"><rect x={sx} y={yTop} width={sw} height="18" rx="4"></rect><text x={sx + 6} y={yTop + 13}>{stamp}</text></g>
		{/if}
		{#if drag && Math.abs(drag.b - drag.a) >= 6}
			<rect class="zsel" x={Math.min(drag.a, drag.b)} y={yTop} width={Math.abs(drag.b - drag.a)} height={yBot - yTop}></rect>
		{/if}
		{#if showX}
			{#each ticks as tk}
				{#if X(tk.t) >= x0 - 1 && X(tk.t) <= x1 + 1}
					<line class="xt" x1={X(tk.t)} x2={X(tk.t)} y1={yBot} y2={yBot + 4}></line>
					<text class="xl" class:minor={tk.minor} x={X(tk.t)} y={height - 5} text-anchor="middle">{tk.label}</text>
				{/if}
			{/each}
		{/if}
	</svg>
</div>

<style>
	.tc { width: 100%; touch-action: pan-y pinch-zoom; }
	svg { display: block; cursor: crosshair; overflow: hidden; }
	text { font-family: var(--font-data); font-size: 10.5px; fill: var(--muted); }
	.yu { font-family: var(--font-ui); font-size: 10px; font-weight: 600; }
	.grid { stroke: var(--grid); }
	.zero { stroke: var(--ink-2); stroke-width: 1; }
	.shade { fill: var(--warn-bg); }
	/* cursor, dots and time chip match the Generation tab's canvas charts */
	.cursor { stroke: var(--ink-2); stroke-width: 1; }
	.cursor.pinned { stroke: var(--accent); stroke-width: 1.5; }
	svg.pinnable { cursor: crosshair; }
	.dot { stroke: var(--surface); stroke-width: 2; }
	.stamp rect { fill: var(--ink); }
	.stamp text { fill: var(--surface); font-size: 11px; font-weight: 600; }
	.xt { stroke: var(--line); }
	.xl.minor { opacity: 0.75; }
	.mark { fill: var(--o1); }
	.zsel { fill: color-mix(in srgb, var(--accent) 16%, transparent); stroke: var(--accent); stroke-width: 1; }
	.ml { fill: var(--ink); font-weight: 500; }
	.note { fill: var(--ink-2); }
	/* a halo in the panel colour keeps labels readable over the lines */
	.ml, .note { paint-order: stroke; stroke: var(--surface); stroke-width: 3px; stroke-linejoin: round; }
</style>
