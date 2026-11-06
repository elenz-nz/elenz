<script lang="ts">
	import Calculations from '../Calculations.svelte';
	import DataSources from '../DataSources.svelte';
	import GoodFor from '../GoodFor.svelte';
	import References from '../References.svelte';
</script>

<aside class="mt-caveats" aria-label="Key caveats">
	<p class="k">Key caveats</p>
	<ul>
		<li>Grid demand leaves out electricity supplied on local networks by generation that isn’t dispatched, so it reads below total consumption.</li>
		<li>Demand with embedded generation adds two calculated estimates, and the band on the chart covers only embedded solar’s uncertainty.</li>
		<li>Demand with embedded generation steps up by about 2% in January 2009, when other embedded generation starts.</li>
	</ul>
	<p><a href="#limitations">Accuracy and limitations</a> has the detail.</p>
</aside>

<h2 id="introduction"><span id="shows"></span>Introduction</h2>
<p>Grid demand is the electricity taken from the national grid in each island. It includes everything supplied through local networks and the Tiwai Point smelter, which is counted like any other consumer. It leaves out battery charging. It is the solid line on the demand chart.</p>
<p>Demand with embedded generation is the dashed line. It adds back the electricity generated on local networks that never passes through the grid, so it is closer to what homes and businesses used.</p>

<h2 id="data-sources">Data sources</h2>
<p>Recent figures come from dispatch data. Elenz replaces them with metered data as the Electricity Authority (EA) publishes each month, and <a href="/methods/history#layers">History since 1997</a> explains how the layers fit together. Demand with embedded generation adds calculated estimates in every period.</p>
<DataSources slug="demand" />

<h2 id="how-it-works">How it works</h2>

<h3 id="live">Grid demand in the live week</h3>
<p>Each dispatch case gives the load at every node, a point on the national grid where the market sets a price. An island’s grid demand is the sum of the load at all its nodes, leaving out battery charging. We net charging against each battery’s output instead. Missing intervals are filled as they are for <a href="/methods/generation#live">generation</a>.</p>
<p>The dispatch data counts dispatched plants on local networks as generation, not as lower load. Their output is therefore part of grid demand.</p>

<h3 id="history">Grid demand in the metered history</h3>
<p>For each month the EA has published, we build demand from the grid’s own meters, so that it means the same as the dispatch data’s island load. It is the energy leaving the grid, less the energy entering it, plus generation. Adding generation back does two things. It counts stations on local networks that are netted off at their grid exit point, as dispatch counts them. It also takes grid losses out of the figure.</p>
<p>There is no grid imports file before October 2000, and until about 2003 it covers only injections from local networks. For the connection points it lacks, metered generation stands in. In those years metered generation covers grid stations only, and these inject at their own connection point.</p>
<Calculations>
	<p class="formula">Demand = grid exports − grid imports + generation</p>
	<div class="tbl">
		<table>
			<thead><tr><th>Term</th><th>Meaning</th><th>Unit</th></tr></thead>
			<tbody>
				<tr><td>Grid exports</td><td>Energy leaving the national grid in that island and half-hour</td><td>MW</td></tr>
				<tr><td>Grid imports</td><td>Energy entering the national grid in that island and half-hour</td><td>MW</td></tr>
				<tr><td>Generation</td><td>Metered generation in that island and half-hour</td><td>MW</td></tr>
			</tbody>
		</table>
	</div>
	<p class="k">Worked example</p>
	<p>These figures are illustrative. An island generates 4,000 MW. Of that, 50 MW comes from a station on a local network, which reaches the meters only as lower exports at its grid exit point. Grid imports are 3,950 MW, and grid exports are 3,800 MW.</p>
	<p>Demand is 3,800 − 3,950 + 4,000 = 3,850 MW.</p>
</Calculations>

<h3 id="embedded">Demand with embedded generation</h3>
<p>Demand with embedded generation is grid demand plus the two layers that don’t pass through the grid: <a href="/methods/embedded-solar">embedded solar</a> from August 2013, and <a href="/methods/other-embedded">other embedded generation</a> from January 2009. Both are calculated estimates.</p>
<p>Ngāwhā and Teviot are filled in as generation in recent weeks and the live week, but that fill isn’t added to demand of either kind. Dispatch demand already matches metered demand to within 0.2 MW on average, and adding the fill put it about 24 MW too high.</p>
<Calculations>
	<p class="formula">Demand with embedded generation = grid demand + embedded solar + other embedded generation</p>
	<p class="k">Worked example</p>
	<p>These figures are illustrative. Grid demand is 4,000 MW, embedded solar is 300 MW, and other embedded generation is 120 MW. Demand with embedded generation is 4,000 + 300 + 120 = 4,420 MW.</p>
