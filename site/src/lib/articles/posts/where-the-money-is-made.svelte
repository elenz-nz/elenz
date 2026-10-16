<script module lang="ts">
	export const meta = {
		title: 'Where the money is made',
		dek: 'The wholesale price spends more and more time at its extremes: under $1/MWh when cheap power is plentiful, over $300 when it is tight. In 2024, the 4.5% of trading periods above $500 earned a fifth of the year’s $8.6 billion.',
		date: '2026-10-16',
		kind: 'Analysis',
		draft: true,
		series: 'wholesale-market',
		part: 5,
		image: '/articles/where-the-money-is-made.png',
		imageLight: '/articles/where-the-money-is-made-light.png',
	} as const;
</script>

<script lang="ts">
	// Part 5 of "Inside the wholesale market". Figures from analysis/wholesale_prices.py (see #lib/articles/series/wholesale.ts).
	import Figure from '#lib/articles/Figure.svelte';
	import Note from '#lib/articles/Note.svelte';
	import Stats from '#lib/articles/Stats.svelte';
	import PriceCover from '#lib/articles/PriceCover.svelte';
	import Columns from '#lib/articles/charts/Columns.svelte';
	import HBars from '#lib/articles/charts/HBars.svelte';
	import TimeMoney from '#lib/articles/charts/TimeMoney.svelte';
	import { D, cover } from '#lib/articles/series/wholesale.js';
	import PartLink from '#lib/articles/series/PartLink.svelte';

	const C = cover(5, ['Where the money', 'is made']);
	const extYears = D.extremes.years.map((y) => (y === 2026 ? '2026*' : String(y)));
	const extX = D.extremes.years.map((y) => ((y % 5 === 0 && y !== 2025) || y === 2026 ? String(y) : null));

	const MO = D.money;
	const moneyRows = MO.years.map((y, i) => ({
		name: y === 2026 ? '2026*' : String(y), time: MO.time[i], money: MO.money[i], total: MO.money[i].reduce((a, v) => a + v, 0),
	}));
	const REL = D.reliance as { [k: string]: number };
	const relRows = [
		{ k: 'diesel', name: 'Diesel', tok: '--f-diesel' }, { k: 'batt', name: 'Batteries', tok: '--f-batt' },
		{ k: 'coal', name: 'Coal/gas, Rankine', tok: '--f-coal' }, { k: 'gas', name: 'Gas', tok: '--f-gas' },
		{ k: 'hydro', name: 'Hydro', tok: '--f-hydro' }, { k: 'geo', name: 'Geothermal', tok: '--f-geo' },
		{ k: 'solar', name: 'Solar', tok: '--f-solar' }, { k: 'wind', name: 'Wind', tok: '--f-wind' },
		{ k: 'all', name: 'All generation', tok: '--ink' },
	].map((r) => ({ label: r.name, value: REL[r.k], tok: r.tok })).sort((a, b) => b.value - a.value);
</script>

<PriceCover {...C} />

<p>Every generator is paid the wholesale price of each trading period for what it generates (see <PartLink to="works">Part 1</PartLink>). As more low-priced generation is built, that price spends more of its time at the extremes, so a year's earnings depend more and more on the stretches when supply is tight. This part looks at how often the price sits at each extreme, and who earns the money when it is high.</p>

<Stats items={[
	{ label: 'Spot market takings, 2024', value: '$8.6', unit: 'billion', note: 'against $4.8 billion in 2022, for about the same 41 TWh', tok: '--accent' },
	{ label: 'Over $500/MWh, 2024', value: '20%', note: 'of the money, in 4.5% of the trading periods', tok: '--f-diesel' },
	{ label: 'Under $50/MWh, 2024', value: '1.4%', note: 'of the money, in 26% of the trading periods', tok: '--f-hydro' },
]} />

<h2>An all-or-nothing market</h2>
<p>One way to see the extremes is to count, each year, how many trading periods cleared under $1/MWh, when there was more cheap supply than needed, and how many cleared over $300/MWh, when supply was tight.</p>

