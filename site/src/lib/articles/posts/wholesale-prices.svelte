<script module lang="ts">
	export const meta = {
		title: 'What sets the wholesale price',
		dek: 'In seventeen months New Zealand had its most expensive month and its cheapest since the market began in 1996. Water, gas and a wave of new geothermal explain both, and show how the price is set.',
		date: '2026-10-16',
		kind: 'Analysis',
		draft: true,
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
	import Scatter from '#lib/articles/charts/Scatter.svelte';
	import OfferStack from '#lib/articles/charts/OfferStack.svelte';
	import Legend from '#lib/articles/charts/Legend.svelte';
	import { num } from '#lib/articles/charts/util.js';
	import D from '#lib/articles/data/wholesale-prices.json';

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
	const P = D.profile as { [y: string]: number[] };
	const profSeries = ['2022', '2023', '2024', '2025', '2026'].map((y) => ({
		name: y === '2026' ? '2026 (Jan–Sep)' : y, values: P[y],
		tok: y === '2026' ? '--accent' : y === '2024' ? '--f-gas' : '--f-hvdc', faint: y !== '2026' && y !== '2024',
	}));

	const SI = new Set(['MAN2201', 'INV2201', 'BEN2201', 'ISL2201', 'KIW2201']);
	const nodeRows = [...D.nodes].sort((a, b) => b.price - a.price)
		.map((n) => ({ label: n.name, value: n.price, tok: SI.has(n.poc) ? '--p-si' : '--p-ni' }));
</script>

<p>In August 2024 the wholesale price of electricity at Haywards, the North Island's reference point, averaged <strong>$465/MWh</strong>, the highest of any month since the market opened in October 1996. Seventeen months later, in January 2026, it averaged <strong>$3.52/MWh</strong>, the lowest. Nothing about the market's rules changed in between. What changed was how much water was in the lakes, how much gas there was to burn, and how much new generation had been built. This piece uses the Electricity Authority's market data to show how the price is set, and why it swings so far.</p>

<Stats items={[
	{ label: 'Most expensive month', value: '$465', unit: '/MWh', note: 'August 2024, Haywards average', tok: '--f-gas' },
	{ label: 'Cheapest month', value: '$3.52', unit: '/MWh', note: 'January 2026, Haywards average', tok: '--f-hydro' },
	{ label: 'Under $1', value: '57%', note: 'of trading periods in January 2026', tok: '--f-geo' },
	{ label: 'Average, 2018–2023', value: '$120', unit: '/MWh', note: 'Haywards, against $62 from 1997 to 2017', tok: '--accent' },
]} />

<h2>How the price is set</h2>
<p>Every generator offers its output for each trading period, the half-hour the market is settled in: up to five blocks of megawatts per unit, each at a price. Every five minutes the system operator's dispatch software stacks those offers from cheapest to dearest and runs the cheapest combination that meets demand, allowing for transmission losses, line limits and reserves. The price at each point on the grid is what one more megawatt would cost there. In practice, that is roughly the price of the last offer needed to meet demand.</p>

<p>Two trading periods at the same time of day show the whole story. At 6 pm on Wednesday 7 August 2024 the country needed <strong>{num(s24.load)} MW</strong>. At 6 pm on Wednesday 21 January 2026 it needed {num(s26.load)} MW.</p>

<Figure caption="Every generator offer for two trading periods, cheapest first, on the same scale. Each block's width is the MW offered and its height the offer price; offers above $1,200 are drawn to the top, with a marker. The strip under each axis shows the fuel of every offer, including those at about $0." source="EMI generator offers (BidsAndOffers), final offers for the trading period; generation from EMI dispatch data; Haywards final price" wide>
	<Legend items={stackLegend} />
	<OfferStack title="6:00 pm, Wednesday 7 August 2024" blocks={s24.blocks} fuels={FUELS} load={s24.load} price={s24.price.HAY} priceName="Haywards" xmax={9000} ymax={1200} />
	<OfferStack title="6:00 pm, Wednesday 21 January 2026" blocks={s26.blocks} fuels={FUELS} load={s26.load} price={s26.price.HAY} priceName="Haywards" xmax={9000} ymax={1200} />
</Figure>

<p>In both, the first 5,500 MW or so was offered at $1/MWh or less: geothermal stations, wind farms, river stations that must pass the water downstream anyway, and the minimum running levels of other plant. These generators want to run whatever the price, so they offer low to make sure they are dispatched, and are paid the market price like everyone else.</p>

<p>The difference is what came next. In August 2024, 4,792 MW of hydro was offered, and 1,991 MW of it was priced above $300/MWh. Most gas was priced above $300 too, and gas and diesel peakers, with some hydro, above $1,000. Meeting 6,644 MW reached offers of around $750, and Haywards cleared at <strong>$882/MWh</strong>. In January 2026, 3,626 MW of hydro was offered at $1 or less on its own. Demand never reached the expensive part of the stack, and Haywards cleared at <strong>$1.14/MWh</strong>.</p>

<p>Why would a hydro station, whose fuel falls from the sky, offer at $800? Because water used now can't be used later. Hydro generators price their stored water at what it is expected to be worth in the future, its water value. When the lakes are low and winter is ahead, using water now risks needing expensive gas, coal or diesel later, or running out, so the water value is high. When the lakes are full and water would otherwise be spilled, it is worth almost nothing. The Authority's review of winter 2024 found that hydro offers rose as storage fell, and that they reflected genuine fuel scarcity.</p>

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
<p>The reason is the backup. When hydro runs short, gas and coal fill the gap, so the cost and availability of thermal fuel set the value of the water that remains. That backup has become scarce and dear. The first shock came in spring 2018, when an outage at Pohokura, the largest gas field, coincided with low lakes and October averaged $290/MWh. Gas production then kept falling. The Authority's winter review records an average of 435 TJ a day in 2020 and 304 TJ a day in 2024, most of the fall from Pohokura, and gas spot prices rising from about $15/GJ at the start of 2024 to $54/GJ in August.</p>

<p>Prices rose even as less thermal generation ran: thermal plant supplied 27% of metered generation from 1998 to 2017, and 15% from 2018 to 2025. It is the risk of needing gas, and its price when it is needed, that sets the value of water, more than how much gas is actually burnt.</p>

<h2>Winter 2024: everything at once</h2>
<p>Winter 2024 combined both problems. According to the Authority's review, there were no significant inflows to the lakes after mid-April, and national storage fell to about 1,500 GWh in early August, a six-year low, with Pūkaki at its lowest since 1997. Gas was short. Wind output often dropped below 300 MW, and a cold snap in early August lifted demand. Every day from 3 to 10 August averaged more than $760/MWh at Haywards, peaking at <strong>$878</strong> on Wednesday 7 August, the most expensive day since the market began.</p>

<Record label="Most expensive day, Haywards" value="$878" unit="/MWh" when="Wednesday 7 August 2024 (daily average); its highest trading period, 7:30 am, cleared at $1,529" previous="$663/MWh on 17 March 2011" fuel="--f-gas" />

<p>Relief came from the demand side, then the weather. The Tiwai Point smelter cut its load by up to 185 MW, saving about 330 GWh, and Methanex halted production on 13 August and sold its gas to Genesis and Contact for generation. Heavy rain in late August and September then refilled the lakes. September averaged $74/MWh, and November $29.</p>

<h2>Summer 2025–26: more than the lakes could hold</h2>
<p>A year later the position had reversed. The Authority's security of supply snapshot for 22 December 2025 put national storage at about 138% of the historic mean and about 101% of nominally full, with 98% of that week's generation from renewables. Lakes that full have to spill, and water that would be spilled anyway has no value, so it was offered at close to nothing. December averaged $13.70/MWh at Haywards and $5.00 at Benmore. In January, 57% of trading periods cleared under $1 and the median was 35 cents.</p>

<Record label="Cheapest month, Haywards" value="$3.52" unit="/MWh" when="January 2026 (Benmore: $1.87)" previous="$13.60/MWh in February 2004" fuel="--f-hydro" />

<p>Water wasn't the only change. A run of new geothermal stations has steadily added generation that runs around the clock at almost no marginal cost. From January to August 2026, geothermal generated <strong>6,838 GWh</strong>, 23% (1,282 GWh) more than in the same months of 2024. Wind added 203 GWh and solar 135 GWh. With hydro also up, thermal generation fell by 69%, to 5.8% of the total, its smallest share for those months since at least 1998.</p>

<Figure caption="Generation from January to August each year by fuel, with the average Haywards price over the same months above each column" source="EMI metered generation (Generation_MD); EMI final energy prices">
	<Columns cats={mixYears} series={mixSeries} stacked tops={D.mix.price.map((v) => `$${v}`)} unit="GWh" height={290} label="January–August"
		fmt={(v) => `${num(v)} GWh`} />
</Figure>

<p>Even the futures market didn't see how far prices would fall. On 20 January 2026, with spot prices at a few dollars, the Authority's snapshot reported forward prices for June 2026 of about $170/MWh at Benmore and $194/MWh at Ōtāhuhu, on the expectation that winter would bring the usual squeeze. June 2026 averaged <strong>$35/MWh</strong> at Benmore and $41/MWh at Ōtāhuhu.</p>

<h2>An all-or-nothing market</h2>
<p>As more zero-priced generation is built, the price spends more time at the extremes. Before 2021, prices fell below $1/MWh in more than 3% of trading periods only in the wet years of 2009–2011. They have done so every year since 2022, and in 11–13% of trading periods in 2022, 2025 and 2026. Meanwhile dry spells have pushed the share above $300/MWh to new highs: 16% in 2024. 2025 had both: 11% of trading periods under $1 and 13% over $300, almost all of the expensive ones between February and May.</p>

<Figure caption="Share of trading periods each year with a Haywards price under $1/MWh and over $300/MWh (* 2026 is January to September)" source="EMI final energy prices">
	<Columns cats={extYears} xlabels={extX} series={[{ name: 'Under $1/MWh', tok: '--f-hydro', values: D.extremes.low }, { name: 'Over $300/MWh', tok: '--f-gas', values: D.extremes.high }]}
		unit="% of trading periods" height={240} fmt={(v) => `${v.toFixed(1)}%`} label="Year" />
</Figure>

<h2>The shape of the day</h2>
<p>Prices follow demand through the day, with a morning and an evening peak. The level of the whole curve moves far more than its shape, but the shape is changing too. In 2026 the price from noon to 3 pm averaged <strong>$51/MWh</strong>, 57% of the evening price from 5 to 8 pm ($89). From 2022 to 2025 the afternoon ran at 79–89% of the evening. Solar farms, rooftop panels and spilling hydro all push the middle of the day down, while the evening peak still needs water or gas.</p>

<Figure caption="Average Haywards price by time of day, each year" source="EMI final energy prices, by trading period (each point is the trading period starting at that time)" wide>
	<Lines xs={hxs} series={profSeries} xticks={[0, 3, 6, 9, 12, 15, 18, 21]} xfmt={(v) => clock(v)} titleFmt={(v) => `Trading period from ${clock(v)}`} fmt={dollars} unit="$/MWh" height={280}
		legend={[{ name: '2026 (Jan–Sep)', tok: '--accent', kind: 'line' }, { name: '2024', tok: '--f-gas', kind: 'line' }, { name: '2022, 2023 and 2025', tok: '--f-hvdc', kind: 'line', faint: true }]} />
</Figure>

<h2>Where you are</h2>
<p>There isn't one wholesale price but one at each of about 250 points on the grid. Power loses some energy on its way along the lines, and when a line is full, cheaper generation on one side can't reach the other. Over the past year (October 2025 to September 2026) the cheapest point was Manapōuri, at $49/MWh, and the dearest Kikiwa, near Nelson, at $69. Haywards ran at least $10 above Benmore in 12% of trading periods, mostly when the HVDC link or the lines north were carrying all they could; the reverse happened in under 1%.</p>

<Figure caption="Average price at selected grid points, October 2025 to September 2026" source="EMI final energy prices">
	<HBars rows={nodeRows} fmt={(v) => `$${v.toFixed(0)}`} label="Grid point" valueLabel="Average price ($/MWh)"
		legend={[{ name: 'North Island', tok: '--p-ni' }, { name: 'South Island', tok: '--p-si' }]} />
</Figure>

<h2>What to watch</h2>
<p>The price will keep following the lakes and the gas fields. New geothermal, wind and solar make wet, mild periods cheaper and more often near zero. They do less for a dry winter evening with little wind, when the price is still set by water values and the cost of thermal backup. How much gas is left, how batteries and demand response grow, and what replaces Huntly's role as the backstop will decide how high the next dry year goes.</p>

<Note title="How these figures are measured">
	<p>Prices are the Electricity Authority's final energy prices, averaged over trading periods (not weighted by demand) and in dollars of the day, not adjusted for inflation. Haywards and Benmore are the island reference points. Storage is from the Authority's Hydrological Modelling Dataset, which ends in December 2024: the ten main lakes' active storage, converted to energy with the dataset's derived storage capacities and compared with the 1980–2024 average for each date. The Authority's own figures (1,500 GWh in August 2024) cover more storage and differ slightly. Storage figures after 2024 and forward prices are from the Authority's weekly security of supply snapshots. Generation by fuel is metered generation (Generation_MD). The offer stacks add up every final energy offer for the trading period, capped at each unit's maximum output and, for wind and solar, its forecast potential; they ignore transmission limits, losses and reserves, which the dispatch takes into account, so they show how the price is set rather than reproduce it exactly.</p>
	<p>Sources: EMI final energy prices, generator offers, metered generation and the Hydrological Modelling Dataset; the Authority's <a href="https://www.ea.govt.nz/documents/7069/Review_of_winter_2024.pdf">Review of winter 2024</a> (April 2025) and security of supply snapshots of <a href="https://www.ea.govt.nz/documents/9072/Security_of_Supply_Snapshot_-_22_December_2025.pdf">22 December 2025</a> and <a href="https://www.ea.govt.nz/documents/9192/Security_of_Supply_Snapshot_-_20_January_2026.pdf">20 January 2026</a>.</p>
</Note>
