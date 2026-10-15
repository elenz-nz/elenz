<script module lang="ts">
	export const meta = {
		title: 'What sets the wholesale price',
		dek: 'In seventeen months New Zealand had its most expensive month and its cheapest since the market began in 1996. Water, gas and a wave of new geothermal explain both, and show how the price is set.',
		date: '2026-10-16',
		kind: 'Analysis',
		draft: true,
		image: '/articles/wholesale-prices.png',
	} as const;
</script>

<script lang="ts">
	// Figures from analysis/wholesale_prices.py, which also writes the chart data in ../data/wholesale-prices.json
	// (run analysis/price_fetch.py first for the final prices).
	import Figure from '#lib/articles/Figure.svelte';
	import Note from '#lib/articles/Note.svelte';
	import Stats from '#lib/articles/Stats.svelte';
	import Record from '#lib/articles/Record.svelte';
	import Columns from '#lib/articles/charts/Columns.svelte';
	import HBars from '#lib/articles/charts/HBars.svelte';
	import Lines from '#lib/articles/charts/Lines.svelte';
	import Ridgeline from '#lib/articles/charts/Ridgeline.svelte';
	import TimeMoney from '#lib/articles/charts/TimeMoney.svelte';
	import Scatter from '#lib/articles/charts/Scatter.svelte';
	import OfferStack from '#lib/articles/charts/OfferStack.svelte';
	import Legend from '#lib/articles/charts/Legend.svelte';
	import { num } from '#lib/articles/charts/util.js';
	import D from '#lib/articles/data/wholesale-prices.json';
	import PriceCover from '#lib/articles/PriceCover.svelte';

	const dollars = (v: number) => `$${num(v)}/MWh`;
	const MON = new Intl.DateTimeFormat('en-NZ', { month: 'long', year: 'numeric', timeZone: 'UTC' });
	const monthName = (ym: string) => MON.format(new Date(ym + '-01T00:00:00Z'));

	// 30 years, month by month: x is the year plus the month's midpoint
	const [y0, m0] = D.months.start.split('-').map(Number);
	const mxs = D.months.HAY.map((_, i) => y0 + (m0 - 1 + i + 0.5) / 12);
	const monthOf = (v: number) => {
		const k = Math.floor((v - y0) * 12 - (m0 - 1));
		const y = y0 + Math.floor((m0 - 1 + k) / 12), mo = ((m0 - 1 + k) % 12) + 1;
		return monthName(`${y}-${String(mo).padStart(2, '0')}`);
	};

	const FUELS = [
		{ k: 'geo', name: 'Geothermal', tok: '--f-geo' },
		{ k: 'coal', name: 'Coal/gas, Rankine', tok: '--f-coal' },
		{ k: 'gas', name: 'Gas', tok: '--f-gas' },
		{ k: 'diesel', name: 'Diesel', tok: '--f-diesel' },
		{ k: 'hydro', name: 'Hydro', tok: '--f-hydro' },
		{ k: 'wind', name: 'Wind', tok: '--f-wind' },
		{ k: 'solar', name: 'Solar', tok: '--f-solar' },
		{ k: 'batt', name: 'Battery', tok: '--f-batt' },
	];
	const [s24, s26] = D.stacks as unknown as { label: string; load: number; price: { HAY: number }; blocks: [string, number, number][] }[];
	const stackLegend = FUELS.filter((f) => f.k !== 'batt').map((f) => ({ name: f.name, tok: f.tok }));

	const sc = D.scatter;
	const scPts = sc.pts as [number, number, number, string][];
	const scTable = {
		head: ['Storage, % of average for the date', 'Average price 1997–2017', 'Months', 'Average price 2018–2024', 'Months'],
		rows: sc.bands.map((b, i) => [b, dollars(sc.before[i] ?? 0), String(sc.n_before[i]), dollars(sc.after[i] ?? 0), String(sc.n_after[i])]),
	};

	const mixYears = D.mix.years.map(String);
	const mixSeries = [
		{ name: 'Geothermal', tok: '--f-geo', values: D.mix.geo },
		{ name: 'Thermal (gas, coal, diesel)', tok: '--f-gas', values: D.mix.thermal },
		{ name: 'Hydro', tok: '--f-hydro', values: D.mix.hydro },
		{ name: 'Wind', tok: '--f-wind', values: D.mix.wind },
		{ name: 'Solar', tok: '--f-solar', values: D.mix.solar },
	];

	const extYears = D.extremes.years.map((y) => (y === 2026 ? '2026*' : String(y)));
	const extX = D.extremes.years.map((y) => ((y % 5 === 0 && y !== 2025) || y === 2026 ? String(y) : null));

	const hxs = Array.from({ length: 48 }, (_, i) => i / 2);
	const clock = (h: number) => { const hh = Math.floor(h) % 24, mm = h % 1 ? '30' : '00'; return `${hh % 12 || 12}${mm === '30' ? ':30' : ''} ${hh < 12 ? 'am' : 'pm'}`; };
	const P = D.profile as { years: number[]; values: number[][] };
	const ridgeRows = P.years.map((y, i) => ({
		name: y === 2026 ? '2026*' : String(y), values: P.values[i].map((v) => (v === null ? NaN : v)),
		tok: y === 2026 ? '--accent' : y === 2024 ? '--f-gas' : '--f-hvdc', strong: y === 2026 || y === 2024,
	}));

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

	const SI = new Set(['MAN2201', 'INV2201', 'BEN2201', 'ISL2201', 'KIW2201']);
	const nodeRows = [...D.nodes].sort((a, b) => b.price - a.price)
		.map((n) => ({ label: n.name, value: n.price, tok: SI.has(n.poc) ? '--p-si' : '--p-ni' }));
