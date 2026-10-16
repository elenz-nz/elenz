<script module lang="ts">
	export const meta = {
		title: 'How the wholesale market works',
		dek: "Every five minutes, New Zealand's generators compete to supply the grid, and the last offer needed sets the price for everyone. Here is how that works, who is involved, and why most people never pay that price directly.",
		date: '2026-10-16',
		kind: 'Guide',
		draft: true,
		series: 'wholesale-market',
		part: 1,
		image: '/articles/how-the-wholesale-market-works.png',
	} as const;
</script>

<script lang="ts">
	// Part 1 of "Inside the wholesale market". Figures from analysis/wholesale_prices.py (see #lib/articles/series/wholesale.ts).
	import Figure from '#lib/articles/Figure.svelte';
	import Note from '#lib/articles/Note.svelte';
	import Stats from '#lib/articles/Stats.svelte';
	import PriceCover from '#lib/articles/PriceCover.svelte';
	import OfferStack from '#lib/articles/charts/OfferStack.svelte';
	import MarketDiagram from '#lib/articles/charts/MarketDiagram.svelte';
	import Legend from '#lib/articles/charts/Legend.svelte';
	import { num } from '#lib/articles/charts/util.js';
	import { D, FUELS, cover, PARTS } from '#lib/articles/series/wholesale.js';

	const C = cover(1, ['How the wholesale', 'market works']);
	const [s24, s26] = D.stacks as unknown as { load: number; price: { HAY: number }; blocks: [string, number, number][] }[];
	const stackLegend = FUELS.filter((f) => f.k !== 'batt').map((f) => ({ name: f.name, tok: f.tok }));
</script>

<PriceCover {...C} />

<p>Almost all of New Zealand's electricity passes through one market. Generators offer their output, the system operator picks the cheapest combination that keeps the lights on, and that choice sets a price at every point on the grid, every five minutes. This first part of the series explains how that works. The rest look at what has driven the price over 30 years, who earns what, and how it reaches a power bill.</p>

<Stats items={[
	{ label: 'Prices set', value: 'Every 5', unit: 'minutes', note: 'by the system operator\'s dispatch', tok: '--accent' },
	{ label: 'Trading periods', value: '48', unit: 'a day', note: 'the half-hours the market settles in', tok: '--f-hydro' },
	{ label: 'Grid points', value: 'About 250', note: 'each with its own price', tok: '--f-geo' },
]} />

<h2>Who is in the market</h2>
<ul>
	<li><strong>Generators</strong> own the power stations. Four companies, Contact, Genesis, Mercury and Meridian, own most of the large ones, and also run the biggest retailers, which is why they are often called gentailers.</li>
	<li><strong>Retailers</strong> buy electricity in the market and sell it to homes and businesses. There are about 40.</li>
	<li><strong>Transpower</strong> owns the national grid. As the system operator, it also runs the dispatch that decides which stations run, and keeps the system secure.</li>
	<li><strong>Lines companies</strong> carry electricity from the grid to homes and businesses on their local networks.</li>
	<li><strong>Large users</strong>, such as the Tiwai Point aluminium smelter, buy straight from the market.</li>
	<li><strong>The Electricity Authority</strong> writes the market's rules, watches how it works, and publishes the data this site is built on.</li>
</ul>

<h2>From offers to a price</h2>
<p>Each generator offers its output for every trading period, the half-hour the market is settled in: up to five price bands for each station (some large thermal units are offered unit by unit), each a quantity of megawatts at a price. Offers must be in about a day and a half ahead, and can be revised until gate closure, an hour before the trading period starts for most generators; from then on the prices are locked. The Code also sets a standard for the prices: each offer must be what the generator, acting rationally, would offer if no generator could exercise significant market power. Some large users can also bid to cut their demand when the price is high.</p>

<p>Every five minutes the system operator's dispatch software stacks those offers from cheapest to most expensive and runs the cheapest combination that meets demand. It does this for the whole grid at once, allowing for the energy lost on the lines, the limits of each line, and the reserve that must be held back in case a station or line trips.</p>

<p>The result is a price at every grid point: what one more megawatt would cost to deliver there. In practice that is roughly the price of the last offer needed to meet demand, adjusted for losses and line limits along the way. The market quotes two reference points, Haywards near Wellington for the North Island and Benmore in the Waitaki valley for the South. Each trading period's price is the time-weighted average of its five-minute prices. It is published first as an interim price, and becomes final at 2 pm the next business day unless someone claims a pricing error.</p>

<Figure caption="How the wholesale market works" wide>
	<MarketDiagram />
</Figure>

<h2>Two trading periods</h2>
<p>The offers show how the price is set. These are every generator's offers for 6 pm on two Wednesdays, on the same scale. At 6 pm on 7 August 2024 the country needed {num(s24.load)} MW. At 6 pm on 21 January 2026 it needed {num(s26.load)} MW.</p>

