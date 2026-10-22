<script lang="ts">
	// The day a record fell: the record's own series, half-hour by half-hour through that New Zealand day, with the
	// record half-hour marked.
	import { clock } from './records.js';

	let { day, t, tok = '--ink', fmt, label }: { day: { t0: number; step: number; v: (number | null)[] }; t: number; tok?: string;
		fmt: (v: number) => string; label: string } = $props();

	let cw = $state(640);
	const W = $derived(Math.max(300, Math.min(760, cw)));
	const H = 210, L = 58, R = 10, T = 12, B = 26;
	const n = $derived(day.v.length);
	const vals = $derived(day.v.filter((v): v is number => v != null));
	// a round axis: four or five steps of 1, 2, 2.5 or 5 x 10^k
	const ax = $derived.by(() => {
		let lo = Math.min(...vals), hi = Math.max(...vals);
		if (lo >= 0 && lo < 0.4 * hi) lo = 0;
		if (hi === lo) hi = lo + 1;
		const raw = (hi - lo) / 4, p = 10 ** Math.floor(Math.log10(raw)), m = raw / p;
		const st = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
		lo = Math.floor(lo / st) * st; hi = Math.ceil(hi / st) * st;
		const ticks = [];
		for (let v = lo; v <= hi + st / 2; v += st) ticks.push(v);
		return { lo, hi, ticks };
	});
	const x = (i: number) => L + (i / Math.max(1, n - 1)) * (W - L - R);
	const y = (v: number) => T + (1 - (v - ax.lo) / (ax.hi - ax.lo)) * (H - T - B);
	const path = $derived.by(() => {
		let d = '', pen = false;
		day.v.forEach((v, i) => {
			if (v == null) { pen = false; return; }
			d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
			pen = true;
		});
		return d;
	});
	const area = $derived(path ? `${path} L${x(n - 1).toFixed(1)} ${H - B} L${x(0).toFixed(1)} ${H - B} Z` : '');
	const at = $derived(Math.round((t - day.t0) / day.step));
	const ticks = $derived(ax.ticks);
	// clock labels every six hours (by position: a clock-change day has 46 or 50 half-hours)
	const hours = $derived((W < 420 ? [0, 24] : [0, 12, 24, 36]).filter((i) => i < n).map((i) => ({ i, l: clock(day.t0 + i * day.step) })));

	// hover or touch: the half-hour's time and value
	let hover = $state<number | null>(null);
	function move(e: PointerEvent) {
		const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
		const i = Math.round((((e.clientX - r.left) / r.width) * W - L) / (W - L - R) * Math.max(1, n - 1));
		hover = i >= 0 && i < n && day.v[i] != null ? i : null;
	}
</script>

<div class="dc" bind:clientWidth={cw}>
<svg viewBox="0 0 {W} {H}" role="img" aria-label={label} onpointermove={move} onpointerdown={move} onpointerleave={() => (hover = null)}>
	{#each ticks as v}
		<line x1={L} x2={W - R} y1={y(v)} y2={y(v)} class="grid" />
		<text x={L - 8} y={y(v) + 4} text-anchor="end" class="lab">{fmt(v)}</text>
	{/each}
	{#each hours as h}
		<text x={x(h.i)} y={H - 6} text-anchor={h.i === 0 ? 'start' : 'middle'} class="lab">{h.l}</text>
	{/each}
	<path d={area} style="fill:var({tok})" opacity="0.12" />
	<path d={path} fill="none" style="stroke:var({tok})" stroke-width="2" stroke-linejoin="round" />
	{#if at >= 0 && at < n && day.v[at] != null}
		<line x1={x(at)} x2={x(at)} y1={T} y2={H - B} class="cursor" />
		<circle cx={x(at)} cy={y(day.v[at] as number)} r="5" style="fill:var({tok})" />
	{/if}
	{#if hover !== null && hover !== at}
		<line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} class="cursor hov" />
		<circle cx={x(hover)} cy={y(day.v[hover] as number)} r="3.5" style="fill:var({tok})" />
	{/if}
</svg>
{#if hover !== null}
	{@const fx = x(hover) / W}
	<div class="tip" class:flip={fx > 0.7} style="left:{fx * 100}%;top:{(y(day.v[hover] as number) / H) * 100}%" aria-hidden="true">
		<b>{fmt(day.v[hover] as number)}</b><span>{clock(day.t0 + hover * day.step)}{hover === at ? ' · the record' : ''}</span>
	</div>
{/if}
</div>

<style>
	.dc { min-width: 0; position: relative; }
	svg { width: 100%; height: auto; display: block; touch-action: pan-y; }
	.hov { stroke-dasharray: none; opacity: 0.5; }
	.tip { position: absolute; transform: translate(12px, -50%); pointer-events: none; display: grid; gap: 1px; padding: 5px 8px; border-radius: 4px;
		background: var(--surface); border: 1px solid var(--line); box-shadow: 0 4px 14px rgb(0 0 0 / 0.12); font-size: 0.78rem; color: var(--ink-2); white-space: nowrap; }
	.tip.flip { transform: translate(calc(-100% - 12px), -50%); }
	.tip b { font-family: var(--font-data); color: var(--ink); font-size: 0.9rem; }
	.grid { stroke: var(--grid); stroke-width: 1; }
	.lab { fill: var(--muted); font-family: var(--font-data); font-size: 12px; }
	.cursor { stroke: var(--ink-2); stroke-width: 1; stroke-dasharray: 3 3; }
</style>
