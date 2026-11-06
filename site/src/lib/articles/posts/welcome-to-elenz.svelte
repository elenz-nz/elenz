<script module lang="ts">
	export const meta = {
		title: 'Welcome to Elenz',
		dek: "A free, live view of New Zealand's electricity system, with history back to August 1997.",
		date: '2026-11-07',
		kind: 'Guide',
		image: '/og/elenz.png',
	} as const;
</script>

<script lang="ts">
	// Figures from analysis/welcome.py, which also writes the chart data in ../data/welcome-to-elenz.json.
	// Pictures from analysis/welcome_shots.py.
	import Figure from '#lib/articles/Figure.svelte';
	import Record from '#lib/articles/Record.svelte';
	import Stats from '#lib/articles/Stats.svelte';
	import Columns from '#lib/articles/charts/Columns.svelte';
	import TimeStack from '#lib/articles/charts/TimeStack.svelte';
	import { num } from '#lib/articles/charts/util.js';
	import D from '#lib/articles/data/welcome-to-elenz.json';
	import Shot from '#lib/methods/Shot.svelte';
	type Table = { [k: string]: number[] };

	const twh = (v: number) => `${v.toFixed(1)} TWh`;
	const mix = D.mix as Table;
	const mixSeries = [
		{ name: 'Geothermal', tok: '--f-geo', values: mix.geo },
		{ name: 'Other', tok: '--f-oemb', values: mix.other },
		{ name: 'Coal/gas, Rankine', tok: '--f-coal', values: mix.coal },
		{ name: 'Gas', tok: '--f-gas', values: mix.gas },
		{ name: 'Hydro', tok: '--f-hydro', values: mix.hydro },
		{ name: 'Wind', tok: '--f-wind', values: mix.wind },
		{ name: 'Solar', tok: '--f-solar', values: mix.solar },
	];
	const everyFifth = (ys: number[]) => ys.map((y) => (y % 5 === 0 ? String(y) : null));

	const hvdcColors = D.hvdc_years.map((y) => (y === 1998 ? '--accent' : '--f-hvdc'));
	const hvdcTops = D.hvdc_best3.map((v, i) => (D.hvdc_years[i] === 1998 ? `${num(Math.round(v))} MW` : null));

	const x = D.xmas;
	const fuels = x.fuels as Table;
	const xmasLayers = [
		{ k: 'geo', name: 'Geothermal', tok: '--f-geo' },
		{ k: 'bio', name: 'Bioenergy', tok: '--f-bio' },
		{ k: 'waste', name: 'Waste heat', tok: '--f-waste' },
		{ k: 'coal', name: 'Coal/gas, Rankine', tok: '--f-coal' },
		{ k: 'gas', name: 'Gas', tok: '--f-gas' },
		{ k: 'diesel', name: 'Diesel', tok: '--f-diesel' },
		{ k: 'hydro', name: 'Hydro', tok: '--f-hydro' },
		{ k: 'wind', name: 'Wind', tok: '--f-wind' },
		{ k: 'solar', name: 'Solar, grid', tok: '--f-solar' },
		{ k: 'batt', name: 'Battery', tok: '--f-batt' },
	].map((f) => ({ name: f.name, tok: f.tok, values: fuels[f.k] }));

	const peakColors = D.peak_years.map((y) => (y === 2026 ? '--accent' : '--f-hvdc'));
	const peakTops = D.peaks.map((v, i) => (D.peak_years[i] === 2026 ? num(v) : null));
</script>

<p>Elenz shows New Zealand’s electricity system as it runs: what is generating, what it costs, how much is flowing between the islands and how much of it is renewable. The figures update every 5 minutes, and the history goes back to August 1997.</p>

<Stats items={[
	{ label: 'Updated every', value: '5', unit: 'minutes', note: 'from the real-time dispatch feed', tok: '--accent' },
	{ label: 'History since', value: 'Aug 1997', note: 'metered data and final prices', tok: '--f-hydro' },
	{ label: 'Half-hours', value: num(Math.floor(D.stats.tps / 1000) * 1000), note: 'in the history so far', tok: '--f-wind' },
	{ label: 'Plants', value: String(D.stats.plants), note: 'stations, farms and batteries, past and present', tok: '--f-geo' },
]} />

<p>The figures are public, but they are spread across market files and technical reports. We bring them together in one place, so anyone can read them and check how they were made. Elenz is free, has no ads and isn’t affiliated with any organisation.</p>

<p>Together, the figures show how New Zealand’s generation has changed. Geothermal grew from 2.0 TWh in 1998 to 9.3 TWh in 2025. Wind and grid solar generated 4.1 TWh in 2025, up from almost nothing in 1998. Gas generation peaked at 9.1 TWh in 2008 and fell to 3.1 TWh in 2025. Hydro supplied more than half of generation in every year.</p>

<Figure caption="Generation by fuel each calendar year, 1998 to 2025" source="Metered history from the Electricity Authority. Solar includes embedded solar, a calculated estimate. Other is bioenergy, waste heat, diesel and, from January 2009, other embedded generation, a calculated estimate. Gas leaves out the Huntly Rankines, shown as coal/gas.">
	<Columns cats={D.years.map(String)} xlabels={everyFifth(D.years)} series={mixSeries} stacked unit="TWh" height={300} fmt={twh} label="Year" />
