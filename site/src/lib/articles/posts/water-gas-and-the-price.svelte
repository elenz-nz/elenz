<script module lang="ts">
	export const meta = {
		title: 'Water, gas and the price',
		dek: 'Why would a hydro station, whose fuel falls from the sky, offer its power at $800/MWh? Because of what its water might be worth later, and that depends on how full the lakes are and how scarce gas has become.',
		date: '2026-10-16',
		kind: 'Analysis',
		draft: true,
		series: 'wholesale-market',
		part: 3,
		image: '/articles/water-gas-and-the-price.png',
	} as const;
</script>

<script lang="ts">
	// Part 3 of "Inside the wholesale market". Figures from analysis/wholesale_prices.py (see #lib/articles/series/wholesale.ts).
	import Figure from '#lib/articles/Figure.svelte';
	import Note from '#lib/articles/Note.svelte';
	import Stats from '#lib/articles/Stats.svelte';
	import PriceCover from '#lib/articles/PriceCover.svelte';
	import Scatter from '#lib/articles/charts/Scatter.svelte';
	import { num } from '#lib/articles/charts/util.js';
	import { D, dollars, monthName, cover, PARTS } from '#lib/articles/series/wholesale.js';

	const C = cover(3, ['Water, gas and', 'the price']);
	const sc = D.scatter;
	const scPts = sc.pts as [number, number, number, string][];
	const scTable = {
		head: ['Storage, % of average for the date', 'Average price 1997–2017', 'Months', 'Average price 2018–2024', 'Months'],
		rows: sc.bands.map((b, i) => [b, dollars(sc.before[i] ?? 0), String(sc.n_before[i]), dollars(sc.after[i] ?? 0), String(sc.n_after[i])]),
	};
</script>

<PriceCover {...C} />

<p>More than half of New Zealand's electricity comes from hydro stations, and their fuel is free. Yet in a dry winter they offer much of their output at hundreds of dollars a megawatt-hour, and set the price for everyone. This part explains why, and why the price has run about twice as high since 2018 even with the lakes at normal levels.</p>

<Stats items={[
	{ label: 'Lakes at normal, 1997–2017', value: '$55', unit: '/MWh', note: 'average price in months with storage within 5% of normal', tok: '--f-hvdc' },
	{ label: 'Lakes at normal, 2018–2024', value: '$126', unit: '/MWh', note: 'the same lake levels, more than twice the price', tok: '--f-gas' },
	{ label: 'August 2024 storage', value: '53%', note: 'of normal for the time of year, the lowest month since 2001', tok: '--f-hydro' },
]} />

<h2>The value of water</h2>
<p>Water used now can't be used later. A hydro generator with a lake behind its dam is always choosing between running today and saving the water for a day when it will be worth more. So it offers its output at the price it expects that water to fetch later: its water value.</p>

<p>The main lakes, Pūkaki, Tekapo, Taupō, Manapōuri and Te Anau among them, hold only a few weeks of the country's winter demand. They fill with spring snowmelt and rain and draw down through autumn and winter, when inflows are low and demand is high. When they are low partway through winter, with the spring and summer inflows that refill them still months away, every unit of water saved is insurance against running short. Using it now risks needing expensive gas, coal or diesel later, or running out, so the water value is high. When the lakes are full and water would otherwise be spilled over the dams, it is worth almost nothing, and is offered that way.</p>

<p>The market's rules expect this. The Code's trading conduct rule (clause 13.5A) requires every offer to be what a generator acting rationally would offer if no generator could exercise significant market power, so a hydro offer has to be explainable by what the water is worth. The Authority's review of winter 2024 found exactly this: hydro offers rose as storage fell, the offers were consistent with the trading conduct rule, and they reflected genuine scarcity of fuel.</p>

<h2>Lakes and prices, month by month</h2>
<p>The Authority's hydrological dataset tracks the ten main storage lakes back to 1980. Measured against the average for each date, storage fell to <strong>53% of normal</strong> in August 2024, the lowest month since October 2001. Plotted against the price, the pattern is plain.</p>

<Figure caption="Each month's average price (mean of Haywards and Benmore) against national hydro storage, 1997–2024" source="EMI final energy prices; EA Hydrological Modelling Dataset (active storage of the ten main lakes, converted to GWh with the dataset's derived storage capacity, against the 1980–2024 average for each day). The dataset ends in December 2024." wide>
	<Scatter pts={scPts} groups={[{ name: '1997–2017', tok: '--f-hvdc' }, { name: '2018–2024', tok: '--f-gas' }]}
		xmin={40} xfmt={(v) => `${num(v)}%`} yfmt={dollars} xtitle="Hydro storage, % of the average for the time of year"
		unit="$/MWh" xname="storage, % of average" yname="average price" ptLabel={(s) => monthName(s)} height={340} table={scTable} />
</Figure>

<p>The drier the lakes, the higher the price, in every era. But the whole cloud moved up after 2017. In months when storage was within 5% of normal, prices averaged <strong>$55/MWh</strong> from 1997 to 2017 and <strong>$126/MWh</strong> from 2018 to 2024. At almost every level of storage the price roughly doubled; only when the lakes were very full did it stay below $100.</p>

<h2>Gas, the backup</h2>
<p>When hydro runs short, gas and coal fill the gap, so the cost and availability of thermal fuel set the value of the water that remains. That backup has become scarce and expensive. The first shock came in spring 2018, when an outage at Pohokura, the largest gas field, coincided with low lakes and October averaged $290/MWh. Gas production then kept falling. The Authority's winter review records an average of 435 TJ a day in 2020 and 304 TJ a day in 2024, most of the fall from Pohokura, and gas spot prices rising from about $15/GJ at the start of 2024 to $54/GJ in August.</p>

<p>Prices rose even as less thermal generation ran: thermal plant supplied 27% of metered generation from 1998 to 2017, and 15% from 2018 to 2025. It is the risk of needing gas, and its price when it is needed, that sets the value of water, more than how much gas is actually burnt. Dry-year backup is set to stay: the big four generators have agreed to keep capacity from Huntly's coal-capable Rankine units in reserve until the end of 2035. What that backup costs, and how much gas is left to run it, will go on shaping the price in every dry year. <a href={PARTS.extremes}>Part 4</a> shows what happened when low lakes and short gas arrived together in 2024.</p>

<Note title="How these figures are measured">
	<ul>
		<li><strong>Prices</strong> are the Electricity Authority's final energy prices, each month's average of Haywards and Benmore, in the dollars of the day.</li>
		<li><strong>Hydro storage</strong> comes from the Authority's Hydrological Modelling Dataset, which covers the ten main lakes up to December 2024. Each lake's active storage is converted to energy with the dataset's derived storage capacities, and each day is compared with the 1980–2024 average for that date. The Authority's own storage figures are worked out differently, so its numbers (about 1,500 GWh in early August 2024) are higher than this series; the comparison with each date's average is what matters here.</li>
		<li><strong>Thermal share</strong> is gas, coal and diesel as a share of metered generation (Generation_MD).</li>
	</ul>
	<p>Sources: EMI final energy prices, metered generation and the Hydrological Modelling Dataset; the Authority's <a href="https://www.ea.govt.nz/documents/7069/Review_of_winter_2024.pdf">Review of winter 2024</a> (April 2025); the Commerce Commission's <a href="https://www.comcom.govt.nz/news-and-media/news-and-events/2025/commission-authorises-gentailers-application-for-strategic-energy-reserve-huntly-firming-option/">authorisation of the Huntly firming option</a> (November 2025).</p>
</Note>
