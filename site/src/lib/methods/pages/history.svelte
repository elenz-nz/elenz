<script lang="ts">
	import { REPO, ref, sourceHref } from '../registry.js';
	import DataSources from '../DataSources.svelte';
	import GoodFor from '../GoodFor.svelte';
	import Handover from '../Handover.svelte';
	import References from '../References.svelte';
</script>

<aside class="mt-caveats" aria-label="Key caveats">
	<p class="k">Key caveats</p>
	<ul>
		<li>Totals step up by about 2% of generation in January 2009, when other embedded generation starts. Before then those plants are missing.</li>
		<li>Annual totals from 1999 run 1% to 3.2% below MBIE’s net generation, which also counts generation the Electricity Authority’s data doesn’t show.</li>
		<li>Glenbrook and Kawerau (Onepu) read differently in metered and dispatch data, so each can step where the two meet.</li>
	</ul>
	<p><a href="#limitations">Accuracy and limitations</a> has the detail.</p>
</aside>

<h2 id="introduction">Introduction</h2>
<p>The history is the record behind every view older than the live week. It runs back to 1 August 1997, and holds generation by plant and fuel, grid demand, HVDC transfer and prices.</p>
<p>Elenz builds it month by month, so that one time axis can run from 1997 to today. Plants that have closed stay in the record, including New Plymouth, Ōtāhuhu A and B, Southdown, Te Awamutu and the Taranaki Combined Cycle.</p>

<h2 id="data-sources"><span id="layers"></span>Data sources</h2>
<Handover />
<p>Each dataset does the following job in the history.</p>
<DataSources slug="history" />

<h2 id="how-it-works">How it works</h2>
<p>The history job runs every 6 hours. It adds each month as the Electricity Authority (EA) publishes it, and rebuilds every month when the plant register, the corrections or the metered plant table change.</p>

<h3 id="metered">A metered month</h3>
<p>A metered month is built half-hour by half-hour from the EA’s monthly files. Each step below deals with one way the files need interpreting.</p>
<dl>
	<dt>Mapping</dt>
	<dd>Each code in <a href={sourceHref('genmd')}>metered generation</a> (<code>Generation_MD</code>) is mapped to a plant, fuel and island in <a href={REPO + 'facilities/metered_plants.csv'}><code>facilities/metered_plants.csv</code></a>, with date ranges and shares. Many connection points in these files are retired, so <a href={sourceHref('nsp')}>network supply points</a> supplies their islands. Each build warns about any code it doesn’t recognise.</dd>
	<dt>Stations on local networks</dt>
	<dd>Metered generation covers these stations only from January 2009. Before that, we read <a href={sourceHref('embedded')}>embedded generation</a> (<code>Embedded_generation</code>) under the old meter codes, such as Rotokawa <code>RKA0111</code>, Ngāwhā <code>NGA0331</code> and Tararua <code>TWF0331</code> and <code>TWF0332</code>. We include only stations that Elenz also shows later.</dd>
	<dt>Net meters</dt>
	<dd>At some connection points on local networks, metered generation is net of local load. It reads only about 10% of Mangahao’s gross output, about 35% of Cobb’s and about 50% of Whareroa’s. Where the embedded generation meter reads more, we add the difference to that point’s plant.</dd>
	<dt>Shared meters</dt>
	<dd>Two meters each carry two plants, and we split them by their shares in the dispatch data. Deep Stream and Mahinerangi are split 30% and 70% from June 2011. Kawerau (Te Ahi O Maui) and Kawerau (TOPP2) are split 35% and 65% from December 2025.</dd>
	<dt>Repeated rows</dt>
	<dd>Pātea has three unit rows from June 2026, and each repeats the station total, so we use one.</dd>
	<dt>Doubled readings</dt>
	<dd>Trustpower’s embedded meters at Kaimai, Rotokawa, Tararua, Highbank, Paerau, Waipori and Teviot read double until July 2005. We halve a month’s reading if its peak is more than 1.4 times the plant’s nameplate capacity.</dd>
	<dt>Plants filled from dispatch data</dt>
	<dd>Some plants use their dispatch figures even in a metered month. Batteries always do, because dispatch nets their charging. So do solar farms not yet in the metered data, and any plant whose metered energy is under half its dispatch energy.</dd>
	<dt>Demand and HVDC transfer</dt>
	<dd>These come from the metered grid flows, as <a href="/methods/demand#history">Demand</a> and <a href="/methods/hvdc#metered">HVDC transfer</a> explain.</dd>
	<dt>Embedded generation</dt>
	<dd><a href="/methods/embedded-solar">Embedded solar</a> and <a href="/methods/other-embedded">other embedded generation</a> are added as calculated estimates. Each page explains how its layer is made.</dd>
</dl>

