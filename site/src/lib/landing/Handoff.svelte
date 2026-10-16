<script lang="ts">
	// The hero-to-Tracker hand-off, in three stages as the page scrolls:
	//   1. lift: the hero's horizon line (HeroBackdrop, data-handoff="from") shrinks into its "now" dot;
	//   2. fly: the dot, with a short tail, travels down the page past whatever lies between;
	//   3. land: near the Tracker preview (TrackerPeek, data-handoff="to") the line grows back out of the dot and settles
	//      on the top of the stack, which fills in beneath it; once landed, the Tracker's own outline takes over.
	// Drawn in a fixed overlay between the two charts' positions on screen, read afresh each frame, so it starts on one
	// and ends on the other wherever they are. Progress goes on <html>: --ho-lift (stage 1, the hero's fill fades),
	// --ho (stage 3, the Tracker's stack fills in; 1 once landed) and data-ho while the line is away. Nothing happens
	// for prefers-reduced-motion.
	import { onMount } from 'svelte';
	import { HZ, TK, horizon, tracker } from './geometry.js';

	let { D }: { D: any } = $props();

	const src = $derived(horizon(D));
	const dst = $derived(tracker(D));

	let path = $state('');
	let dot = $state<{ x: number; y: number } | null>(null);
	let tail = $state<{ x: number; y: number; r: number; o: number }[]>([]);
	let ink = $state(0.55); // starts as faint as the horizon line, firms up to sit on the stack
	let show = $state(false);

	type Pt = { x: number; y: number };
	const smooth = (v: number) => (v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v));
	const lerp = (p: Pt, q: Pt, k: number) => ({ x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k });

	onMount(() => {
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		const root = document.documentElement;
		let raf = 0;
		function frame() {
			raf = 0;
			const from = document.querySelector('[data-handoff="from"]'), to = document.querySelector('[data-handoff="to"]');
			if (!from || !to) return;
			const a = from.getBoundingClientRect(), b = to.getBoundingClientRect(), vh = innerHeight, s = scrollY;
			// landed once the Tracker chart's middle is a little above the middle of the screen
			const travel = s + (b.top + b.height / 2) - vh * 0.52;
			// the line is gone into the dot after the first ~160 px of scroll, and grows back over the last ~320 px
			const sA = Math.min(160, travel * 0.2), sC = travel - Math.min(320, travel * 0.3);
			const kA = travel <= 0 ? 1 : smooth(s / sA);
			const kB = travel <= 0 ? 1 : smooth((s - sA) / (sC - sA));
			const kC = travel <= 0 ? 1 : smooth((s - sC) / (travel - sC));
			root.style.setProperty('--ho-lift', kA.toFixed(4));
			root.style.setProperty('--ho', kC.toFixed(4));
			show = s > 0 && kC < 1;
			if (show) root.setAttribute('data-ho', ''); else root.removeAttribute('data-ho');
			if (!show) return;

			const n = src.tot.length;
			const P = (i: number) => ({ x: a.left + (i / Math.max(1, n - 1)) * a.width, y: a.top + (src.y(src.tot[i]) / HZ.H) * a.height });
			// the landing points are the Tracker's own, so the line ends exactly on the outline it hands over to
			const m = dst.tot.length;
			const Q = (i: number) => ({ x: b.left + (i / Math.max(1, m - 1)) * b.width, y: b.top + (dst.y(dst.tot[i]) / TK.H) * b.height });
			const pEnd = P(n - 1), qEnd = Q(m - 1);
			// the dot's path down the page: a gentle swing out to the side and back, rather than a straight drop
			const at = (k: number) => {
				const m = lerp(pEnd, qEnd, k);
				return { x: m.x - Math.sin(Math.PI * k) * Math.min(120, innerWidth * 0.18), y: m.y };
			};

			const pts: string[] = [];
			if (kC > 0) {
				// stage 3: grow out of the dot onto the stack
				for (let i = 0; i < m; i++) { const p = lerp(qEnd, Q(i), kC); pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`); }
				dot = qEnd;
				tail = [];
			} else if (kA < 1) {
				// stage 1: shrink into the dot
				for (let i = 0; i < n; i++) { const p = lerp(P(i), pEnd, kA); pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`); }
				dot = pEnd;
				tail = [];
			} else {
				// stage 2: the dot in flight, with a tail of where it was a moment ago
				dot = at(kB);
				tail = Array.from({ length: 7 }, (_, j) => {
					const p = at(Math.max(0, kB - (j + 1) * 0.018));
					return { ...p, r: 3.6 - j * 0.42, o: 0.45 - j * 0.06 };
				});
			}
			path = pts.length ? `M${pts.join('L')}` : '';
			ink = kC > 0 ? 0.55 + 0.35 * kC : 0.55;
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
			root.style.removeProperty('--ho-lift');
			root.removeAttribute('data-ho');
		};
	});
	// a new interval reshapes both charts; redraw at the current scroll
	$effect(() => { void src; void dst; if (typeof window !== 'undefined') dispatchEvent(new Event('scroll')); });
</script>

{#if show}
	<svg class="ho" aria-hidden="true">
		{#if path}<path d={path} style="stroke-opacity:{ink}" />{/if}
		{#each tail as t}<circle class="t" cx={t.x} cy={t.y} r={t.r} style="opacity:{t.o}" />{/each}
		{#if dot}<circle class="halo" cx={dot.x} cy={dot.y} r="9" /><circle cx={dot.x} cy={dot.y} r="4.5" />{/if}
	</svg>
{/if}

<style>
	.ho { position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 5; overflow: visible; }
	path { fill: none; stroke: var(--accent); stroke-width: 1.6; stroke-linejoin: round; stroke-linecap: round; }
	circle { fill: var(--accent); }
	.halo { opacity: 0.18; }
</style>