</script>

<PriceCover values={D.months.HAY} start={D.months.start} kicker="Analysis" title={['What sets the', 'wholesale price']}
	note="Each column is one month's average price at Haywards, 1996–2026" />

<p>In August 2024 the wholesale price of electricity at Haywards, the North Island's reference point, averaged <strong>$465/MWh</strong>, the highest of any month since the market opened in October 1996. Seventeen months later, in January 2026, it averaged <strong>$3.52/MWh</strong>, the lowest. Nothing about the market's rules changed in between. What changed was how much water was in the lakes, how much gas there was to burn, and how much new generation had been built. This piece uses the Electricity Authority's market data to show how the price is set, and why it swings so far.</p>

<Stats items={[
	{ label: 'Most expensive month', value: '$465', unit: '/MWh', note: 'August 2024, Haywards average', tok: '--f-gas' },
	{ label: 'Cheapest month', value: '$3.52', unit: '/MWh', note: 'January 2026, Haywards average', tok: '--f-hydro' },
	{ label: 'Under $1', value: '57%', note: 'of trading periods in January 2026', tok: '--f-geo' },
	{ label: 'Average, 2018–2023', value: '$120', unit: '/MWh', note: 'Haywards, against $62 from 1997 to 2017', tok: '--accent' },
]} />

<h2>How the price is set</h2>
<p>Every generator offers its output for each trading period, the half-hour the market is settled in: up to five blocks of megawatts per site, each at a price. Every five minutes the system operator's dispatch software stacks those offers from cheapest to most expensive and runs the cheapest combination that meets demand, allowing for transmission losses, line limits and reserves. The price at each point on the grid is what one more megawatt would cost there. In practice, that is roughly the price of the last offer needed to meet demand.</p>

<p>Two trading periods at the same time of day show the whole story. At 6 pm on Wednesday 7 August 2024 the country needed <strong>{num(s24.load)} MW</strong>. At 6 pm on Wednesday 21 January 2026 it needed {num(s26.load)} MW.</p>

<Figure caption="Every generator offer for two trading periods, cheapest first, on the same scale. Each block's width is the MW offered and its height the offer price; offers above $1,200 are drawn to the top, with a marker. The strip under each axis shows the fuel of every offer, including those at about $0." source="EMI generator offers (BidsAndOffers), final offers for the trading period; generation from EMI dispatch data; Haywards final price" wide>
	<Legend items={stackLegend} />
	<OfferStack title="6:00 pm, Wednesday 7 August 2024" blocks={s24.blocks} fuels={FUELS} load={s24.load} price={s24.price.HAY} priceName="Haywards" xmax={9000} ymax={1200} />
	<OfferStack title="6:00 pm, Wednesday 21 January 2026" blocks={s26.blocks} fuels={FUELS} load={s26.load} price={s26.price.HAY} priceName="Haywards" xmax={9000} ymax={1200} />
