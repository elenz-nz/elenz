<script lang="ts">
	import { ref } from '../registry.js';
	import Calculations from '../Calculations.svelte';
	import DataSources from '../DataSources.svelte';
	import GoodFor from '../GoodFor.svelte';
	import References from '../References.svelte';
	import Shot from '../Shot.svelte';
</script>

<aside class="mt-caveats" aria-label="Key caveats">
	<p class="k">Key caveats</p>
	<ul>
		<li>The newest periods show dispatch prices, which can differ from final prices. On stressed days since 2022, half-hours have differed by up to about a third.</li>
		<li>All figures are wholesale spot prices, not what households pay. $100/MWh is 10c a kWh, before lines charges, retail margins and GST.</li>
		<li>Before 1 November 2022, dispatch prices could be many times the final price, so the two aren’t comparable in those years.</li>
	</ul>
	<p><a href="#limitations">Accuracy and limitations</a> has the detail.</p>
</aside>

<h2 id="introduction"><span id="nodes"></span>Introduction</h2>
<p>The wholesale market sets a price every 5 minutes at each node, a point on the national grid where electricity is priced. Prices differ between nodes because some electricity is lost in transmission, and because transmission limits can stop the cheapest generation reaching every node.</p>
<p>Elenz shows six nodes, from north to south. Elenz uses Haywards and Benmore as its reference prices because they sit at the two ends of the HVDC link. <a href={ref('hedge')}>ASX electricity futures</a> use Ōtāhuhu and Benmore.</p>
<div class="tbl">
	<table>
		<thead><tr><th>Node</th><th>Code</th><th>Location</th><th>Shown on</th></tr></thead>
		<tbody>
			<tr><td>Ōtāhuhu</td><td><code>OTA2201</code></td><td>Auckland</td><td>Prices tab</td></tr>
			<tr><td>Whakamaru</td><td><code>WKM2201</code></td><td>Waikato River</td><td>Prices tab</td></tr>
			<tr><td>Haywards</td><td><code>HAY2201</code></td><td>Wellington, the North Island reference</td><td>Now, both Tracker tabs and Records</td></tr>
			<tr><td>Benmore</td><td><code>BEN2201</code></td><td>Waitaki, the South Island reference</td><td>Now, both Tracker tabs and Records</td></tr>
			<tr><td>Islington</td><td><code>ISL2201</code></td><td>Christchurch</td><td>Prices tab</td></tr>
			<tr><td>Invercargill</td><td><code>INV2201</code></td><td>Southland</td><td>Prices tab</td></tr>
		</tbody>
	</table>
</div>

<h2 id="data-sources">Data sources</h2>
<p>Views of 30 days or longer use final prices once they are published. The 24-hour to 7-day views keep showing dispatch prices. <a href="/methods/history#layers">History since 1997</a> explains how the layers fit together.</p>
<DataSources slug="prices" />

<h2 id="how-it-works">How it works</h2>

<h3 id="dispatch">Dispatch prices</h3>
<p>Each 5-minute dispatch case gives a price at every node, and Elenz keeps the last 7 days of these from the real-time feed. Gaps of up to 12 intervals at the four nodes other than Haywards and Benmore are bridged by a straight line. Longer gaps at those nodes are left empty.</p>

<h3 id="final">Final prices</h3>
<p>A final price is the price the market settles on for a half-hour, called a trading period. Trading period 1 starts at midnight. A price is marked interim until it is confirmed, usually for a day or two, and for longer if the period is under review.</p>
<p>The history uses final prices wherever they exist, including interim ones. For a half-hour with no final price yet, it uses the average dispatch price. The daily dispatch files have no rows for Haywards and Benmore, so we work those prices out from another node’s price and its location factor. A location factor is the relationship between a node’s price and its island’s reference price.</p>

