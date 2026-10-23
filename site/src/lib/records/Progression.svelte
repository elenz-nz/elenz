<script lang="ts">
	// How a record grew: a step line from the first data to today, one step each time it was broken, the current
	// record marked, and a provisional one (dashed) beyond it. Hover shows the record at that date; a click, tap or
	// drag pins it (it stays after the finger lifts; another click on it, a tap outside the chart or Escape lets go).
	// On touch the tooltip sits above the chart, clear of the finger.
	import { yearOf, trimZeros } from './records.js';

	// fmt: axis labels (bare numbers); full: a value with its unit, for the tooltip and readout (fmt if not given)
	let { steps: all, first: dataFirst, end, tok = '--ink', label, fmt, full, prov = null, dashed = false, when }:
		{ steps: [number, number][]; first: number; end: number; tok?: string; label: string; fmt: (v: number) => string;
		  full?: (v: number) => string; prov?: { t: number; v: number } | null; dashed?: boolean; when?: (t: number) => string } = $props();
	const val = (v: number) => (full ?? fmt)(v);
	// leading zeros left out (grid solar until its first farm): the chart starts at the first record above zero
	const steps = $derived(trimZeros(all) as [number, number][]);
	const trimmed = $derived(steps !== all);
	const first = $derived(trimmed ? steps[0][0] : dataFirst);
	const whenOf = (t: number) => when ? when(t) : new Date(t).toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'short', year: 'numeric' });

	// drawn at the width it is shown, so labels stay readable on phones
	let cw = $state(1000);
	const W = $derived(Math.max(320, Math.min(1000, cw)));
	const H = $derived(W < 600 ? 220 : 300);
	const L = 64, Rm = 18, T = 16, B = 30;
	const pts = $derived(prov ? [...steps, [prov.t, prov.v] as [number, number]] : steps);
	const t1 = $derived(Math.max(end, pts[pts.length - 1][0]));

	// a round axis that holds every step (from zero for most records: the growth is the point)
	function niceStep(span: number) {
		const raw = span / 4, p = 10 ** Math.floor(Math.log10(raw || 1)), m = raw / p;
		return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
	}
	const ax = $derived.by(() => {
		const vs = pts.map((s) => s[1]);
		let lo = Math.min(...vs), hi = Math.max(...vs);
		if (lo >= 0 && lo < 0.5 * hi) lo = 0;   // from zero unless the record moved over a narrow range
		if (hi === lo) hi = lo + 1;
		const st = niceStep(hi - lo);
		lo = Math.floor(lo / st) * st; hi = Math.ceil(hi / st) * st;
		const ticks = [];
		for (let v = lo; v <= hi + st / 2; v += st) ticks.push(v);
		return { lo, hi, ticks };
	});
	const x = (t: number) => L + ((t - first) / (t1 - first)) * (W - L - Rm);
	const y = (v: number) => T + (1 - (v - ax.lo) / (ax.hi - ax.lo)) * (H - T - B);
	const path = $derived.by(() => {
		let d = `M${x(steps[0][0]).toFixed(1)} ${y(steps[0][1]).toFixed(1)}`;
		for (const [t, v] of steps.slice(1)) d += ` H${x(t).toFixed(1)} V${y(v).toFixed(1)}`;
		return d + (prov ? ` H${x(prov.t).toFixed(1)}` : ` H${x(t1).toFixed(1)}`);
	});
	const years = $derived.by(() => {
		const a = +yearOf(first), b = +yearOf(t1), every = (b - a) / (W / 90) > 5 ? 10 : b - a > 20 ? 5 : b - a > 8 ? 2 : 1;
		const out = [];
		for (let yr = Math.ceil(a / every) * every; yr <= b; yr += every) out.push({ yr, t: Date.UTC(yr, 0, 1) - 13 * 36e5 });
		return out.filter((q) => q.t >= first && x(q.t) > L + 14);
	});
	const last = $derived(steps[steps.length - 1]);

	let hov = $state<number | null>(null);   // under the mouse
	let pin = $state<number | null>(null);   // clicked, tapped or dragged to
	let touch = $state(false);               // the last pointer was a finger or pen
	const hover = $derived(hov ?? pin);
	let fig = $state<HTMLElement>();
	function at(e: PointerEvent) {
		const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
		const t = first + (((e.clientX - r.left) / r.width) * W - L) / (W - L - Rm) * (t1 - first);
		let i = 0;
		while (i + 1 < pts.length && pts[i + 1][0] <= t) i++;
		return t < pts[0][0] ? null : i;
	}
	function move(e: PointerEvent) {
		touch = e.pointerType !== 'mouse';
		if (touch) { pin = at(e); hov = null; } else hov = at(e);
	}
	function click(e: MouseEvent) {
		if (touch) return;   // a tap pinned it already
		const i = at(e as PointerEvent);
		pin = i === null || i === pin ? null : i;
	}
	function outside(e: Event) {
		if (pin === null) return;
		if (e instanceof KeyboardEvent) { if (e.key === 'Escape') pin = null; return; }
		if (fig && !fig.contains(e.target as Node)) pin = null;
	}
