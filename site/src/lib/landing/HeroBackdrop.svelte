<script lang="ts">
	// The landing hero's horizon: New Zealand's total generation over the last 24 hours as one outline across the
	// width of the hero, ending in a pulsing dot at now. Hovering shows the total and time at that point. As the page
	// scrolls, Handoff.svelte shrinks this line into its dot and flies it down to the Tracker preview (geometry shared in geometry.js).
	import { HZ, horizon } from './geometry.js';

	let { D }: { D: any } = $props();

	const { W, H } = HZ;
	const shape = $derived.by(() => {
		const { t, tot, y } = horizon(D);
		const n = t.length;
		const x = (i: number) => (i / Math.max(1, n - 1)) * W;
		const pts = tot.map((v: number, i: number) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
		return {
			n, t, tot, x, y,
			line: `M${pts.join('L')}`, area: `M0,${H}L${pts.join('L')}L${W},${H}Z`, end: { x: x(n - 1), y: y(tot[n - 1]) },
		};
	});

	const TIME = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
	const timeOf = (t: number) => {
		const p = Object.fromEntries(TIME.formatToParts(new Date(t)).map((q) => [q.type, q.value]));
		return `${p.hour}:${p.minute} ${String(p.dayPeriod).toLowerCase()} ${p.weekday}`;
	};

	let hover = $state<number | null>(null);
	function move(e: PointerEvent) {
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
		hover = Math.round(f * (shape.n - 1));
	}
	const tip = $derived(hover === null ? null : {
		left: (shape.x(hover) / W) * 100, top: (shape.y(shape.tot[hover]) / H) * 100,
		mw: Math.round(shape.tot[hover]).toLocaleString('en-NZ'), time: timeOf(shape.t[hover]),
	});
</script>

<div class="backdrop" role="img" aria-label="New Zealand's total generation over the last 24 hours"
	onpointermove={move} onpointerdown={move} onpointerleave={() => (hover = null)}>
	<svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" aria-hidden="true" data-handoff="from">
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
	{#if tip}
		<span class="guide" style="left:{tip.left}%"></span>
		<span class="hdot" style="left:{tip.left}%;top:{tip.top}%"></span>
		<span class="peek-tip" style="left:clamp(60px, {tip.left}%, calc(100% - 60px));top:{tip.top}%"><b>{tip.mw} MW</b>{tip.time}</span>
	{/if}
	<span class="lbl l" aria-hidden="true">24 hours ago</span><span class="lbl r" aria-hidden="true">now</span>
</div>

<style>
	.backdrop { position: relative; width: 100%; height: clamp(90px, 16vh, 150px); cursor: crosshair; touch-action: pan-y;
		animation: draw 1.8s cubic-bezier(0.3, 0.6, 0.2, 1) 0.3s both; }
	svg { display: block; width: 100%; height: 100%;
		-webkit-mask-image: linear-gradient(to right, transparent, #000 15%); mask-image: linear-gradient(to right, transparent, #000 15%); }
	.lbl { position: absolute; bottom: 4px; font-size: 0.7rem; color: var(--muted); font-family: var(--font-data); pointer-events: none; }
	.lbl.l { left: 6%; }
	.lbl.r { right: 0; transform: translateX(50%); }
	/* while the line is away (Handoff.svelte sets --ho-lift and data-ho on <html>), its fill fades and its own line and dot hide */
	.area { fill: url(#bd-fill); opacity: calc(1 - var(--ho-lift, 0)); }
	:global(html[data-ho]) .line, :global(html[data-ho]) .dot { opacity: 0; }
	.line { fill: none; stroke: var(--accent); stroke-opacity: 0.55; stroke-width: 1.5; stroke-linejoin: round; }
	.dot { position: absolute; width: 9px; height: 9px; margin: -4.5px 0 0 -4.5px; border-radius: 50%; background: var(--accent); pointer-events: none; }
	.dot::after { content: ""; position: absolute; inset: 0; border-radius: 50%; background: var(--accent); animation: ping 2.2s ease-out infinite; }
	@keyframes ping { from { transform: scale(1); opacity: 0.6; } to { transform: scale(4); opacity: 0; } }
	.guide { position: absolute; top: 0; bottom: 0; width: 1px; background: color-mix(in srgb, var(--ink-2) 35%, transparent); pointer-events: none; }
	.hdot { position: absolute; width: 9px; height: 9px; margin: -4.5px 0 0 -4.5px; border-radius: 50%; background: var(--surface); border: 2px solid var(--accent); box-sizing: border-box; pointer-events: none; }
	.peek-tip { position: absolute; width: max-content; transform: translate(-50%, calc(-100% - 12px)); display: grid; gap: 1px; padding: 5px 9px; border-radius: 4px; white-space: nowrap;
		background: var(--surface); border: 1px solid var(--line); box-shadow: 0 4px 14px rgb(0 0 0 / 0.12); font-size: 0.74rem; color: var(--muted); text-align: center; pointer-events: none; }
	.peek-tip b { font-family: var(--font-data); font-size: 0.88rem; color: var(--ink); font-weight: 600; }
	@keyframes draw { from { clip-path: inset(-200px 100% -40px 0); } to { clip-path: inset(-200px -200px -40px -200px); } }
	@media (prefers-reduced-motion: reduce) { .backdrop, .dot::after { animation: none; } }
</style>
