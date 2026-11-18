<script lang="ts">
	// The live panel's last 7 days: one point a half-hour, shaded under the line, the installed MW as a dashed line,
	// day names under it. Drawn to the panel's width.
	import { fmtMw } from './history.js';
	let { half, cap, tok = '--f-hydro', label }: { half: { t: number; mw: number }[]; cap: number | null; tok?: string; label: string } = $props();

	let w = $state(320);
	const H = 96, PAD = { t: 14, b: 18 };
	const lo = $derived(Math.min(0, ...half.map((h) => h.mw)));
	const hi = $derived(Math.max(cap ?? 0, ...half.map((h) => h.mw), 1));
	const t0 = $derived(half[0]?.t ?? 0), t1 = $derived(half[half.length - 1]?.t ?? 1);
	const X = (t: number) => (w * (t - t0)) / Math.max(t1 - t0, 1);
	const Y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - (v - lo) / (hi - lo));
	const line = $derived(half.map((h) => `${X(h.t).toFixed(1)},${Y(h.mw).toFixed(1)}`).join(' '));
	const area = $derived(half.length ? `${X(t0).toFixed(1)},${Y(0).toFixed(1)} ${line} ${X(t1).toFixed(1)},${Y(0).toFixed(1)}` : '');
	const DAY = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', weekday: 'short' });
	const HOUR = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', hour: 'numeric', hourCycle: 'h23' });
	// a tick at each NZ midnight in the week
	const hourOf = (t: number) => +(HOUR.formatToParts(t).find((x) => x.type === 'hour')?.value ?? -1) % 24;
	const days = $derived(half.filter((h) => hourOf(h.t) === 0 && new Date(h.t).getUTCMinutes() === 0)
		.map((h) => ({ x: X(h.t), name: DAY.format(h.t) })).filter((d) => d.x < w - 24));
</script>

<div class="box" bind:clientWidth={w}>
	<svg width={w} height={H} role="img" aria-label={label}>
		{#if cap}
			<line x1="0" x2={w} y1={Y(cap)} y2={Y(cap)} class="cap" />
			<text x="0" y={Y(cap) - 4} class="ax">{fmtMw(cap)} MW installed</text>
		{/if}
		<polygon points={area} fill="var({tok})" opacity="0.14" />
		<polyline points={line} fill="none" stroke="var({tok})" stroke-width="1.8" />
		{#if lo < 0}<line x1="0" x2={w} y1={Y(0)} y2={Y(0)} class="base" />{/if}
		<line x1="0" x2={w} y1={H - PAD.b} y2={H - PAD.b} class="base" />
		{#each days as d}
			<line x1={d.x} x2={d.x} y1={H - PAD.b} y2={H - PAD.b + 4} class="base" />
			<text x={d.x + 2} y={H - 4} class="ax">{d.name}</text>
		{/each}
	</svg>
</div>

<style>
	.box { min-width: 0; }
	svg { display: block; overflow: visible; }
	.cap { stroke: var(--ink-2); stroke-dasharray: 3 3; }
	.base { stroke: var(--line); }
	.ax { font-family: var(--font-data); font-size: 10px; fill: var(--muted); }
</style>
