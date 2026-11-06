<script lang="ts">
	import { REPO, ref, sourceHref } from '../registry.js';
	import Calculations from '../Calculations.svelte';
	import DataSources from '../DataSources.svelte';
	import GoodFor from '../GoodFor.svelte';
	import References from '../References.svelte';
</script>

<aside class="mt-caveats" aria-label="Key caveats">
	<p class="k">Key caveats</p>
	<ul>
		<li>In the live week and the newest weeks, each grid exit point shows a typical day from earlier months, which doesn’t follow rain, outages or new plant. Back-tested, a month’s average was out by about 9%.</li>
		<li>This figure starts in January 2009, so generation totals step up by about 2% that month.</li>
		<li>The split by fuel is partly a calculated estimate from the registry of installed generation.</li>
	</ul>
	<p><a href="#limitations">Accuracy and limitations</a> has the detail.</p>
</aside>

<h2 id="introduction">Introduction</h2>
<p>Embedded generation is generation connected to a local network instead of the national grid. The larger plants are dispatched, so the market data has their output. The smaller ones aren’t. Their output meets nearby demand, so it appears only as lower demand at the grid exit point, where electricity leaves the national grid for a local network.</p>
<p><a href="/methods/embedded-solar">Embedded solar</a> has its own page. Other embedded generation is the rest: mostly small hydro and landfill gas, with some geothermal, wind, gas, diesel and output whose fuel isn’t known.</p>
<p>It averaged about 120 MW in September 2026, about 2.3% of generation, and it runs steadily day and night.</p>

<h2 id="data-sources">Data sources</h2>
<p>Other embedded generation is a calculated estimate in every period. Each dataset below does one job in making it. The EA is the Electricity Authority.</p>
<DataSources slug="other-embedded" />

<h2 id="how-it-works"><span id="how"></span>How it works</h2>

<h3 id="source">The reconciliation data</h3>
<p>The EA’s <a href={sourceHref('reconciliation')}>reconciliation data</a> records the metered energy each trader injects and takes off at each grid exit point, by local network and half-hour. A trader is a retailer, generator or purchaser that buys electricity from the market or sells electricity to it.</p>

<h3 id="sorting">Sorting the injection</h3>
<p>Each injection series is one grid exit point, one local network and one trader. We sort every series in this order, and the first rule that applies decides what happens to it:</p>
<ol>
	<li>A series with under 5% of its energy between 9 pm and 5 am is solar. It is left out, because <a href="/methods/embedded-solar">embedded solar</a> is modelled separately.</li>
	<li>A series on a network that belongs to a generator is left out. Those networks connect grid stations, which are already part of <a href="/methods/generation">generation</a>.</li>
	<li>Glenbrook is left out. Its metered output runs about 1.47 times its dispatch figure, so the difference isn’t missing plant.</li>
	<li>A series that belongs to Ngāwhā or Teviot stays with that plant (see <a href="#named">Named plants</a>).</li>
	<li>Everything else is the starting point for other embedded generation.</li>
</ol>
<p>Elenz may already count some of this energy as a plant at the same grid exit point. So at each grid exit point and half-hour, we take off what is already counted there. That includes metered generation, gross output where the metered figure is net of local load, and any plant filled in from dispatch data. Comparing with metered generation alone would make Matahina and Cobb look missing.</p>
<Calculations>
	<p class="formula">Other embedded generation = injection − generation already counted, at each grid exit point and half-hour, and never below zero</p>
	<div class="tbl">
		<table>
			<thead><tr><th>Term</th><th>Meaning</th><th>Unit</th></tr></thead>
			<tbody>
				<tr><td>Injection</td><td>The series kept by step 5 at that grid exit point</td><td>MW</td></tr>
				<tr><td>Generation already counted</td><td>The non-solar output of every plant Elenz shows at that grid exit point</td><td>MW</td></tr>
			</tbody>
		</table>
	</div>
	<p class="k">Worked example</p>
	<p>These figures are illustrative. In one half-hour of a metered month, the series kept at a grid exit point inject 12 MW. A metered hydro station at the same grid exit point generated 5 MW. Other embedded generation there is 12 − 5 = 7 MW.</p>
	<p>In the live week, the same grid exit point shows its typical figure for that half-hour, say 6.5 MW, whatever the river is doing that day.</p>
</Calculations>