<h3 id="derived">Figures worked out from prices</h3>
<dl>
	<dt>Island spread</dt>
	<dd>The Haywards price less the Benmore price. It is positive when the North Island is dearer.</dd>
	<dt>Islands priced apart</dt>
	<dd>Haywards and Benmore differ by more than $10/MWh and by more than 10% of the lower price. The chart shades these intervals, and the figure for a range is the share of intervals priced apart.</dd>
	<dt>Time-weighted average</dt>
	<dd>The average price with every interval counting the same.</dd>
	<dt>Generation-weighted average</dt>
	<dd>The average price with each interval counting by how much was generated, so busy peaks count for more. It uses each fuel’s output at its island’s reference price, over the fuels listed under Price captured by fuel.</dd>
	<dt>Price captured by fuel</dt>
	<dd>The average price a fuel’s generation was worth, using its island’s reference price. It is shown in $/MWh and as a percentage of the generation-weighted average. Battery output counts only while a battery is discharging. The price paid to charge it appears separately in the Battery (charging) row and isn’t part of the average. Embedded solar and other embedded generation are excluded because they aren’t paid the spot price.</dd>
	<dt>Price range</dt>
	<dd>On the 12-month and All views, each day’s spread of half-hourly final prices. It shows the middle 80% of prices (the 10th to 90th percentile), the lowest and the highest. Weeks and months average the daily percentiles, and take the lowest and highest half-hour.</dd>
	<dt>Price spikes</dt>
	<dd>On the 12-month and All views, the number of half-hours in each period over $500/MWh and over $1,000/MWh at the chosen reference node.</dd>
	<dt>Price by time of day</dt>
	<dd>One row per day and one column per half-hour, coloured by the price at the chosen node. On All, each row is a month or year, and each cell is that half-hour’s average price. The colours are fixed price bands, so that periods can be compared. “Scale to this view” divides the prices shown into six groups of equal size instead.</dd>
	<dt>Range figures</dt>
	<dd>Each node’s average and highest price over the range, and the time it was over $500/MWh.</dd>
</dl>
<Calculations>
	<p class="formula">Island spread = Haywards price − Benmore price
Time-weighted average = sum of (price × hours) ÷ sum of hours
Generation-weighted average = sum of (each fuel’s MW × its island’s price × hours) ÷ sum of (MW × hours)
Price captured by a fuel = sum of (its MW × its island’s price × hours) ÷ sum of (its MW × hours)</p>
	<div class="tbl">
		<table>
			<thead><tr><th>Term</th><th>Meaning</th><th>Unit</th></tr></thead>
			<tbody>
				<tr><td>Price</td><td>The price at the node or island in that interval</td><td>$/MWh</td></tr>
				<tr><td>Hours</td><td>The length of the interval</td><td>Hours</td></tr>
				<tr><td>MW</td><td>The fuel’s output in that island and interval</td><td>MW</td></tr>
			</tbody>
		</table>
	</div>
	<p class="k">Worked example</p>
	<p>These figures are illustrative. A wind farm generates 100 MW for a half-hour at $50/MWh, then 20 MW for a half-hour at $200/MWh. The time-weighted average price is (50 × 0.5 + 200 × 0.5) ÷ 1 = $125/MWh.</p>
	<p>The wind farm’s captured price is (100 × 50 × 0.5 + 20 × 200 × 0.5) ÷ (100 × 0.5 + 20 × 0.5) = 6,500 ÷ 60 = $108/MWh, rounded from $108.33.</p>
</Calculations>
<Shot name="prices-range" alt="The price range chart on 1Y: each day’s lowest to highest price, with the Haywards and Benmore buttons above it." caption="The price range on the 1-year view." />
<Shot name="prices-fuel" alt="The price captured by fuel card: a row for each fuel, its $/MWh and its share of the generation-weighted average." caption="Price captured by fuel." />

<h3 id="scales">Price scales</h3>
<p>A few very high prices can flatten everything else on a chart, so Elenz offers three scales. The price drawn over the Generation tab’s chart always uses the compressed scale, labelled Spike-proof in the menu.</p>
<dl>
	<dt>Spike-proof</dt>
	<dd>A compressed scale, close to linear up to about $100/MWh. It also handles negative prices.</dd>
	<dt>Capped</dt>
	<dd>A linear scale up to $600/MWh. Anything higher is clipped and marked at the top.</dd>
	<dt>Linear</dt>
	<dd>A plain scale, which shows spikes at their true size.</dd>
