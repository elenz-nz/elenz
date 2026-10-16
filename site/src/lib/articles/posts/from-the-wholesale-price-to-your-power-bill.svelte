<script module lang="ts">
	export const meta = {
		title: 'From the wholesale price to your power bill',
		dek: 'Between April 2025 and January 2026 the wholesale price fell by 99%. Household prices rose. The electricity itself is only about half of a power bill, and retailers buy it at prices fixed long in advance.',
		date: '2026-10-16',
		kind: 'Analysis',
		draft: true,
		series: 'wholesale-market',
		part: 6,
		image: '/articles/from-the-wholesale-price-to-your-power-bill.png',
	} as const;
</script>

<script lang="ts">
	// Part 6 of "Inside the wholesale market". Figures from analysis/wholesale_prices.py (see #lib/articles/series/wholesale.ts).
	import Figure from '#lib/articles/Figure.svelte';
	import Note from '#lib/articles/Note.svelte';
	import Stats from '#lib/articles/Stats.svelte';
	import PriceCover from '#lib/articles/PriceCover.svelte';
	import Columns from '#lib/articles/charts/Columns.svelte';
	import Lines from '#lib/articles/charts/Lines.svelte';
	import HBars from '#lib/articles/charts/HBars.svelte';
	import SplitBar from '#lib/articles/charts/SplitBar.svelte';
	import { D, dollars, monthName, cover, PARTS } from '#lib/articles/series/wholesale.js';

	const C = cover(6, ['From wholesale to', 'your power bill']);

	const BP = D.bill_parts;
	const cents = (v: number) => `${(v / 10).toFixed(v < 10 ? 2 : 1)} c/kWh`;
	const billParts = [
		{ name: 'Electricity', value: BP.electricity, tok: '--f-hydro' },
		{ name: 'Lines', value: BP.distribution, tok: '--f-hvdc' },
		{ name: 'Metering', value: BP.metering, tok: '--f-solar' },
		{ name: 'Levies', value: BP.levies, tok: '--f-diesel' },
		{ name: 'Retail margin', value: BP.margin, tok: '--f-wind' },
		{ name: 'GST', value: BP.gst, tok: '--f-coal' },
	];

	const RR = D.retail;
	const rrCats = RR.years.map((y) => `Year to June ${y}`);
	const rrX = RR.years.map((y) => `FY${y}`);
	const rrSeries = [
		{ name: 'Electricity', tok: '--f-hydro', values: RR.electricity },
		{ name: 'Lines (distribution)', tok: '--f-hvdc', values: RR.distribution },
		{ name: 'Metering', tok: '--f-solar', values: RR.metering },
		{ name: 'Levies', tok: '--f-diesel', values: RR.levies },
		{ name: 'Retail margin', tok: '--f-wind', values: RR.margin },
	];

	const [by0, bm0] = D.bills.start.split('-').map(Number);
	const bxs = D.bills.household.map((_, i) => i);
	const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	const billMonth = (i: number) => { const j = bm0 - 1 + Math.round(i); return monthName(`${by0 + Math.floor(j / 12)}-${String((j % 12) + 1).padStart(2, '0')}`); };
	const billTick = (i: number) => { const j = bm0 - 1 + Math.round(i); return MON3[j % 12] + (j % 12 === 0 ? ` ${by0 + Math.floor(j / 12)}` : ''); };

	// the ten cheapest and ten most expensive network regions for the same 600 kWh
	const R = D.regions;
	const short = (n: string) => n.replace(/\s*\(.*\)$/, '');
	const ends = [...R.rows.slice(-10).reverse(), ...R.rows.slice(0, 10).reverse()];
	const regionRows = ends.map((r, i) => ({ label: short(r.name), value: r.bill, tok: i < 10 ? '--f-gas' : '--f-hydro', note: `lines ${r.share}% of the bill` }));
	const regionMonth = monthName(R.month.slice(0, 7));
</script>

<PriceCover {...C} />

<p>Between April 2025 and January 2026 the monthly wholesale price at Haywards fell from $320/MWh to $3.52, a drop of 99%. Over the same months the price households paid per kilowatt-hour went up. That isn't a mistake in either number. The wholesale price is only part of a power bill, and it reaches the bill slowly and smoothed.</p>

<Stats items={[
	{ label: 'Retail price, year to June 2025', value: '34.4', unit: 'c/kWh', note: 'the big four retailers, including GST', tok: '--accent' },
	{ label: 'Electricity', value: '46%', note: 'of that price; lines charges 35%, GST 13%', tok: '--f-hydro' },
	{ label: 'Household price change', value: '+13%', note: 'January 2025 to May 2026, while wholesale swung from $320 to $3.52', tok: '--f-gas' },
]} />

<h2>What a power bill pays for</h2>
<p>The Authority collects a breakdown from each large retailer of what it earns for every MWh it sells to households and small businesses, before GST. For the four generator-retailers, Contact, Genesis, Mercury and Meridian, in the year to June 2025, that averaged $299/MWh, or 29.9 cents a kilowatt-hour. With GST added it is 34.4 cents.</p>