<h3 id="typical"><span id="periods"></span>The typical day</h3>
<p>The reconciliation data stops about 4 to 8 weeks before today. After that, each grid exit point shows a typical day: its average for each half-hour of the day, as the mean of two months’ averages.</p>
<ul>
	<li>The latest month with reconciliation data follows recent changes, such as a new plant or a dry spell.</li>
	<li>The same month a year earlier follows the season.</li>
</ul>
<p>Each of these alone did worse when tested (see <a href="#limitations">Accuracy and limitations</a>).</p>

<h3 id="named">Named plants</h3>
<p>Ngāwhā and Teviot have their own meters, so the metered history shows each as a whole plant. The dispatch data doesn’t. Only Ngāwhā B is dispatched, and Teviot is never dispatched. Their missing output is therefore filled in, so that neither steps down where the metered history meets the dispatch data.</p>
<div class="tbl">
	<table>
		<thead><tr><th>Period</th><th>Ngāwhā</th><th>Teviot</th></tr></thead>
		<tbody>
			<tr><td>Months with metered generation</td><td>Metered output.</td><td>Metered output.</td></tr>
			<tr><td>Recent weeks with reconciliation data</td><td>Ngāwhā B’s dispatched output, plus what is left at its grid exit point. Nothing else injects there.</td><td>What is left at its grid exit point, less the other plants’ typical output there.</td></tr>
			<tr><td>Live week, and weeks without reconciliation data</td><td>Ngāwhā B’s dispatched output, plus the rest of the station’s typical day.</td><td>Teviot’s typical day.</td></tr>
		</tbody>
	</table>
</div>
<p>A plant’s typical day is its own metered average for each half-hour, made from the same two months. In the reconciliation data, one trader’s injection at Ngāwhā matches its metered output exactly. Teviot’s grid exit point also carries other hydro, and Teviot’s share changes with the season, from most of the injection in spring to almost none in summer.</p>
<p>The fill counts in the plant, its fuel, total generation and the renewable share. It doesn’t count in grid demand. Demand from the dispatch data already matches metered demand to within 0.2 MW on average, and adding the fill put it about 24 MW too high.</p>

<h3 id="fuel">Fuel</h3>
<p>A public document decides the fuel at a grid exit point where one states it. These are the documents we rely on, and <a href={REPO + 'facilities/embedded_points.csv'}><code>facilities/embedded_points.csv</code></a> gives the source for each grid exit point:</p>
<ul>
	<li>Landfill gas: WM New Zealand’s reports on <a href={ref('wm-2022')}>Whitford and Redvale</a> and on <a href={ref('wm-2026')}>Kate Valley and Tirohia</a>, and Transpower’s <a href={ref('tpr-wellington')}>Wellington regional plan</a>.</li>
	<li>Hydro: submissions from <a href={ref('manawa-coast')}>Manawa Energy</a> and <a href={ref('kce')}>King Country Energy</a>, <a href={ref('westpower')}>Westpower</a>, the <a href={ref('pioneer')}>Pioneer Energy</a> plant list, and the <a href={ref('waipori')}>Waipori embedment proposal</a>.</li>
</ul>
<p>Otherwise we split the output by the <a href={sourceHref('guehmt')}>registry of installed distributed generation</a>. We take each fuel’s capacity at the grid exit point, less any dispatched plant, and weight it by a typical capacity factor. A capacity factor is a plant’s output as a share of what it would produce at full capacity. A grid exit point with no capacity in the registry is unclassified.</p>
<p>Landfill gas is renewable and has no emission factor, because its carbon is biogenic (see <a href="/methods/emissions">Emissions intensity</a>). Unclassified output counts in total generation, but not as renewable, and has no emission factor.</p>
<Calculations>
	<p class="formula">A fuel’s share at a grid exit point = (its capacity × its capacity factor) ÷ the sum of that across all fuels there</p>
	<div class="tbl">
		<table>
			<thead><tr><th>Registry fuel</th><th>Shown as</th><th class="n">Capacity factor</th></tr></thead>
			<tbody>
				<tr><td>Fresh water</td><td>Hydro</td><td class="n">0.50</td></tr>
				<tr><td>Geothermal</td><td>Geothermal</td><td class="n">0.90</td></tr>
				<tr><td>Wind</td><td>Wind</td><td class="n">0.33</td></tr>
				<tr><td>Natural gas</td><td>Gas</td><td class="n">0.50</td></tr>
				<tr><td>Liquid fuel</td><td>Diesel</td><td class="n">0.02</td></tr>
				<tr><td>Other, industrial process</td><td>Unclassified</td><td class="n">0.50</td></tr>
			</tbody>
		</table>
	</div>
	<p class="k">Worked example</p>
	<p>These figures are illustrative. A grid exit point has 4 MW of hydro and 10 MW of diesel in the registry. Hydro counts 4 × 0.50 = 2.0, and diesel counts 10 × 0.02 = 0.2. Hydro’s share is 2.0 ÷ 2.2 = 91%, and diesel’s share is 9%.</p>