</Figure>

<p>In both, the first 5,500 MW or so was offered at $1/MWh or less: geothermal stations, wind farms, hydro stations that must pass water downstream anyway, and the minimum running levels of other plant. These generators want to run whatever the price, so they offer low to make sure they are dispatched, and are paid the market price like everyone else.</p>

<p>The difference is what came next. In August 2024, 4,792 MW of hydro was offered, and 1,991 MW of it was priced above $300/MWh. Most gas was priced above $300 too, and gas and diesel peakers, with some hydro, above $1,000. Meeting 6,644 MW reached offers of around $750, and Haywards cleared at <strong>$882/MWh</strong>. In January 2026, 3,626 MW of hydro was offered at $1 or less on its own. Demand never reached the expensive part of the stack, and Haywards cleared at <strong>$1.14/MWh</strong>.</p>

<p>Why would a hydro station, whose fuel falls from the sky, offer at $800? Because water used now can't be used later. Hydro generators price their stored water at what it is expected to be worth in the future, its water value. When the lakes are low partway through winter, and the spring and summer inflows that refill them are still months away, using water now risks needing expensive gas, coal or diesel later, or running out, so the water value is high. When the lakes are full and water would otherwise be spilled, it is worth almost nothing. The Authority's review of winter 2024 found that hydro offers rose as storage fell, and that they reflected genuine fuel scarcity.</p>

<h2>Thirty years of prices</h2>

<Figure caption="Average wholesale price each month at the two island reference points, October 1996 to September 2026 (not adjusted for inflation)" source="EMI final energy prices, averaged over every trading period" wide>
	<Lines xs={mxs} series={[{ name: 'Haywards (North Island)', tok: '--p-ni', values: D.months.HAY }, { name: 'Benmore (South Island)', tok: '--p-si', values: D.months.BEN, faint: true }]}
		xzero={false} xticks={[2000, 2005, 2010, 2015, 2020, 2025]} xfmt={(v) => String(Math.round(v))} titleFmt={monthOf} fmt={dollars} unit="$/MWh" height={300}
		legend={[{ name: 'Haywards (North Island)', tok: '--p-ni', kind: 'line' }, { name: 'Benmore (South Island)', tok: '--p-si', kind: 'line', faint: true }]} />
</Figure>

<p>For its first two decades the market mostly ran between $30 and $80/MWh, broken by dry years: 2001, 2003, 2005–06 and 2008, when June averaged $306. Then, from 2018, the floor lifted. Haywards averaged $62/MWh from 1997 to 2017 and $120 from 2018 to 2023. Eight months averaged above $150 in those first 21 years; eighteen did in the next six. 2024 then set the record, and 2026, so far, has been the cheapest year since 2016.</p>

<h2>Water</h2>
<p>More than half the country's electricity comes from hydro, but the lakes hold only a few weeks of winter demand. Whether they are full or empty is the biggest single influence on the price. The Authority's hydrological dataset tracks the ten main storage lakes back to 1980. Measured against the average for each date, storage fell to <strong>53% of normal</strong> in August 2024, the lowest month since October 2001.</p>

<Figure caption="Each month's average price (mean of Haywards and Benmore) against national hydro storage, 1997–2024" source="EMI final energy prices; EA Hydrological Modelling Dataset (active storage of the ten main lakes, converted to GWh with the dataset's derived storage capacity, against the 1980–2024 average for each day). The dataset ends in December 2024." wide>
	<Scatter pts={scPts} groups={[{ name: '1997–2017', tok: '--f-hvdc' }, { name: '2018–2024', tok: '--f-gas' }]}
		xmin={40} xfmt={(v) => `${num(v)}%`} yfmt={dollars} xtitle="Hydro storage, % of the average for the time of year"
		unit="$/MWh" xname="storage, % of average" yname="average price" ptLabel={(s) => monthName(s)} height={340} table={scTable} />
</Figure>