</Calculations>

<h3 id="ranges">Peaks and longer intervals</h3>
<p>On day, week, month and year intervals, the chart shows each interval’s average demand. Peak demand over a long range uses each day’s highest half-hour, so averaging doesn’t flatten it.</p>

<h2 id="interpretation"><span id="good-for"></span>How to interpret it</h2>
<p>Grid demand rises and falls with the day, the season and the weather. A dip in the middle of a sunny day doesn’t mean people used less electricity. Embedded solar is meeting part of their use, and the gap between the two lines shows how much.</p>
<GoodFor rows={[
	{ use: 'Grid demand, metered history', level: 'good', verdict: 'Built from the grid’s own meters.' },
	{ use: 'Grid demand, recent weeks and live week', level: 'good', verdict: 'The dispatch data’s island load, within 1% of metered demand in each island on average.' },
	{ use: 'Peaks on long ranges', level: 'good', verdict: 'Each day’s highest half-hour is kept, so averaging doesn’t flatten peaks.' },
	{ use: 'Demand with embedded generation', level: 'ok', verdict: 'It adds two calculated estimates to grid demand.', why: 'The band on the chart covers embedded solar only.' },
	{ use: 'Comparing demand with embedded generation across January 2009', level: 'care', verdict: 'It steps up by about 2% that month.', why: 'Compare grid demand instead.' },
	{ use: 'Demand at one town or substation', level: 'no', verdict: 'Elenz publishes demand only for New Zealand and each island.' },
]} />

<h2 id="limitations"><span id="limits"></span>Accuracy and limitations</h2>
<div class="tbl">
	<table>
		<thead><tr><th>Figure</th><th>Status</th><th>Typical accuracy</th></tr></thead>
		<tbody>
			<tr><td>Grid demand, metered history</td><td>Metered</td><td>Calculated directly from the EA’s metered files</td></tr>
			<tr><td>Grid demand, recent weeks and live week</td><td>Dispatch</td><td>New Zealand 0.0%, and each island within 1% of metered demand, September 2020 to September 2026</td></tr>
			<tr><td>Demand with embedded generation, from January 2009</td><td>Calculated estimate</td><td>Carries embedded solar’s uncertainty, about ±9% on clear days and ±19% under cloud, and other embedded generation’s error</td></tr>
		</tbody>
	</table>
</div>
<p>The band around the dashed line is embedded solar’s uncertainty alone. Other embedded generation adds an error of its own. In the newest weeks, its monthly average is out by about 9% of its value, or about 10 MW.</p>
<p>Before January 2009, demand with embedded generation has no other embedded generation in it. That month’s step is about 93 MW over 2009 as a whole, or 2% of generation.</p>
<p>Grid demand isn’t the same as electricity consumed. It includes the local networks’ own losses, and it leaves out what generation on local networks supplies directly.</p>
<p>Records use a different dashed line. A demand record’s chart adds back embedded solar only (see <a href="/methods/records#solar">Records</a>).</p>

<h2 id="coverage">Historical coverage</h2>
<p>Each row marks a change in what the record can show.</p>
<div class="tbl">
	<table>
		<thead><tr><th>From</th><th>Change</th></tr></thead>
		<tbody>
			<tr><td>August 1997</td><td>Grid demand starts. Metered generation stands in for grid imports.</td></tr>
			<tr><td>October 2000</td><td>Grid imports start. Until about 2003 they cover only injections from local networks, and metered generation stands in for the rest.</td></tr>
			<tr><td>January 2009</td><td>Other embedded generation joins demand with embedded generation.</td></tr>
			<tr><td>August 2013</td><td>Embedded solar joins demand with embedded generation. Before this month the registry of installed systems has no records.</td></tr>
			<tr><td>10 September 2020</td><td>Daily dispatch files start, so recent dispatch data is possible from here.</td></tr>
		</tbody>
	</table>
</div>

<h2 id="references">References</h2>
<References slug="demand" />
