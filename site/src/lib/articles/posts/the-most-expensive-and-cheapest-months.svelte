<script module lang="ts">
	export const meta = {
		title: 'The most expensive and cheapest months',
		dek: 'August 2024 averaged $465/MWh, the most expensive month since the market began. January 2026 averaged $3.52, the cheapest. Low lakes and short gas made one; overflowing lakes and new geothermal made the other.',
		date: '2026-10-16',
		kind: 'Analysis',
		draft: true,
		series: 'wholesale-market',
		part: 4,
		image: '/articles/the-most-expensive-and-cheapest-months.png',
		imageLight: '/articles/the-most-expensive-and-cheapest-months-light.png',
	} as const;
</script>

<script lang="ts">
	// Part 4 of "Inside the wholesale market". Figures from analysis/wholesale_prices.py (see #lib/articles/series/wholesale.ts);
	// the month charts read ../data/wholesale-months.json, written by the same script.
	import Figure from '#lib/articles/Figure.svelte';
	import Note from '#lib/articles/Note.svelte';
	import Stats from '#lib/articles/Stats.svelte';
	import Record from '#lib/articles/Record.svelte';
	import PriceCover from '#lib/articles/PriceCover.svelte';
	import Columns from '#lib/articles/charts/Columns.svelte';
	import TimeStack from '#lib/articles/charts/TimeStack.svelte';
	import { num } from '#lib/articles/charts/util.js';
	import M from '#lib/articles/data/wholesale-months.json';
	import { D, FUELS, cover } from '#lib/articles/series/wholesale.js';
	import PartLink from '#lib/articles/series/PartLink.svelte';

	const C = cover(4, ['The most expensive', 'and cheapest months']);
	type Month = { t0: number; step: number; demand: number[]; price: number[]; [k: string]: number[] | number };
	const month = (m: Month) => ({
		t0: m.t0, step: m.step,
		layers: FUELS.map((f) => ({ name: f.name, tok: f.tok, values: m[f.k] as number[] })),
		line: { name: 'Demand', tok: '--ink', values: m.demand },
	});
	const aug = month(M['2024-08'] as unknown as Month);
	const jan = month(M['2026-01'] as unknown as Month);
	// both months on the same scales, so January's price can be seen against August's
	const peak = (m: Month) => Math.max(...m.demand.map((_, i) => FUELS.reduce((a, f) => a + Math.max(0, (m[f.k] as number[])[i]), 0)), ...m.demand);
	const ymax = Math.max(peak(M['2024-08'] as unknown as Month), peak(M['2026-01'] as unknown as Month));
	const pmax = Math.max(...(M['2024-08'] as unknown as Month).price, ...(M['2026-01'] as unknown as Month).price);
	const pricePanel = (m: Month) => ({ name: 'Price at Haywards', tok: '--p-ni', values: m.price, unit: '$/MWh', fmt: (v: number) => `$${num(v)}/MWh`, height: 100 });

	const mixYears = D.mix.years.map(String);
	const mixSeries = [
		{ name: 'Geothermal', tok: '--f-geo', values: D.mix.geo },
		{ name: 'Thermal (gas, coal, diesel)', tok: '--f-gas', values: D.mix.thermal },
		{ name: 'Hydro', tok: '--f-hydro', values: D.mix.hydro },
		{ name: 'Wind', tok: '--f-wind', values: D.mix.wind },
		{ name: 'Solar', tok: '--f-solar', values: D.mix.solar },
	];
</script>

<PriceCover {...C} />

<p>Seventeen months separate the most expensive and the cheapest months in the wholesale market's 30 years. Nothing about the market's rules changed in between. What changed was how much water was in the lakes, how much gas there was to burn, and how much new generation had been built. Seen side by side, the two months show each of those at work.</p>

<Stats items={[
	{ label: 'August 2024', value: '$465', unit: '/MWh', note: 'Haywards average, the most expensive month', tok: '--f-gas' },
	{ label: 'January 2026', value: '$3.52', unit: '/MWh', note: 'Haywards average, the cheapest month', tok: '--f-hydro' },
	{ label: 'Thermal generation', value: '1,162 → 106', unit: 'MW', note: 'average in each month', tok: '--f-coal' },
]} />

<h2>Winter 2024: everything at once</h2>
<p>Winter 2024 combined both problems behind high prices (see <PartLink to="water">Part 3</PartLink>). According to the Authority's review, there were no significant inflows to the lakes after mid-April, and national storage fell to about 1,500 GWh in early August, a six-year low, with Pūkaki at its lowest since 1997. Gas was short. Wind output often dropped below 300 MW, and a cold snap in early August lifted demand. Every day from 3 to 10 August averaged more than $760/MWh at Haywards, peaking at <strong>$878</strong> on Wednesday 7 August, the most expensive day since the market began.</p>