<p>The drier the lakes, the higher the price, in every era. But the whole cloud moved up after 2017. In months when storage was within 5% of normal, prices averaged <strong>$55/MWh</strong> from 1997 to 2017 and <strong>$126/MWh</strong> from 2018 to 2024. At almost every level of storage the price roughly doubled; only when the lakes were very full did it stay below $100.</p>

<h2>Gas</h2>
<p>When hydro runs short, gas and coal fill the gap, so the cost and availability of thermal fuel set the value of the water that remains. That backup has become scarce and expensive. The first shock came in spring 2018, when an outage at Pohokura, the largest gas field, coincided with low lakes and October averaged $290/MWh. Gas production then kept falling. The Authority's winter review records an average of 435 TJ a day in 2020 and 304 TJ a day in 2024, most of the fall from Pohokura, and gas spot prices rising from about $15/GJ at the start of 2024 to $54/GJ in August.</p>

<p>Prices rose even as less thermal generation ran: thermal plant supplied 27% of metered generation from 1998 to 2017, and 15% from 2018 to 2025. It is the risk of needing gas, and its price when it is needed, that sets the value of water, more than how much gas is actually burnt.</p>

<h2>Winter 2024: everything at once</h2>
<p>Winter 2024 combined both problems. According to the Authority's review, there were no significant inflows to the lakes after mid-April, and national storage fell to about 1,500 GWh in early August, a six-year low, with Pūkaki at its lowest since 1997. Gas was short. Wind output often dropped below 300 MW, and a cold snap in early August lifted demand. Every day from 3 to 10 August averaged more than $760/MWh at Haywards, peaking at <strong>$878</strong> on Wednesday 7 August, the most expensive day since the market began.</p>

<Record label="Most expensive day, Haywards" value="$878" unit="/MWh" when="Wednesday 7 August 2024 (daily average); its highest trading period, 7:30 am, cleared at $1,529" previous="$663/MWh on 17 March 2011" fuel="--f-gas" />

<p>Relief came from the demand side, then the weather. The Tiwai Point smelter cut its load by up to 185 MW, saving about 330 GWh, and Methanex halted production on 13 August and sold its gas to Genesis and Contact for generation. Heavy rain in late August and September then refilled the lakes. September averaged $74/MWh, and November $29.</p>

<h2>Summer 2025–26: more than the lakes could hold</h2>
<p>A year later the position had reversed. The Authority's security of supply snapshot for 22 December 2025 put national storage at about 138% of the historic mean and about 101% of nominally full, with 98% of that week's generation from renewables. Lakes that full have to spill, and water that would be spilled anyway has no value, so it was offered at close to nothing. December averaged $13.70/MWh at Haywards and $5.00 at Benmore. In January, 57% of trading periods cleared under $1 and the median was 35 cents.</p>

<Record label="Cheapest month, Haywards" value="$3.52" unit="/MWh" when="January 2026 (Benmore: $1.87)" previous="$13.60/MWh in February 2004" fuel="--f-hydro" />

<p>Water wasn't the only change. A run of new geothermal stations has steadily added generation that runs around the clock. Like the rest of the geothermal fleet it is offered at very low prices so that it stays on, which pushes more expensive offers further up the stack. From January to August 2026, geothermal generated <strong>6,838 GWh</strong>, 23% (1,282 GWh) more than in the same months of 2024. Wind added 203 GWh and solar 135 GWh. With hydro also up, thermal generation fell by 69%, to 5.8% of the total, its smallest share for those months since at least 1998.</p>

<Figure caption="Generation from January to August each year by fuel, with the average Haywards price over the same months above each column" source="EMI metered generation (Generation_MD); EMI final energy prices">
	<Columns cats={mixYears} series={mixSeries} stacked tops={D.mix.price.map((v) => `$${v}`)} unit="GWh" height={290} label="January–August"
		fmt={(v) => `${num(v)} GWh`} />
</Figure>

<p>Even the futures market didn't see how far prices would fall. On 20 January 2026, with spot prices at a few dollars, the Authority's snapshot reported forward prices for June 2026 of about $170/MWh at Benmore and $194/MWh at Ōtāhuhu, on the expectation that winter would bring the usual squeeze. June 2026 averaged <strong>$35/MWh</strong> at Benmore and $41/MWh at Ōtāhuhu.</p>