<h3 id="seam">Where the sources hand over</h3>
<p>Where both exist, the dispatch and metered figures agree closely. Over September 2020 to September 2026, national wind and hydro agree within 0.2%, and demand agrees within 1% in each island. National generation has a half-hourly correlation of 0.999 in every month.</p>
<p>A few plants differ, and we treat them in two ways.</p>
<ul>
	<li><b>Ngāwhā and Teviot:</b> the dispatch data has only part of Ngāwhā and none of Teviot. We fill in the rest of each as a calculated estimate, so neither steps at the handover. <a href="/methods/other-embedded#named">Other embedded generation</a> explains how. This fill counts in the plant, its fuel and total generation. It doesn’t count in grid demand.</li>
	<li><b>Glenbrook:</b> dispatch sees part of the plant, and its metered output runs about 1.47 times the dispatch figure. We show each as published, so Glenbrook can step down at the handover.</li>
	<li><b>Kawerau (Onepu):</b> its meter is a whole site’s connection to the grid, and its metered output runs about 0.68 times the dispatch figure. We show each as published, so it can step up at the handover (see <a href="/methods/generation#onepu">Kawerau (Onepu)</a>).</li>
</ul>
<p>Some river chains are <a href={ref('block')}>dispatched as a block</a>. One station’s dispatch figure on such a chain can differ from what it generated, while the chain’s total agrees with the meters.</p>
<p>Dispatch data also reaches slightly further at its extremes. A month’s highest half-hour of wind reads about 10 MW above the metered figure nationally, and hydro and demand read about 20 to 25 MW above. We correct for these differences before a dispatch figure counts towards a <a href="/methods/records#official">provisional record</a>.</p>

<h3 id="resolution">Half-hours and longer intervals</h3>
<p>The 30-day view shows half-hours. The 1-year and All views show days, or weeks, months and years. Generation is shown as each interval’s energy, and demand, HVDC transfer and prices as its average.</p>
<p>Peak demand and peak generation come from each day’s highest half-hour. Energy figures add up the half-hours, so they are the same at any interval.</p>

<h2 id="interpretation">How to interpret it</h2>
<p>A long line on the Tracker joins several kinds of data. National figures are consistent across the joins, but a few things change along the way.</p>
<p>A step in January 2009 is the start of other embedded generation, not a change in the power system. Keep that in mind when comparing a total or a renewable share across that month. A step in one plant’s line within the last 10 weeks or so may be the handover to dispatch data.</p>
<GoodFor rows={[
	{ use: 'National generation and demand since 2009', level: 'good', verdict: 'Metered for most of the total, with other embedded generation added as a calculated estimate.' },
	{ use: 'Comparing totals across January 2009', level: 'care', verdict: 'Totals step up by about 2% of generation that month.', why: 'Compare hydro, wind or thermal generation instead, because other embedded generation sits outside those fuels.' },
	{ use: 'One plant, metered history', level: 'good', verdict: 'Metered, unless a meter is shared or the plant is shown whole.' },
	{ use: 'One plant, recent weeks', level: 'ok', verdict: 'Dispatch data agrees closely for most plants.', why: 'Glenbrook, Kawerau (Onepu) and stations on block-dispatched chains can differ.' },
	{ use: 'Local-network plants before January 2009', level: 'no', verdict: 'Only stations that Elenz also shows later are in the history before that month.' },
]} />

<h2 id="limitations"><span id="checks"></span>Accuracy and limitations</h2>
<div class="tbl">
	<table>
		<thead><tr><th>Figure</th><th>Status</th><th>Typical accuracy</th></tr></thead>
		<tbody>
			<tr><td>Generation by plant and fuel, metered history</td><td>Metered</td><td>As published by the EA, apart from the corrections under A metered month</td></tr>
			<tr><td>Generation by plant and fuel, recent dispatch data</td><td>Dispatch</td><td>National wind and hydro within 0.2% of metered output, September 2020 to September 2026</td></tr>
			<tr><td>Grid demand, recent dispatch data</td><td>Dispatch</td><td>Within 1% of metered demand in each island, September 2020 to September 2026</td></tr>
			<tr><td>Prices, history</td><td>Final price</td><td>As published by the EA</td></tr>
			<tr><td>HVDC transfer after the latest published month</td><td>Calculated estimate</td><td>Mean error of about 10 MW (see <a href="/methods/hvdc#limitations">HVDC transfer</a>)</td></tr>
			<tr><td>Embedded solar</td><td>Calculated estimate</td><td>About ±9% on clear days and ±19% under cloud (see <a href="/methods/embedded-solar#uncertainty">Embedded solar</a>)</td></tr>
			<tr><td>Other embedded generation, newest weeks</td><td>Calculated estimate</td><td>A month’s average out by about 9% (see <a href="/methods/other-embedded#limitations">Other embedded generation</a>)</td></tr>
			<tr><td>Total generation, from January 2009</td><td>Calculated estimate</td><td>The sum of the figures above, so it carries their errors</td></tr>
		</tbody>
	</table>
