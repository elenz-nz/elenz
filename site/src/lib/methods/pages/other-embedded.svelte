<script lang="ts">
	// Other embedded generation: non-solar plant on local networks that isn't dispatched.
	// Written to the methods style guide (6 Nov 2026): data status line, key caveats, Introduction, How it works, How to
	// interpret it, Accuracy and limitations, Historical coverage. Data sources and References still come from the
	// registry through the page template until the template change in the style guide's rollout.
	import { REPO, sourceHref } from '../registry.js';
	import GoodFor from '../GoodFor.svelte';
</script>

<p class="data-status"><b>Data status:</b> Estimated. From January 2009 it rests on metered data. For the newest weeks it is a typical day from earlier months.</p>

<div class="caveats">
	<p><b>Key caveats</b></p>
	<ul>
		<li>For the live week and the newest weeks, each grid exit point shows a typical day from earlier months. It doesn’t follow rain, outages or new plant. Back-tested, a month’s average was out by about 9%.</li>
		<li>There is none before January 2009, because the data it comes from isn’t complete before then. Generation totals step up by about 2% that month.</li>
		<li>The split by fuel is partly estimated from the registry of installed generation.</li>
	</ul>
</div>

<h2 id="introduction">Introduction</h2>
<p>Embedded generation is plant connected to a local distribution network rather than to the national grid. The bigger embedded plants are dispatched, so the market data has their output. The smaller ones aren’t. Their output meets nearby demand, so at the grid exit point it only shows up as less demand.</p>
<p>A grid exit point is where a local network connects to the national grid. Embedded solar, mostly rooftops, has <a href="/methods/embedded-solar">its own page</a>. This page covers the rest: mostly small hydro, plus geothermal, landfill gas and a little wind.</p>
<p>Other embedded generation averaged about 120 MW in September 2026, about 2.3% of generation. It runs at a steady level day and night. The site shows it as its own layer, hatched as an estimate, in the generation chart and in every total and share.</p>
<p>Two plants on local networks aren’t fully dispatched but have their own meter: Ngāwhā and Teviot. They stay as plants in their own fuel, so they aren’t part of this layer. <a href="#named">Named plants</a> explains how their missing output is filled in.</p>

<h2 id="how">How it works</h2>

<h3 id="source">The source</h3>
<p>The EA’s <a href={sourceHref('reconciliation')}>reconciliation data</a> records the metered energy every trader injects and takes off at every grid exit point, by local network and half-hour. A trader is the market participant that buys a generator’s output or sells to its customers. The data starts in January 2005, but we use it from January 2009 (see <a href="#coverage">Historical coverage</a>). Each month is published about 3 to 4 weeks after it ends, then replaced by revised figures about 3, 7 and 14 months later.</p>

<h3 id="sorting">Sorting the injection</h3>
<p>Each injection series is one grid exit point, one local network and one trader. We sort every series in this order:</p>
<ol>
	<li><b>Solar:</b> a series with less than 5% of its energy between 9 pm and 5 am is solar. It is left out, because <a href="/methods/embedded-solar">embedded solar</a> is estimated separately.</li>
	<li><b>Generators’ own networks:</b> a series on a network that belongs to a generator is left out. Those networks connect grid stations, which the <a href="/methods/generation">generation page</a> covers.</li>
	<li><b>Glenbrook:</b> left out. The steel mill’s meter runs at about 1.45 times its dispatched output, so the difference isn’t missing plant.</li>
	<li><b>Named plants:</b> a series that belongs to Ngāwhā or Teviot stays with that plant (see <a href="#named">Named plants</a>).</li>
	<li><b>Everything else</b> on local networks is the starting point for other embedded generation.</li>
</ol>
<p>Elenz may already count some of this energy as a plant at the same grid exit point. So at each grid exit point and half-hour, we take off what is already counted there:</p>
<p class="formula">O = max(0, I − C)</p>
<div class="tbl">
	<table>
		<thead><tr><th>Term</th><th>Meaning</th><th>Unit</th></tr></thead>
		<tbody>
			<tr><td>O</td><td>Other embedded generation at the grid exit point</td><td>MW</td></tr>
			<tr><td>I</td><td>Injection at the grid exit point, from the series kept in step 5</td><td>MW</td></tr>
			<tr><td>C</td><td>Non-solar generation Elenz already counts at that grid exit point: metered generation, gross embedded generation where the metered figure is net, and any plant filled in from dispatch data</td><td>MW</td></tr>
		</tbody>
	</table>
</div>
<p>C has to include every source, not only metered generation. At Matahina, metered generation stops in October 2021 and dispatch data fills it in. At Cobb, metered generation is net of local load and the gross figure comes from <a href={sourceHref('embedded')}>embedded generation</a>. Comparing with metered generation alone would count both as missing.</p>

