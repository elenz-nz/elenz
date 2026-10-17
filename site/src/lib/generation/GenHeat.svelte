<script lang="ts">
	// The last 30 days by time of day: one row per NZ day, one cell per half-hour. Renewable share in bands (brown
	// where generation leaned on thermal plant, green where it was close to all renewable); a fuel's MW in its own
	// colour, darker for more. Rows from heatRows() in ./data.js.
	import { REN_BANDS, REN_LEGEND, mwBands } from './data.js';

	type Row = { day: number; t: number; v: number[] };
	let { rows, metric, tok, label }: { rows: Row[]; metric: string; tok: string; label: string } = $props();

	const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	const ofDay = (day: number) => { const d = new Date(day * 864e5); return { d: d.getUTCDate(), mo: d.getUTCMonth(), wd: d.getUTCDay() }; };
	const short = (day: number) => { const p = ofDay(day); return `${p.d} ${MON[p.mo]}`; };
	const long = (day: number) => { const p = ofDay(day); return `${WD[p.wd]} ${p.d} ${MON[p.mo]}`; };
	const hh = (c: number) => `${String(Math.floor(c / 2)).padStart(2, '0')}:${c % 2 ? '30' : '00'}`;
	const fmt = (v: number) => Math.round(v).toLocaleString('en-NZ');

	const ren = $derived(metric === 'ren');
	const bands = $derived(ren ? null : mwBands(rows));
	const edges = $derived(ren ? REN_BANDS : bands!.edges);
	const bin = (v: number) => { if (v !== v) return -1; let b = 0; while (b < edges.length && v >= edges[b]) b++; return b; };
	const legend = $derived(ren ? REN_LEGEND : [0, 1, 2, 3, 4, 5].map((q) => (q < 5 ? `${fmt(q * bands!.step)}–${fmt((q + 1) * bands!.step)} MW` : `${fmt(5 * bands!.step)} MW and over`)));
	const value = (v: number) => (v !== v ? 'no data' : ren ? `${v.toFixed(1)}% renewable` : `${fmt(v)} MW`);

	let tip = $state<{ text: string; x: number; y: number } | null>(null);
</script>

<div class="hm" class:ren style="--fc: var({tok})">
	<div class="scroll">
		<div class="grid" role="img" aria-label={label} onpointerleave={() => (tip = null)}>
			{#each rows as r, j (r.day)}
				<div class="r">
					<span class="d">{j % 5 === 0 || j === rows.length - 1 ? short(r.day) : ''}</span>
					<div class="cells">
						{#each r.v as v, c}
							<!-- svelte-ignore a11y_no_static_element_interactions (pointer readout only; the legend describes the colours) -->
							<span class="c b{bin(v)}" onpointermove={(e) => (tip = { text: `${long(r.day)}, ${hh(c)}–${hh(c + 1)}: ${value(v)}`, x: e.clientX, y: e.clientY })}></span>
						{/each}
					</div>
				</div>
			{/each}
			<div class="r ax"><span class="d"></span><div class="hrs"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div></div>
		</div>
	</div>
	{#if tip}<div class="hm-tip" style="left: {tip.x + 14}px; top: {tip.y + 14}px">{tip.text}</div>{/if}
	<div class="leg">
		{#each legend as l, i}<span><i class="b{i}"></i>{l}</span>{/each}
	</div>
</div>

<style>
	/* renewable share: brown (thermal) through a neutral middle to green; lightness steps as well as hue */
	.hm.ren { --h0: #8a4a17; --h1: #d49a64; --h2: #e7e0d2; --h3: #b7dccb; --h4: #5cae8c; --h5: #1d7656; }
	:global(:root[data-theme='dark']) .hm.ren { --h0: #e08a4a; --h1: #94643c; --h2: #3a4240; --h3: #24584a; --h4: #2e8f6e; --h5: #7fd3b0; }
	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme='light'])) .hm.ren { --h0: #e08a4a; --h1: #94643c; --h2: #3a4240; --h3: #24584a; --h4: #2e8f6e; --h5: #7fd3b0; }
	}
	/* a fuel's MW: its own colour mixed into the panel, darker for more */
	.hm:not(.ren) {
		--h0: color-mix(in srgb, var(--fc) 7%, var(--surface)); --h1: color-mix(in srgb, var(--fc) 24%, var(--surface));
		--h2: color-mix(in srgb, var(--fc) 42%, var(--surface)); --h3: color-mix(in srgb, var(--fc) 60%, var(--surface));
		--h4: color-mix(in srgb, var(--fc) 80%, var(--surface)); --h5: var(--fc);
	}
	.scroll { overflow-x: auto; }
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
	.leg { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 0.76rem; color: var(--ink-2); margin-top: 8px; }
	.leg span { display: inline-flex; align-items: center; gap: 5px; }
	.leg i { width: 11px; height: 11px; border-radius: 2px; display: inline-block; }
</style>
