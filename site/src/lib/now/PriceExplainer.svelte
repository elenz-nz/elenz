<script lang="ts">
	// The price explainer on /now: a line under the price tiles that opens into "Why is the price high?".
	// State, rules and wording come from explain.js (explainNow); this only draws them. Quiet: one line and a button.
	// Highlighted: the line is outlined and asks to be opened. Open (extremes only): the card opens by itself; a viewer
	// can fold it, and it stays folded until the explainer's state changes.
	import { money, clock, duration } from './explain.js';
	import ExplainChart from './ExplainChart.svelte';
	import InfoTip from '#lib/site/InfoTip.svelte';

	type Row = { k: string; tok: string; title: string; sub: string; now: number; usual: number; effect: number; split?: boolean };
	type Band = { t0: number; t1: number; med: number; p25: number; p75: number; hl: number; open: number };
	type X = {
		t: number; tier: string; variant: string; newLow: boolean; nearZero: boolean; lowStart: number | null;
		since: number | null; hay: number; ben: number; hi: number; typical: number | null; ratio: number | null;
		headline: string; line: string; verdict: string; verdictNow?: string; rows: Row[]; link: Row; offersDay: string | null; setterIsl: string;
		setter: { plant: string; fuel: string; mw: number; cap: number | null; price: number; owner?: string; scheme?: string } | null;
		chart: { t: number[]; hay: number[]; ben: number[]; band: Band[] };
	};
	// the button that opens it is in /now's wholesale price tile (PriceButton.svelte); this is the card that drops down
	let { x, open, onclose }: { x: X; open: boolean; onclose: () => void } = $props();

	const fmt = (v: number) => Math.round(v).toLocaleString('en-NZ');
	const FUEL: Record<string, string> = { gas: 'gas', diesel: 'diesel', coal: 'coal/gas', hydro: 'hydro', geo: 'geothermal', wind: 'wind', solar: 'solar', batt: 'battery', bio: 'bioenergy', waste: 'waste heat' };
	const TOK: Record<string, string> = { gas: '--f-gas', diesel: '--f-diesel', coal: '--f-coal', hydro: '--f-hydro', geo: '--f-geo', wind: '--f-wind', solar: '--f-solar', batt: '--f-batt', bio: '--f-bio', waste: '--f-waste' };
	const DAY = (d: string | null) => d ? new Date(d + 'T12:00:00+13:00').toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', timeZone: 'Pacific/Auckland' }) : '';

	const sub = $derived(
		x.variant === 'low' ? (x.lowStart ? `${x.nearZero ? 'Near zero' : 'Low'} since ${clock(x.lowStart)}.` : '')
		: x.since && x.tier !== 'quiet' ? `${x.variant === 'split' ? 'Split' : 'High'} for ${duration(x.t - x.since + 300000)}.` : ''
	);

	// the 24-hour chart (ExplainChart.svelte) pops out larger in a modal dialog: Esc, the close button or a click
	// outside it closes it
	let big: HTMLDialogElement | undefined = $state();
	let bigOpen = $state(false);
	let narrow = $state(false);
	const popOut = () => { narrow = innerWidth < 700; bigOpen = true; big?.showModal(); };
	const shut = () => big?.close();
	// each reason: now (in its colour) over its recent level (grey), on one scale, so the lengths compare at a glance
	const bar = (r: Row) => { const s = Math.max(r.now, r.usual, 1) * 1.08; return { now: (r.now / s) * 100, usual: (r.usual / s) * 100 }; };
</script>

