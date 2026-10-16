<script lang="ts">
	// The hero-to-Tracker hand-off. As the page scrolls, the hero's horizon line (HeroBackdrop, data-handoff="from")
	// lifts off and flies down to land exactly on the top of the Tracker preview's stack (TrackerPeek,
	// data-handoff="to"), which fills in beneath it. The flying line is drawn in a fixed overlay between the two
	// charts' positions on screen, read afresh each frame, so it starts on one and ends on the other wherever they are.
	// Progress goes on <html> as --ho (0 at the top of the page, 1 once landed) and data-ho while the line is away;
	// the two charts' styles read them. Nothing happens for prefers-reduced-motion.
	import { onMount } from 'svelte';
	import { HZ, TK, horizon, tracker } from './geometry.js';

	let { D }: { D: any } = $props();

	const src = $derived(horizon(D));
	const dst = $derived(tracker(D));
	// each point's place along the Tracker's time axis
	const tf = $derived(src.t.map((t) => Math.min(1, Math.max(0, (t - dst.t0) / (dst.t1 - dst.t0 || 1)))));

	let path = $state('');
	let dot = $state<{ x: number; y: number } | null>(null);
	let fade = $state(1); // the flying line fades as the stack fills in
	let edge = $state(0); // the horizon's faded left end firms up in flight
	let ink = $state(0.55); // starts as faint as the horizon line, firms up to sit on the stack
	let show = $state(false);

	const smooth = (v: number) => (v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v));

	onMount(() => {
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		const root = document.documentElement;
		let raf = 0;
		function frame() {
			raf = 0;
			const from = document.querySelector('[data-handoff="from"]'), to = document.querySelector('[data-handoff="to"]');
			if (!from || !to) return;
			const a = from.getBoundingClientRect(), b = to.getBoundingClientRect(), vh = innerHeight;
			// landed once the Tracker chart's middle is a little above the middle of the screen
			const travel = scrollY + (b.top + b.height / 2) - vh * 0.52;
			const e = travel <= 0 ? 1 : Math.min(1, Math.max(0, scrollY / travel));
			root.style.setProperty('--ho', e.toFixed(4));
			if (e > 0 && e < 1) root.setAttribute('data-ho', ''); else root.removeAttribute('data-ho');
			show = e > 0 && e < 1;
			if (!show) return;
			// the "now" end leads and the older end follows, so the line pours down rather than sliding as one piece
			const n = src.tot.length, pts: string[] = [];
			let last = { x: 0, y: 0 };
			for (let i = 0; i < n; i++) {
				const k = smooth((e - 0.18 * (1 - tf[i])) / 0.82);
				const x0 = a.left + (i / Math.max(1, n - 1)) * a.width, y0 = a.top + (src.y(src.tot[i]) / HZ.H) * a.height;
				const x1 = b.left + tf[i] * b.width, y1 = b.top + (dst.y(src.tot[i]) / TK.H) * b.height;
				last = { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k };
				pts.push(`${last.x.toFixed(1)},${last.y.toFixed(1)}`);
			}
			path = `M${pts.join('L')}`;
			dot = last;
			fade = 1 - smooth((e - 0.8) / 0.2);
			edge = smooth(e / 0.4);
			ink = 0.55 + 0.35 * smooth(e);
		}
		const go = () => { if (!raf) raf = requestAnimationFrame(frame); };
		frame();
		addEventListener('scroll', go, { passive: true });
		addEventListener('resize', go, { passive: true });
		return () => {
			cancelAnimationFrame(raf);
			removeEventListener('scroll', go);
			removeEventListener('resize', go);
			root.style.removeProperty('--ho');
			root.removeAttribute('data-ho');
		};
	});
	// a new interval reshapes both charts; redraw at the current scroll
	$effect(() => { void src; void dst; if (typeof window !== 'undefined') dispatchEvent(new Event('scroll')); });
</script>

{#if show}
	<svg class="ho" aria-hidden="true" style="opacity:{fade}">
		<defs>
			<linearGradient id="ho-edge" x1="0" y1="0" x2="1" y2="0">
				<stop offset="0" stop-color="var(--accent)" stop-opacity={edge} />
				<stop offset="0.15" stop-color="var(--accent)" />
			</linearGradient>
		</defs>
		<path d={path} style="stroke-opacity:{ink}" />
		{#if dot}<circle cx={dot.x} cy={dot.y} r="4.5" />{/if}
	</svg>
{/if}

<style>
	.ho { position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 5; overflow: visible; }
	path { fill: none; stroke: url(#ho-edge); stroke-width: 1.6; stroke-linejoin: round; stroke-linecap: round; }
	circle { fill: var(--accent); }
</style>
