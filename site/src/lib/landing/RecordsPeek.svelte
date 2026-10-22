<script lang="ts">
	// A glimpse of Records for the landing page: the newest record (a provisional one from the live week if there is
	// one), or peak demand, as its staircase since 1997, each step a time it was broken, with the figure over it. Kept
	// bare, almost a picture: what the record is and its value, no dates, axis labels or notes (the Records page has those). On the
	// landing page the flying dot leaves the Tracker preview and climbs this staircase, drawing it as it goes
	// (Handoff.svelte, build.rec); the path carries data-handoff="rec" for that.
	import { onMount } from 'svelte';
	import { loadRecords, liveBeats, recent, get, def, parts, fullName, trimZeros } from '#lib/records/records.js';
	import { build } from './build.svelte.js';

	let { D }: { D?: any; now?: any } = $props();
	let R = $state<any>(null);
	let done = $state(false);
	// once drawn, a scroll event lets the hand-off place the staircase for where the page is now
	onMount(() => { loadRecords().then((r) => { R = r; done = true; requestAnimationFrame(() => dispatchEvent(new Event('scroll'))); }); });

	const pick = $derived.by(() => {
		if (!R) return null;
		const live = D ? liveBeats(R, D) : {};
		const first = recent(R, live).find((c) => !c.settled);
		if (first) return { d: first.d, region: first.region, rec: first.rec, prov: first.prov, label: 'Latest record' };
		const d = def('demand_max'), rec = get(R, 'demand_max', 'NZ');
		return rec && d ? { d, region: 'NZ', rec, prov: null, label: 'Record' } : null;
	});

	const W = 600, H = 210, TOP = 64, BOT = 8;   // the figure sits over the top-left, so the steps start lower down
	const chart = $derived.by(() => {
		if (!pick || !R) return null;
		const steps = trimZeros(pick.rec.steps) as [number, number][];
		const pts: [number, number][] = pick.prov ? [...steps, [pick.prov.t, pick.prov.v]] : steps;
		const t0 = pts[0][0], t1 = Math.max(R.end ?? 0, pts[pts.length - 1][0]) || t0 + 1;
		const vs = pts.map((p) => p[1]);
		let lo = Math.min(...vs), hi = Math.max(...vs);
		if (hi === lo) { hi += 1; lo -= 1; }
		const x = (t: number) => ((t - t0) / (t1 - t0 || 1)) * W;
		const y = (v: number) => TOP + (1 - (v - lo) / (hi - lo)) * (H - TOP - BOT);
		let d = `M${x(steps[0][0]).toFixed(1)} ${y(steps[0][1]).toFixed(1)}`;
		for (const [t, v] of steps.slice(1)) d += ` H${x(t).toFixed(1)} V${y(v).toFixed(1)}`;
		const last = steps[steps.length - 1];
		const tail = pick.prov ? `M${x(pick.prov.t).toFixed(1)} ${y(last[1]).toFixed(1)} V${y(pick.prov.v).toFixed(1)}` : '';
		d += ` H${x(pick.prov ? pick.prov.t : t1).toFixed(1)}`;
		const end = pick.prov ? { x: x(pick.prov.t), y: y(pick.prov.v) } : { x: x(last[0]), y: y(last[1]) };
		const area = `${d} V${H} H${x(steps[0][0]).toFixed(1)} Z`;
		return { d, tail, end, area };
	});
	const k = $derived(build.rec);
	// how much of the staircase is drawn: a clip up to the point the dot has climbed to (the steps only ever move right
	// or up/down, so everything left of that point is behind it)
	let stepsEl = $state<SVGPathElement>();
	const clipX = $derived.by(() => {
		if (k >= 0.999) return W + 10;
		if (!stepsEl || k <= 0) return -10;
		void chart;
		try { return stepsEl.getPointAtLength(k * stepsEl.getTotalLength()).x; } catch { return W + 10; }
	});
	const clipId = 'rec-clip-' + Math.random().toString(36).slice(2, 8);
</script>