<h2>An all-or-nothing market</h2>
<p>As more low-priced generation is built, the price spends more time at the extremes. One way to see it is to count, each year, how many trading periods cleared under $1/MWh, when there was more cheap supply than needed, and how many cleared over $300/MWh, when supply was tight.</p>

<p>Until 2021, prices under $1 were rare: fewer than 1 trading period in 30 in most years, a little more in the wet years of 2009–2011. Since 2022 they have become common, about 1 in 9 in 2022 and 2025 and 1 in 7 so far in 2026. Prices over $300 have become more common too, reaching 1 in 6 trading periods in 2024. 2025 had plenty of both: 11% of trading periods under $1 and 13% over $300, almost all of the expensive ones between February and May.</p>

<Figure caption="Share of trading periods each year with a Haywards price under $1/MWh and over $300/MWh (* 2026 is January to September)" source="EMI final energy prices">
	<Columns cats={extYears} xlabels={extX} series={[{ name: 'Under $1/MWh', tok: '--f-hydro', values: D.extremes.low }, { name: 'Over $300/MWh', tok: '--f-gas', values: D.extremes.high }]}
		unit="% of trading periods" height={240} fmt={(v) => `${v.toFixed(1)}%`} label="Year" />
</Figure>

<h2>Where the money is made</h2>
<p>Every generator is paid the price of the trading period for what it generates, so the spot market's takings for a year are each trading period's generation multiplied by its price. On the grid that came to <strong>$8.6 billion</strong> in 2024 and $4.8 billion in 2022, for almost exactly the same amount of electricity, about 41 TWh each year.</p>

<p>Very little of that money is earned in the cheap periods. In 2024, the quarter of trading periods that cleared under $50/MWh brought in 1.4% of the year's revenue. The 4.5% that cleared over $500 brought in <strong>20%</strong>, $1.7 billion, more than everything earned under $150. Most years the money comes from the long middle: the $150–300 band earned between 42% and 67% of revenue in 2021–2025. In 2026 so far, with half of all trading periods under $50, the spot market has taken $2.0 billion in nine months.</p>

<Figure caption="Each year, the share of trading periods spent in each price band (time) against the share of the spot market's revenue earned in it (money), with the year's total (* 2026 is January to September)" source="Elenz half-hourly history: grid generation from EMI dispatch data, paid at the island reference price (Haywards or Benmore); EMI final energy prices" wide>
	<TimeMoney rows={moneyRows} bands={MO.bands} />
</Figure>

<p>New Zealand's high prices tend to come in runs, through a dry month or a gas shortage, rather than in single spikes, so no one depends on a handful of half-hours. Across 2021–2025, the most expensive 1% of each year's trading periods earned between 3% and 6.4% of revenue, and the most expensive 5% about 17%. Who earns that money differs by fuel. Diesel peakers, which run only when prices are high, earned 83% of their revenue in the most expensive 5% of trading periods. Wind earned just 11% there: high prices often coincide with calm spells, when wind farms have little to sell.</p>

<Figure caption="Share of each fuel's 2021–2025 spot revenue earned in the most expensive 5% of each year's trading periods" source="Elenz half-hourly history: grid generation from EMI dispatch data, paid at the island reference price; EMI final energy prices. Batteries earned about $2 million over the period">
	<HBars rows={relRows} fmt={(v) => `${v.toFixed(0)}%`} label="Fuel" valueLabel="Share of revenue in the dearest 5% of trading periods" />
</Figure>

<p>This is spot revenue, before contracts. Most generation is sold forward through hedges and to the generators' own retail customers at agreed prices, so a generator's income swings far less than these totals. But the spot price is what those contracts are priced against, and what any electricity that isn't covered by a contract earns.</p>

<h2>The shape of the day</h2>
<p>Prices follow demand through the day: cheapest in the small hours, with a morning peak and a bigger evening one. For most of the market's history that shape barely changed. In most years the morning peak came at 7:30 or 8 am, the evening peak between 5:30 and 6:30 pm, and the cheapest time between 3:30 and 4:30 am. The middle of the day sat a little above the day's average: from 1997 to 2022 the price from noon to 3 pm ran at 97–112% of the year's average.</p>

