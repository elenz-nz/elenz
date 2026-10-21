<script lang="ts">
	import { REPO } from '../registry.js';
</script>

<h2 id="nodes">Which prices</h2>
<p>New Zealand’s wholesale market sets a price at every node on the grid, every five minutes; prices differ between nodes by transmission losses and constraints. The site shows six, north to south:</p>
<div class="tbl">
	<table>
		<thead><tr><th>Node</th><th>Code</th><th>Where</th><th>Shown on</th></tr></thead>
		<tbody>
			<tr><td>Ōtāhuhu</td><td><code>OTA2201</code></td><td>Auckland</td><td>Prices tab</td></tr>
			<tr><td>Whakamaru</td><td><code>WKM2201</code></td><td>Waikato River</td><td>Prices tab</td></tr>
			<tr><td><b>Haywards</b></td><td><code>HAY2201</code></td><td>Wellington: North Island reference</td><td>Everywhere</td></tr>
			<tr><td><b>Benmore</b></td><td><code>BEN2201</code></td><td>Waitaki: South Island reference</td><td>Everywhere</td></tr>
			<tr><td>Islington</td><td><code>ISL2201</code></td><td>Christchurch</td><td>Prices tab</td></tr>
			<tr><td>Invercargill</td><td><code>INV2201</code></td><td>Southland</td><td>Prices tab</td></tr>
		</tbody>
	</table>
</div>
<p>Haywards and Benmore sit at the two ends of the HVDC link and are the usual reference prices for each island. Prices are in dollars per megawatt-hour ($100/MWh is 10 cents a kWh), before lines charges, GST and retail margins.</p>

<h2 id="dispatch">The live week: dispatch prices</h2>
<ul>
	<li>Each 5-minute dispatch case’s price at each node, from the real-time feed.</li>
	<li>Where the week was filled from the EA’s daily dispatch files, those files have no rows for bus nodes such as Haywards and Benmore. The files do give each node’s price and its location factor against the island reference node, and price ÷ location factor gives the reference price exactly. Ōtāhuhu, Islington and Invercargill have no price for those intervals; Whakamaru, a generating node, does.</li>
	<li>Gaps of up to 12 intervals (an hour of 5-minute data) at the four other nodes are bridged by a straight line; longer ones are left empty.</li>
</ul>

<h2 id="final">History: final prices</h2>
<p>History uses the EA’s final prices, the prices the market settles on, for every half-hour trading period. They are published the next day, marked interim until confirmed (occasionally for longer, while a period is under review). Trading period 1 starts at midnight New Zealand time.</p>
<p>Dispatch and final prices can be very different under scarcity pricing: on 9 August 2021, dispatch prices at Haywards averaged $16,270/MWh with a peak of $356,621, while the final prices averaged $360 with a peak of $2,698.</p>

<h2 id="derived">What the Prices tab works out</h2>
<dl>
	<dt>Island spread</dt>
	<dd>Haywards − Benmore, $/MWh. Positive when the North Island is dearer.</dd>
	<dt>Islands priced apart</dt>
	<dd>Shaded where Haywards and Benmore differ by more than $10 <i>and</i> by more than 10% of the lower price; usually the HVDC link, or the grid near it, is at a limit. The range figure is the share of intervals priced apart.</dd>
	<dt>Time-weighted average</dt>
	<dd>Every interval counts the same: Σ price × hours ÷ Σ hours.</dd>
	<dt>Generation-weighted average</dt>
	<dd>Each interval counts by how much was generated, so busy peaks count for more: Σ(each fuel’s MW × its island’s price × hours) ÷ Σ(MW × hours), over every fuel below.</dd>
	<dt>Price captured by fuel</dt>
	<dd>The average price a fuel’s generation was worth: its output × its island’s reference price, summed, ÷ its output. Shown as $/MWh and as a percentage of the generation-weighted average. Batteries count discharge only (not the price they paid to charge); embedded solar is left out because it isn’t paid the spot price.</dd>
	<dt>Price range</dt>
	<dd>On 12 months and All: each day’s spread of half-hourly final prices: the middle 80% (10th to 90th percentile), lowest and highest. Weeks and months average the daily percentiles and take the lowest and highest half-hour.</dd>
	<dt>Price spikes</dt>
	<dd>On 12 months and All: the number of half-hours in each period over $500 and over $1,000/MWh, at the chosen reference node.</dd>
	<dt>Price by time of day</dt>
	<dd>A heat map over the selected range (at least the last week): one row per day, one column per half-hour, coloured by price at the chosen node. On All it has one row per month (or year), each the month’s average price in that half-hour, from a file the history job keeps of every month’s time-of-day averages. The colours are fixed price bands, so periods compare; “Scale to this view” sets the bands at the sixths of the prices shown instead.</dd>
	<dt>Range figures</dt>
	<dd>Each node’s average and highest price over the range, and the time it was over $500/MWh.</dd>
</dl>
<p>The Prices tab’s HVDC chart is the same series as the Generation tab’s; see <a href="/methods/hvdc">HVDC transfer</a>.</p>

<h2 id="scales">Price scales</h2>
<dl>
	<dt>Spike-proof</dt>
	<dd>Linear to about $100, compressed above it, so a single spike doesn’t flatten everything else: the chart plots sign(p) × log₁₀(1 + |p| ÷ 100), which also handles negative prices.</dd>
	<dt>Capped</dt>
	<dd>Linear up to $600; anything higher is clipped and marked at the top.</dd>
	<dt>Linear</dt>
	<dd>A plain scale, showing spikes at their true size.</dd>
</dl>

<h2 id="limits">Known limits</h2>
<ul>
	<li>Dispatch prices can be revised, and can differ a lot from final prices; the live week is replaced with final prices as they are published.</li>
	<li>Prices are wholesale spot prices only. Most electricity is sold under contracts and retail plans, at other prices.</li>
</ul>

<p class="note">Code: <a href={REPO + 'site/src/lib/prices/data.js'}><code>site/src/lib/prices/data.js</code></a> (everything the Prices tab works out), <a href={REPO + 'ingest/history.py'}><code>ingest/history.py</code></a> (final prices, daily spreads).</p>