</Calculations>

<h3 id="shown">How it shows on Elenz</h3>
<p>On every chart it is its own layer, “Other embedded” (est.), hatched and stacked just under embedded solar.</p>
<div class="tbl">
	<table>
		<thead><tr><th>Figure</th><th>How other embedded generation counts</th></tr></thead>
		<tbody>
			<tr><td>Total generation</td><td>Counted.</td></tr>
			<tr><td>Renewable share</td><td>Its hydro, geothermal, wind and landfill gas count as renewable. Its unclassified output counts in the total only.</td></tr>
			<tr><td>Emissions intensity</td><td>Counted, with factors for its gas, diesel and geothermal (see <a href="/methods/emissions#factors">Emissions intensity</a>).</td></tr>
			<tr><td>Grid demand</td><td>Not counted, because it sits behind the grid’s meters.</td></tr>
			<tr><td>Demand with embedded generation</td><td>Counted.</td></tr>
			<tr><td>Fuel records</td><td>Not counted. Hydro, wind and fossil records stay on the plants Elenz shows.</td></tr>
			<tr><td>Renewable-share records</td><td>Counted.</td></tr>
			<tr><td>Price captured by fuel</td><td>Not counted, because embedded generation isn’t paid the spot price.</td></tr>
			<tr><td>Capacity factors and spare dispatchable capacity</td><td>Not counted, because it has no installed capacity on Elenz.</td></tr>
			<tr><td>Price explainer and the HVDC estimate</td><td>Not counted.</td></tr>
			<tr><td>Time-of-day maps, the Now page and downloads</td><td>Counted. The generator list on the Now page has one row per island, marked as an estimate.</td></tr>
		</tbody>
	</table>
</div>
<p>In By site and By owner, and when a group is opened, it has one row per island. <a href="/methods/groupings#groupings">Renewable share and groupings</a> says where it sits in each grouping.</p>

<h3 id="plant-notes">Plant notes: open questions</h3>
<p>A grid exit point can carry several small plants, so they are shown together. We name a plant only where a public document ties it to its grid exit point. These points remain open:</p>
<ul>
	<li>Bombay (<code>BOB1101</code>) stays unclassified. <a href={ref('hampton')}>Hampton Downs landfill gas</a> may be the source, but no document we have found confirms it, and the registry says natural gas.</li>
	<li>Huirangi, Carrington St, Blenheim, Rotorua, Orowaiti and Wairakei take their fuel from the registry alone.</li>
	<li>Stoke’s output may be Cobb’s meter set against its dispatch figure. That is our reading of the data.</li>
	<li>Ashburton’s amount suggests it includes some of Highbank’s output. That is also our reading of the data.</li>
</ul>

<h2 id="interpretation"><span id="interpret"></span>How to interpret it</h2>
<p>Most of this output comes from small run-of-river hydro and plant that runs flat out, so the layer is nearly level through the day. It changes slowly, with rainfall and the seasons. The small morning and evening rises are hydro following demand.</p>
<p>In the live week the layer is a typical day, so a flood or an outage at a small station won’t show until the month is published.</p>
<GoodFor rows={[
	{ use: 'Monthly or yearly energy, from January 2009', level: 'good', verdict: 'Built from metered injection and metered generation.' },
	{ use: 'Half-hourly output, from January 2009', level: 'ok', verdict: 'Metered, but the solar test works on whole series, so sorting isn’t exact.' },
	{ use: 'Recent weeks with reconciliation data', level: 'ok', verdict: 'Metered injection less dispatch data.' },
	{ use: 'The live week and the newest weeks', level: 'care', verdict: 'A typical day from earlier months.', why: 'It doesn’t follow rain or outages.' },
	{ use: 'The split by fuel', level: 'care', verdict: 'Stated for some grid exit points, and a calculated estimate from the registry for the rest.' },
	{ use: 'One small plant', level: 'no', verdict: 'A grid exit point can carry several plants, and they are shown together.' },
	{ use: 'Before January 2009', level: 'no', verdict: 'The reconciliation data isn’t complete enough to use.' },
]} />

