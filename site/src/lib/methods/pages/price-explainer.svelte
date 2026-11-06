<script lang="ts">
	// Thresholds and factors come straight from the explainer's own code, so this page can't drift from it.
	import { BELOW, FACTORS, RULES } from '#lib/now/explain.js';
	import { ref } from '../registry.js';
	import Calculations from '../Calculations.svelte';
	import DataSources from '../DataSources.svelte';
	import GoodFor from '../GoodFor.svelte';
	import References from '../References.svelte';
	import Shot from '../Shot.svelte';
	const R = RULES;
	const usd = (v: number) => '$' + v.toLocaleString('en-NZ');
</script>

<aside class="mt-caveats" aria-label="Key caveats">
	<p class="k">Key caveats</p>
	<ul>
		<li>The panel shows associations, not proven causes. It can’t see grid constraints, reserves, outages or changes in offers.</li>
		<li>The possible price setter is a calculated estimate from the newest published day’s offers, which can differ from today’s.</li>
		<li>Usual prices come from final prices, while the price the panel explains is a dispatch price.</li>
	</ul>
	<p><a href="#limitations">Accuracy and limitations</a> has the detail.</p>
</aside>

<h2 id="introduction"><span id="what"></span>Introduction</h2>
<p>The price explainer is a panel on the <a href="/now">Now</a> page. It says how the wholesale price compares with recent prices at this time, and what is different on the power system from usual.</p>
<p>It compares wind, solar, hydro, gas and coal, peaking plants, demand, the HVDC link and the gap between the islands with their usual levels. It also lists plants running well below the past week, and a possible price setter.</p>
<Shot name="now-explainer" alt="The price explainer open under the price tiles: why the price is what it is, a pair of bars for each reason, and a 24-hour price chart." caption="The price explainer on the Now page." />

<h2 id="data-sources">Data sources</h2>
<p>The panel compares the live week with the last 28 days of history. <a href="/methods/history#layers">History since 1997</a> explains how those layers fit together.</p>
<DataSources slug="price-explainer" />

<h2 id="how-it-works">How it works</h2>

<h3 id="usual">What counts as usual</h3>
<p>The history job keeps a usual value for each of the week’s 336 half-hours, counted from midnight on Monday. It uses the last 28 days of half-hourly history. A factor’s usual value is its median at that half-hour of the week.</p>
<p>The price needs more data than that, because four prices are too few. One half-hour of the week can hold two nights of spilling hydro at a few cents, which would make an ordinary price look six times usual. So each half-hour pools every half-hour on the same kind of day, weekday or weekend, within an hour of that time of day. That gives 40 prices for a weekend half-hour and 100 for a weekday one. The panel keeps the median and the 25th and 75th percentiles.</p>
<p>The price tested is the higher of the Haywards and Benmore prices. The panel doesn’t quote a multiple of usual. It says prices are higher than, or far above, what they have been recently around this time.</p>
<p>The panel also keeps the median price over the past year, the year median, as a floor. When spilling hydro makes the usual price tiny, $20/MWh against a usual $5/MWh would otherwise count as four times usual.</p>
<p>Wind follows the weather, not the clock, so its usual value is its median over the whole 4 weeks. The panel then says how long it has been since wind was this low or this high, once that is at least {R.windDays} days. Wind now is its {R.avgMin}-minute average.</p>
<Calculations>
	<p class="formula">Typical price = the median of the higher of the Haywards and Benmore prices, on the same kind of day, within an hour of this time of day, over the last 4 weeks</p>
	<p class="k">Worked example</p>
	<p>These figures are illustrative. At 6 pm on a Tuesday, the panel takes every half-hour from 5 pm to 7 pm on weekdays over the last 4 weeks. That is 100 half-hours. Their median is the typical price.</p>
</Calculations>

