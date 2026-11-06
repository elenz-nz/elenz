<script lang="ts">
	// The hero-to-Tracker hand-off, in three stages as the page scrolls:
	//   1. lift: the hero's horizon line (HeroBackdrop, data-handoff="from") shrinks into its "now" dot;
	//   2. fly: the dot, with a short tail, travels down the page through the Now preview's map (NowPeek,
	//      data-handoff="via"): to the North Island ring, which has filled by the time it gets there, then down the
	//      HVDC route from Haywards to Benmore, drawing the link behind it, and past the South Island ring, which fills
	//      as it passes (build.svelte.js carries how far each part has built);
	//   3. pass: as the dot reaches the end of the Tracker preview's line (TrackerPeek, data-handoff="to"), the line
	//      starts growing back out from there over GROW ms, the stack filling in beneath it, while the dot flies on;
	//   4. record: the dot carries on to the start of the Records preview's staircase (RecordsPeek, data-handoff="rec"),
	//      which then draws itself over CLIMB ms whatever the page does (build.rec), a small dot at its tip following the
	//      path, so it climbs (or descends) whatever shape the record shown has, while the dot flies on with the scroll,
	//      as at the Tracker. (Without an Articles preview the dot climbs the staircase itself and rests on the record.);
	//   5. lap: at the Articles preview
	//      (data-handoff="art") it runs once round the card's outline, drawing it, on its own clock (LAP), and the
	//      outline fades (FADE) (test report HOME-02, 6 Nov 2026: stopping on Records made it read as the foot of the page,
	//      and it needn't ride the record before moving on).
	// Drawn in a fixed overlay between the two charts' positions on screen, read afresh each frame, so it starts on one
	// and ends on the other wherever they are. Progress goes on <html>: --ho-lift (stage 1, the hero's fill fades),
	// --ho (stage 3, the Tracker's stack fills in; 1 once landed) and data-ho while the line is away. Nothing happens
	// for prefers-reduced-motion.
	// Eased between scroll positions: where the browser scrolls in jumps (Windows with smooth scrolling off: a mouse
	// wheel moves the page ~100 px a notch at once), the progress values and the dot glide to their new places over
	// about a fifth of a second rather than jumping with the page (EASE).
	import { onMount } from 'svelte';
	import { HZ, TK, horizon, tracker } from './geometry.js';
	import { build } from './build.svelte.js';
	import { RING, hvAt } from '#lib/home/maplayout.js';

	let { D }: { D: any } = $props();

	const src = $derived(horizon(D));
	const dst = $derived(tracker(D));

	let path = $state('');
	let lap = $state(''), lapO = $state(0);   // the Articles card's outline as the dot draws it, and its opacity
	let pen = $state<Pt | null>(null);        // the small dot at the tip of the record as it draws itself
	let dot = $state<{ x: number; y: number } | null>(null);
	let tail = $state<{ x: number; y: number; r: number; o: number }[]>([]);
	let ink = $state(0.55); // starts as faint as the horizon line, firms up to sit on the stack
	let show = $state(false);

	type Pt = { x: number; y: number };
	const smooth = (v: number) => (v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v));
	const tip = (ps: Pt[]) => ps[ps.length - 1];
	const lerp = (p: Pt, q: Pt, k: number) => ({ x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k });

	const EASE = 70;   // ms: the time constant of the easing (63% of the way in 70 ms, ~95% in 200 ms)
	const GROW = 900;  // ms: the Tracker's line growing out once the dot has passed its end
	const CLIMB = 1600; // ms: the dot climbing the Records staircase, however fast or slow the page is scrolled
	const LAP = 1700, FADE = 700;   // ms: once round the Articles card, then its outline fading
	const ART = LAP + FADE;
	const ART_PAD = 5;  // px: the outline sits this far outside the card

	onMount(() => {
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		build.rec = 0;   // the Records staircase waits for the dot (it stays drawn if there is no hand-off)
		const root = document.documentElement;
		let raf = 0;
		// what's shown: eased towards the values the scroll position gives (cur), null until the first frame
		let shown: { kA: number; ni: number; link: number; si: number; dx: number; dy: number } | null = null;
		// the two clocks: how far the Tracker's line has grown back out (0-1) and how far the dot has climbed the steps
		let grown = 0, climb = 0, art = 0;   // art: ms along the Articles leg (0 to ART)
		let lastT = 0, settling = false;
		function frame(now = performance.now()) {
			raf = 0;
			const dt = lastT ? Math.min(100, now - lastT) : 16;   // after a pause (settled), count the first frame as one frame
			lastT = now;
			const f = shown ? 1 - Math.exp(-dt / EASE) : 1;
			const ease = (a: number, b: number) => { const v = a + (b - a) * f; return Math.abs(b - v) < 0.0015 ? b : v; };
			const from = document.querySelector('[data-handoff="from"]'), to = document.querySelector('[data-handoff="to"]');
			if (!from || !to) return;
			const a = from.getBoundingClientRect(), b = to.getBoundingClientRect(), vh = innerHeight, s = scrollY;
			// aim to have landed once the Tracker chart's middle is a little above the middle of the screen
			const travel = s + (b.top + b.height / 2) - vh * 0.52;
			// the line is gone into the dot after the first ~160 px of scroll
			const sA = Math.max(1, Math.min(160, travel * 0.2));
			const kA = travel <= 0 ? 1 : smooth(s / sA);
			const n = src.tot.length;
			const P = (i: number) => ({ x: a.left + (i / Math.max(1, n - 1)) * a.width, y: a.top + (src.y(src.tot[i]) / HZ.H) * a.height });
			// the landing points are the Tracker's own, so the line ends exactly on the outline it hands over to
			const m = dst.tot.length;
			const Q = (i: number) => ({ x: b.left + (i / Math.max(1, m - 1)) * b.width, y: b.top + (dst.y(dst.tot[i]) / TK.H) * b.height });
			const pEnd = P(n - 1), qEnd = Q(m - 1);

			// the dot's route, in page coordinates, each stop with the scroll position at which the dot reaches it: it
			// reaches each stop on the map as that stop crosses the middle of the screen, so between stops it rides
			// at mid-screen while the page moves under it
			const page = (p: Pt) => ({ x: p.x, y: p.y + s });
			const via = document.querySelector('[data-handoff="via"]') as SVGSVGElement | null;
			const ctm = via?.getScreenCTM();
			type Stop = { p: Pt; at: number; hv?: boolean };
			const stops: Stop[] = [{ p: page(pEnd), at: sA }];
			const mapStops: Record<string, number> = {};
			if (ctm) {
				const onMap = (v: Pt) => { const q = new DOMPoint(v.x, v.y).matrixTransform(ctm); return { x: q.x, y: q.y + s }; };
				const add = (key: string, v: Pt, hv = false) => {
					const p = onMap(v), prev = stops[stops.length - 1].at;
					const at = Math.max(prev + 1, p.y - vh * 0.5);
					stops.push({ p, at, hv });
					mapStops[key] = at;
				};
				add('ni', RING.NI);
				add('hay', hvAt(1));
				add('ben', hvAt(0), true); // reached by following the route from Haywards
				add('si', RING.SI);
			}
			// the dot reaches the end of the Tracker's line ("now") as that point crosses the middle of the screen (at least
			// 220 px after the map), and the line grows out from there on its own clock (GROW) while the dot flies on.
			// On a tall screen the page may end before then, so every stop is pulled in to the last scroll position.
			const maxS = Math.max(0, document.documentElement.scrollHeight - vh);
			const last = stops[stops.length - 1].at;
			const sC = Math.min(Math.max(travel, last + 220), Math.max(last + 40, maxS - 260));
			stops.push({ p: page(qEnd), at: sC });
			// then on to the start of the Records staircase, reached as it comes up to a little above the middle of the
			// screen (or at the foot of the page); the climb runs on its own clock (CLIMB), so it finishes even if the
			// page has stopped scrolling
			const recPath = document.querySelector('[data-handoff="rec"]') as SVGPathElement | null;
			const ctmR = recPath?.getScreenCTM(), L = recPath ? recPath.getTotalLength() : 0;
			const hasRec = !!(recPath && ctmR && L > 0);
			const onRec = (u: number) => { const p = recPath!.getPointAtLength(Math.max(0, Math.min(1, u)) * L); const q = new DOMPoint(p.x, p.y).matrixTransform(ctmR!); return { x: q.x, y: q.y + s }; };
			let c0 = Infinity;
			if (hasRec) {
				const start = onRec(0);
				c0 = Math.min(Math.max(sC + 220, start.y - vh * 0.6), Math.max(sC + 60, maxS - 2));
				stops.push({ p: start, at: c0 });
			}
			// the Articles card, on screen: its outline, a little outside it, as a point a share w (0-1) of the way round
			// from its top-left corner, clockwise, and the outline drawn that far
			const artEl = document.querySelector('[data-handoff="art"]');
			const ar = artEl?.getBoundingClientRect();
			const hasArt = hasRec && !!ar && ar.width > 0 && ar.height > 0;
			const box = hasArt ? { x: ar!.left - ART_PAD, y: ar!.top - ART_PAD, w: ar!.width + 2 * ART_PAD, h: ar!.height + 2 * ART_PAD } : null;
			const corners = box ? [{ x: box.x, y: box.y }, { x: box.x + box.w, y: box.y }, { x: box.x + box.w, y: box.y + box.h }, { x: box.x, y: box.y + box.h }, { x: box.x, y: box.y }] : [];
			const round = (w: number) => {
				const per = 2 * (box!.w + box!.h);
				let d = Math.max(0, Math.min(1, w)) * per;
				const pts: Pt[] = [corners[0]];
				for (let k = 1; k < corners.length; k++) {
					const A = corners[k - 1], B = corners[k], len = Math.hypot(B.x - A.x, B.y - A.y);
					if (d <= len) { pts.push(lerp(A, B, len ? d / len : 0)); break; }
					pts.push(B); d -= len;
				}
				return pts;
			};
			// then on to the Articles card's top-left corner, reached as it comes up past the middle of the screen (or at the
			// foot of the page), where the lap round it starts
			let cA = Infinity;
			if (hasArt) {
				const corner = { x: corners[0].x, y: corners[0].y + s };
				cA = Math.min(Math.max(c0 + 220, corner.y - vh * 0.45), Math.max(c0 + 60, maxS - 1));
				stops.push({ p: corner, at: cA });
			}
			// where the dot is (page coordinates) at scroll position v
			const route = (v: number): Pt => {
				let i = 0;
				while (i < stops.length - 2 && v > stops[i + 1].at) i++;
				const A = stops[i], B = stops[i + 1], u = Math.min(1, Math.max(0, (v - A.at) / (B.at - A.at || 1)));
				if (B.hv && ctm) { const q = new DOMPoint(hvAt(1 - u).x, hvAt(1 - u).y).matrixTransform(ctm); return { x: q.x, y: q.y + s }; }
				return lerp(A.p, B.p, u);
			};

			// the Now preview builds as the dot passes
			let tNi = 1, tLink = 1, tSi = 1;
			if (ctm) {
				const { ni, hay, ben, si } = mapStops;
				const clamp = (v: number) => (v <= 0 ? 0 : v >= 1 ? 1 : v);
				tNi = smooth((s - (ni - 280)) / 280);
				tLink = clamp((s - hay) / (ben - hay || 1));
				const siFrom = ben - 0.3 * (ben - hay);
				tSi = smooth((s - siFrom) / (si + 100 - siFrom));
			}
			// the clocks: the Tracker's line grows once the dot has passed its end; the climb runs once the dot is at the
			// staircase; scrolling back above either winds it back, faster
			const step = (v: number, on: boolean, ms: number) => Math.max(0, Math.min(1, v + (on ? dt / ms : -dt / (ms * 0.4))));
			grown = travel <= 0 ? 1 : step(grown, s >= sC, GROW);
			const climbing = hasRec && s >= c0 - 1;
			climb = hasRec ? step(climb, climbing, CLIMB) : 1;
			const kC = smooth(grown);
			const u = smooth(climb);
			// the lap round the Articles card runs once the dot has reached its corner; scrolling back above winds it back
			const artGo = hasArt && s >= cA - 1;
			art = hasArt ? Math.max(0, Math.min(ART, art + (artGo ? dt : -dt * 2.5))) : 0;
			// the dot on the lap at time a (ms)
			const artAt = (a: number): Pt => tip(round(smooth(a / LAP)));

			// the dot's place on screen for this scroll position: flying (eased), or round the Articles card (on its clock).
			// Without an Articles preview it climbs the record, as before
			const screen = (p: Pt) => ({ x: p.x, y: p.y - s });
			const onStair = hasRec && !hasArt && (climbing || climb > 0);
			const onArt = hasArt && art > 0;
			const target = onArt ? artAt(art) : onStair ? screen(onRec(u)) : screen(route(s));
			if (!shown) shown = { kA, ni: tNi, link: tLink, si: tSi, dx: 0, dy: 0 };
			else {
				const prevDot = dot ?? target;
				const fly = onStair || onArt ? 0 : 1;   // on the staircase the dot is exactly where the clip has drawn to (and on its own clock round Articles)
				shown = { kA: ease(shown.kA, kA), ni: ease(shown.ni, tNi), link: ease(shown.link, tLink), si: ease(shown.si, tSi),
				          dx: fly * (prevDot.x - target.x) * (1 - f), dy: fly * (prevDot.y - target.y) * (1 - f) };
				if (Math.abs(shown.dx) < 0.3) shown.dx = 0;
				if (Math.abs(shown.dy) < 0.3) shown.dy = 0;
			}
			const kAs = shown.kA;
			root.style.setProperty('--ho-lift', kAs.toFixed(4));
			root.style.setProperty('--ho', kC.toFixed(4));
			if (ctm) { build.ni = shown.ni; build.link = shown.link; build.si = shown.si; }
			if (hasRec) build.rec = u;
			// keep drawing until everything has caught up: the eased values, and the two clocks
			settling = shown.kA !== kA || shown.ni !== tNi || shown.link !== tLink || shown.si !== tSi || shown.dx !== 0 || shown.dy !== 0
				|| (grown > 0 && grown < 1) || (s >= sC ? grown < 1 : grown > 0) || (hasRec && (climbing ? climb < 1 : climb > 0))
				|| (hasArt && (artGo ? art < ART : art > 0));
			if (settling) go(); else lastT = 0;

			// the dot is out while it flies or climbs; once it rests on the record (or, with no Records preview, on the
			// end of the Tracker's line) the page's own marks take over
			const dotOut = s > 0 && (hasArt ? s < cA - 1 || art < LAP : hasRec ? climb < 1 : s < sC);
			// the outline the dot has drawn round the Articles card, fading once it's round
			lap = onArt ? 'M' + round(smooth(art / LAP)).map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('L') : '';
			lapO = art <= LAP ? 0.9 : 0.9 * (1 - (art - LAP) / FADE);
			// the record drawing itself behind the dot, with a small dot at its tip
			pen = hasArt && climb > 0 && climb < 1 ? screen(onRec(u)) : null;
			show = (s > 0 && (kAs < 1 || (kC > 0 && kC < 1))) || dotOut || (onArt && art < ART) || !!pen;
			if (show) root.setAttribute('data-ho', ''); else root.removeAttribute('data-ho');
			if (!show) return;

			const pts: string[] = [];
			if (kAs < 1) {
				// stage 1: the hero's line shrinks into the dot
				for (let i = 0; i < n; i++) { const p = lerp(P(i), pEnd, kAs); pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`); }
				dot = pEnd;
				tail = [];
			} else {
				if (kC > 0 && kC < 1) {
					// the Tracker's line grows out of its end, behind the dot, which has already moved on
					for (let i = 0; i < m; i++) { const p = lerp(qEnd, Q(i), kC); pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`); }
				}
				if (dotOut) {
					const { dx, dy } = shown;
					dot = { x: target.x + dx, y: target.y + dy };
					// a tail of where it was a moment ago: along the route in flight, along the steps when climbing
					tail = Array.from({ length: 7 }, (_, j) => {
						const p = onArt ? artAt(Math.max(0, art - (j + 1) * 12)) : onStair ? screen(onRec(Math.max(0, u - (j + 1) * 0.018))) : screen(route(Math.max(sA, s - (j + 1) * 14)));
						return { x: p.x + dx, y: p.y + dy, r: 3.6 - j * 0.42, o: 0.45 - j * 0.06 };
					});
				} else { dot = null; tail = []; }
			}
			path = pts.length ? `M${pts.join('L')}` : '';
			ink = kC > 0 ? 0.55 + 0.35 * kC : 0.55;
		}
		const go = () => { if (!raf) raf = requestAnimationFrame(frame); };
		frame(performance.now());
		addEventListener('scroll', go, { passive: true });
		addEventListener('resize', go, { passive: true });
		return () => {
			cancelAnimationFrame(raf);
			removeEventListener('scroll', go);
			removeEventListener('resize', go);
			root.style.removeProperty('--ho');
			root.style.removeProperty('--ho-lift');
			root.removeAttribute('data-ho');
			build.ni = build.link = build.si = build.rec = 1;
		};
	});
	// a new interval reshapes both charts; redraw at the current scroll
	$effect(() => { void src; void dst; if (typeof window !== 'undefined') dispatchEvent(new Event('scroll')); });
</script>

{#if show}
	<svg class="ho" aria-hidden="true">
		{#if path}<path d={path} style="stroke-opacity:{ink}" />{/if}
		{#if lap}<path class="lap" d={lap} style="stroke-opacity:{lapO}" />{/if}
		{#each tail as t}<circle class="t" cx={t.x} cy={t.y} r={t.r} style="opacity:{t.o}" />{/each}
		{#if pen}<circle class="pen" cx={pen.x} cy={pen.y} r="3" />{/if}
		{#if dot}<circle class="halo" cx={dot.x} cy={dot.y} r="9" /><circle cx={dot.x} cy={dot.y} r="4.5" />{/if}
	</svg>
{/if}

<style>
	.ho { position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 5; overflow: visible; }
	path { fill: none; stroke: var(--accent); stroke-width: 1.6; stroke-linejoin: round; stroke-linecap: round; }
	circle { fill: var(--accent); }
	.halo { opacity: 0.18; }
	.lap { stroke-width: 1.8; }
	.pen { opacity: 0.85; }
</style>