</script>

<svelte:window onpointerdown={outside} onkeydown={outside} />

<figure class="prog" bind:clientWidth={cw} bind:this={fig}>
	<div class="plot">
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions (pointer readout; the figcaption and the table below carry the figures) -->
	<svg viewBox="0 0 {W} {H}" role="img" aria-label={label} onpointermove={move} onpointerdown={move} onclick={click} onpointerleave={() => (hov = null)}>
		{#each ax.ticks as v}
			<line x1={L} x2={W - Rm} y1={y(v)} y2={y(v)} class="grid" />
			<text x={L - 8} y={y(v) + 4} text-anchor="end" class="lab">{fmt(v)}</text>
		{/each}
		{#each years as q}
			<text x={x(q.t)} y={H - 8} text-anchor="middle" class="lab">{q.yr}</text>
		{/each}
		<path d={path} fill="none" style="stroke:var({tok})" stroke-width="2.4" stroke-linejoin="round" stroke-dasharray={dashed ? '6 3' : undefined} />
		{#if prov}
			<path d="M{x(prov.t)} {y(last[1])} V{y(prov.v)} H{x(t1)}" fill="none" style="stroke:var({tok})" stroke-width="2" stroke-dasharray="4 4" />
			<circle cx={x(prov.t)} cy={y(prov.v)} r="5" class="hole" style="stroke:var({tok})" />
		{/if}
		<circle cx={x(last[0])} cy={y(last[1])} r="5" style="fill:var({tok})" />
		{#if hover !== null}
			{@const p = pts[hover]}
			<line x1={x(p[0])} x2={x(p[0])} y1={T} y2={H - B} class="cursor" class:pinned={hov === null} />
			<circle cx={x(p[0])} cy={y(p[1])} r="4" style="fill:var({tok})" />
		{/if}
	</svg>
	{#if hover !== null}
		{@const p = pts[hover]}
		{@const fx = x(p[0]) / W}
		<div class="tip" style={touch ? `left:${Math.min(80, Math.max(20, fx * 100))}%` : `left:${fx * 100}%;top:${(y(p[1]) / H) * 100}%`} class:flip={!touch && fx > 0.7} class:above={touch} aria-hidden="true">
			<b>{val(p[1])}</b><span>{prov && hover === pts.length - 1 ? 'Provisional, ' : ''}{whenOf(p[0])}</span>
		</div>
	{/if}
	</div>
	<figcaption class="readout" aria-live="polite">
		{#if hover !== null}
			{@const p = pts[hover]}
			Record {val(p[1])} {prov && hover === pts.length - 1 ? 'provisional,' : 'from'} {whenOf(p[0])}{#if hov === null}<button type="button" class="rel" onclick={() => (pin = null)}>Release</button>{/if}
		{:else}
			{steps.length - 1 === 0 ? (trimmed ? `First above zero in ${yearOf(first)}` : 'Not broken since the data began') : `Broken ${steps.length - 1} times since ${trimmed ? `the first above zero in ${yearOf(first)}` : yearOf(first)}`}{prov ? '; dashed: provisional' : ''}. {touch ? 'Tap or drag' : 'Hover or click'} for the record at any date.
		{/if}
	</figcaption>
</figure>

<style>
	.prog { margin: 0; display: grid; gap: 4px; }
	svg { width: 100%; height: auto; display: block; touch-action: pan-y; }
	.grid { stroke: var(--grid); stroke-width: 1; }
	.lab { fill: var(--muted); font-family: var(--font-data); font-size: 12px; }
	.cursor { stroke: var(--ink-2); stroke-width: 1; stroke-dasharray: 3 3; }
	.hole { fill: var(--surface); stroke-width: 2.4; }
	.readout { color: var(--muted); font-size: 0.8rem; min-height: 1.4em; }
	.plot { position: relative; }
	/* the value and date beside the hovered step */
	.tip { position: absolute; transform: translate(12px, -50%); pointer-events: none; display: grid; gap: 1px; padding: 5px 8px; border-radius: 4px;
		background: var(--surface); border: 1px solid var(--line); box-shadow: 0 4px 14px rgb(0 0 0 / 0.12); font-size: 0.78rem; color: var(--ink-2); white-space: nowrap; }
	.tip.flip { transform: translate(calc(-100% - 12px), -50%); }
	/* touch: above the chart, centred on the point, so the finger doesn't hide it */
	.tip.above { top: 0; transform: translate(-50%, calc(-100% - 6px)); z-index: 2; }
	.cursor.pinned { stroke: var(--accent); stroke-dasharray: none; }
	.rel { font: inherit; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--accent); background: none; border: 0; padding: 0 4px; margin-left: 8px; cursor: pointer; }
	.tip b { font-family: var(--font-data); color: var(--ink); font-size: 0.9rem; }
</style>