<p>That has started to change. In 2023–2025 the middle of the day slipped just below average, and in 2026 it fell to <strong>79%</strong> of it, the lowest of the 30 years, while the morning and evening peaks rose to about one and a half times the average. Solar farms, rooftop panels and spilling hydro all push the middle of the day down; the evening peak still needs water or gas. Noon to 3 pm averaged $51/MWh in 2026, against $89 from 5 to 8 pm.</p>

<Figure caption="Average Haywards price by time of day, one row per year since 1997 (2026 is January to September). Each row is drawn as a share of that year's own average, so the rows compare the shape of the day rather than the price level; hover for the price." source="EMI final energy prices, by trading period (each point is the trading period starting at that time)" wide>
	<Ridgeline rows={ridgeRows} xs={hxs} xticks={[0, 3, 6, 9, 12, 15, 18, 21]} xfmt={(v) => clock(v)} titleFmt={(v) => `trading period from ${clock(v)}`} fmt={dollars} label="Year"
		band={[12, 15]} bandLabel="noon–3 pm" />
</Figure>

<h2>Where you are</h2>
<p>There isn't one wholesale price but one at each of about 250 points on the grid. Power loses some energy on its way along the lines, and when a line is full, cheaper generation on one side can't reach the other. Over the past year (October 2025 to September 2026) the cheapest point was Manapōuri, at $49/MWh, and the most expensive Kikiwa, near Nelson, at $69. Haywards ran at least $10 above Benmore in 12% of trading periods, mostly when the HVDC link or the lines north were carrying all they could; the reverse happened in under 1%.</p>

<Figure caption="Average price at selected grid points, October 2025 to September 2026" source="EMI final energy prices">
	<HBars rows={nodeRows} fmt={(v) => `$${v.toFixed(0)}`} label="Grid point" valueLabel="Average price ($/MWh)"
		legend={[{ name: 'North Island', tok: '--p-ni' }, { name: 'South Island', tok: '--p-si' }]} />
</Figure>

<h2>From the wholesale price to the power bill</h2>
<p>The wholesale price is only part of a power bill, and it reaches the bill slowly. The Authority collects a breakdown from each large retailer of what it earns for every MWh it sells to households and small businesses, before GST. For the four generator-retailers in the year to June 2025, that averaged <strong>$299/MWh</strong>, or 29.9 cents a kWh. About half, $156, paid for the electricity itself. Lines charges took $121 (40%), metering $13 and industry levies $2, leaving $6.50 to cover the cost of running the retail business and any profit.</p>

<Figure caption="What the four generator-retailers (Contact, Genesis, Mercury and Meridian) earned per MWh sold to households and small businesses, by component, before GST, with the average Haywards wholesale price over the same year" source="EA retail gross margin disclosures (weighted by each retailer's MWh sold); EMI final energy prices">
	<Columns cats={rrCats} xlabels={rrX} series={rrSeries} stacked unit="$/MWh" height={280} label="Financial year" fmt={(v) => `$${v.toFixed(0)}/MWh`}
		marks={{ name: 'Haywards wholesale average', tok: '--ink', values: RR.spot, fmt: (v) => `$${v.toFixed(0)}/MWh` }} />
</Figure>

<p>The electricity part moves much more slowly than the spot price. Over those four years it rose steadily, from $106 to $156/MWh, while the Haywards average for the same years went from $136 to $80, then $175 and $193. Retailers buy most of what they sell at prices agreed in advance, from their own power stations or through contracts, so a dry year raises their costs over the years that follow rather than all at once, and a wet year doesn't cut them at once either. Over the same years the retail margin shrank from $36 to $6.50/MWh, as costs rose faster than the prices retailers charged.</p>

<p>Household prices show the same lag. Across the Authority's 39 network regions, a standard household's price per kWh averaged 28.6 cents including GST in January 2025 and 32.4 cents in May 2026, up 13%. In between, the monthly wholesale price fell from $320/MWh in April 2025 to $3.52 in January 2026. Lines charges, about 42% of a household bill, rose when the lines companies' new regulated price limits began in April 2025. A summer of almost free wholesale power never showed up on household bills.</p>

