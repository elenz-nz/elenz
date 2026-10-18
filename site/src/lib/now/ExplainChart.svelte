<script lang="ts">
	// The price explainer's 24-hour chart: Haywards and Benmore, the usual range for each half-hour, and the lines above
	// which the explainer is highlighted or opens by itself. size: 'small' in the panel; in its pop-out
	// (PriceExplainer.svelte) 'large' on wide screens and 'tall' on phones. Hovering shows the values at that time.
	import { money, clock } from './explain.js';

	type Band = { t0: number; t1: number; med: number; p25: number; p75: number; hl: number; open: number };
	let { c, size = 'small' }: { c: { t: number[]; hay: number[]; ben: number[]; band: Band[] }; size?: 'small' | 'large' | 'tall' } = $props();
	const large = $derived(size === 'large');

	// drawn at its measured width and a fixed height, one viewBox unit per pixel, so the text stays the same size and
	// only the plot stretches (a fixed viewBox scaled the text with the width: huge when the side column wrapped under
	// the reasons at middling window widths)
	let W = $state(0);
	const VW = $derived(Math.max(240, W || 420)), VH = $derived(large ? 420 : size === 'tall' ? 360 : 220);
	const FS = $derived(large ? 12.5 : 11.5);
	const L = 48, R = 8, T = 10, B = 24;
	const NT = $derived(size === 'small' ? 2 : 4);   // steps up the price axis
	const t0 = $derived(c.t[0]), t1 = $derived(c.t[c.t.length - 1]);
	const ymax = $derived.by(() => {
		let m = 0;
		for (const v of c.hay) if (v > m) m = v;
		for (const v of c.ben) if (v > m) m = v;
		for (const b of c.band) m = Math.max(m, b.p75, b.hl);
		// a round step (1, 2, 2.5 or 5 × a power of ten) so every tick is a round price
		const raw = Math.max(10, m * 1.08) / NT;
		const p = Math.pow(10, Math.floor(Math.log10(raw)));
		const stp = [1, 2, 2.5, 5, 10].map((k) => k * p).find((v) => v >= raw) ?? 10 * p;
		return stp * NT;
	});
	const X = (v: number) => L + ((v - t0) / (t1 - t0 || 1)) * (VW - L - R);
	const Y = (v: number) => T + (1 - Math.max(0, Math.min(v, ymax)) / ymax) * (VH - T - B);
	const line = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${X(c.t[i]).toFixed(1)},${Y(v).toFixed(1)}`).join('');
	const steps = (k: 'hl' | 'open') => c.band.filter((b) => b[k] <= ymax).map((b) => `M${X(b.t0).toFixed(1)},${Y(b[k]).toFixed(1)}H${X(b.t1).toFixed(1)}`).join('');
	const yTicks = $derived(Array.from({ length: NT + 1 }, (_, i) => (ymax * i) / NT));
	const HOUR = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', hour: 'numeric', hourCycle: 'h23' });
	const xTicks = $derived.by(() => {
		// every six hours on the NZ clock (every three once the chart is 640 px wide), clear of "now"
		const out: { t: number; label: string }[] = [];
		const hr = 3600000, every = VW >= 640 ? 3 : 6;
		for (let tt = Math.ceil(t0 / hr) * hr; tt < t1 - 2 * hr; tt += hr) {
			const h = Number(HOUR.format(new Date(tt)));
			if (h % every === 0) { out.push({ t: tt, label: h === 0 ? 'midnight' : h === 12 ? 'noon' : clock(tt).replace(':00', '') }); tt += (every - 1) * hr; }
		}
		return out;
	});
	const show = $derived(c.band.some((b) => b.open <= ymax));

	// hover: the nearest point to the pointer
	let hi = $state(-1);
	let svgEl: SVGSVGElement | undefined = $state();
	function move(e: PointerEvent) {
		if (!svgEl) return;
		const r = svgEl.getBoundingClientRect();
		const vx = ((e.clientX - r.left) / r.width) * VW;
		const tt = t0 + ((vx - L) / (VW - L - R)) * (t1 - t0);
		let best = -1, d = Infinity;
		for (let i = 0; i < c.t.length; i++) { const dd = Math.abs(c.t[i] - tt); if (dd < d) { d = dd; best = i; } }
		hi = vx < L - 4 ? -1 : best;
	}
	const at = $derived(hi >= 0 ? hi : c.t.length - 1);
	const bandAt = $derived(c.band.find((b) => b.t0 <= c.t[at] && c.t[at] < b.t1) ?? c.band[c.band.length - 1]);
	const ria = (v: number | null | undefined) => (v == null ? '–' : money(v));
</script>

<p class="ro" class:on={hi >= 0} aria-live="off">
	<b>{hi >= 0 ? clock(c.t[at]) : 'Now'}</b>
	<span><i class="k-hay"></i>Haywards {ria(c.hay[at])}</span>
	<span><i class="k-ben"></i>Benmore {ria(c.ben[at])}</span>
	{#if bandAt}<span><i class="k-band"></i>usual {money(bandAt.p25)}–{money(bandAt.p75)}</span>{/if}
</p>
<div class="plot" bind:clientWidth={W}>
<svg bind:this={svgEl} viewBox="0 0 {VW} {VH}" width={VW} height={VH} style="--fs:{FS}px" role="img" onpointermove={move} onpointerleave={() => (hi = -1)}
	aria-label="Haywards and Benmore prices over the last 24 hours, with the usual range for each half-hour of the week.">
	{#each yTicks as v}
		<line class="grid" x1={L} x2={VW - R} y1={Y(v)} y2={Y(v)} />
		<text class="ax" x={L - 6} y={Y(v) + FS / 3} text-anchor="end">${Math.round(v).toLocaleString('en-NZ')}</text>
	{/each}
	{#each c.band as b}
		<rect class="band" x={X(b.t0)} width={Math.max(0.5, X(b.t1) - X(b.t0))} y={Y(b.p75)} height={Math.max(0.5, Y(b.p25) - Y(b.p75))} />
	{/each}
	<path class="thr hl" d={steps('hl')} />
	<path class="thr op" d={steps('open')} />
	<path class="p-ben" d={line(c.ben)} />
	<path class="p-hay" d={line(c.hay)} />
	{#if hi >= 0}
		<line class="cur" x1={X(c.t[hi])} x2={X(c.t[hi])} y1={T} y2={VH - B} />
		<circle class="dot-hay" cx={X(c.t[hi])} cy={Y(c.hay[hi])} r="4" />
	{/if}
	{#each xTicks as tk}
		<text class="ax" x={X(tk.t)} y={VH - 8} text-anchor="middle">{tk.label}</text>
	{/each}
	<text class="ax" x={VW - R} y={VH - 8} text-anchor="end">now</text>
</svg>
</div>
<p class="legend">
	<span><i class="k-hay"></i>Haywards</span><span><i class="k-ben"></i>Benmore</span><span><i class="k-band"></i>usual range</span>
	<span><i class="k-hl"></i>highlighted above</span>{#if show}<span><i class="k-op"></i>opens by itself above</span>{/if}
</p>

<style>
	.plot { width: 100%; min-width: 0; }
	svg { display: block; max-width: 100%; touch-action: pan-y; }
	.grid { stroke: var(--grid); stroke-width: 1; }
	.ax { fill: var(--muted); font-size: var(--fs); font-family: var(--font-data); }
	.band { fill: var(--f-hydro); opacity: 0.16; }
	.thr { fill: none; stroke-width: 1.3; }
	.thr.hl { stroke: var(--ink-2); stroke-dasharray: 2 3; }
	.thr.op { stroke: var(--warn-ink); stroke-dasharray: 5 4; }
	.p-hay { fill: none; stroke: var(--p-ni); stroke-width: 1.8; stroke-linejoin: round; }
	.p-ben { fill: none; stroke: var(--p-si); stroke-width: 1.5; stroke-dasharray: 5 3; stroke-linejoin: round; }
	.cur { stroke: var(--ink-2); stroke-width: 1; }
	.dot-hay { fill: var(--surface); stroke: var(--p-ni); stroke-width: 2; }
	.ro { margin: 0 0 4px; display: flex; flex-wrap: wrap; gap: 2px 12px; font-size: 0.78rem; color: var(--ink-2); font-family: var(--font-data); min-height: 1.3em; }
	.ro b { font-family: var(--font-ui); color: var(--ink); }
	.ro span, .legend span { display: inline-flex; align-items: center; gap: 5px; }
	.legend { margin: 6px 0 0; display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 0.74rem; color: var(--muted); }
	i { display: inline-block; width: 14px; height: 0; border-top: 2px solid; }
	.k-hay { border-color: var(--p-ni); }
	.k-ben { border-color: var(--p-si); border-top-style: dashed; }
	.k-band { height: 9px; border: 0; background: var(--f-hydro); opacity: 0.3; }
	.k-hl { border-color: var(--ink-2); border-top-style: dotted; }
	.k-op { border-color: var(--warn-ink); border-top-style: dashed; }
</style>