</div>
<p>We compare the history’s annual totals with <a href={ref('mbie-elec')}>MBIE’s net generation</a>, using the figures published on <a href={ref('figure-net')}>Figure.NZ</a>. MBIE also counts industrial cogeneration and small plant that the EA’s metered data doesn’t see, as <a href={ref('mbie-methods')}>its sources and methods</a> explain.</p>
<div class="tbl">
	<table>
		<thead><tr><th>Years</th><th class="n">Elenz total below MBIE</th></tr></thead>
		<tbody>
			<tr><td>1998</td><td class="n">7.6%</td></tr>
			<tr><td>1999–2008</td><td class="n">1.7–3.2%</td></tr>
			<tr><td>2009–19</td><td class="n">1.6–2.6%</td></tr>
			<tr><td>2020–24</td><td class="n">1.0–1.6%</td></tr>
		</tbody>
		<caption>Elenz’s total includes embedded solar and other embedded generation, and leaves out battery discharge.</caption>
	</table>
</div>
<p>The gap has no step at 2009: it is 2.3% in 2008 and 2.0% in 2009. Before other embedded generation was added, it widened from 2.3% to 3.9% between those years. In 1998, the embedded generation meters are still incomplete.</p>
<p>Emissions follow the national inventory from year to year (see <a href="/methods/emissions#checks">Emissions intensity</a>).</p>
<p>Today’s owners apply to the whole history. <a href="/methods/groupings">Renewable share and groupings</a> explains what that means for the By owner view.</p>

<h2 id="coverage"><span id="gaps"></span>Historical coverage</h2>
<p>Each row marks a change in the data or a known gap in it.</p>
<div class="tbl">
	<table>
		<thead><tr><th>Period</th><th>What changes or is missing</th></tr></thead>
		<tbody>
			<tr><td>August 1997</td><td>The history starts, with metered generation for grid-connected stations.</td></tr>
			<tr><td>August 1997 to March 1999</td><td>Embedded generation doesn’t yet have Rotokawa, Ngāwhā, Kaimai and Tararua, about 1–2% of generation. Geothermal generation in 1998 to 2000 is up to 15% below MBIE’s figure.</td></tr>
			<tr><td>August 1997 to September 2008</td><td>Metered generation numbers the days the clocks change by the clock, and leaves out one hour. We put each half-hour at its right time and fill the missing hour from the half-hour next to it.</td></tr>
			<tr><td>December 1997 to December 2002</td><td>38 months of HVDC flows hold only each end’s sending side (see <a href="/methods/hvdc#coverage">HVDC transfer</a>).</td></tr>
			<tr><td>To April 2002</td><td>Highbank (25 MW) has no metered rows before October 2001, and its rows read next to nothing until April 2002.</td></tr>
			<tr><td>To about 2003</td><td>Grid imports are incomplete, so the stations’ own metered generation stands in (see <a href="/methods/demand#history">Demand</a>).</td></tr>
			<tr><td>January 2009</td><td>Metered generation starts covering stations on local networks. Other embedded generation starts, as a calculated estimate, about 2% of generation.</td></tr>
			<tr><td>January 2013 to December 2019</td><td>Metered generation has no row for Kawerau (Onepu) until January 2020, so grid imports at <code>KAW0112</code> stand in. From January 2020 the two figures match to the half-hour.</td></tr>
			<tr><td>August 2013</td><td>Embedded solar starts, as a calculated estimate.</td></tr>
			<tr><td>May 2014 to August 2015</td><td>Mill Creek wind farm’s first 16 months aren’t in metered generation or embedded generation. They come from Meridian’s injection at Wilton in the reconciliation data.</td></tr>
			<tr><td>September 2020</td><td>Metered generation has no Huntly rows. We use the grid meter at <code>HLY2201</code>, split between the Rankines, unit 5 and unit 6 by clearing it through their offers. Tested on the week before, the split came within about 13 MW for the Rankines and 5 MW for unit 5.</td></tr>
			<tr><td>10 September 2020</td><td>Daily dispatch files start, so recent dispatch data is possible from here.</td></tr>
			<tr><td>October 2021 onward</td><td>Metered generation has no rows for Matahina, so dispatch figures stand in.</td></tr>
			<tr><td>1 November 2022</td><td>Real-time pricing starts, which changes how final prices are set (see <a href="/methods/prices#coverage">Wholesale prices</a>).</td></tr>
			<tr><td>November 2026</td><td>Kawerau (Onepu) moved to geothermal from January 2013, and other embedded generation joined totals and shares from January 2009. Both changes moved published figures.</td></tr>
		</tbody>
	</table>
</div>

<h2 id="references">References</h2>
<References slug="history" />
