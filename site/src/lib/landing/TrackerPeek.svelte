<script lang="ts">
	// A glimpse of the Tracker for the landing page: the last 24 hours of generation, stacked by fuel. No y axis: the
	// top of the chart is a rounded-up maximum, so a label there would read as a figure it isn't. On the landing page
	// the hero's horizon line flies down onto this stack as you scroll (Handoff.svelte), which fills in beneath it.
	import { TK, tracker } from './geometry.js';

	let { D }: { D: any; now?: any } = $props();

	const { W, H } = TK;
	const G = $derived(tracker(D));
	const S = $derived(G.S);
	const x = (i: number) => (i / Math.max(1, S.t.length - 1)) * W;
	// each layer as a closed path between its base and its top
	const areas = $derived.by(() => {
		const base = new Array(S.t.length).fill(0);
		return S.layers.map((l) => {
			const lo = base.slice();
			l.v.forEach((v, i) => (base[i] += v));
			const top = base.map((v, i) => `${x(i).toFixed(1)},${G.y(v).toFixed(1)}`);
			const bot = lo.map((v, i) => `${x(i).toFixed(1)},${G.y(v).toFixed(1)}`).reverse();
			return { ...l, d: `M${top.join('L')}L${bot.join('L')}Z` };
		});
	});
	const end = $derived({ left: 100, top: (G.y(G.tot[G.tot.length - 1] ?? 0) / H) * 100 });
	// a tick at every six hours, New Zealand time
	const HOUR = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', hour: 'numeric', hour12: true });
	const ticks = $derived.by(() => {
		const out: { x: number; label: string }[] = [];
		S.t.forEach((t, i) => {
			const p = HOUR.formatToParts(new Date(t));
			const h = Number(p.find((q) => q.type === 'hour')?.value);
			const pm = /p/i.test(p.find((q) => q.type === 'dayPeriod')?.value ?? '');
			const h24 = (h % 12) + (pm ? 12 : 0);
			if (h24 % 6 === 0 && new Date(t).getUTCMinutes() < 15 && i > S.t.length * 0.04 && i < S.t.length * 0.96 && (!out.length || (x(i) / W) * 100 - out[out.length - 1].x > 7))
				out.push({ x: (x(i) / W) * 100, label: h24 === 0 ? 'midnight' : h24 === 12 ? 'noon' : `${h} ${pm ? 'pm' : 'am'}` });
		});
		return out;
	});
</script>

<div class="trk-peek">
	<div class="plot">
		<svg viewBox="0 0 {W} {H}" aria-hidden="true" data-handoff="to">
			<defs>
				<pattern id="pk-hatch-trk" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
					<rect width="4" height="4" class="hb" /><rect width="2" height="4" class="hf" />
				</pattern>
			</defs>
			{#each [0.25, 0.5, 0.75] as g}<line class="grid" x1="0" x2={W} y1={G.y(G.max * g)} y2={G.y(G.max * g)} />{/each}
			<g class="fill">{#each areas as a}<path d={a.d} style="fill:{a.hatch ? 'url(#pk-hatch-trk)' : `var(${a.tok})`}" />{/each}</g>
			<line class="axis" x1="0" x2={W} y1={H} y2={H} />
		</svg>
		<span class="now" style="left:{end.left}%;top:{end.top}%"></span>
	</div>
	<div class="ticks">{#each ticks as t}<span style="left:{t.x}%">{t.label}</span>{/each}</div>
	<ul class="key">
		{#each [...S.layers].reverse() as l}<li><span class="sw" class:hatch={l.hatch} style="--c:var({l.tok})"></span>{l.name}</li>{/each}
	</ul>
</div>

<style>
	.trk-peek { display: grid; gap: 4px; }
	.plot { position: relative; padding-top: 8px; }
	svg { display: block; width: 100%; height: auto; overflow: visible; }
	path { stroke: none; }
	.grid { stroke: var(--grid); stroke-width: 1; }
	.axis { stroke: var(--line); stroke-width: 1; }
	/* --ho is the hand-off's progress (0 at the top of the page, 1 once the line has landed); unset, all shows */
	.fill { opacity: calc((var(--ho, 1) - 0.45) * 1.9); }
	.now { position: absolute; width: 9px; height: 9px; margin: -4.5px 0 0 -4.5px; border-radius: 50%; background: var(--accent); pointer-events: none;
		opacity: calc((var(--ho, 1) - 0.97) * 34); }
	.now::after { content: ""; position: absolute; inset: 0; border-radius: 50%; background: var(--accent); animation: ping 2.2s ease-out infinite; }
	@keyframes ping { from { transform: scale(1); opacity: 0.6; } to { transform: scale(4); opacity: 0; } }
	@media (prefers-reduced-motion: reduce) { .now::after { animation: none; } }
	.hb { fill: color-mix(in srgb, var(--f-solar) 30%, transparent); }
	.hf { fill: var(--f-solar); }
	.ticks { position: relative; height: 16px; font-family: var(--font-data); font-size: 0.7rem; color: var(--muted); }
	.ticks span { position: absolute; transform: translateX(-50%); white-space: nowrap; }
	.key { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 0.76rem; color: var(--ink-2); }
	.sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; background: var(--c); margin-right: 6px; vertical-align: -1px; }
	.hatch { background: repeating-linear-gradient(135deg, var(--c) 0 2px, color-mix(in srgb, var(--c) 30%, transparent) 2px 4px); }
</style>