<h3 id="periods">Which data each period uses</h3>
<p>Reconciliation data arrives a little before metered generation, so there are three periods:</p>
<div class="tbl">
	<table>
		<thead><tr><th>Period</th><th>What C is</th><th>How it is made</th></tr></thead>
		<tbody>
			<tr><td>Months with metered generation</td><td>Metered generation at the grid exit point</td><td>Injection less metered generation: both metered</td></tr>
			<tr><td>Recent weeks with reconciliation data but no metered generation yet</td><td>Dispatched generation at the grid exit point</td><td>Injection less dispatch data, averaged to half-hours</td></tr>
			<tr><td>The live week, and any weeks without reconciliation data</td><td>Not used</td><td>A typical day at each grid exit point (see below)</td></tr>
		</tbody>
	</table>
</div>
<p>The last period usually covers the 4 to 8 weeks before today. For it, each grid exit point gets its average for each half-hour of the day in two months, averaged together:</p>
<ul>
	<li>the latest month with reconciliation data, which follows recent changes, such as a new plant or a dry spell</li>
	<li>the same month a year earlier, which follows the season</li>
</ul>
<p>Each of these alone did worse when tested (see <a href="#accuracy">Accuracy and limitations</a>).</p>

<h3 id="named">Named plants</h3>
<p>Ngāwhā and Teviot have their own meters, so the metered history shows each as a whole plant. The dispatch data doesn’t:</p>
<ul>
	<li><b>Ngāwhā</b> (geothermal, near Kaikohe): only Ngāwhā B is dispatched. In the reconciliation data, one trader’s injection at the grid exit point matches the station’s metered output exactly.</li>
	<li><b>Teviot</b> (hydro, near Roxburgh): never dispatched. Its grid exit point also carries other hydro, so Teviot can’t be read straight from the reconciliation data. Its share of that point’s injection changes with the season, from most of it in spring to almost none in summer, so a fixed share won’t do.</li>
</ul>
<p>So that these plants don’t step down where the history meets the dispatch data, their missing output is filled in:</p>
<div class="tbl">
	<table>
		<thead><tr><th>Period</th><th>Ngāwhā</th><th>Teviot</th></tr></thead>
		<tbody>
			<tr><td>Months with metered generation</td><td>Metered output</td><td>Metered output</td></tr>
			<tr><td>Recent weeks with reconciliation data</td><td>Ngāwhā B’s dispatched output + what is left at its grid exit point, where nothing else injects</td><td>What is left at its grid exit point, less the other plants’ typical output there. The rest stays other embedded generation.</td></tr>
			<tr><td>The live week, and any weeks without reconciliation data</td><td>Ngāwhā B’s dispatched output + the rest of the station’s typical day</td><td>Its typical day</td></tr>
		</tbody>
	</table>
</div>
<p>A typical day here is made as for the layer: the plant’s own metered average for each half-hour of the day, from the latest metered month and the same month a year earlier, averaged together.</p>
<p>The filled-in output counts in the plant’s fuel, in total generation and in the renewable share, as the metered output does. It doesn’t change grid demand: demand from the dispatch data already matches the metered demand on average, and adding it put demand about 24 MW too high. Other embedded generation doesn’t change grid demand either: it is added only to demand with embedded generation (see <a href="/methods/demand">Demand</a>).</p>

<h3 id="fuel">Fuel</h3>
<p>Where a public document states the fuel at a grid exit point, we use it. Otherwise we split the grid exit point’s output by the <a href={sourceHref('guehmt')}>registry of installed distributed generation</a>. We take the capacity of each fuel there, less any dispatched plant at that point, and weight it by a typical capacity factor:</p>
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
<p>A capacity factor is a plant’s output as a share of what it would make running flat out. A grid exit point with no capacity in the registry is unclassified. Unclassified output counts in total generation but not as renewable, and has no emission factor. Landfill gas is renewable and has no emission factor, because its carbon is biogenic (see <a href="/methods/emissions">Emissions intensity</a>).</p>

<h3 id="example">Worked example</h3>
<p>These figures are illustrative. In one half-hour of a metered month, the series kept at a grid exit point inject 12 MW in total. A metered hydro station at the same grid exit point generated 5 MW.</p>
<div class="tbl">
	<table>
		<thead><tr><th>Step</th><th>Calculation</th><th class="n">MW</th></tr></thead>
		<tbody>
			<tr><td>Injection kept</td><td>Series left after steps 1 to 4</td><td class="n">12.0</td></tr>
			<tr><td>Already counted</td><td>The metered station</td><td class="n">5.0</td></tr>
			<tr><td>Other embedded generation</td><td>max(0, 12.0 − 5.0)</td><td class="n">7.0</td></tr>
		</tbody>
	</table>
</div>
<p>In the live week, the same grid exit point shows its typical figure for that half-hour of the day, say 6.5 MW, whatever the river is doing that day.</p>

