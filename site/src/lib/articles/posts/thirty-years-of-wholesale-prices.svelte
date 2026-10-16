<script module lang="ts">
	export const meta = {
		title: 'Thirty years of wholesale prices',
		dek: 'For two decades the wholesale price mostly sat between $30 and $80/MWh, broken by dry years. Since 2018 it has run about twice as high, and in the last two years it set both its highest and its lowest month.',
		date: '2026-10-16',
		kind: 'Analysis',
		draft: true,
		series: 'wholesale-market',
		part: 2,
		image: '/articles/thirty-years-of-wholesale-prices.png',
		imageLight: '/articles/thirty-years-of-wholesale-prices-light.png',
	} as const;
</script>

<script lang="ts">
	// Part 2 of "Inside the wholesale market". Figures from analysis/wholesale_prices.py (see #lib/articles/series/wholesale.ts).
	import Figure from '#lib/articles/Figure.svelte';
	import Note from '#lib/articles/Note.svelte';
	import Stats from '#lib/articles/Stats.svelte';
	import PriceCover from '#lib/articles/PriceCover.svelte';
	import Lines from '#lib/articles/charts/Lines.svelte';
	import Columns from '#lib/articles/charts/Columns.svelte';
	import { D, dollars, monthName, cover, PARTS } from '#lib/articles/series/wholesale.js';

	const C = cover(2, ['Thirty years of', 'wholesale prices']);
	const [y0, m0] = D.months.start.split('-').map(Number);
	const mxs = D.months.HAY.map((_, i) => y0 + (m0 - 1 + i + 0.5) / 12);
	const monthOf = (v: number) => {
		const k = Math.floor((v - y0) * 12 - (m0 - 1));
		const y = y0 + Math.floor((m0 - 1 + k) / 12), mo = ((m0 - 1 + k) % 12) + 1;
		return monthName(`${y}-${String(mo).padStart(2, '0')}`);
	};
	const Y = D.years;
	const yCats = Y.years.map((y) => (y === 2026 ? '2026*' : String(y)));
	const yX = Y.years.map((y) => (y % 5 === 0 ? String(y) : y === 2026 ? '2026*' : null));
	// years after 2017 in the accent, so the step up stands out
	const yCol = Y.years.map((y) => (y >= 2018 ? '--f-gas' : '--f-hvdc'));
</script>

<PriceCover {...C} />

<p>New Zealand's wholesale electricity market opened in October 1996. In the 30 years since, the price at Haywards, the North Island's reference point, has averaged $81/MWh. That average hides a market that swings hard: it set its most expensive month in August 2024, at $465/MWh, and its cheapest just 17 months later, in January 2026, at $3.52.</p>

<Stats items={[
	{ label: 'Most expensive month', value: '$465', unit: '/MWh', note: 'August 2024', tok: '--f-gas' },
	{ label: 'Cheapest month', value: '$3.52', unit: '/MWh', note: 'January 2026', tok: '--f-hydro' },
	{ label: 'Average, 1997–2017', value: '$62', unit: '/MWh', note: 'Haywards', tok: '--f-hvdc' },
	{ label: 'Average, 2018–2023', value: '$120', unit: '/MWh', note: 'Haywards, about twice as high', tok: '--accent' },
]} />

<Figure caption="Average wholesale price each month at the two island reference points, October 1996 to September 2026 (not adjusted for inflation)" source="EMI final energy prices, averaged over every trading period" wide>
	<Lines xs={mxs} series={[{ name: 'Haywards (North Island)', tok: '--p-ni', values: D.months.HAY }, { name: 'Benmore (South Island)', tok: '--p-si', values: D.months.BEN, faint: true }]}
		xzero={false} xticks={[2000, 2005, 2010, 2015, 2020, 2025]} xfmt={(v) => String(Math.round(v))} titleFmt={monthOf} fmt={dollars} unit="$/MWh" height={300}
		legend={[{ name: 'Haywards (North Island)', tok: '--p-ni', kind: 'line' }, { name: 'Benmore (South Island)', tok: '--p-si', kind: 'line', faint: true }]} />
</Figure>

<h2>Two decades of cheap power, broken by dry years</h2>
<p>For its first two decades the market mostly ran between $30 and $80/MWh. The spikes were dry years, when the hydro lakes ran low: 2001, 2003, 2005–06 and 2008, when June averaged $306/MWh. Each time the price fell back once the rain came. Haywards and Benmore usually moved together, a few dollars apart.</p>

<Figure caption="Average Haywards price each year (* 2026 is January to September)" source="EMI final energy prices, averaged over every trading period">
	<Columns cats={yCats} xlabels={yX} series={[{ name: 'Haywards', tok: '--f-hvdc', values: Y.HAY }]} colors={yCol} unit="$/MWh" height={240} label="Year"
		fmt={(v) => `$${v.toFixed(0)}/MWh`} />
</Figure>

<h2>A higher floor from 2018</h2>
<p>From 2018 the floor lifted. Haywards averaged $62/MWh from 1997 to 2017 and $120 from 2018 to 2023, about twice as much, and stayed above $100 even in years without a serious drought. Eight months averaged above $150/MWh in those first 21 years; eighteen did in the next six. The reason, explored in <a href={PARTS.water}>Part 3</a>, is gas: as the gas fields declined, the backup that hydro relies on in a dry year became scarce and expensive, and that raised the value of the water in the lakes.</p>

<p>Then came the two extremes. 2024 set the record, with a dry winter and short gas pushing August to $465/MWh. Two summers later the lakes were overflowing and a wave of new geothermal was running, and January 2026 averaged $3.52. So far 2026 has been the cheapest year since 2016, at $64/MWh to the end of September. <a href={PARTS.extremes}>Part 4</a> looks at those two months side by side.</p>

<Note title="How these figures are measured">
	<ul>
		<li>Prices are the Electricity Authority's final energy prices for every trading period since October 1996, at Haywards (HAY2201) and Benmore (BEN2201).</li>
		<li>Averages give every trading period equal weight (they aren't weighted by demand) and are in the dollars of the day, not adjusted for inflation; in today's money the early years' prices would be higher than shown.</li>
		<li>December 2025's monthly file was published incomplete, so that month is built from the Authority's daily final price files.</li>
	</ul>
</Note>