</Figure>

<h2>What Elenz shows</h2>

<h3><a href="/now">Now</a></h3>
<p>The Now page shows the latest 5-minute interval: grid demand, renewable share, wholesale prices, HVDC transfer (the flow on the link between the islands), emissions intensity and embedded solar. Elenz uses Haywards and Benmore as its reference prices because they sit at the two ends of the HVDC link. A map sets out each island’s generation mix, and the Every generator right now chart lists what each plant is producing.</p>
<Shot name="welcome-now" alt="The Now page: figures for demand, renewable share, prices, HVDC, emissions intensity and embedded solar, above a map of the two islands and the generation mix." caption="The Now page, with each island’s generation mix on the map." />

<h3><a href="/tracker">Tracker</a></h3>
<p>The Tracker has two tabs, Generation and Prices, and both run from the last 24 hours back to August 1997. The main chart in the Generation tab stacks output by fuel above charts of price, renewable share, grid demand, HVDC transfer and emissions intensity, all on one time axis. The <a href="/tracker/prices">Prices</a> tab compares six nodes, the points on the grid where the market sets a price, and shows the gap between the islands.</p>
<Shot name="welcome-tracker" alt="The Tracker’s Generation tab: a week of generation stacked by fuel, a time slider under the chart, and a list of sources beside it." caption="A week of generation on the Tracker, with the time slider under the chart." />

<h3><a href="/records">Records</a></h3>
<p>The Records page lists the highest and lowest half-hours, days, weeks, months and years since August 1997, for New Zealand and each island, along with the longest runs. The market calls its half-hours trading periods, and the page uses that name. Each record has its own page showing how it grew, and the Heading for a record section lists the current periods running ahead of their record.</p>
<Shot name="welcome-records" alt="The Records page: cards under Heading for a record and New and provisional, above the list of all-time records." caption="The Records page, with the periods heading for a record at the top." />

<h3><a href="/articles">Articles</a></h3>
<p>The Articles page holds quarterly reviews and analysis, beginning with the <a href="/articles/winter-2026">Winter 2026 review</a>.</p>

<h3><a href="/methods">Data and methods</a></h3>
<p>The Data and methods pages set out every source and calculation, and how we estimate any incomplete data. Each method page gives the date we last reviewed it against the code.</p>

<h2>Things to try</h2>

<ol>
	<li>Select a fuel in the list beside the Generation chart to see its plants, as with <a href="/tracker?fuel=hydro">hydro</a>. The ‹ All sources button steps out again.</li>
	<li>Use the two chart buttons beside MW and % to switch the Generation chart from stacked areas to lines, and compare <a href="/tracker?by=site&chart=lines&fuel=wind">every wind farm</a> on one scale.</li>
	<li>Use the menu above the Generation chart to group generation <a href="/tracker?by=owner">by owner</a>, <a href="/tracker?by=scheme">by hydro scheme</a>, or one of six more options.</li>
	<li>Select the <a href="/tracker?price=on">$ Price</a> button to draw the island prices over the Generation chart.</li>
	<li>Drag the window on the slider under the Generation chart to move through time, and pick a date from the calendar above to go further.</li>
	<li>Drag across a chart to zoom in, and click a chart to pin a time. The Share button copies a link to the view, and the Download button gives the charts as a picture or the data as a spreadsheet file.</li>
	<li>Select the button in the wholesale price tile on the <a href="/now">Now</a> page to open the price explainer. It says whether the price is usual for the time of week, and what is different when it isn’t.</li>
</ol>

<Shot name="welcome-pin" alt="The Generation tab with a time pinned: the Pinned chip in the bar, a line through the chart, and the list showing that time." caption="A pinned time, with the chip in the bar, the line on the chart and the list at that time." />

<p>The <a href="/guide">Using Elenz</a> page covers every control, and the ⓘ icon beside each chart says what it shows.</p>

<h2>Three moments from the history</h2>

<p>Every Tracker view has its own address, so any view can be shared. Here are three to start with.</p>

<h3>February to April 1998</h3>
<p>HVDC transfer north averaged <strong>835 MW</strong> over these 3 months, the highest of any 3 months in a row since August 1997. March 1998 averaged 862 MW, the highest of any month. <a href="/tracker?range=1y&int=1mo&end=1998-12-31&fold=price,ren,demand,co2">Open the Generation tab with the HVDC transfer chart below for 1998</a>.</p>

<Figure caption="The highest 3 months in a row of net HVDC transfer north, by the year they start in, August 1997 to September 2026" source="EA metered HVDC flows (HVDC_Flows), at mid-link. In 38 months from December 1997 to December 2002, the receiving side is a calculated estimate. February to April 1998 is metered at both ends.">
	<Columns cats={D.hvdc_years.map(String)} xlabels={everyFifth(D.hvdc_years)} series={[{ name: 'Average transfer north', tok: '--f-hvdc', values: D.hvdc_best3 }]} colors={hvdcColors} tops={hvdcTops}
		unit="MW" height={230} fmt={(v) => `${num(Math.round(v))} MW`} label="Year" />