<h2 id="interpret">How to interpret it</h2>
<p>Most of this output comes from small run-of-river hydro and plant that runs flat out, so the layer is nearly level through the day. It changes slowly, with rainfall and the seasons. It doesn’t respond to prices the way dispatched plant does.</p>
<p>In the live week the layer is a typical day, not a measurement. A flood or an outage at a small station won’t show until the month is published.</p>
<GoodFor rows={[
	{ use: 'Monthly or yearly energy, from January 2009', level: 'good', verdict: 'built from metered injection and metered generation.' },
	{ use: 'Half-hourly output, from January 2009', level: 'ok', verdict: 'metered, but sorting out solar is a rule of thumb.' },
	{ use: 'Recent weeks with reconciliation data', level: 'ok', verdict: 'metered injection less dispatch data.' },
	{ use: 'The live week and the newest weeks', level: 'care', verdict: 'a typical day from earlier months.', why: 'It doesn’t follow rain or outages.' },
	{ use: 'The split by fuel', level: 'care', verdict: 'stated for some grid exit points, estimated from the registry for the rest.' },
	{ use: 'One small plant', level: 'no', verdict: 'a grid exit point can carry several plants, and they are shown together.' },
	{ use: 'Before January 2009', level: 'no', verdict: 'the data isn’t complete enough.' },
]} />

<h2 id="accuracy">Accuracy and limitations</h2>
<div class="tbl">
	<table>
		<thead><tr><th>Figure</th><th>Status</th><th>Typical accuracy</th></tr></thead>
		<tbody>
			<tr><td>Other embedded generation, months with metered generation</td><td>Estimated</td><td>Both inputs are metered. The error is in sorting the series, and is small: the layer is level through the day.</td></tr>
			<tr><td>Other embedded generation, recent weeks with reconciliation data</td><td>Estimated</td><td>As above, with dispatch data for the plants already counted</td></tr>
			<tr><td>Other embedded generation, the live week and newest weeks</td><td>Estimated</td><td>A month’s average out by about 9% (16% in one month in ten)</td></tr>
			<tr><td>Ngāwhā and Teviot’s filled-in output, live week</td><td>Estimated</td><td>A month’s average out by about 5 MW for Ngāwhā (about 50 MW) and 2 MW for Teviot (about 4 MW)</td></tr>
			<tr><td>Split by fuel</td><td>Estimated</td><td>Stated where a public document gives the fuel; from the registry otherwise</td></tr>
		</tbody>
	</table>
</div>
<p>We tested the live estimate by predicting each month from 2023 to 2026 as it would have been made at the time: from the month two before it (about how old the latest published month is during the live week) and the same month a year earlier. It leaned neither way: over the test it was 0.3% high on average. A typical half-hour was out by about 13 MW, against an average of about 105 MW.</p>
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
<p>The solar test works on whole series. A trader that sells both solar and other output at one grid exit point could pass a little solar through. The layer’s shape by hour of day suggests very little gets in. In September 2026 it ranged between 109 and 128 MW through the day, and its evening rise is hydro following demand, not solar.</p>
<p>A grid exit point can carry several small plants, so they are shown together under the grid exit point’s name, unless a public document names the plant.</p>
<p>When the EA revises a month, the site reads the new figures and rebuilds that month.</p>

<h2 id="coverage">Historical coverage</h2>
<div class="tbl">
	<table>
		<thead><tr><th>Period</th><th>Status</th><th>Data</th></tr></thead>
		<tbody>
			<tr><td>August 1997 to December 2008</td><td>None</td><td>No complete half-hourly record covers these plants (see below). Any figure would be invented, so we show none. Ngāwhā and Teviot are in the metered history as plants throughout.</td></tr>
			<tr><td>January 2009 to the latest month with metered generation</td><td>Estimated</td><td>Injection less metered generation. Totals and shares step up at January 2009, by about 2% of generation (about 93 MW over 2009).</td></tr>
			<tr><td>Recent weeks with reconciliation data</td><td>Estimated</td><td>Injection less dispatch data</td></tr>
			<tr><td>The live week, and any weeks without reconciliation data</td><td>Estimated</td><td>A typical day from earlier months</td></tr>
		</tbody>
	</table>
</div>
<p>The reconciliation data starts in January 2005, but its first years aren’t complete enough to use:</p>
<ul>
	<li>Until February 2007, much of the embedded hydro seen in later years is missing.</li>
	<li>From March 2007 to April 2008, some retailers’ injection at city grid exit points follows the shape of demand, not of any plant.</li>
	<li>From May 2008 it is consistent with the years after.</li>
</ul>
<p>We start in January 2009, the first whole year of consistent data. It is also when the EA’s metered generation starts listing embedded stations, so both inputs change in the same month.</p>

<p class="note">Code: <a href={REPO + 'ingest/embedded.py'}><code>ingest/embedded.py</code></a>. Evidence: <a href={REPO + 'analysis/embedded_backtest.py'}><code>analysis/embedded_backtest.py</code></a>, <a href={REPO + 'analysis/embedded_split.py'}><code>analysis/embedded_split.py</code></a> and <a href={REPO + 'analysis/README.md'}><code>analysis/README.md</code></a>.</p>

<style>
	.data-status { padding: 10px 14px; border-radius: 4px; background: var(--surface); border: 1px solid var(--line); }
	.caveats { display: grid; gap: 6px; }
</style>
