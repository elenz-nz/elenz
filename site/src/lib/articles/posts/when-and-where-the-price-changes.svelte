<script module lang="ts">
	export const meta = {
		title: 'When and where the price changes',
		dek: 'For 30 years the wholesale price followed the same daily shape, with the middle of the day a little above average. In 2026 midday became the cheapest part of the day after the small hours. And the price differs across the grid, from $49/MWh at Manapōuri to $65 north of Auckland.',
		date: '2026-10-16',
		kind: 'Analysis',
		draft: true,
		series: 'wholesale-market',
		part: 7,
		image: '/articles/when-and-where-the-price-changes.png',
		imageLight: '/articles/when-and-where-the-price-changes-light.png',
	} as const;
</script>

<script lang="ts">
	// Part 7 of "Inside the wholesale market". Figures from analysis/wholesale_prices.py (see #lib/articles/series/wholesale.ts).
	import Figure from '#lib/articles/Figure.svelte';
	import Note from '#lib/articles/Note.svelte';
	import Stats from '#lib/articles/Stats.svelte';
	import PriceCover from '#lib/articles/PriceCover.svelte';
	import Ridgeline from '#lib/articles/charts/Ridgeline.svelte';
	import HBars from '#lib/articles/charts/HBars.svelte';
	import { D, dollars, cover } from '#lib/articles/series/wholesale.js';
	import PartLink from '#lib/articles/series/PartLink.svelte';

	const C = cover(7, ['When and where', 'the price changes']);
	const hxs = Array.from({ length: 48 }, (_, i) => i / 2);
	const clock = (h: number) => { const hh = Math.floor(h) % 24, half = h % 1 !== 0; return `${hh % 12 || 12}${half ? ':30' : ''} ${hh < 12 ? 'am' : 'pm'}`; };
	const P = D.profile as { years: number[]; values: number[][] };
	const ridgeRows = P.years.map((y, i) => ({
		name: y === 2026 ? '2026*' : String(y), values: P.values[i].map((v) => (v === null ? NaN : v)),
		tok: y === 2026 ? '--accent' : y === 2024 ? '--f-gas' : '--f-hvdc', strong: y === 2026 || y === 2024,
	}));
	const SI = new Set(['MAN2201', 'INV2201', 'BEN2201', 'ISL2201', 'STK2201']);
	const nodeRows = [...D.nodes].sort((a, b) => b.price - a.price)
		.map((n) => ({ label: n.name, value: n.price, tok: SI.has(n.poc) ? '--p-si' : '--p-ni' }));
</script>

<PriceCover {...C} />

<p>The wholesale price isn't one number. It changes through the day as demand rises and falls, and it differs from one end of the grid to the other. This part looks at both: a daily shape that held for almost 30 years before starting to change, and the gap between the cheapest and most expensive points on the grid.</p>

<Stats items={[
	{ label: 'Midday price, 2026', value: '79%', note: 'of the year’s average, noon to 3 pm; 97–112% every year to 2022', tok: '--accent' },
	{ label: 'Cheapest grid point', value: '$49', unit: '/MWh', note: 'Manapōuri, October 2025 to September 2026', tok: '--p-si' },
	{ label: 'Most expensive', value: '$65', unit: '/MWh', note: 'Wellsford, north of Auckland, over the same year', tok: '--f-gas' },
]} />

<h2>The shape of the day</h2>
<p>Prices follow demand through the day: cheapest in the small hours, with a morning peak and a bigger evening one. For most of the market's history that shape barely changed. In most years the morning peak came at 7:30 or 8 am, the evening peak between 5:30 and 6:30 pm, and the cheapest time between 3:30 and 4:30 am. The middle of the day sat a little above the day's average: from 1997 to 2022 the price from noon to 3 pm ran at 97–112% of the year's average.</p>

<Figure caption="Average Haywards price by time of day, one row per year since 1997 (2026 is January to September). Each row is drawn as a share of that year's own average, so the rows compare the shape of the day rather than the price level; hover for the price." source="EMI final energy prices, by trading period (each point is the trading period starting at that time)" wide>
	<Ridgeline rows={ridgeRows} xs={hxs} xticks={[0, 3, 6, 9, 12, 15, 18, 21]} xfmt={(v) => clock(v)} titleFmt={(v) => `trading period from ${clock(v)}`} fmt={dollars} label="Year"
		band={[12, 15]} bandLabel="noon–3 pm" />
</Figure>

<p>That has started to change. In 2023–2025 the middle of the day slipped just below average, and in 2026 it fell to <strong>79%</strong> of it, the lowest of the 30 years, while the morning and evening peaks rose to about one and a half times the average. Solar farms, rooftop panels and spilling hydro all push the middle of the day down; the evening peak still needs water or gas. Noon to 3 pm averaged $51/MWh in 2026, against $89 from 5 to 8 pm. A gap like that is exactly what grid batteries are built to earn from, charging in the middle of the day and selling into the evening peak.</p>

<h2>Where you are on the grid</h2>
<p>There isn't one wholesale price but one at each of about 250 points on the grid (see <PartLink to="works">Part 1</PartLink>). Power loses some energy on its way along the lines, and when a line is full, cheaper generation on one side can't reach the other. Over the past year (October 2025 to September 2026) the cheapest point was Manapōuri, at $49/MWh, and the most expensive Wellsford, north of Auckland, at $65. Haywards ran at least $10 above Benmore in 12% of trading periods; the reverse happened in under 1%. Those gaps open when the HVDC link between the islands is carrying a lot of power north: in 78% of them it was carrying at least 700 MW, against 19% of all trading periods. The link can carry up to 1,050 MW north, but how much it can safely carry at any moment also depends on outages and on the reserve held in the North Island in case it trips.</p>

<Figure caption="Average price at selected grid points, October 2025 to September 2026" source="EMI final energy prices">
	<HBars rows={nodeRows} fmt={(v) => `$${v.toFixed(0)}`} label="Grid point" valueLabel="Average price ($/MWh)" labelWidth={150}
		legend={[{ name: 'North Island', tok: '--p-ni' }, { name: 'South Island', tok: '--p-si' }]} />
</Figure>

<p>Most of the cheap power is in the south, where the big hydro schemes are, and most of the demand is in the north, so the price generally rises with distance from the southern lakes. The five most expensive points over the year were all in the upper North Island, in Northland and on the Coromandel: Wellsford, Maungaturoto, Maungatapere, Kopu and Marsden, all at $63–65/MWh. Nelson's main grid point, Stoke, averaged $56, close to Haywards.</p>

<Note title="How these figures are measured">
	<ul>
		<li>Prices are the Electricity Authority's final energy prices for every trading period, averaged with every trading period weighted equally, in the dollars of the day.</li>
		<li>HVDC transfer is the site's history of the link's flow (metered where published, otherwise estimated), mid-link, north positive. The 1,050 MW northward limit is from the Electricity Authority's <a href="https://www.ea.govt.nz/news/eye-on-electricity/hvdc-inter-island-cable-benmore-to-haywards">HVDC explainer</a>.</li>
		<li>The grid-point averages cover the points priced in every month from October 2025 to September 2026 (243 of 246); a point priced for only part of the year, such as a newly connected wind farm, would be averaged over different months from the rest.</li>
		<li>The daily shape uses Haywards. Each trading period is placed by its start time in New Zealand time; each year's row is that year's average for each half-hour, drawn as a share of the year's overall average.</li>
	</ul>
</Note>