<p>Until 2021, prices under $1 were rare: fewer than 1 trading period in 30 in most years, a little more in the wet years of 2009–2011. Since 2022 they have become common, about 1 in 9 in 2022 and 2025 and 1 in 7 so far in 2026. Prices over $300 have become more common too, reaching 1 in 6 trading periods in 2024. 2025 had plenty of both: 11% of trading periods under $1 and 13% over $300, almost all of the expensive ones between February and May.</p>

<Figure caption="Share of trading periods each year with a Haywards price under $1/MWh and over $300/MWh (* 2026 is January to September)" source="EMI final energy prices">
	<Columns cats={extYears} xlabels={extX} series={[{ name: 'Under $1/MWh', tok: '--f-hydro', values: D.extremes.low }, { name: 'Over $300/MWh', tok: '--f-gas', values: D.extremes.high }]}
		unit="% of trading periods" height={240} fmt={(v) => `${v.toFixed(1)}%`} label="Year" />
</Figure>

<h2>Where the money is made</h2>
<p>Each trading period's generation multiplied by its price gives the spot market's takings. On the grid they came to <strong>$8.6 billion</strong> in 2024 and $4.8 billion in 2022, for almost exactly the same amount of electricity, about 41 TWh each year.</p>

<p>Very little of that money is earned in the cheap periods. In 2024, the quarter of trading periods that cleared under $50/MWh brought in 1.4% of the year's revenue. The 4.5% that cleared over $500 brought in <strong>20%</strong>, $1.7 billion, more than everything earned under $150. Most years the money comes from the long middle: the $150–300 band earned between 42% and 67% of revenue in 2021–2025. In 2026 so far, with half of all trading periods under $50, the spot market has taken $2.0 billion in nine months.</p>

<Figure caption="Each year, the share of trading periods spent in each price band (time) against the share of the spot market's revenue earned in it (money), with the year's total (* 2026 is January to September)" source="Elenz half-hourly history: grid generation from EMI dispatch data, paid at the island reference price (Haywards or Benmore); EMI final energy prices" wide>
	<TimeMoney rows={moneyRows} bands={MO.bands} />
</Figure>

<h2>Who relies on the high prices</h2>
<p>New Zealand's high prices tend to come in runs, through a dry month or a gas shortage, rather than in single spikes, so no one depends on a handful of half-hours. Across 2021–2025, the most expensive 1% of each year's trading periods earned between 3% and 6.4% of revenue, and the most expensive 5% about 17%. Who earns that money differs by fuel. Diesel peakers, which run only when prices are high, earned 83% of their revenue in the most expensive 5% of trading periods. Wind earned just 11% there: high prices often coincide with calm spells, when wind farms have little to sell.</p>

<Figure caption="Share of each fuel's 2021–2025 spot revenue earned in the most expensive 5% of each year's trading periods" source="Elenz half-hourly history: grid generation from EMI dispatch data, paid at the island reference price; EMI final energy prices. Batteries earned about $2 million over the period">
	<HBars rows={relRows} fmt={(v) => `${v.toFixed(0)}%`} label="Fuel" valueLabel="Share of revenue in the most expensive 5% of trading periods" />
</Figure>

<p>This is spot revenue, before contracts. Most generation is sold forward through hedges and to the generators' own retail customers at agreed prices, so a generator's income swings far less than these totals. But the spot price is what those contracts are priced against, and what any electricity that isn't covered by a contract earns. <PartLink to="bill">Part 6</PartLink> follows the money on to the power bill.</p>

<Note title="How these figures are measured">
	<ul>
		<li><strong>Prices</strong> are the Electricity Authority's final energy prices at Haywards, for the counts of trading periods under $1 and over $300.</li>
		<li><strong>Spot revenue</strong> multiplies each trading period's grid generation (dispatch data, so not embedded generation) by its island's reference price: Haywards for the North Island, Benmore for the South. Real payments use each station's own node price and metered output, so the totals are approximate. A trading period's band is set by its generation-weighted national price.</li>
	</ul>
</Note>