<h3 id="rules">When it is highlighted or opens</h3>
<p>The button in the wholesale price tile has three states. It is quiet by default, and the panel opens only when asked. It is highlighted when the price is unusual, and it says why. At extremes, the panel opens by itself. Low prices never open it.</p>
<p>The rules test the {R.avgMin}-minute average of the 5-minute dispatch prices. Each state holds for {R.holdMin} minutes after its condition ends, so it doesn’t flicker.</p>
<div class="tbl">
	<table>
		<thead><tr><th>State</th><th>Any of these conditions</th></tr></thead>
		<tbody>
			<tr><td>Highlighted</td><td>
				<ul>
					<li>The higher island price is at least {R.hlRatio} times typical and at least {R.hlLevel} times the year median.</li>
					<li>The islands are more than {usd(R.splitGap)}/MWh and {Math.round(R.splitRel * 100)}% apart.</li>
					<li>There is a new low: under {usd(R.low)}/MWh after {R.lowQuietH} hours without one, for its first {R.lowShowH} hours. Prices under ${R.nearZero.toFixed(2)}/MWh are described as near zero, and others as low.</li>
				</ul>
			</td></tr>
			<tr><td>Open</td><td>
				<ul>
					<li>The higher island price is at least {R.openRatio} times typical, at least {R.openLevel} times the year median, and at least {usd(R.openFloor)}/MWh.</li>
					<li>The price is at least {usd(R.openAny)}/MWh at any time. A dry year raises typical prices too, so the relative test alone would miss it.</li>
				</ul>
			</td></tr>
		</tbody>
	</table>
</div>
<p>A smaller gap counts at low prices. With the higher price under {usd(R.apartUnder)}/MWh, the islands are treated as apart from more than {usd(R.apartGap)}/MWh and {Math.round(R.splitRel * 100)}%. The panel then says why the dearer island is dearer, but the button isn’t highlighted, because a gap that size is ordinary. Whenever the islands are apart, the panel gives the HVDC link’s estimated transfer.</p>

