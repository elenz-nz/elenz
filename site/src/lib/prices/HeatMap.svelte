<script lang="ts">
	import { portal } from '#lib/site/portal.js';
	// Price by time of day: one row per NZ day (or month or year on All, #lib/site/heat.js), one cell per half-hour,
	// coloured by price band: fixed bands, so periods compare, or (scaled) bands at the sixths of the prices shown.
	// Long lists scroll, latest last.
	import { money, shortDate, dayLabel } from './data.js';
	import { quantileEdges } from '#lib/site/heat.js';

	type Row = { day: number; t: number; v: number[]; lab?: string; long?: string; month?: boolean };
	let { rows, scaled = false }: { rows: Row[]; scaled?: boolean } = $props();

	const FIXED = [50, 100, 150, 250, 500];
	const BINS = $derived((scaled && quantileEdges(rows)) || FIXED);
	const dollars = (v: number) => (v < 0 ? '−$' + Math.abs(v).toLocaleString('en-NZ') : '$' + v.toLocaleString('en-NZ'));
	const LEGEND = $derived([0, 1, 2, 3, 4, 5].map((c) => ({ c, label: c === 0 ? `Under ${dollars(BINS[0])}` : c === 5 ? `Over ${dollars(BINS[4])}` : `${dollars(BINS[c - 1])}–${dollars(BINS[c]).replace('$', '')}` })));
	const bin = (v: number) => { if (v !== v) return -1; let b = 0; while (b < BINS.length && v >= BINS[b]) b++; return b; };
	let scroller = $state<HTMLDivElement>();
	$effect(() => { void rows; if (scroller) scroller.scrollTop = scroller.scrollHeight; });
	let tip = $state<{ text: string; x: number; y: number } | null>(null);
	// the tooltip follows the pointer, on its left in the right half of the window and above it near the foot, so it
	// never runs off the screen; hung from <body> so an enlarged card's transform doesn't move it (portal.js)
	const tipAt = (text: string, e: PointerEvent) => (tip = { text, x: e.clientX, y: e.clientY });
	const tipStyle = (t: { x: number; y: number }) => `left: ${t.x}px; top: ${t.y}px; transform: translate(${t.x > innerWidth / 2 ? 'calc(-100% - 14px)' : '14px'}, ${t.y > innerHeight - 70 ? 'calc(-100% - 14px)' : '14px'})`;
	const hh = (c: number) => `${String(Math.floor(c / 2)).padStart(2, '0')}:${c % 2 ? '30' : '00'}`;
</script>

<div class="hm">
	<div class="scroll" class:tall={rows.length > 40} bind:this={scroller}>
		<div class="grid" role="img" aria-label="Heat map of half-hourly prices by day and time of day" onpointerleave={() => (tip = null)}>
			{#each rows as r, j (r.day)}
				<div class="r">
					<span class="d">{r.month ? r.lab : j % (rows.length > 40 ? 7 : 5) === 0 || j === rows.length - 1 ? shortDate(r.t) : ''}</span>
					<div class="cells">
						{#each r.v as v, c}
							<!-- svelte-ignore a11y_no_static_element_interactions (pointer readout only; the cells are summarised by the legend) -->
							<span class="c b{bin(v)}" onpointermove={(e) => tipAt(`${r.month ? r.long + ' average' : dayLabel(r.t)}, ${hh(c)}–${hh(c + 1)}: ${v === v ? money(v) + '/MWh' : 'no data'}`, e)}></span>
						{/each}
					</div>
				</div>
			{/each}
			<div class="r ax"><span class="d"></span><div class="hrs"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div></div>
		</div>
	</div>
	{#if tip}<div class="hm-tip" use:portal style={tipStyle(tip)}>{tip.text}</div>{/if}
	<div class="leg">
		{#each LEGEND as l}<span><i class="b{l.c}"></i>{l.label}</span>{/each}
	</div>
</div>

<style>
	.hm {
		--h0: #e6eff0; --h1: #bfdadf; --h2: #86b9c4; --h3: #4793a6; --h4: #16697d; --h5: #d9731f;
	}
	:global(:root[data-theme='dark']) .hm { --h0: #2c4244; --h1: #23596a; --h2: #2a7a8e; --h3: #3c9cb3; --h4: #7ccbdb; --h5: #f08a3c; }
	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme='light'])) .hm { --h0: #2c4244; --h1: #23596a; --h2: #2a7a8e; --h3: #3c9cb3; --h4: #7ccbdb; --h5: #f08a3c; }
	}
	.scroll { overflow-x: auto; }
	.scroll.tall { max-height: calc(40 * (var(--rh, 10px) + 1px) + 20px); overflow-y: auto; overscroll-behavior: contain; }
	.scroll.tall .r.ax { position: sticky; bottom: 0; background: var(--surface); margin-top: 0; padding-top: 3px; height: 19px; }
	.grid { min-width: 440px; display: grid; gap: 1px; }
	.r { display: flex; align-items: center; gap: 8px; height: var(--rh, 10px); }  /* --rh: row height, taller when enlarged */
	.r.ax { height: 16px; margin-top: 3px; }
	.d { width: 46px; flex: none; text-align: right; font: 400 10px var(--font-data); color: var(--muted); white-space: nowrap; }
	.cells { flex: 1; display: grid; grid-template-columns: repeat(48, minmax(0, 1fr)); gap: 1px; height: var(--rh, 10px); }
	.c { display: block; height: 100%; background: var(--grid); }
	.hrs { flex: 1; display: flex; justify-content: space-between; font: 400 10px var(--font-data); color: var(--muted); }
	.b0 { background: var(--h0); } .b1 { background: var(--h1); } .b2 { background: var(--h2); }
	.b3 { background: var(--h3); } .b4 { background: var(--h4); } .b5 { background: var(--h5); }
	.hm-tip { position: fixed; z-index: 30; pointer-events: none; background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 5px 9px; box-shadow: 0 6px 18px rgb(0 0 0 / 0.14); font-size: 0.78rem; color: var(--ink); font-family: var(--font-data); white-space: nowrap; }
	.leg { margin-top: 8px !important; }
	.leg { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 0.76rem; color: var(--ink-2); margin-top: 4px; }
	.leg span { display: inline-flex; align-items: center; gap: 5px; }
	.leg i { width: 11px; height: 11px; border-radius: 2px; display: inline-block; }
</style>