<Figure caption="A standard household's price per kWh (average of all network regions, before GST) against the monthly Haywards wholesale price, both in $/MWh" source="EA regional power prices (standard users, variable price per kWh); EMI final energy prices" wide>
	<Lines xs={bxs} series={[{ name: 'Household price per kWh, before GST', tok: '--accent', values: D.bills.household }, { name: 'Haywards wholesale, monthly average', tok: '--p-ni', values: D.bills.hay }]}
		xticks={bxs.filter((i) => i % 3 === 0)} xfmt={billTick} titleFmt={billMonth} fmt={dollars} unit="$/MWh" height={260}
		legend={[{ name: 'Household price per kWh, before GST', tok: '--accent', kind: 'line' }, { name: 'Haywards wholesale, monthly average', tok: '--p-ni', kind: 'line' }]} />
</Figure>

<h2>What to watch</h2>
<p>The price will keep following the lakes and the gas fields. New geothermal, wind and solar make wet, mild periods cheaper and more often near zero. They do less for a dry winter evening with little wind, when the price is still set by water values and the cost of thermal backup.</p>

<p>That backup will be there for a while yet. Genesis, Contact, Meridian and Mercury agreed in 2025 to keep capacity from Huntly's coal-capable Rankine units available as a reserve for dry years until the end of 2035, an arrangement the Commerce Commission authorised in November 2025. Huntly also matters to the grid in its own right, as one of the few large stations near Auckland. So the next dry year will turn less on whether there is backup than on what it costs: how much gas is left, how big the coal stockpile is, and how quickly batteries and demand response grow.</p>

<Note title="How these figures are measured">
	<ul>
		<li><strong>Prices</strong> are the Electricity Authority's final energy prices. Averages give every trading period equal weight (they aren't weighted by demand) and are in the dollars of the day, not adjusted for inflation. Haywards and Benmore are the North and South Island reference points.</li>
		<li><strong>Hydro storage</strong> comes from the Authority's Hydrological Modelling Dataset, which covers the ten main lakes up to December 2024. Each day is compared with the 1980–2024 average for that date. The Authority's own storage figures are worked out differently, so its numbers (about 1,500 GWh in early August 2024) are higher than this series; the comparison with each date's average is what matters here. Storage after 2024, and the forward prices, come from the Authority's weekly security of supply snapshots.</li>
		<li><strong>Generation by fuel</strong> is metered generation from the Authority's Generation_MD files.</li>
		<li><strong>Spot revenue</strong> multiplies each trading period's grid generation (dispatch data, so not embedded generation) by its island's reference price: Haywards for the North Island, Benmore for the South. Real payments use each station's own node price and metered output, so the totals are approximate.</li>
		<li><strong>Retail figures</strong> are the Authority's retail gross margin disclosures (each retailer's financial year, which ends in June for the four generator-retailers; before GST) and its regional power prices (the average of every network region's standard-user price per kWh, including GST; the chart shows it before GST, in dollars per MWh). The electricity cost in the disclosures is what each retailer reports; for the generator-retailers it can include an internal transfer price between their generation and retail businesses.</li>
		<li><strong>The offer stacks</strong> add up every generator's final offers for the trading period, limited to what each could actually produce. The real dispatch also allows for transmission limits, losses and reserves, so the stacks show how the price is set rather than reproducing it exactly.</li>
	</ul>
	<p>Sources: EMI final energy prices, generator offers, metered generation and the Hydrological Modelling Dataset; the Authority's <a href="https://www.ea.govt.nz/documents/7069/Review_of_winter_2024.pdf">Review of winter 2024</a> (April 2025); its security of supply snapshots of <a href="https://www.ea.govt.nz/documents/9072/Security_of_Supply_Snapshot_-_22_December_2025.pdf">22 December 2025</a> and <a href="https://www.ea.govt.nz/documents/9192/Security_of_Supply_Snapshot_-_20_January_2026.pdf">20 January 2026</a>; the Authority's <a href="https://www.ea.govt.nz/industry/monitoring/retail-gross-margin">retail gross margin</a> and regional power price data; and the Commerce Commission's <a href="https://www.comcom.govt.nz/news-and-media/news-and-events/2025/commission-authorises-gentailers-application-for-strategic-energy-reserve-huntly-firming-option/">authorisation of the Huntly firming option</a> (November 2025).</p>
</Note>