<h2 id="limitations"><span id="accuracy"></span>Accuracy and limitations</h2>
<div class="tbl">
	<table>
		<thead><tr><th>Figure</th><th>Status</th><th>Typical accuracy</th></tr></thead>
		<tbody>
			<tr><td>Other embedded generation, months with metered generation</td><td>Calculated estimate</td><td>Both inputs are metered. The error comes from sorting the series, and is small because the layer is nearly level through the day.</td></tr>
			<tr><td>Other embedded generation, recent weeks with reconciliation data</td><td>Calculated estimate</td><td>Injection is metered, and dispatch data supplies the plants already counted.</td></tr>
			<tr><td>Other embedded generation, live week and newest weeks</td><td>Calculated estimate</td><td>A month’s average out by about 9%, and by more than 16% one month in ten.</td></tr>
			<tr><td>Ngāwhā, filled-in output</td><td>Calculated estimate</td><td>A month’s average out by 4.9 MW, on about 50 MW.</td></tr>
			<tr><td>Teviot, filled-in output</td><td>Calculated estimate</td><td>A month’s average out by 2.3 MW, on about 4 MW.</td></tr>
			<tr><td>Split by fuel</td><td>Calculated estimate</td><td>Stated where a public document gives the fuel, and otherwise from the registry.</td></tr>
		</tbody>
	</table>
</div>
<p>We tested the live estimate on each month from 2023 to 2026, as it would have been made at the time. It used the month two before, about how old the latest published month is during the live week, and the same month a year earlier. It leaned neither way, running 0.3% high on average. A typical half-hour was out by about 13 MW, on an average of about 105 MW.</p>
<div class="tbl">
	<table>
		<thead><tr><th>Typical day from</th><th class="n">A month’s average, out by</th><th class="n">One month in ten, out by more than</th></tr></thead>
		<tbody>
			<tr><td>The month two before</td><td class="n">12%</td><td class="n">23%</td></tr>
			<tr><td>The same month a year earlier</td><td class="n">10%</td><td class="n">19%</td></tr>
			<tr><td>Both, averaged (what Elenz uses)</td><td class="n">9%</td><td class="n">16%</td></tr>
		</tbody>
	</table>
</div>
<p>The solar test works on whole series, so a trader that sells both solar and other output at one grid exit point could pass a little solar through. The layer’s shape suggests very little gets in. In September 2026 it ranged between 109 and 128 MW through the day.</p>
<p>The EA revises each month’s reconciliation data about 3, 7 and 14 months after it. Elenz reads the new figures and rebuilds that month.</p>

<h2 id="coverage">Historical coverage</h2>
<p>The reconciliation data starts in January 2005, but its first years aren’t complete enough to use. Until February 2007, much of the embedded hydro seen in later years is missing. From March 2007 to April 2008, some retailers’ injection at city grid exit points follows the shape of demand, not of any plant. From May 2008 it is consistent with later years.</p>
<p>We start in January 2009, the first whole year of consistent data. It is also when metered generation starts listing stations on local networks, so both inputs change in the same month.</p>
<div class="tbl">
	<table>
		<thead><tr><th>Period</th><th>Status</th><th>What Elenz shows</th></tr></thead>
		<tbody>
			<tr><td>August 1997 to December 2008</td><td>Not shown</td><td>Nothing. No complete half-hourly record covers plants on local networks. Ngāwhā and Teviot are in the metered history as plants throughout.</td></tr>
			<tr><td>January 2009 onward</td><td>Calculated estimate</td><td>The layer, about 93 MW over 2009, or 2.0% of generation. Totals and shares step up that month.</td></tr>
			<tr><td>6 November 2026</td><td>Method change</td><td>The layer joined totals, shares and demand with embedded generation, and renewable-share records moved (see <a href="/methods/records#coverage">Records</a>).</td></tr>
		</tbody>
	</table>
</div>

<h2 id="references">References</h2>
<References slug="other-embedded" />