<Figure caption="Every generator offer for two trading periods, cheapest first, on the same scale. Each block's width is the MW offered and its height the offer price; offers above $1,200 are drawn to the top, with a marker. The strip under each axis shows the fuel of every offer, including those at about $0." source="EMI generator offers (BidsAndOffers), final offers for the trading period; generation from EMI dispatch data; Haywards final price" wide>
	<Legend items={stackLegend} />
	<OfferStack title="6:00 pm, Wednesday 7 August 2024" blocks={s24.blocks} fuels={FUELS} load={s24.load} price={s24.price.HAY} priceName="Haywards" xmax={9000} ymax={1200} />
	<OfferStack title="6:00 pm, Wednesday 21 January 2026" blocks={s26.blocks} fuels={FUELS} load={s26.load} price={s26.price.HAY} priceName="Haywards" xmax={9000} ymax={1200} />
</Figure>

<p>In both, the first 5,500 MW or so was offered at $1/MWh or less: geothermal stations, wind farms, hydro stations that must pass water downstream anyway, and the minimum running levels of other plant. These generators want to run whatever the price, so they offer low to make sure they are dispatched, and are paid the market price like everyone else.</p>

<p>The difference is what came next. In August 2024, 4,792 MW of hydro was offered, and 1,991 MW of it was priced above $300/MWh. Most gas was priced above $300 too, and gas and diesel peakers, with some hydro, above $1,000. Meeting 6,644 MW reached offers of around $750, and Haywards cleared at <strong>$882/MWh</strong>. In January 2026, 3,626 MW of hydro was offered at $1 or less on its own. Demand never reached the expensive part of the stack, and Haywards cleared at <strong>$1.14/MWh</strong>.</p>

<p>Why would a hydro station, whose fuel falls from the sky, offer at $800? Because water used now can't be used later, so generators price it at what it is expected to be worth when it is needed most. That idea, the water value, runs through everything that follows; <a href={PARTS.water}>Part 3</a> looks at it in detail.</p>

<h2>Who pays whom</h2>
<p>Once the trading period is over and the meters are read, every generator is paid the final price at its grid point for what it generated, and every retailer and large user is charged the price at its own grid point for what its customers used. Each calendar month is a billing period: the market's clearing manager works out what every participant owes and is owed, and the money changes hands on the 20th of the following month.</p>

<p>Very few people pay that price directly. Most electricity is also covered by contracts that fix its price in advance: hedges between generators and retailers, futures traded on the ASX, and the gentailers selling their own generation to their own customers. A household pays its retailer a tariff set months ahead. The spot price still matters, because it is what all those contracts are priced against, and what any electricity outside a contract earns or costs.</p>

<h2>Why the price matters</h2>
<p>The price decides which stations run and when. A high price tells generators to run everything they have and large users to cut back; a low one tells hydro stations to save their water. Over years, the prices people expect are what new power stations are built against. When the price swings from $878/MWh one winter's day to about a dollar on a summer evening, it is telling everyone something about how much electricity there is to go round.</p>

<p>The rest of the series follows that signal: <a href={PARTS.history}>thirty years of prices</a>, the <a href={PARTS.water}>water and gas</a> behind them, the <a href={PARTS.extremes}>most expensive and cheapest months</a>, <a href={PARTS.money}>where the money is made</a>, <a href={PARTS.bill}>how it reaches a power bill</a>, and <a href={PARTS.when}>when and where the price changes</a>.</p>

<p class="a-src">The market's rules are in the Electricity Industry Participation Code: offers, gate closure and the trading conduct rule in <a href="https://www.ea.govt.nz/code-and-compliance/the-code-electricity-industry-participation-code-2010/part-13-trading-arrangements/">Part 13</a> (clauses 13.5A to 13.17), interim and final prices in clauses 13.134A and 13.182A, and settlement in <a href="https://www.ea.govt.nz/code-and-compliance/the-code-electricity-industry-participation-code-2010/part-14-clearing-and-settlement/">Part 14</a> (clause 14.31).</p>

<Note title="Words used in this series">
	<dl class="gloss">
		<dt>Trading period</dt><dd>One of the 48 half-hours of a day (46 or 50 on the days daylight saving starts or ends). The market is settled by trading period.</dd>
		<dt>Grid point (node)</dt><dd>A place where electricity enters or leaves the national grid, usually a substation. Each has its own price.</dd>
		<dt>Reference node</dt><dd>Haywards (North Island) and Benmore (South Island), the two grid points the market's prices are usually quoted at.</dd>
		<dt>Offer</dt><dd>A block of megawatts a generator is willing to supply in a trading period, and the price it wants for it.</dd>
		<dt>Dispatch</dt><dd>The system operator's choice of which offers to run, made every five minutes.</dd>
		<dt>Water value</dt><dd>The price a hydro generator puts on its stored water: what it is expected to be worth later.</dd>
		<dt>Gentailer</dt><dd>A company that both generates electricity and sells it to customers.</dd>
		<dt>$/MWh</dt><dd>Dollars per megawatt-hour, the market's unit. $100/MWh is 10 cents a kilowatt-hour.</dd>
	</dl>
</Note>

<style>
	.gloss { margin: 0; display: grid; grid-template-columns: max-content 1fr; gap: 6px 14px; }
	.gloss dt { font-weight: 650; color: var(--ink); }
	.gloss dd { margin: 0; color: var(--ink-2); }
	@media (max-width: 520px) { .gloss { grid-template-columns: 1fr; gap: 2px; } .gloss dd { margin-bottom: 6px; } }
</style>