{#if open}
<section class="pe tier-{x.tier} var-{x.variant}" aria-label="Price explainer">
		<div class="pe-body" id="pe-body">
			<button type="button" class="pe-close" onclick={onclose} aria-label="Close the price explainer">
				<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
			</button>
			<div class="pe-head">
				<div class="pe-eye">Price explainer <InfoTip label="About the price explainer">Each reason is compared with its recent level for the same half-hour of the week over the last four weeks (wind with its four-week median). The possible price setter is an estimate from the latest generator offers the EA has published. <a href="/methods/price-explainer">How the explainer works</a></InfoTip></div>
				<h2>{x.headline}</h2>
				<p class="pe-sub">{x.line}{sub ? ` ${sub}` : ''}</p>
			</div>
			<div class="pe-grid">
				<div class="pe-main">
					<p class="pe-verdict">{x.verdict}</p>
					{#if x.verdictNow}<p class="pe-verdict">{x.verdictNow}</p>{/if}
					<ul class="pe-rows">
						{#each [...x.rows, x.link] as r (r.k)}
							{@const b = bar(r)}
							<li>
								<span class="sw" style="--c:var({r.tok})" aria-hidden="true"></span>
								<span class="pe-what"><b>{r.title}</b><small>{r.sub}</small></span>
								<span class="pe-bars" aria-hidden="true"><span class="b-now" style="--c:var({r.tok});width:{b.now}%"></span><span class="b-usual" style="width:{b.usual}%"></span></span>
							</li>
						{/each}
					</ul>
					<p class="pe-key"><span class="k-now" aria-hidden="true"></span>now <span class="k-usual" aria-hidden="true"></span>recent level for this half-hour of the week (wind: its four-week median)</p>
				</div>

				<aside class="pe-side">
					<div>
						<div class="ch-head">
							<h3>Prices, last 24 hours</h3>
							<button type="button" class="pop" onclick={popOut} aria-haspopup="dialog">
								<svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><path d="M8 2h4v4M12 2L7 7M6 3H3v8h8V8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
								Enlarge
							</button>
						</div>
						<ExplainChart c={x.chart} />
					</div>

					<div class="pe-setter">
						<p class="ps-head"><span>Possible price setter{x.variant === 'split' ? `, ${x.setterIsl === 'NI' ? 'North' : 'South'} Island` : ''}</span><span class="est">Estimate</span></p>
						{#if x.setter}
							<p class="ps-name"><span class="sw" style="--c:var({TOK[x.setter.fuel] ?? '--muted'})" aria-hidden="true"></span><b>{x.setter.plant}</b>
								<small>{FUEL[x.setter.fuel] ?? x.setter.fuel}{x.setter.scheme ? `, ${x.setter.scheme} scheme` : ''}{x.setter.owner ? `, ${x.setter.owner}` : ''}</small></p>
							<p class="ps-why">Running {fmt(x.setter.mw)} MW, part way up an offer block at {money(x.setter.price)}/MWh in the latest offers published ({DAY(x.offersDay)}, same half-hour).</p>
						{:else if x.nearZero}
							<p class="ps-why">Near zero, many plants are offering at this price, so no single one sets it.</p>
						{:else if x.hi < 5}
							<p class="ps-why">At prices this low, many plants offer at similar prices, so no single one stands out.</p>
						{:else}
							<p class="ps-why">No plant in the latest offers {x.offersDay ? `(${DAY(x.offersDay)})` : ''} clearly matches this price.</p>
						{/if}
					</div>
				</aside>
			</div>
		</div>

	<dialog bind:this={big} class="big" aria-labelledby="pe-big-h" onclose={() => (bigOpen = false)}
		onclick={(e) => { if (e.target === big) shut(); }}>
		<div class="big-in">
			<div class="big-head">
				<h2 id="pe-big-h">Prices, last 24 hours</h2>
				<button type="button" class="close" onclick={shut} aria-label="Close the larger chart">
					<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
				</button>
			</div>
			{#if bigOpen}<ExplainChart c={x.chart} size={narrow ? 'tall' : 'large'} />{/if}
			<p class="big-foot">Dispatch prices, every 5 minutes. <a href="/tracker/prices?range=7d">See the week on the Prices tab →</a></p>
		</div>
	</dialog>
</section>
{/if}

<style>
	.pe { background: var(--surface); border: 1px solid var(--line); border-radius: 4px; }

	.pe-body { position: relative; }
	.pe-close { position: absolute; top: 8px; right: 8px; width: 40px; height: 40px; border: 0; border-radius: 4px; background: transparent; color: var(--ink-2); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
	.pe-close:hover { background: var(--grid); }
	.pe-close:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
	.pe-head { padding: 16px 56px 12px 18px; display: grid; gap: 4px; border-bottom: 1px solid var(--grid); }
	.pe-eye { margin: 0; display: flex; align-items: center; gap: 2px; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
	.tier-open .pe-eye, .var-high .pe-eye, .var-split .pe-eye { color: var(--warn-ink); }
	.pe-head h2 { margin: 0; font-size: 1.3rem; letter-spacing: -0.01em; }
	.pe-sub { margin: 0; color: var(--ink-2); font-size: 0.88rem; }
	.pe-grid { display: flex; flex-wrap: wrap; }
	.pe-main { flex: 3 1 520px; min-width: 0; padding: 16px 18px; display: grid; gap: 12px; align-content: start; }
	.pe-verdict { margin: 0; font-size: 1rem; line-height: 1.5; max-width: 66ch; }
	/* the reasons stop at a readable width, so on wide screens each one's bars stay near its words */
	.pe-rows { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--grid); max-width: 900px; }
	.pe-rows li { display: grid; grid-template-columns: 12px minmax(0, 1fr) minmax(140px, 28%); gap: 12px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--grid); }
	.sw { width: 10px; height: 10px; border-radius: 3px; background: var(--c); display: inline-block; }
	.pe-what { display: grid; gap: 2px; min-width: 0; }
	.pe-what b { font-weight: 600; font-size: 0.92rem; }
	.pe-what small { color: var(--muted); font-size: 0.78rem; }
	.pe-bars { display: grid; gap: 3px; }
	.pe-bars span { display: block; border-radius: 3px; min-width: 2px; }
	.b-now { height: 7px; background: var(--c); }
	.b-usual { height: 4px; background: color-mix(in srgb, var(--muted) 55%, transparent); }
	.pe-key { margin: -4px 0 0; display: flex; align-items: center; flex-wrap: wrap; gap: 4px 6px; font-size: 0.78rem; color: var(--muted); }
	.k-now, .k-usual { display: inline-block; width: 14px; border-radius: 2px; }
	.k-now { height: 7px; background: var(--ink-2); }
	.k-usual { height: 4px; margin-left: 8px; background: color-mix(in srgb, var(--muted) 55%, transparent); }

	.pe-side { flex: 2 1 340px; min-width: 0; padding: 16px 18px; background: color-mix(in srgb, var(--bg) 45%, var(--surface)); border-left: 1px solid var(--grid); display: grid; gap: 14px; align-content: start; }
	.pe-side h3 { margin: 0 0 6px; font-size: 0.86rem; }
	.ch-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
	.ch-head h3 { margin: 0; }
	.pop { font: inherit; font-size: 0.8rem; font-weight: 600; color: var(--accent); background: transparent; border: 1px solid var(--line);
		border-radius: 4px; min-height: 36px; padding: 0 10px; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
	.pop:hover { background: var(--accent-soft); }
	.pop:focus-visible, .close:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

	.big { width: min(1040px, calc(100vw - 32px)); max-width: none; border: 1px solid var(--line); border-radius: 6px; padding: 0;
		background: var(--surface); color: var(--ink); box-shadow: 0 18px 50px rgb(0 0 0 / 0.25); }
	.big::backdrop { background: rgb(10 18 18 / 0.5); }
	.big-in { padding: 14px 18px 16px; display: grid; gap: 6px; }
	.big-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
	.big-head h2 { margin: 0; font-size: 1.1rem; }
	.close { width: 44px; height: 44px; border: 0; border-radius: 4px; background: transparent; color: var(--ink-2); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
	.close:hover { background: var(--grid); }
	.big-foot { margin: 6px 0 0; font-size: 0.8rem; color: var(--muted); }
	.big-foot a { color: var(--accent); font-weight: 600; }

	.pe-setter { background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 12px 14px; display: grid; gap: 6px; }
	.ps-head { margin: 0; display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--muted); }
	.est { font-size: 0.68rem; padding: 2px 7px; border-radius: 999px; border: 1px dashed var(--muted); text-transform: none; letter-spacing: 0; font-weight: 600; color: var(--ink-2); }
	.ps-name { margin: 0; display: flex; align-items: baseline; gap: 7px; flex-wrap: wrap; }
	.ps-name b { font-size: 1.05rem; }
	.ps-name small { color: var(--muted); font-size: 0.82rem; }
	.ps-why { margin: 0; font-size: 0.84rem; color: var(--ink-2); line-height: 1.45; }


	@media (max-width: 640px) {
		.pe-rows li { grid-template-columns: 12px minmax(0, 1fr); }
		.pe-bars { grid-column: 2; grid-row: 2; }
		.big-in { padding: 10px 12px 12px; }
		.pe-side { border-left: 0; border-top: 1px solid var(--grid); }
		.pe-head, .pe-main, .pe-side { padding-inline: 14px; }
	}
</style>