<h3 id="factors">The reasons</h3>
<p>Each factor’s value now is compared with its usual value, for New Zealand or the island the panel is about. A factor is mentioned only when it is off by at least a set number of MW and a set share of usual.</p>
<div class="tbl">
	<table>
		<thead><tr><th>Factor</th><th>When above usual, the price tends to</th><th class="n">At least</th><th class="n">And at least</th></tr></thead>
		<tbody>
			{#each FACTORS as f (f.k)}
				<tr><td>{f.name}</td><td>{f.sign > 0 ? 'rise' : 'fall'}</td><td class="n">{f.floor} MW</td><td class="n">{Math.round((f.rel ?? 0.15) * 100)}%</td></tr>
			{/each}
		</tbody>
		<caption>Solar is grid solar plus embedded solar. Gas and coal is coal/gas Rankine, gas and diesel. Peakers are Junction Road, McKee, Stratford’s peakers, Huntly 6 and Whirinaki. Demand is grid demand. Other embedded generation isn’t a factor.</caption>
	</table>
</div>
<p>Factors are ranked by how far off they are, relative to usual and in MW. The top two that tend to move the price the way it has gone lead the explanation. Hydro counts for half, because it is dispatched to balance everything else, so it follows the other factors more than it leads them. The HVDC transfer and the price gap between the islands are shown against usual too.</p>
<p>The data has no outages, so as a rough stand-in the panel lists plants running well below the past week. It looks at baseload thermal, geothermal and cogeneration plants, not hydro or peaking plants, which move with the market. A plant is listed if its last 30 minutes are at least {BELOW.minDrop} MW lower than the median of that half-hour on the other days of the live week. They must also be at most {Math.round(BELOW.maxShare * 100)}% of that median. Together they count as a reason when they are at least {BELOW.f.floor} MW below. A plant running low may be out for maintenance or a fault, or may simply be offering less.</p>
<p>A state holds for {R.holdMin} minutes, so a price that jumps for a few intervals and drops back stays highlighted for a while. The panel then says when the price jumped and that it is back. It doesn’t look for causes in conditions that have passed. When nothing shown is pushing the price up, it says so, and names what it can’t see.</p>

<h3 id="setter">The possible price setter</h3>
<p>Generators’ offers are published the day after, so we use the newest available day’s final offers for the same half-hour of the day. Each plant’s offers for that half-hour are stacked cheapest first.</p>
<p>A plant running part way up one of its offer blocks, at least 1 MW into it and 1 MW short of its end, is on the margin. Of those whose block is priced within 25% of their island’s reference price now, the closest is named. None is named when the price is under $5/MWh, where many plants offer at similar prices and none stands out.</p>
<p>The panel labels this an estimate, and calls it possible, not likely. Offers change from day to day, and node prices differ from the reference price by losses.</p>

<h2 id="interpretation">How to interpret it</h2>
<p>The panel shows what is unusual at the same time as the price. These are associations with the usual pattern, not a measured cause, so it doesn’t label each factor as pushing the price up or down.</p>
<p>When the panel says nothing shown is pushing the price up, the cause may be something it can’t see.</p>
<GoodFor rows={[
	{ use: 'Whether a price is unusual for this time', level: 'good', verdict: 'It compares with the same kind of day over the last 4 weeks.' },
	{ use: 'What is different from usual on the power system', level: 'ok', verdict: 'Each factor is compared with its own usual value.' },
	{ use: 'Why the price moved', level: 'care', verdict: 'The panel shows associations.', why: 'Constraints, reserves, outages and offers can all move the price, and it can’t see them.' },
	{ use: 'Which plant set the price', level: 'care', verdict: 'A possible price setter only, from the newest published day’s offers.' },
	{ use: 'Whether a plant has an outage', level: 'no', verdict: 'Lower output can have other causes, such as a plant offering less.' },
]} />

<h2 id="limitations"><span id="limits"></span>Accuracy and limitations</h2>
<div class="tbl">
	<table>
		<thead><tr><th>Figure</th><th>Status</th><th>Typical accuracy</th></tr></thead>
		<tbody>
			<tr><td>The price now</td><td>Dispatch</td><td>An average of 5-minute dispatch prices over {R.avgMin} minutes</td></tr>
			<tr><td>Usual prices</td><td>Final price</td><td>Medians of final prices over the last 28 days</td></tr>
			<tr><td>Usual values of the factors</td><td>Dispatch</td><td>Medians over the last 28 days, including embedded solar where solar is shown</td></tr>
			<tr><td>Possible price setter</td><td>Calculated estimate</td><td>Offers from the newest published day, not today’s</td></tr>
		</tbody>
	</table>
</div>
<p>We tested the rules on every half-hour of final prices at Haywards and Benmore from March 1997 to September 2026.</p>
<ul>
	<li>Highlighted: 11% of the time over the whole period and 12.5% since 2021, with 8–19% a year. That is about 400 episodes a year, on 54% of days, with a median of 1½ hours each.</li>
	<li>Open: 0.6–0.7% of the time, about 33 times a year since 2021, on 6.2% of days. It would have opened on 9 August 2021, 8 May 2024, 12 December 2024 and 4 August 2026, and through August 2024’s dry-year prices.</li>
	<li>Lows: prices were under $5/MWh for 14% of the time since 2021 and 26% of 2026. The longest run was 354 hours at $0.01/MWh, from 22 December 2025 to 6 January 2026.</li>
</ul>
<p>The test used final prices, and live rules run on an average of dispatch prices. Since <a href={ref('rtp')}>real-time pricing</a> began, half-hour averages of the two have been close (see <a href="/methods/prices#limitations">Wholesale prices</a>).</p>
<p>Hydro lake storage, reserves and outages can all move the price, and they aren’t in the data the panel uses.</p>

<h2 id="coverage">Historical coverage</h2>
<p>The panel shows only the current price, and its usual values always cover the last 28 days. Offers for the possible price setter are the newest published day’s. The test above ran on final prices back to March 1997. Prices before 1 November 2022 were set under different rules (see <a href="/methods/prices#coverage">Wholesale prices</a>).</p>

<h2 id="references">References</h2>
<References slug="price-explainer" />
