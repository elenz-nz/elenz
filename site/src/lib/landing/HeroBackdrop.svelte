<script lang="ts">
	// The landing hero's horizon: New Zealand's total generation over the last 24 hours as one outline across the
	// width of the hero, ending in a pulsing dot at now.
	import { recent } from '#lib/home/now.js';

	let { D }: { D: any } = $props();

	const W = 1000, H = 220;
	const shape = $derived.by(() => {
		const S = recent(D, 24, 2);
		const n = S.t.length;
		const tot = S.t.map((_, i) => S.layers.reduce((a, l) => a + l.v[i], 0));
		const hi = Math.max(...tot), lo = Math.min(...tot);
		// the daily swing fills most of the height; the floor sits a little below the overnight low
		const floor = lo - (hi - lo) * 0.6;
		const x = (i: number) => (i / Math.max(1, n - 1)) * W;
		const y = (v: number) => H - ((v - floor) / (hi - floor || 1)) * (H * 0.85);
		const pts = tot.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
		return { line: `M${pts.join('L')}`, area: `M0,${H}L${pts.join('L')}L${W},${H}Z`, end: { x: x(n - 1), y: y(tot[n - 1]) } };
	});
</script>

<div class="backdrop" aria-hidden="true">
	<svg viewBox="0 0 {W} {H}" preserveAspectRatio="none">
		<defs>
			<linearGradient id="bd-fill" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" stop-color="var(--accent)" stop-opacity="0.16" />
				<stop offset="1" stop-color="var(--accent)" stop-opacity="0" />
			</linearGradient>
		</defs>
		<path class="area" d={shape.area} />
		<path class="line" d={shape.line} vector-effect="non-scaling-stroke" />
	</svg>
	<span class="dot" style="left:{(shape.end.x / W) * 100}%;top:{(shape.end.y / H) * 100}%"></span>
	<span class="lbl l">24 hours ago</span><span class="lbl r">now</span>
</div>

<style>
	.backdrop { position: relative; width: 100%; height: clamp(90px, 16vh, 150px); pointer-events: none;
		animation: draw 1.8s cubic-bezier(0.3, 0.6, 0.2, 1) 0.3s both; }
	svg { -webkit-mask-image: linear-gradient(to right, transparent, #000 15%); mask-image: linear-gradient(to right, transparent, #000 15%); }
	.lbl { position: absolute; bottom: 4px; font-size: 0.7rem; color: var(--muted); font-family: var(--font-data); }
	.lbl.l { left: 6%; }
	.lbl.r { right: 0; transform: translateX(50%); }
	svg { display: block; width: 100%; height: 100%; }
	.area { fill: url(#bd-fill); }
	.line { fill: none; stroke: var(--accent); stroke-opacity: 0.55; stroke-width: 1.5; stroke-linejoin: round; }
	.dot { position: absolute; width: 9px; height: 9px; margin: -4.5px 0 0 -4.5px; border-radius: 50%; background: var(--accent); }
	.dot::after { content: ""; position: absolute; inset: 0; border-radius: 50%; background: var(--accent); animation: ping 2.2s ease-out infinite; }
	@keyframes ping { from { transform: scale(1); opacity: 0.6; } to { transform: scale(4); opacity: 0; } }
	@keyframes draw { from { clip-path: inset(-40px 100% -40px 0); } to { clip-path: inset(-40px -40px -40px 0); } }
	@media (prefers-reduced-motion: reduce) { .backdrop, .dot::after { animation: none; } }
</style>