<Figure caption="August 2024: generation by fuel and grid demand, with the Haywards price, two-hourly averages" source="Elenz history (EMI dispatch data); EMI final energy prices" wide>
	<TimeStack {...aug} panel={pricePanel(M['2024-08'] as unknown as Month)} height={300} labelEvery={4} {ymax} {pmax} />
</Figure>

<p>Through the month thermal plant ran at an average of 1,162 MW, with Huntly's Rankine units mostly on coal. Hydro, saving what water it had, averaged 2,259 MW. From 3 to 10 August the price never fell below $300/MWh.</p>

<Record label="Most expensive day, Haywards" value="$878" unit="/MWh" when="Wednesday 7 August 2024 (daily average); its highest trading period, 7:30 am, cleared at $1,529" previous="$663/MWh on 17 March 2011" fuel="--f-gas" />

<p>Relief came from the demand side, then the weather. The Tiwai Point smelter cut its load by up to 185 MW, saving about 330 GWh, and Methanex halted production on 13 August and sold its gas to Genesis and Contact for generation. Heavy rain in late August and September then refilled the lakes. September averaged $74/MWh, and November $29.</p>

<h2>Summer 2025–26: more than the lakes could hold</h2>
<p>A year later the position had reversed. The Authority's security of supply snapshot for 22 December 2025 put national storage at about 138% of the historic mean and about 101% of nominally full, with 98% of that week's generation from renewables. Lakes that full have to spill, and water that would be spilled anyway has no value, so it was offered at close to nothing. December averaged $13.70/MWh at Haywards and $5.00 at Benmore. In January, 57% of trading periods cleared under $1 and the median was 35 cents.</p>

<Figure caption="January 2026: generation by fuel and grid demand, with the Haywards price, two-hourly averages, on the same scales as August 2024" source="Elenz history (EMI dispatch data); EMI final energy prices" wide>
	<TimeStack {...jan} panel={pricePanel(M['2026-01'] as unknown as Month)} height={300} labelEvery={4} {ymax} {pmax} />
</Figure>

<p>Demand was lower, as it always is in summer, averaging 4,197 MW against 4,868 MW in August 2024. Thermal generation almost stopped, at 106 MW on average. The price chart is the striking part: most days it barely left the floor.</p>

<Record label="Cheapest month, Haywards" value="$3.52" unit="/MWh" when="January 2026 (Benmore: $1.87)" previous="$13.60/MWh in February 2004" fuel="--f-hydro" />

<h2>New generation, not just rain</h2>
<p>Water wasn't the only change. A run of new geothermal stations has steadily added generation that runs around the clock. Like the rest of the geothermal fleet it is offered at very low prices so that it stays on, which pushes more expensive offers further up the stack. From January to August 2026, geothermal generated <strong>6,838 GWh</strong>, 23% (1,282 GWh) more than in the same months of 2024. Wind added 203 GWh and solar 135 GWh. With hydro also up, thermal generation fell by 69%, to 5.8% of the total, its smallest share for those months since at least 1998.</p>

<Figure caption="Generation from January to August each year by fuel, with the average Haywards price over the same months above each column" source="EMI metered generation (Generation_MD); EMI final energy prices">
	<Columns cats={mixYears} series={mixSeries} stacked tops={D.mix.price.map((v) => `$${v}`)} unit="GWh" height={290} label="January–August"
		fmt={(v) => `${num(v)} GWh`} />
</Figure>

<p>Even the futures market didn't see how far prices would fall. On 20 January 2026, with spot prices at a few dollars, the Authority's snapshot reported forward prices for June 2026 of about $170/MWh at Benmore and $194/MWh at Ōtāhuhu, on the expectation that winter would bring the usual squeeze. June 2026 averaged <strong>$35/MWh</strong> at Benmore and $41/MWh at Ōtāhuhu.</p>

<Note title="How these figures are measured">
	<ul>
		<li><strong>Prices</strong> are the Electricity Authority's final energy prices at Haywards, in the dollars of the day.</li>
		<li><strong>The month charts</strong> are the site's own history from EMI dispatch data: generation on the grid by fuel and grid demand, averaged over two hours. Rooftop solar isn't included.</li>
		<li><strong>Generation by fuel</strong> over January to August is metered generation (Generation_MD), which also counts some generation embedded in local networks.</li>
		<li><strong>Storage and forward prices</strong> after 2024 are from the Authority's weekly security of supply snapshots.</li>
	</ul>
	<p>Sources: the Authority's <a href="https://www.ea.govt.nz/documents/7069/Review_of_winter_2024.pdf">Review of winter 2024</a> (April 2025); security of supply snapshots of <a href="https://www.ea.govt.nz/documents/9072/Security_of_Supply_Snapshot_-_22_December_2025.pdf">22 December 2025</a> and <a href="https://www.ea.govt.nz/documents/9192/Security_of_Supply_Snapshot_-_20_January_2026.pdf">20 January 2026</a>.</p>
</Note>