</Figure>

<h3>Christmas 2025</h3>
<p>The final price at Benmore stayed under $5/MWh for <strong>354 hours</strong> in a row, from 22 December 2025 to 6 January 2026. $5/MWh is 0.5c a kWh, before lines and retail charges. The run lasted nearly 15 days, more than double the next longest, in January 2009. In just over half of its half-hours, the price was $0.01/MWh. Open the <a href="/records/low_price_run?region=SI">record’s page</a> or the <a href="/tracker/prices?range=30d&end=2026-01-15">prices chart for those weeks</a>.</p>

<Record label="Longest run of near-zero prices, South Island" value="354" unit="hours" when="9:30 pm 22 December 2025 to 3:30 pm 6 January 2026" previous="156.5 hours, from 6 January 2009" fuel="--accent" />

<Figure caption="Grid generation by fuel and grid demand, 21 December 2025 to 7 January 2026, with the final price at Benmore" source="EA metered generation (Generation_MD) and final prices (FinalEnergyPrices), by half-hour" wide>
	<TimeStack t0={x.t0} step={x.step} layers={xmasLayers} line={{ name: 'Grid demand', tok: '--ink', values: x.demand }}
		panel={{ name: 'Price at Benmore', tok: '--p-si', values: x.price, unit: '$/MWh', fmt: (v) => `$${v.toFixed(2)}/MWh`, height: 100 }} height={300} labelEvery={3} />
</Figure>

<h3>6 August 2026</h3>
<p>Grid demand reached <a href="/records/demand_max"><strong>7,387 MW</strong></a> in the half-hour from 7:30 am, the highest peak in the dataset. The <a href="/articles/winter-2026">Winter 2026 review</a> covers that week in detail.</p>

<Figure caption="The highest half-hour of grid demand in each calendar year since 1998, with 2026 so far" source="EA metered data, half-hourly averages">
	<Columns cats={D.peak_years.map(String)} xlabels={everyFifth(D.peak_years)} series={[{ name: 'Peak demand', tok: '--f-hvdc', values: D.peaks }]} colors={peakColors} tops={peakTops}
		unit="MW" height={230} fmt={(v) => `${num(v)} MW`} label="Year" />
</Figure>

<h2>Where the numbers come from</h2>

<p>Almost every figure comes from the Electricity Authority’s market data, published under CC BY 4.0. Recent figures come from dispatch data, which isn’t a meter reading. For most plants, dispatch data is the market system’s 5-minute target. For wind and solar, it is a snapshot of output at the time.</p>

<p>Elenz replaces dispatch figures with metered data as the EA publishes each month, and the <a href="/methods/history">History since 1997</a> page explains how the layers fit together. Prices move to final prices the same way, so the same half-hour can show a dispatch price in the 7-day view and a final price in the 30-day view. A record set on dispatch data stays provisional until metered data confirms it, usually 5 to 10 weeks later.</p>

<p>Some figures have no meter reading behind them. We model <a href="/methods/embedded-solar">embedded solar</a> from installed capacity and satellite sunshine. We make a calculated estimate of <a href="/methods/other-embedded">other embedded generation</a> from the EA’s reconciliation data, and of live <a href="/methods/hvdc">HVDC transfer</a> from each island’s generation and grid demand. <a href="/methods/emissions">Emissions intensity</a> is also a calculated estimate, because its factors are published averages or assumptions.</p>

<p>The <a href="/methods">Data and methods</a> pages explain each series in full. The code, including every correction we make to the EA’s data, is on <a href="https://github.com/elenz-nz/elenz">GitHub</a>.</p>

<h2>What’s coming</h2>

<p>We’re working on new dashboards, plant pages and a public API.</p>

<h2>Tell us what you think</h2>

<p>If something looks wrong, the Report a problem link at the foot of every page starts an email with the page’s address filled in. We’d love to hear your questions, corrections and ideas at <a href="mailto:hello@elenz.co.nz">hello@elenz.co.nz</a>. If you find Elenz useful, you can help us keep it running and improving through the <a href="https://buymeacoffee.com/elenz">Support Elenz</a> link.</p>

<h2>Sources</h2>

<p>The charts and figures here use Elenz’s published history, which is built from these Electricity Authority datasets. All three are published under CC BY 4.0, and the <a href="/methods/sources">source register</a> describes every dataset we use.</p>

<ul>
	<li><a href="https://www.emi.ea.govt.nz/Wholesale/Datasets/Generation/Generation_MD">Metered generation</a> (<code>Generation_MD</code>)</li>
	<li><a href="https://www.emi.ea.govt.nz/Wholesale/Datasets/DispatchAndPricing/FinalEnergyPrices">Final energy prices</a> (<code>FinalEnergyPrices</code>)</li>
	<li><a href="https://www.emi.ea.govt.nz/Wholesale/Datasets/Metered_data/HVDC_Flows">HVDC flows</a> (<code>HVDC_Flows</code>)</li>
</ul>
