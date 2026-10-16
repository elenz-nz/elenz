<script lang="ts">
	// The price explainer on /now: a line under the price tiles that opens into "Why is the price high?".
	// State, rules and wording come from explain.js (explainNow); this only draws them. Quiet: one line and a button.
	// Highlighted: the line is outlined and asks to be opened. Open (extremes only): the card opens by itself; a viewer
	// can fold it, and it stays folded until the explainer's state changes.
	import { money, clock, duration } from './explain.js';

	type Row = { k: string; tok: string; title: string; sub: string; now: number; usual: number; effect: number; split?: boolean };
	type Band = { t0: number; t1: number; med: number; p25: number; p75: number; hl: number; open: number };
	type X = {
		t: number; tier: string; variant: string; newLow: boolean; lowStart: number | null;
		since: number | null; hay: number; ben: number; hi: number; typical: number | null; ratio: number | null;
		headline: string; line: string; verdict: string; rows: Row[]; link: Row; offersDay: string | null; setterIsl: string;
		setter: { plant: string; fuel: string; mw: number; cap: number | null; price: number; owner?: string; scheme?: string } | null;
		chart: { t: number[]; hay: number[]; ben: number[]; band: Band[] };
	};
	let { x }: { x: X } = $props();

	// open by default only at extremes; a viewer's choice holds until the state changes
	let choice = $state<boolean | null>(null);
	const key = $derived(`${x.tier}|${x.variant}`);
	let lastKey = '';
	$effect(() => {
		if (key !== lastKey) { lastKey = key; choice = null; }
	});
	const open = $derived(choice ?? x.tier === 'open');

	const fmt = (v: number) => Math.round(v).toLocaleString('en-NZ');
	const FUEL: Record<string, string> = { gas: 'gas', diesel: 'diesel', coal: 'coal/gas', hydro: 'hydro', geo: 'geothermal', wind: 'wind', solar: 'solar', batt: 'battery', bio: 'bioenergy', waste: 'waste heat' };
	const TOK: Record<string, string> = { gas: '--f-gas', diesel: '--f-diesel', coal: '--f-coal', hydro: '--f-hydro', geo: '--f-geo', wind: '--f-wind', solar: '--f-solar', batt: '--f-batt', bio: '--f-bio', waste: '--f-waste' };
	const DAY = (d: string | null) => d ? new Date(d + 'T12:00:00+13:00').toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', timeZone: 'Pacific/Auckland' }) : '';

	const tag = $derived(x.tier === 'open' ? 'High price' : x.variant === 'split' ? 'Islands split' : x.variant === 'high' ? 'Prices up'
		: x.variant === 'low' ? (x.newLow ? 'New low' : 'Near zero') : 'Price');
	const button = $derived(open ? 'Hide' : x.tier === 'quiet' ? 'Why this price?' : x.headline);
	const sub = $derived(
		x.variant === 'low' ? (x.lowStart ? `Near zero since ${clock(x.lowStart)}.` : '')
		: x.since && x.tier !== 'quiet' ? `${x.variant === 'split' ? 'Split' : 'High'} for ${duration(x.t - x.since + 300000)}.` : ''
	);

	// the 24-hour chart
	const VW = 420, VH = 230, L = 58, R = 8, T = 12, B = 30;
	const c = $derived(x.chart);
	const t0 = $derived(c.t[0]), t1 = $derived(c.t[c.t.length - 1]);
	const ymax = $derived.by(() => {
		let m = 0;
		for (const v of c.hay) if (v > m) m = v;
		for (const v of c.ben) if (v > m) m = v;
		for (const b of c.band) m = Math.max(m, b.p75, b.hl);
		const raw = Math.max(10, m * 1.08);
		const p = Math.pow(10, Math.floor(Math.log10(raw)));
		return Math.ceil(raw / (p / 2)) * (p / 2);
	});
	const X = (v: number) => L + ((v - t0) / (t1 - t0 || 1)) * (VW - L - R);
	const Y = (v: number) => T + (1 - Math.max(0, Math.min(v, ymax)) / ymax) * (VH - T - B);
	const line = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${X(c.t[i]).toFixed(1)},${Y(v).toFixed(1)}`).join('');
	const steps = (k: 'hl' | 'open') => c.band.filter((b) => b[k] <= ymax).map((b) => `M${X(b.t0).toFixed(1)},${Y(b[k]).toFixed(1)}H${X(b.t1).toFixed(1)}`).join('');
	const yTicks = $derived([0, ymax / 2, ymax]);
	const xTicks = $derived.by(() => {
		const out: { t: number; label: string }[] = [];
		const six = 6 * 3600000;
		// every six hours on the NZ clock (midnight, 6 am, noon, 6 pm), clear of "now"
		const hr = 3600000;
		for (let tt = Math.ceil(t0 / hr) * hr; tt < t1 - 2 * hr; tt += hr) {
			const h = Number(new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', hour: 'numeric', hourCycle: 'h23' }).format(new Date(tt)));
			if (h % 6 === 0) { out.push({ t: tt, label: h === 0 ? 'midnight' : h === 12 ? 'noon' : clock(tt).replace(':00', '') }); tt += six - hr; }
		}
		return out;
	});
	const ariaChart = $derived(`Haywards and Benmore prices over the last 24 hours, with the usual range for each half-hour. Now: Haywards ${money(x.hay)}, Benmore ${money(x.ben)} per MWh (30-minute averages)${x.typical != null ? `; usually about ${money(x.typical)}` : ''}.`);
	const bar = (r: Row) => { const s = Math.max(r.now, r.usual, 1) * 1.15; return { fill: (r.now / s) * 100, tick: (r.usual / s) * 100 }; };
</script>

<section class="pe tier-{x.tier} var-{x.variant}" aria-label="Price explainer">
	<div class="pe-line">
		<p class="pe-says">
			<span class="pe-tag">{#if x.tier !== 'quiet'}<span class="dot" aria-hidden="true"></span>{/if}{tag}</span>
			<span>{x.line}</span>
		</p>
		<button type="button" class="pe-btn" aria-expanded={open} aria-controls="pe-body" onclick={() => (choice = !open)}>
			{button}
			<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" class:up={open}><path d="M3 5l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
		</button>
	</div>

	{#if open}
		<div class="pe-body" id="pe-body">
			<div class="pe-head">
				<p class="pe-eye">Price explainer</p>
				<h2>{x.headline}</h2>
				{#if sub}<p class="pe-sub">{sub}</p>{/if}
			</div>
			<div class="pe-grid">
				<div class="pe-main">
					<p class="pe-verdict">{x.verdict}</p>
					<ul class="pe-rows">
						{#each [...x.rows, x.link] as r (r.k)}
							{@const b = bar(r)}
							<li>
								<span class="sw" style="--c:var({r.tok})" aria-hidden="true"></span>
								<span class="pe-what"><b>{r.title}</b><small>{r.sub}</small></span>
								<span class="pe-bar" aria-hidden="true"><span class="fill" style="--c:var({r.tok});width:{b.fill}%"></span><span class="tick" style="left:{b.tick}%"></span></span>
								<span class="pe-eff e{r.effect}">{r.split ? 'Split' : r.effect > 0 ? 'Pushing up' : r.effect < 0 ? 'Pushing down' : 'Normal'}</span>
							</li>
						{/each}
					</ul>
					<p class="pe-key"><span class="tick-key" aria-hidden="true"></span>usual for this half-hour of the week (last four weeks) · Not in the explanation yet: lake storage, reserves, outages</p>
				</div>

				<aside class="pe-side">
					<div>
						<h3>Prices, last 24 hours</h3>
						<svg viewBox="0 0 {VW} {VH}" role="img" aria-label={ariaChart}>
							{#each yTicks as v}
								<line class="grid" x1={L} x2={VW - R} y1={Y(v)} y2={Y(v)} />
								<text class="ax" x={L - 6} y={Y(v) + 5} text-anchor="end">{money(v).replace(/\.00$/, '')}</text>
							{/each}
							{#each c.band as b}
								<rect class="band" x={X(b.t0)} width={Math.max(0.5, X(b.t1) - X(b.t0))} y={Y(b.p75)} height={Math.max(0.5, Y(b.p25) - Y(b.p75))} />
							{/each}
							<path class="thr hl" d={steps('hl')} />
							<path class="thr op" d={steps('open')} />
							<path class="p-ben" d={line(c.ben)} />
							<path class="p-hay" d={line(c.hay)} />
							{#each xTicks as tk}
								<text class="ax" x={X(tk.t)} y={VH - 8} text-anchor="middle">{tk.label}</text>
							{/each}
							<text class="ax" x={VW - R} y={VH - 8} text-anchor="end">now</text>
						</svg>
						<p class="legend">
							<span><i class="k-hay"></i>Haywards</span><span><i class="k-ben"></i>Benmore</span><span><i class="k-band"></i>usual range</span>
							<span><i class="k-hl"></i>highlighted above</span>{#if c.band.some((b) => b.open <= ymax)}<span><i class="k-op"></i>opens by itself above</span>{/if}
						</p>
					</div>

					<div class="pe-setter">
						<p class="ps-head"><span>Likely price setter{x.variant === 'split' ? `, ${x.setterIsl === 'NI' ? 'North' : 'South'} Island` : ''}</span><span class="est">Estimate</span></p>
						{#if x.setter}
							<p class="ps-name"><span class="sw" style="--c:var({TOK[x.setter.fuel] ?? '--muted'})" aria-hidden="true"></span><b>{x.setter.plant}</b>
								<small>{FUEL[x.setter.fuel] ?? x.setter.fuel}{x.setter.scheme ? `, ${x.setter.scheme} scheme` : ''}{x.setter.owner ? `, ${x.setter.owner}` : ''}</small></p>
							<p class="ps-why">Running {fmt(x.setter.mw)} MW, part way up an offer block at {money(x.setter.price)}/MWh in the latest offers published ({DAY(x.offersDay)}, same half-hour).</p>
						{:else if x.hi < 5}
							<p class="ps-why">Near zero, many plants are offering at this price, so no single one sets it.</p>
						{:else}
							<p class="ps-why">No plant in the latest offers {x.offersDay ? `(${DAY(x.offersDay)})` : ''} clearly matches this price.</p>
						{/if}
					</div>
				</aside>
			</div>
			<p class="pe-foot">
				<span>Built from the 5-minute dispatch feed, compared with the last four weeks of history. Offers are published the day after, so the price setter is a best guess.</span>
				<a href="/about#m-explain">How this works</a>
			</p>
		</div>
	{/if}
</section>

<style>
	.pe { background: var(--surface); border: 1px solid var(--line); border-radius: 4px; }
	.pe-line { display: flex; align-items: center; justify-content: space-between; gap: 6px 14px; padding: 4px 6px 4px 14px; flex-wrap: wrap; }
	.pe-says { margin: 0; display: flex; align-items: center; gap: 4px 10px; flex-wrap: wrap; font-size: 0.9rem; color: var(--ink-2); padding-block: 6px; }
	.pe-tag { display: inline-flex; align-items: center; gap: 6px; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
		padding: 3px 8px; border-radius: 999px; background: var(--grid); color: var(--ink-2); white-space: nowrap; }
	.dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
	.pe-btn { font: inherit; font-size: 0.86rem; font-weight: 600; min-height: 44px; padding: 0 12px; border: 0; border-radius: 4px; background: transparent;
		color: var(--accent); display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
	.pe-btn:hover { background: var(--accent-soft); }
	.pe-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
	.pe-btn svg { transition: transform 0.15s; }
	.pe-btn svg.up { transform: rotate(180deg); }

	/* highlighted: prices up or the islands split (amber), a new low (teal) */
	.tier-highlight, .tier-open { border-width: 1.5px; }
	.tier-highlight.var-high, .tier-highlight.var-split, .tier-open { border-color: color-mix(in srgb, var(--warn-ink) 45%, var(--line)); }
	.tier-highlight.var-high .pe-line, .tier-highlight.var-split .pe-line, .tier-open .pe-line { background: var(--warn-bg); border-radius: 3px 3px 0 0; }
	.tier-highlight.var-high .pe-tag, .tier-highlight.var-split .pe-tag, .tier-open .pe-tag { background: color-mix(in srgb, var(--warn-ink) 14%, transparent); color: var(--warn-ink); }
	.tier-highlight.var-low { border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); }
	.tier-highlight.var-low .pe-line { background: var(--accent-soft); border-radius: 3px 3px 0 0; }
	.tier-highlight.var-low .pe-tag { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }
	.tier-highlight .pe-btn, .tier-open .pe-btn { background: var(--ink); color: var(--surface); }
	.tier-highlight .pe-btn:hover, .tier-open .pe-btn:hover { background: var(--ink-2); }
	.tier-highlight.var-low .pe-btn { background: transparent; color: var(--accent); box-shadow: inset 0 0 0 1.5px var(--accent); }
	.tier-highlight.var-low .pe-btn:hover { background: var(--surface); }

	.pe-body { border-top: 1px solid var(--line); }
	.pe-head { padding: 16px 18px 12px; display: grid; gap: 4px; border-bottom: 1px solid var(--grid); }
	.pe-eye { margin: 0; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
	.tier-open .pe-eye, .var-high .pe-eye, .var-split .pe-eye { color: var(--warn-ink); }
	.pe-head h2 { margin: 0; font-size: 1.3rem; letter-spacing: -0.01em; }
	.pe-sub { margin: 0; color: var(--ink-2); font-size: 0.88rem; }
	.pe-grid { display: flex; flex-wrap: wrap; }
	.pe-main { flex: 999 1 520px; min-width: 0; padding: 16px 18px; display: grid; gap: 12px; align-content: start; }
	.pe-verdict { margin: 0; font-size: 1rem; line-height: 1.5; max-width: 66ch; }
	.pe-rows { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--grid); }
	.pe-rows li { display: grid; grid-template-columns: 12px minmax(0, 1fr) 110px 98px; gap: 12px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--grid); }
	.sw { width: 10px; height: 10px; border-radius: 3px; background: var(--c); display: inline-block; }
	.pe-what { display: grid; gap: 2px; min-width: 0; }
	.pe-what b { font-weight: 600; font-size: 0.92rem; }
	.pe-what small { color: var(--muted); font-size: 0.78rem; }
	.pe-bar { position: relative; height: 7px; border-radius: 4px; background: var(--grid); }
	.pe-bar .fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 4px; background: var(--c); }
	.pe-bar .tick { position: absolute; top: -4px; width: 2px; height: 15px; background: var(--ink); transform: translateX(-1px); }
	.pe-eff { justify-self: end; font-size: 0.72rem; font-weight: 700; padding: 3px 8px; border-radius: 999px; white-space: nowrap; background: var(--grid); color: var(--ink-2); }
	.pe-eff.e1 { background: var(--warn-bg); color: var(--warn-ink); }
	.pe-eff.e-1 { background: var(--accent-soft); color: var(--accent); }
	.pe-key { margin: 0; font-size: 0.76rem; color: var(--muted); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
	.tick-key { width: 2px; height: 12px; background: var(--ink); display: inline-block; }

	.pe-side { flex: 1 1 340px; min-width: 0; padding: 16px 18px; background: color-mix(in srgb, var(--bg) 45%, var(--surface)); border-left: 1px solid var(--grid); display: grid; gap: 14px; align-content: start; }
	.pe-side h3 { margin: 0 0 6px; font-size: 0.86rem; }
	.pe-side svg { width: 100%; height: auto; display: block; }
	.grid { stroke: var(--grid); stroke-width: 1; }
	.ax { fill: var(--muted); font-size: 15px; font-family: var(--font-data); }
	.band { fill: var(--f-hydro); opacity: 0.16; }
	.thr { fill: none; stroke-width: 1.3; }
	.thr.hl { stroke: var(--ink-2); stroke-dasharray: 2 3; }
	.thr.op { stroke: var(--warn-ink); stroke-dasharray: 5 4; }
	.p-hay { fill: none; stroke: var(--p-ni); stroke-width: 1.8; stroke-linejoin: round; }
	.p-ben { fill: none; stroke: var(--p-si); stroke-width: 1.5; stroke-dasharray: 5 3; stroke-linejoin: round; }
	.legend { margin: 6px 0 0; display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 0.74rem; color: var(--muted); }
	.legend span { display: inline-flex; align-items: center; gap: 5px; }
	.legend i { display: inline-block; width: 14px; height: 0; border-top: 2px solid; }
	.k-hay { border-color: var(--p-ni) !important; }
	.k-ben { border-color: var(--p-si) !important; border-top-style: dashed !important; }
	.k-band { height: 9px !important; border: 0 !important; background: var(--f-hydro); opacity: 0.3; }
	.k-hl { border-color: var(--ink-2) !important; border-top-style: dotted !important; }
	.k-op { border-color: var(--warn-ink) !important; border-top-style: dashed !important; }

	.pe-setter { background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 12px 14px; display: grid; gap: 6px; }
	.ps-head { margin: 0; display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--muted); }
	.est { font-size: 0.68rem; padding: 2px 7px; border-radius: 999px; border: 1px dashed var(--muted); text-transform: none; letter-spacing: 0; font-weight: 600; color: var(--ink-2); }
	.ps-name { margin: 0; display: flex; align-items: baseline; gap: 7px; flex-wrap: wrap; }
	.ps-name b { font-size: 1.05rem; }
	.ps-name small { color: var(--muted); font-size: 0.82rem; }
	.ps-why { margin: 0; font-size: 0.84rem; color: var(--ink-2); line-height: 1.45; }

	.pe-foot { margin: 0; padding: 10px 18px; border-top: 1px solid var(--grid); display: flex; justify-content: space-between; gap: 6px 14px; flex-wrap: wrap;
		font-size: 0.78rem; color: var(--muted); }
	.pe-foot a { color: var(--accent); font-weight: 600; }

	@media (max-width: 640px) {
		.pe-line { padding: 6px 8px 8px 12px; }
		.pe-btn { width: 100%; justify-content: center; }
		.pe-rows li { grid-template-columns: 12px minmax(0, 1fr) auto; }
		.pe-bar { grid-column: 2 / 4; grid-row: 2; }
		.pe-side { border-left: 0; border-top: 1px solid var(--grid); }
		.pe-head, .pe-main, .pe-side { padding-inline: 14px; }
	}
</style>