<div class="rec-peek">
	{#if pick && chart}
		{@const shown = pick.prov ?? pick.rec}
		<div class="fig" class:right={pick.d.id.endsWith('_min')}>
			<span class="lbl">{pick.label}{pick.region === 'NZ' ? '' : ` · ${pick.region === 'NI' ? 'North Island' : 'South Island'}`}</span>
			<span class="name">{fullName(pick.d)}</span>
			<span class="val">{parts(pick.d, shown.v).n}<small>{parts(pick.d, shown.v).u}</small></span>
		</div>
		<!-- the chart alone in its box, so the end dot's place (a % of this box) is on the line on phones too -->
		<div class="plot">
			<svg viewBox="0 0 {W} {H}" aria-hidden="true">
				<defs><clipPath id={clipId}><rect x="-10" y="-20" width={Math.max(0, clipX + 10)} height={H + 40} /></clipPath></defs>
				<g clip-path="url(#{clipId})">
					<path class="area" d={chart.area} style="fill:var({pick.d.tok})" />
					<path class="steps" d={chart.d} bind:this={stepsEl} data-handoff="rec" vector-effect="non-scaling-stroke"
						style="stroke:var({pick.d.tok})" class:dashed={!!pick.d.est} />
				</g>
				{#if chart.tail}<path class="tail" d={chart.tail} vector-effect="non-scaling-stroke" style="stroke:var({pick.d.tok});opacity:{k >= 0.999 ? 1 : 0}" />{/if}
				<line class="axis" x1="0" x2={W} y1={H} y2={H} />
			</svg>
			<span class="end" class:hole={!!pick.prov} style="left:{(chart.end.x / W) * 100}%;top:{(chart.end.y / H) * 100}%;--c:var({pick.d.tok});opacity:{k >= 0.999 ? 1 : 0}"></span>
		</div>
	{:else}
		<span class="lbl">Records since 1997</span>
		<span class="sub">{done ? 'Peak demand, renewable share, wind and solar, prices and the HVDC link, for New Zealand and each island.' : 'Loading…'}</span>
	{/if}
</div>

<style>
	/* the right padding keeps the end dot (centred on the chart's right edge) inside the page, so it never makes the
	   page scroll sideways */
	.rec-peek { display: grid; gap: 6px; position: relative; padding-right: 7px; }
	.plot { position: relative; }
	svg { display: block; width: 100%; height: auto; overflow: visible; }
	.axis { stroke: var(--line); stroke-width: 1; vector-effect: non-scaling-stroke; }
	.steps { fill: none; stroke-width: 2.6; stroke-linejoin: round; }
	.steps.dashed { stroke-dasharray: 6 3; }
	.area { opacity: 0.1; }
	.tail { fill: none; stroke-width: 2.2; stroke-dasharray: 4 4; }
	/* the dot's ring is a shadow, which doesn't count towards the page's width */
	.end { position: absolute; width: 12px; height: 12px; margin: -6px 0 0 -6px; border-radius: 50%; background: var(--c); box-shadow: 0 0 0 5px color-mix(in srgb, var(--c) 18%, transparent); transition: opacity 0.2s; }
	.end.hole { background: var(--bg); border: 2.5px solid var(--c); }
	/* the figure sits over the chart's top-left, where the steps start low */
	.fig { position: absolute; left: 0; top: 0; z-index: 1; display: grid; gap: 2px; pointer-events: none; }
	/* a falling record (lowest demand ...) starts high on the left, so its figure sits on the right */
	.fig.right { left: auto; right: 7px; justify-items: end; text-align: right; }
	.lbl { color: var(--muted); font-size: 0.74rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; }
	.name { color: var(--ink-2); font-size: 0.92rem; font-weight: 600; }
	.val { font-family: var(--font-data); font-size: 2.2rem; font-weight: 600; letter-spacing: -0.03em; line-height: 1.05; color: var(--ink); }
	.val small { font-family: var(--font-ui); font-size: 0.9rem; font-weight: 500; color: var(--muted); margin-left: 6px; letter-spacing: 0; }
	.sub { display: block; color: var(--muted); font-size: 0.8rem; }
	/* phones: the chart is too short to carry the figure, so it sits above it */
	@media (max-width: 640px) {
		.val { font-size: 1.7rem; }
		.rec-peek { gap: 8px; }
		.fig, .fig.right { position: static; justify-items: start; text-align: left; }
	}
</style>