</dl>
<Calculations>
	<p class="formula">Plotted height = sign(price) × log₁₀(1 + |price| ÷ 100)</p>
	<p class="k">Worked example</p>
	<p>These figures are illustrative. A price of $100/MWh plots at log₁₀(2) = 0.30. A price of $10,000/MWh is 100 times higher, but plots at log₁₀(101) = 2.00, so it is only about 6.7 times as tall.</p>
</Calculations>

<h2 id="interpretation">How to interpret it</h2>
<p>A price is what the last unit of electricity needed at that node cost in that interval. Most electricity is sold under contracts and retail plans at other prices, so a spot price is a signal of how tight the system is, not of what consumers pay.</p>
<p>Different prices at Haywards and Benmore mean the two islands are priced apart. That usually means the HVDC link, or the grid near it, is at a limit. Elenz has no direct data on those limits.</p>
<p>The price at a node is also a guide to the prices around it, not a price for a whole region. The HVDC chart on the Prices tab is the same figure as on the Generation tab (see <a href="/methods/hvdc">HVDC transfer</a>).</p>
<GoodFor rows={[
	{ use: 'Half-hourly price at a node, history', level: 'good', verdict: 'Final prices, as the market settled them.' },
	{ use: 'Latest price, live week', level: 'ok', verdict: 'Dispatch prices are the market’s own figures for each interval.', why: 'The final price for that half-hour may differ, by up to about a third on stressed days.' },
	{ use: 'Price captured by a fuel', level: 'ok', verdict: 'Uses island reference prices, not each plant’s own node.', why: 'A plant’s actual revenue also depends on its contracts.' },
	{ use: 'Comparing dispatch with final prices before November 2022', level: 'care', verdict: 'The two could differ widely before real-time pricing, as the 9 August 2021 example below shows.' },
	{ use: 'What a household or business pays', level: 'no', verdict: 'Spot prices leave out lines charges, retail margins and GST, and most electricity is sold under contract.' },
]} />

<h2 id="limitations"><span id="limits"></span>Accuracy and limitations</h2>
<div class="tbl">
	<table>
		<thead><tr><th>Figure</th><th>Status</th><th>Typical accuracy</th></tr></thead>
		<tbody>
			<tr><td>Prices, history</td><td>Final price</td><td>As published by the EA, and interim until confirmed</td></tr>
			<tr><td>Prices, 24-hour to 7-day views</td><td>Dispatch</td><td>As published by the EA, and may differ from the final price</td></tr>
			<tr><td>Island spread, averages and price range</td><td>Calculated</td><td>Arithmetic on the prices shown, so each takes the status of those prices</td></tr>
			<tr><td>Bridged gaps at the four other nodes</td><td>Calculated estimate</td><td>A straight line across up to 12 intervals</td></tr>
		</tbody>
	</table>
</div>
<p>We compared half-hour averages of dispatch prices with final prices at Whakamaru and Manapōuri on sample days. On ordinary days since 1 November 2022, they differed by about $1/MWh on average. On three stressed days, they differed by $10 to $36/MWh on average, and by up to about a third in a single half-hour.</p>
<p>The gap was far larger before real-time pricing. On 9 August 2021, dispatch prices at Haywards averaged $16,270/MWh with a peak of $356,621/MWh. Final prices that day averaged $360/MWh with a peak of $2,698/MWh.</p>
<p>Price captured by fuel uses each island’s reference price, so it doesn’t show what a plant at another node earned.</p>

<h2 id="coverage">Historical coverage</h2>
<p>The history’s prices start in August 1997, and the rules behind them have changed since then.</p>
<div class="tbl">
	<table>
		<thead><tr><th>From</th><th>Change</th></tr></thead>
		<tbody>
			<tr><td>August 1997</td><td>Final prices start in the history.</td></tr>
			<tr><td>10 September 2020</td><td>Daily dispatch files start, which supply dispatch prices for half-hours with no final price yet.</td></tr>
			<tr><td>1 November 2022</td><td><a href={ref('rtp')}>Real-time pricing</a> starts. Since then, the final price for a trading period has been a time-weighted average of the prices set during it.</td></tr>
		</tbody>
	</table>
</div>

<h2 id="references">References</h2>
<References slug="prices" />
