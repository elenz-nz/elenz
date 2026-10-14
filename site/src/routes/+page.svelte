<script lang="ts">
	import { onMount } from 'svelte';
	import { mountTracker } from '#lib/tracker/tracker.js';

	type Meta = { intervals: number; expected: number; end: number; api_from: number | null; built: number };

	const DATA_URL = '/data/tracker.json';
	const LIVE_MINUTES = 15; // data newer than this counts as live

	let meta = $state<Meta | null>(null);
	let error = $state('');
	let now = $state(Date.now());

	const PARTS = new Intl.DateTimeFormat('en-NZ', {
		timeZone: 'Pacific/Auckland', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true
	});
	function when(t: number) {
		const p = Object.fromEntries(PARTS.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
		return `${p.hour}:${p.minute} ${String(p.dayPeriod).toLowerCase()} ${p.weekday} ${p.day} ${p.month}`;
	}
	const dayOnly = (t: number) => new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'short' }).format(new Date(t));

	const age = $derived(meta ? (now - meta.end) / 60000 : 0);
	const live = $derived(meta !== null && age < LIVE_MINUTES);
	const missing = $derived(meta ? Math.round(100 * (1 - meta.intervals / meta.expected)) : 0);
	const notice = $derived.by(() => {
		if (!meta) return '';
		const mixed = meta.api_from !== null && meta.api_from > meta.end - 7 * 864e5 + 3e5;
		const source = mixed
			? `: the Electricity Authority's daily EMI files up to ${dayOnly(meta.api_from! - 864e5)}, then the live real-time dispatch feed.`
			: " from the Electricity Authority's real-time dispatch feed.";
		const gaps = missing > 0 ? ` ${missing}% of 5-minute intervals have no dispatch case and are filled by interpolation.` : '';
		return `Dispatch data for the seven days to ${when(meta.end)}${source} Rooftop solar is estimated from installed capacity and irradiance, and HVDC transfer from the balance between the islands.${gaps}`;
	});

	onMount(() => {
		let tracker: ReturnType<typeof mountTracker> | undefined;
		let stamp = 0;
		async function load() {
			const r = await fetch(DATA_URL, { cache: 'no-cache' });
			if (!r.ok) throw new Error(`The data file returned ${r.status}.`);
			const D = await r.json();
			if (D.meta.end === stamp) return;
			stamp = D.meta.end;
			meta = D.meta;
			error = '';
			if (tracker) tracker.update(D);
			else tracker = mountTracker(D);
		}
		load().catch((e) => (error = `The data couldn't be loaded. ${e.message} Try reloading the page.`));
		// new data lands every 5–15 minutes; check every 2 minutes while the page is on screen, and on return
		const check = () => {
			now = Date.now();
			if (document.visibilityState === 'visible') load().catch(() => {});
		};
		const poll = setInterval(check, 120_000);
		document.addEventListener('visibilitychange', check);
		return () => {
			clearInterval(poll);
			document.removeEventListener('visibilitychange', check);
			tracker?.destroy();
		};
	});
</script>

<svelte:head>
	<title>Elenz · New Zealand electricity, live</title>
</svelte:head>