<Figure caption="What a kilowatt-hour sold by the four generator-retailers paid for, year to June 2025, including GST" source="EA retail gross margin disclosures (weighted by each retailer's MWh sold), with GST at 15% added">
	<SplitBar parts={billParts} fmt={cents} totalName="Price per kWh" />
</Figure>

<p>Less than half of the price, 15.6 cents, paid for the electricity itself. The lines companies and Transpower took 12.1 cents for carrying it, metering 1.3 cents, industry levies 0.2 cents, and GST 4.5 cents. That left 0.65 cents to cover the cost of running the retail business and any profit.</p>

<h2>The electricity cost moves slowly</h2>
<p>The electricity part of the bill moves much more slowly than the spot price. Over the four years the Authority has published, it rose steadily, from $106 to $156/MWh, while the Haywards average for the same years went from $136 to $80, then $175 and $193. Retailers buy most of what they sell at prices agreed in advance, from their own power stations or through contracts (see <a href={PARTS.works}>Part 1</a>), so a dry year raises their costs over the years that follow rather than all at once, and a wet year doesn't cut them at once either. Over the same years the retail margin shrank from $36 to $6.50/MWh, as costs rose faster than the prices retailers charged.</p>

<Figure caption="What the four generator-retailers earned per MWh sold to households and small businesses, by component, before GST, with the average Haywards wholesale price over the same year" source="EA retail gross margin disclosures (weighted by each retailer's MWh sold); EMI final energy prices">
	<Columns cats={rrCats} xlabels={rrX} series={rrSeries} stacked unit="$/MWh" height={280} label="Financial year" fmt={(v) => `$${v.toFixed(0)}/MWh`}
		marks={{ name: 'Haywards wholesale average', tok: '--ink', values: RR.spot, fmt: (v) => `$${v.toFixed(0)}/MWh` }} />
</Figure>

<h2>Household prices kept rising</h2>
<p>Household prices show the same lag. Across the Authority's 39 network regions, a standard household's price per kWh averaged 28.6 cents including GST in January 2025 and 32.4 cents in May 2026, up 13%. In between, the monthly wholesale price fell from $320/MWh in April 2025 to $3.52 in January 2026. Lines charges, about 42% of a household bill, rose when the lines companies' new regulated price limits began in April 2025. A summer of almost free wholesale power never showed up on household bills.</p>

<Figure caption="A standard household's price per kWh (average of all network regions, before GST) against the monthly Haywards wholesale price, both in $/MWh" source="EA regional power prices (standard users, variable price per kWh); EMI final energy prices" wide>
	<Lines xs={bxs} series={[{ name: 'Household price per kWh, before GST', tok: '--accent', values: D.bills.household }, { name: 'Haywards wholesale, monthly average', tok: '--p-ni', values: D.bills.hay }]}
		xticks={bxs.filter((i) => i % 3 === 0)} xfmt={billTick} titleFmt={billMonth} fmt={dollars} unit="$/MWh" height={260}
		legend={[{ name: 'Household price per kWh, before GST', tok: '--accent', kind: 'line' }, { name: 'Haywards wholesale, monthly average', tok: '--p-ni', kind: 'line' }]} />
</Figure>

<h2>Where you live matters more</h2>
<p>A household's bill depends more on where it lives than on the wholesale price that month. For the same 600 kWh in {regionMonth}, a standard household's bill ran from $231 in Central Canterbury to $346 in the Bay of Islands, with $282 in the middle. Most of the gap is the lines charge, which made up between 30% and 55% of the bill depending on the network. Scaled to the same 600 kWh, lines charges came to about $78 in Central Canterbury and $176 in the Bay of Islands; rural networks, with long lines and fewer customers on each kilometre, tend to cost more to run.</p>

<Figure caption="A standard household's bill for 600 kWh in {regionMonth}, including GST: the ten most expensive and ten cheapest of the 39 network regions" source="EA regional power prices (each region's average daily charge and price per kWh for standard users)">
	<HBars rows={regionRows} fmt={(v) => `$${v.toFixed(0)}`} label="Network region" valueLabel="Bill for 600 kWh" labelWidth={132}
		legend={[{ name: 'Ten most expensive', tok: '--f-gas' }, { name: 'Ten cheapest', tok: '--f-hydro' }]} />
</Figure>

<Note title="How these figures are measured">
	<ul>
		<li><strong>Retail figures</strong> are the Authority's retail gross margin disclosures: each retailer's financial year (ending in June for the four generator-retailers), before GST, weighted here by the MWh each sold. The electricity cost is what each retailer reports; for the generator-retailers it can include an internal transfer price between their generation and retail businesses.</li>
		<li><strong>Household prices</strong> are the Authority's regional power prices: each network region's average standard-user daily charge and price per kWh, including GST. The household line averages every region's price per kWh; the region bills apply each region's charges to the same 600 kWh over the month.</li>
		<li><strong>Wholesale prices</strong> are the Authority's final energy prices at Haywards.</li>
	</ul>
	<p>Sources: the Authority's <a href="https://www.ea.govt.nz/industry/monitoring/retail-gross-margin">retail gross margin</a> and regional power price data; EMI final energy prices.</p>
</Note>
