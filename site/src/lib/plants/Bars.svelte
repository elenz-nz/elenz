<script lang="ts">
	// A plant page's column chart (generation by year, the last 24 months): one bar an item, part periods hatched,
	// optional dashed marks (where installed MW changed), a y axis with round ticks. Drawn to the card's own width
	// (bind:clientWidth), so text stays the same size on a phone. Pointing at or tapping a bar shows its figures in the
	// line above the chart, which keeps its height so nothing moves.
	type Item = { label: string | null; v: number; part?: boolean; title: string };
	type Mark = { at: number; label: string };
	let { items, marks = [], height = 220, max = null, fmt, tok = '--f-hydro', label, hint = 'Point at a bar for its figures.' }:
		{ items: Item[]; marks?: Mark[]; height?: number; max?: number | null; fmt: (v: number) => string; tok?: string; label: string; hint?: string } = $props();

	let w = $state(720);
	let pick = $state<number | null>(null);
	const PAD = { l: 46, r: 6, t: 22, b: 22 };
	const uid = $props.id();

	// round ticks: 1, 2 or 5 × 10^k, four or five of them up to the top
	function niceTicks(top: number) {
		if (!(top > 0)) return [0, 1];
		const raw = top / 4, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
		const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
		const out = [];
		for (let v = 0; v <= top + step * 0.001; v += step) out.push(+v.toPrecision(12));
		if (out[out.length - 1] < top) out.push(+(out[out.length - 1] + step).toPrecision(12));
		return out;
	}
	const ticks = $derived(max != null ? [0, max / 4, max / 2, (3 * max) / 4, max] : niceTicks(Math.max(...items.map((x) => x.v), 0)));
	const top = $derived(ticks[ticks.length - 1] || 1);
	const iw = $derived(Math.max(10, w - PAD.l - PAD.r));
	const ih = $derived(height - PAD.t - PAD.b);
	const band = $derived(iw / Math.max(items.length, 1));
	const bw = $derived(Math.max(1, Math.min(band * 0.78, band - 1, 48)));
	const x = (i: number) => PAD.l + i * band + (band - bw) / 2;
	const y = (v: number) => PAD.t + ih * (1 - Math.max(0, Math.min(v, top)) / top);
	// x labels: those given, thinned so they don't run into each other (about 44 px each)
	const every = $derived(Math.max(1, Math.ceil(44 / band)));
	const shown = $derived(items.map((it, i) => ({ it, i })).filter(({ it }) => it.label));
	const thin = $derived.by(() => {
		const out: { it: Item; i: number }[] = [];
		let last = -Infinity;
		for (const s of shown) if (s.i - last >= every) { out.push(s); last = s.i; }
		return out;
	});
	// marks too close to the one before keep their line but lose their label
	const labelled = $derived.by(() => {
		let last = -Infinity;
		return marks.map((m) => { const px = PAD.l + m.at * band; const ok = px - last > 64; if (ok) last = px; return { ...m, px, ok }; });
	});

	function at(e: PointerEvent) {
		const svg = e.currentTarget as SVGSVGElement, r = svg.getBoundingClientRect();
		const i = Math.floor((e.clientX - r.left - PAD.l) / band);
		pick = i >= 0 && i < items.length ? i : null;
	}
</script>

<div class="bars" bind:clientWidth={w}>
	<p class="readout" aria-live="polite">{pick != null ? items[pick].title : hint}</p>
	<svg width={w} {height} role="img" aria-label={label} onpointermove={at} onpointerdown={at} onpointerleave={(e) => { if (e.pointerType === 'mouse') pick = null; }}>
		<defs>
			<pattern id="hatch-{uid}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
				<rect width="5" height="5" fill="var({tok})" opacity="0.35" /><rect width="2" height="5" fill="var({tok})" />
			</pattern>
		</defs>
		{#each ticks as t}
			<line x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} class="grid" />
			<text x={PAD.l - 6} y={y(t) + 4} text-anchor="end" class="ax">{fmt(t).replace(/\.0(?=\D*$)/, '')}</text>
		{/each}
		{#each labelled as m}
			<line x1={m.px} x2={m.px} y1={PAD.t - 12} y2={PAD.t + ih} class="mark" />
			{#if m.ok}<text x={m.px + 4} y={PAD.t - 4} class="mk">{m.label}</text>{/if}
		{/each}
		{#each items as it, i}
			<rect x={x(i)} y={y(it.v)} width={bw} height={Math.max(0, PAD.t + ih - y(it.v))} rx="1"
				fill={it.part ? `url(#hatch-${uid})` : `var(${tok})`} opacity={pick == null || pick === i ? 1 : 0.55}><title>{it.title}</title></rect>
		{/each}
		<line x1={PAD.l} x2={w - PAD.r} y1={PAD.t + ih} y2={PAD.t + ih} class="base" />
		{#each thin as { it, i }}
			<text x={x(i) + bw / 2} y={height - 6} text-anchor="middle" class="ax">{it.label}</text>
		{/each}
	</svg>
</div>

<style>
	.bars { min-width: 0; display: grid; gap: 4px; }
	svg { display: block; overflow: visible; touch-action: pan-y; }
	.readout { margin: 0; min-height: 1.3em; font-size: 0.8rem; color: var(--ink-2); }
	.grid { stroke: var(--grid); }
	.base { stroke: var(--line); }
	.mark { stroke: var(--ink-2); stroke-dasharray: 3 3; }
	.ax, .mk { font-family: var(--font-data); font-size: 11px; fill: var(--muted); }
	.mk { fill: var(--ink-2); }
</style>
