<script lang="ts">
	// Installed MW over time as a staircase, from the start of the plant's history to now (or to when it closed), with
	// each step labelled. Drawn to the card's width, like Bars.svelte.
	import { monthName, monthStart } from './history.js';
	import { fmtMw } from './history.js';
	type Step = { from: string | null; to: string | null; mw: number };
	let { steps, first, last, tok = '--f-hydro', label }: { steps: Step[]; first: string; last: string; tok?: string; label: string } = $props();

	let w = $state(720);
	const H = 150, PAD = { l: 46, r: 10, t: 26, b: 22 };
	const t0 = $derived(monthStart(first)), t1 = $derived(Math.max(monthStart(last), t0 + 864e5 * 60));
	// round ticks (1, 2, 2.5 or 5 × 10^k apart), up to the first leaving room over the highest step for its label
	const yTicks = $derived.by(() => {
		const m = Math.max(...steps.map((s) => s.mw), 1) * 1.15, raw = m / 3, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
		const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p, out = [0];
		while (out[out.length - 1] < m) out.push(+(out[out.length - 1] + step).toPrecision(12));
		return out;
	});
	const top = $derived(yTicks[yTicks.length - 1]);
	const iw = $derived(Math.max(10, w - PAD.l - PAD.r)), ih = H - PAD.t - PAD.b;
	const X = (t: number) => PAD.l + (iw * (Math.min(Math.max(t, t0), t1) - t0)) / (t1 - t0);
	const Y = (v: number) => PAD.t + ih * (1 - v / top);
	const day = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
	// the steps that fall in the span shown, each from its start (or the span's) to its end (or the span's)
	const segs = $derived(steps.map((s) => ({ ...s, a: s.from ? day(s.from) : t0, b: s.to ? day(s.to) + 864e5 : t1 }))
		.filter((s) => s.b > t0 && s.a < t1).sort((p, q) => p.a - q.a));
	const path = $derived(segs.map((s, i) => `${i ? 'L' : 'M'}${X(s.a).toFixed(1)},${Y(s.mw).toFixed(1)}H${X(s.b).toFixed(1)}`).join(''));
	const area = $derived(segs.length ? `${path}V${Y(0)}H${X(segs[0].a).toFixed(1)}Z` : '');
	const years = $derived.by(() => {
		const a = new Date(t0).getUTCFullYear(), b = new Date(t1).getUTCFullYear(), span = b - a;
		const step = span > 20 ? 5 : span > 8 ? 2 : 1, out = [];
		for (let y = Math.ceil((a + 1) / step) * step; y <= b; y += step) out.push(y);
		return out.filter((y) => X(Date.UTC(y, 0, 1)) < w - PAD.r - 16);
	});
	// a label over each step, unless it would run into the one before
	const labels = $derived.by(() => {
		let edge = -Infinity;
		return segs.map((s, i) => {
			const text = i === 0 ? `${fmtMw(s.mw)} MW` : `${fmtMw(s.mw)} MW from ${monthName(new Date(s.a).toISOString().slice(0, 7), true)}`;
			// a label that would run off the right edge ends at it instead
			const len = text.length * 6.6, x = Math.min(X(s.a) + 5, w - PAD.r - len), ok = x > edge && x >= PAD.l;
			if (ok) edge = x + len + 8;
			return { x, y: Y(s.mw) - 6, text, ok };
		}).filter((l) => l.ok);
	});
</script>

<div class="box" bind:clientWidth={w}>
	<svg width={w} height={H} role="img" aria-label={label}>
		{#each yTicks as t}
			<line x1={PAD.l} x2={w - PAD.r} y1={Y(t)} y2={Y(t)} class="grid" />
			<text x={PAD.l - 6} y={Y(t) + 4} text-anchor="end" class="ax">{fmtMw(t)}</text>
		{/each}
		<path d={area} fill="var({tok})" opacity="0.14" />
		<path d={path} fill="none" stroke="var({tok})" stroke-width="2.2" />
		{#each labels as l}<text x={l.x} y={l.y} class="lb">{l.text}</text>{/each}
		<line x1={PAD.l} x2={w - PAD.r} y1={Y(0)} y2={Y(0)} class="base" />
		{#each years as y}<text x={X(Date.UTC(y, 0, 1))} y={H - 6} text-anchor="middle" class="ax">{y}</text>{/each}
	</svg>
</div>

<style>
	.box { min-width: 0; }
	svg { display: block; overflow: visible; }
	.grid { stroke: var(--grid); }
	.base { stroke: var(--line); }
	.ax, .lb { font-family: var(--font-data); font-size: 11px; fill: var(--muted); }
	.lb { fill: var(--ink-2); font-weight: 500; }
</style>