<div class="wrap">
	<header class="masthead">
		<div class="brand">
			<svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
				<rect x="1" y="1" width="28" height="28" rx="7" fill="var(--ink)" />
				<path d="M5 23 L5 18 C9 17 11 14 15 14 C19 14 21 16 25 15 L25 23 Z" fill="var(--f-hydro)" />
				<path d="M5 18 C9 17 11 14 15 14 C19 14 21 16 25 15 L25 12 C21 13 19 10 15 10 C11 10 9 13 5 14 Z" fill="var(--f-wind)" />
				<path d="M5 14 C9 13 11 10 15 10 C19 10 21 13 25 12 L25 9 C21 9.5 19 7 15 7 C11 7 9 9.5 5 10.5 Z" fill="var(--f-solar)" />
			</svg>
			<div>
				<h1>Elenz</h1>
				<p>New Zealand's electricity: generation, prices, demand and emissions</p>
			</div>
		</div>
		{#if meta}
			{#if live}
				<span class="pill live" title="Updated from the EMI real-time dispatch feed every 5 minutes">Live</span>
			{:else}
				<span class="pill stale" title="The newest data is more than {LIVE_MINUTES} minutes old">Delayed · {when(meta.end)}</span>
			{/if}
		{/if}
	</header>

	<nav class="toolbar" aria-label="View controls">
		<div class="ctl">
			<span id="lb-region">Region</span>
			<div class="seg" role="group" aria-labelledby="lb-region" id="seg-region">
				<button type="button" id="r-NZ" data-v="NZ">New Zealand</button>
				<button type="button" id="r-NI" data-v="NI">North Island</button>
				<button type="button" id="r-SI" data-v="SI">South Island</button>
			</div>
		</div>
		<div class="ctl">
			<span id="lb-range">Range</span>
			<div class="seg" role="group" aria-labelledby="lb-range" id="seg-range">
				<button type="button" id="g-1" data-v="288">24 h</button>
				<button type="button" id="g-3" data-v="864">3 days</button>
				<button type="button" id="g-7" data-v="2016">7 days</button>
			</div>
		</div>
		<div class="ctl">
			<span id="lb-int">Interval</span>
			<div class="seg" role="group" aria-labelledby="lb-int" id="seg-int">
				<button type="button" id="i-5" data-v="1">5 min</button>
				<button type="button" id="i-30" data-v="6">30 min</button>
			</div>
		</div>
		<span class="asof" id="asof"></span>
	</nav>

	{#if error}
		<p class="notice" role="alert">{error}</p>
	{:else if meta}
		<p class="notice">{notice}</p>
	{:else}
		<p class="notice">Loading the latest data…</p>
	{/if}
	<noscript><p class="notice">The charts need JavaScript turned on.</p></noscript>

	<div class="layout">
		<!-- The chart panel takes arrow keys to move the time cursor, so it needs to be focusable. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<section class="charts" id="charts" tabindex="0" aria-label="Linked charts. Hover or use the left and right arrow keys to read values at a point in time; Escape returns to range totals.">
			<div class="chart">
				<div class="ch-head">
					<h2 class="crumbs" id="gen-title">Generation</h2><span class="unit" id="gen-unit">MW, stacked by fuel</span>
					<div class="legends">
						<span class="lg" id="lg-tot">Total <b id="v-gen"></b></span>
						<select class="grp" id="sel-view" aria-label="Group the generation sources">
							<option value="detailed">Detailed</option>
							<option value="simple">Simplified</option>
							<option value="cgr">Coal/Gas/Renewables</option>
							<option value="flex">Flexibility</option>
							<option value="rf">Renewables/Fossils</option>
							<option value="vre">VRE/Residual</option>
						</select>
					</div>
				</div>
				<!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -->
				<canvas id="cv-gen" role="img" aria-label="Stacked area chart of generation by fuel"></canvas>
			</div>
			<div class="chart">
				<div class="ch-head">
					<h2>Wholesale price</h2><span class="unit">$/MWh</span>
					<div class="legends">
						<span class="lg" id="lg-pni"><i style="--c:var(--p-ni)"></i>North Island · Haywards <b id="v-pni"></b></span>
						<span class="lg" id="lg-psi"><i style="--c:var(--p-si)"></i>South Island · Benmore <b id="v-psi"></b></span>
					</div>
				</div>
				<!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -->
				<canvas id="cv-price" role="img" aria-label="Line chart of reference node prices"></canvas>
			</div>
			<div class="chart">
				<div class="ch-head">
					<h2>Demand</h2><span class="unit">MW</span>
					<div class="legends">
						<span class="lg"><i style="--c:var(--ink)"></i>Metered <b id="v-met"></b></span>
						<span class="lg"><i class="dash" style="--c:var(--ink-2)"></i>With rooftop solar <b id="v-und"></b></span>
						<span class="lg" id="lg-xt"><i style="--c:var(--accent)"></i>Without Tiwai <b id="v-xt"></b></span>
					</div>
				</div>
				<!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -->
				<canvas id="cv-demand" role="img" aria-label="Line chart of metered and underlying demand"></canvas>
			</div>
			<div class="chart">
				<div class="ch-head"><h2>HVDC transfer</h2><span class="unit">MW, northward positive</span><div class="legends"><span class="lg"><i class="area" style="--c:var(--f-hvdc)"></i>Benmore ⇄ Haywards <b id="v-hv"></b></span></div></div>
				<!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -->
				<canvas id="cv-hvdc" role="img" aria-label="Area chart of HVDC transfer between the islands"></canvas>
			</div>
			<div class="chart">
				<div class="ch-head"><h2>Emissions intensity</h2><span class="unit">g CO₂e/kWh</span><div class="legends"><span class="lg"><i class="area" style="--c:var(--co2)"></i>Generation <b id="v-co2"></b></span></div></div>
				<!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -->
				<canvas id="cv-co2" role="img" aria-label="Area chart of emissions intensity"></canvas>
			</div>
			<div class="chart">
				<div class="ch-head"><h2>Renewable share</h2><span class="unit">% of generation</span><div class="legends"><span class="lg"><i style="--c:var(--accent)"></i>Renewables <b id="v-ren"></b></span></div></div>
				<!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -->
				<canvas id="cv-ren" role="img" aria-label="Line chart of renewable share with the time axis"></canvas>
			</div>
		</section>

		<aside class="summary" id="summary" aria-label="Summary for the selected time">
			<div>
				<div class="sum-when" id="sum-when"></div>
				<div class="sum-sub" id="sum-sub"></div>
			</div>
			<div class="sum-level" id="sum-level" hidden><span id="sum-level-txt"></span><button type="button" class="back" id="sum-back">‹ Back</button></div>
			<table class="mix">
				<thead><tr><th scope="col" id="col-name">Source</th><th scope="col" class="n" id="col-q">GWh</th><th scope="col" class="n">Share</th></tr></thead>
				<tbody id="mix-body"></tbody>
				<tfoot><tr><td id="tot-lbl">Total generation</td><td class="n" id="tot-q"></td><td class="n" id="tot-s">100%</td></tr></tfoot>
			</table>
			<dl class="sys" id="sys"></dl>
			<p class="hint">Use the menu above the chart to group sources (by fuel, flexibility, renewables and fossils, and more). Select a name, or click a band in the chart, to break it down by fuel and plant, and by grid connection for plants on more than one bus. Select a colour square to hide that layer. Hover the charts, or focus them and use the arrow keys, to read a single interval.</p>
		</aside>
	</div>

	<section class="sources" aria-labelledby="src-h">
		<h2 id="src-h">Where the data comes from</h2>
		<p>Live series come from the Electricity Authority's EMI real-time dispatch feed, about a minute after each 5-minute dispatch case runs. The EA's daily dispatch files carry the same data and fill any gaps. Both are published under CC BY 4.0.</p>
		<div class="tbl-wrap">
			<table class="src">
				<thead><tr><th scope="col">Chart</th><th scope="col">Source</th><th scope="col">How it's built</th></tr></thead>
				<tbody>
					<tr><td>Generation</td><td>EMI real-time dispatch: MW per connection point and unit</td><td>Each unit mapped to a plant and fuel through the EA plant register (<code>DispatchedGenerationPlant.csv</code>) plus a curated list of newer plant, then summed by plant, fuel and island. Huntly's Rankine units are shown as coal/gas, because the market data doesn't say which fuel they burned</td></tr>
					<tr><td>Rooftop solar</td><td>Modelled</td><td>About 1,000 MW of installed capacity (680 MW North Island, 320 MW South Island) × Open-Meteo 15-minute irradiance for seven cities × 0.78. Shown hatched because it is an estimate</td></tr>
					<tr><td>Wholesale price</td><td>EMI real-time dispatch: nodal prices</td><td>Island reference nodes Haywards (HAY2201) and Benmore (BEN2201). These are dispatch prices, not final prices</td></tr>
					<tr><td>Demand</td><td>EMI real-time dispatch: load by connection point</td><td>Metered grid demand. Rooftop solar is added back for the dashed line. Tiwai is the Tiwai Point smelter (TWI2201)</td></tr>
					<tr><td>HVDC transfer</td><td>Estimated</td><td>Mean of the South Island surplus and the North Island shortfall, since the dispatch feed doesn't include HVDC flow. Positive is northward</td></tr>
					<tr><td>Emissions intensity</td><td>Calculated</td><td>Fuel mix × emission factors. Provisional factors: coal/gas Rankine 0.95, gas 0.50, diesel 0.80, geothermal 0.07 t CO₂e/MWh</td></tr>
					<tr><td>Source groups</td><td>Grouped from the fuel mix</td><td>Groupings follow Open Electricity's. Thermal and fossils are coal/gas Rankine, gas and diesel. Renewables are geothermal, hydro, wind and solar (grid and rooftop). Flexibility: slow flexible is geothermal and the Huntly Rankines; fast flexible is gas, diesel and hydro; variable is wind and solar. VRE/Residual splits wind and solar from everything else. Batteries and HVDC are always shown separately, because they can charge or export. Grouping is by fuel, so gas cogeneration plant counts as fast flexible</td></tr>
				</tbody>
			</table>
		</div>
	</section>

	<footer>
		<p>Data from www.emi.ea.govt.nz provided by the Electricity Authority (New Zealand), CC BY 4.0. Irradiance from Open-Meteo, CC BY 4.0.</p>
		<p>Times are New Zealand time. Trading periods (TP) are the market's half-hour periods, numbered from midnight. Generation is dispatch (the market's 5-minute targets), not metered output. Design follows <a href="https://openelectricity.org.au" target="_blank" rel="noopener">Open Electricity</a>.</p>
	</footer>
</div>
