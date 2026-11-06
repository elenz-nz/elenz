<script lang="ts">
	import { REPO, ref } from '../registry.js';
	import Calculations from '../Calculations.svelte';
	import DataSources from '../DataSources.svelte';
	import GoodFor from '../GoodFor.svelte';
	import References from '../References.svelte';
	import Shot from '../Shot.svelte';
</script>

<aside class="mt-caveats" aria-label="Key caveats">
	<p class="k">Key caveats</p>
	<ul>
		<li>Other embedded generation is a calculated estimate in every period, about 2% of generation, and starts in January 2009. In the newest weeks it is a typical day, which doesn’t follow rain, outages or new plant.</li>
		<li>Dispatch data isn’t a meter reading. On a river chain dispatched as a block, only the chain’s total is reliable.</li>
		<li>Glenbrook and Kawerau (Onepu) read differently in dispatch and metered data, so they can step where the two meet.</li>
	</ul>
	<p><a href="#limitations">Accuracy and limitations</a> has the detail.</p>
</aside>

<h2 id="introduction"><span id="shows"></span>Introduction</h2>
<p>Generation is the electricity produced by New Zealand’s power stations, shown in megawatts (MW) for each fuel and plant. The chart stacks the sources from the base up: geothermal, bioenergy, waste heat, Huntly’s coal/gas Rankine units, gas, diesel, hydro, wind, grid solar, other embedded generation and embedded solar. Batteries sit on top of the stack when discharging, and below zero when charging.</p>
<p>Grid solar is solar farms that the market dispatches. <a href="/methods/embedded-solar">Embedded solar</a> is solar on local networks that isn’t dispatched. <a href="/methods/other-embedded">Other embedded generation</a> is the rest of the generation on local networks that isn’t dispatched, mostly small hydro and landfill gas. Both are hatched on the chart because they are calculated estimates.</p>
<p>To use the chart’s controls, see <a href="/guide#generation">Using Elenz</a>. The other ways of grouping the sources are on the <a href="/methods/groupings">groupings page</a>.</p>

<h2 id="data-sources">Data sources</h2>
<p>Recent figures come from dispatch data. Elenz replaces them with metered data as the Electricity Authority (EA) publishes each month, and <a href="/methods/history#layers">History since 1997</a> explains how the layers fit together. Embedded solar and other embedded generation are calculated estimates in every period.</p>
<DataSources slug="generation" />

<h2 id="how-it-works">How it works</h2>

<h3 id="live">Dispatch data</h3>
<p>Every 5 minutes, the system operator solves the whole market for the coming interval. The result, called a dispatch case, gives each generating unit’s output and the price at each node. For most plants, that output is a target. For wind and solar, it is a snapshot of output at the time.</p>
<p>Elenz reads each case from the EA’s real-time dispatch feed, usually 1 to 2 minutes after the interval starts, and keeps the last 7 days. Each row in the feed is one unit at one connection point, such as <code>MPE1101 KWK0</code> for Kaiwaikawe wind farm. We look up the plant and fuel for each unit.</p>
<p>The live week comes from the feed alone. If Elenz misses an interval, it asks the feed again, because the feed keeps about a month. About 7–8% of 5-minute intervals have no dispatch case at all, and we fill each of these with a straight line between the intervals either side.</p>
<p>A case sometimes arrives with whole groups of rows missing. We treat a case as incomplete if an island’s load, leaving out Tiwai, or national generation is under 75% of the intervals around it. We do the same if the case has under 85% of the usual rows. We fill an incomplete case with the same kind of straight line, and ask for it again for the next 6 hours. The Generation tab labels filled intervals “interpolated”.</p>

<h3 id="mapping">From units to plants and fuels</h3>
<p>The EA’s <a href="/methods/sources#register">register of dispatched generation</a> gives each unit its plant, fuel and island. It keeps dated rows as units are added, moved and retired. The latest row for each unit wins, and retired units and old connections stay mapped so that the history can use them.</p>
<div class="tbl">
	<table>
		<thead><tr><th>Register fuel</th><th>Shown as</th></tr></thead>
		<tbody>
			<tr><td>Hydro, Wind, Geothermal, Solar, Diesel, Gas</td><td>The same name.</td></tr>
			<tr><td>Coal/Gas</td><td>Coal/gas, Rankine. Huntly units 1, 2 and 4 can burn coal or gas, and the market data doesn’t say which.</td></tr>
			<tr><td>Electrical energy</td><td>Battery. The register uses this fuel name for battery storage.</td></tr>
		</tbody>
	</table>
</div>
<p>The register is updated about twice a year, so it lags what is happening on the grid. A file of corrections (<a href={REPO + 'facilities/overrides.toml'}><code>facilities/overrides.toml</code></a>) fills the gaps, and every data build warns about any generating unit it can’t map.</p>
<div class="tbl">
	<table>
		<thead><tr><th>Correction</th><th>Units</th><th>Reason</th></tr></thead>
		<tbody>
			<tr><td>Plants added</td><td>Kaiwaikawe wind (<code>MPE1101 KWK0</code>), Kōwhai Park solar (<code>ISL0661 KPS0</code>), Ruakākā solar (<code>BRB0331 RUS0</code>)</td><td>These units are dispatching but aren’t in the register yet.</td></tr>
			<tr><td>Fuel changed to bioenergy</td><td>Kinleith (<code>KIN0112</code>)</td><td>Oji Fibre Solutions’ cogeneration runs on <a href={ref('kinleith')}>wood waste</a> and black liquor, with <a href={ref('stack2020')}>natural gas as a secondary fuel</a>. The register says gas.</td></tr>
			<tr><td>Fuel changed to waste heat</td><td>Glenbrook (<code>GLN0332</code>)</td><td>It runs on <a href={ref('nzsteel')}>waste gas and heat from NZ Steel’s ironmaking</a>, not pipeline gas.</td></tr>
			<tr><td>Island added</td><td>Connections <code>OHG1101</code> and <code>OHG2201</code></td><td>The feed gives these connections no island, so we assign them to the North Island. Pātea moved to <code>OHG1101</code> in June 2026.</td></tr>
			<tr><td>Battery charging netted</td><td><code>RUK99</code>, <code>GLB99</code>, <code>RHO99</code>, <code>HLY91</code></td><td>Charging is dispatched as load on a separate unit. We net it against its battery at Ruakākā, Glenbrook-Ohurua, Rotohiko and Huntly.</td></tr>
			<tr><td>Names merged</td><td>Pātea units 1–3, Kaimai 5, Ngāwhā B, West Wind 1 and 2</td><td>We show each of these under one plant name, so that dispatch data lines up with the metered history. Kaimai’s unit carries the whole scheme. Ngāwhā B is added to the rest of the station, as the plant notes explain. West Wind’s two connections are one wind farm.</td></tr>
			<tr><td>Name changed</td><td>Kawerau (Onepu) (<code>KAW0112 ONU0</code>)</td><td>The register calls this “Carter Holt Harvey Energy Ltd CoGen”. Its meter is a whole site’s connection to the grid, not the mill’s (see <a href="#onepu">Kawerau (Onepu)</a>).</td></tr>
		</tbody>
	</table>
</div>

<h3 id="totals">Totals, peaks and energy</h3>
<p>Total generation is the sum of every source’s output. It includes battery discharge, embedded solar and other embedded generation. It leaves out battery charging and the HVDC link, so an island’s total is what that island generated.</p>
<p>Peak generation is the highest total in the range. It uses 5-minute data for the live week, half-hours for 30 days, and each day’s highest half-hour for longer ranges.</p>
<p>On 5-minute and half-hourly intervals, the chart shows MW. On day, week, month and year intervals, it shows the energy generated in each interval. An interval still in progress shows the energy generated so far, and doesn’t count as a high or low.</p>
<p>When the tracker opens one plant, its nameplate line and capacity factor use the sum of its units’ nameplate MW in today’s register. For a plant seen only in the metered history, we use the most the register ever had installed at once. The mix table’s capacity factors use each plant’s capacity history instead (see <a href="/methods/capacity">Installed capacity</a>).</p>
<Calculations>
	<p class="formula">Total generation = the sum of each source’s output, counting a source only while its output is positive
Energy (MWh) = the sum of MW × hours, for each stored period
Capacity factor = energy ÷ (capacity MW × hours)</p>
	<div class="tbl">
		<table>
			<thead><tr><th>Term</th><th>Meaning</th><th>Unit</th></tr></thead>
			<tbody>
				<tr><td>Output</td><td>A source’s output in that region and period</td><td>MW</td></tr>
				<tr><td>Stored period</td><td>5 minutes in the live week, otherwise half-hours or days</td><td>Hours</td></tr>
				<tr><td>Capacity MW</td><td>Nameplate capacity for one plant, or installed capacity in the mix table</td><td>MW</td></tr>
			</tbody>
		</table>
	</div>
	<p class="k">Worked example</p>
	<p>These figures are illustrative. A 100 MW plant averages 60 MW for 24 hours. Its energy is 60 × 24 = 1,440 MWh. At full capacity it would produce 100 × 24 = 2,400 MWh, so its capacity factor is 1,440 ÷ 2,400 = 60%.</p>
</Calculations>

<h3 id="time-of-day">By time of day</h3>
<p>The time-of-day map shows the renewable share, or one fuel’s output, for every half-hour of the day. Each column is a half-hour from midnight, so daily and seasonal patterns stand out. It can show renewables, wind, solar, inverter-based generation (wind and solar), hydro, gas and coal/gas.</p>
<Shot name="tracker-heat" alt="The time-of-day map over 30 days: one row per day, one column per half-hour, coloured by the renewable share." caption="The time-of-day map on the Generation tab, over 30 days." />
<p>The map follows the range, with one row per day for at least the last 7 days and up to 400 days. On All it has one row per month or year, each the average of that half-hour across the period.</p>
<p>The renewable share uses fixed colour bands, so that different periods can be compared. The bands are under 80%, 80–88%, 88–93%, 93–96%, 96–98%, and 98% and over. The share is worked out as on the <a href="/methods/groupings#renewable">groupings page</a>.</p>
<p>A fuel’s colours use six steps on a fixed scale, set by today’s installed capacity of that fuel in the region shown. The top step starts at 80% of that capacity for half-hours, and at 60% for monthly averages, which smooth out the peaks. Earlier years show fainter colour where less was built.</p>
<p>“Scale to this view” replaces either scale with one fitted to what is shown. For the renewable share, it divides the shares shown into six groups of equal size. This helps in the early years, when most half-hours are under 80%.</p>

<h3 id="whole">Plant notes: stations shown whole</h3>
<p>The metered history sees some stations only as a whole, so Elenz shows each as one plant. Where dispatch data exists, each part of the station appears as a unit.</p>
<ul>
	<li><b>Huntly Rankines:</b> Huntly units 1–4.</li>
	<li><b>Stratford:</b> Taranaki Combined Cycle (closed March 2026) and Stratford peakers 1 and 2.</li>
	<li><b>Waikaremoana:</b> Tuai, Piripaua and Kaitawa.</li>
	<li><b>Te Mihi:</b> Te Mihi 1 and 2.</li>
	<li><b>Southdown:</b> Southdown and Southdown 5.</li>
</ul>
<p>Over a range that reaches back into the metered history, these stations show a “Whole station (metered)” row beside their units. The units cover only the weeks of dispatch data.</p>
<p>Three plants generate onto two buses, so they can be split by connection point: Arapuni (<code>ARI1101</code>, <code>ARI1102</code>), Roxburgh (<code>ROX2201</code>, <code>ROX1101</code>) and West Wind (<code>WWD1102</code>, <code>WWD1103</code>). Some other plants have more than one point in the metered history, such as a local network meter or a connection that moved. These are extra meters, not extra buses, so we show those plants whole.</p>

<h3 id="counted-differently">Plant notes: plants counted differently</h3>
<p>A few plants are counted differently in the metered history and the dispatch data.</p>
<ul>
	<li><b>Ngāwhā:</b> the metered history has the whole station, but the dispatch data has only Ngāwhā B. In months without metered generation, we fill in the rest of the station as a calculated estimate, so the plant shows the whole station (see <a href="/methods/other-embedded#named">Other embedded generation</a>).</li>
	<li><b>Teviot:</b> the metered history has its own meter, and it is never dispatched. In months without metered generation, we fill in all of it as a calculated estimate.</li>
	<li><b>Deep Stream and Mahinerangi:</b> one meter (<code>WPG0331</code>) has carried both since June 2011. We split it 30% and 70%, their average shares in the dispatch data from 2020 to 2026.</li>
	<li><b>Kawerau (Te Ahi O Maui) and Kawerau (TOPP2):</b> one metered code at <code>KAW2201</code> has carried both since December 2025. We split it 35% and 65%, by their dispatch shares.</li>
	<li><b>Glenbrook:</b> its metered output runs about 1.47 times the dispatch figure, because dispatch sees part of the plant. We show each as published.</li>
</ul>

<h3 id="onepu">Plant notes: Kawerau (Onepu)</h3>
<p>The register lists <code>KAW0112 ONU0</code> as one geothermal unit of 53 MW, under the mill’s name. Its meter shows a whole site’s connection to the grid instead.</p>
<p>Power flows both ways at this connection, usually in the same half-hour, on what look like separate circuits. Elenz counts only the power going into the grid, about 25 MW on average since 2014. That leaves out what the site uses itself and what it takes from the grid.</p>
<p>Until 2012 this connection was a load: about 1 MW or less went into the grid, and about 35–70 MW came out. That changed in 2013, about when <a href={ref('eastland-geo')}>Eastland’s 24 MW TOPP1 geothermal plant</a> started, and when much less power began coming out to the mill.</p>
<p>TOPP1 and Eastland’s 9 MW GDL plant have no row of their own in the register or the metered files. What goes into the grid here is mostly less than their combined 33 MW. We therefore show this meter as geothermal, as the register does, with <a href="/methods/emissions#geothermal">their emissions</a>.</p>
<p>That is our reading of the meters: no public document has been found which specifies the plant behind this one. The wider site also has the mill’s own generation, <a href={ref('tasman')}>biomass</a> and geothermal. Oji reports <a href={ref('ojifs2025')}>96 GWh generated at its Tasman mill in 2025</a>, against about 240 GWh into the grid here.</p>

<h2 id="interpretation">How to interpret it</h2>
<p>The height of the stack above zero is total generation, and each layer is one source’s part of it. Anything below zero is taking power, not supplying it.</p>
<p>On an island’s own chart, HVDC is drawn like a battery. Power arriving over the link is stacked on top, and power leaving goes below zero. The top of the stack is therefore what the island generated plus what it imported.</p>
<p>A step in one plant’s line doesn’t always mean its output changed. It may be the point where metered and dispatch data meet, so check the plant notes above before comparing the two sides of it.</p>
<GoodFor rows={[
	{ use: 'New Zealand or island generation by fuel, in history', level: 'good', verdict: 'Metered, for the stations the metering covers.' },
	{ use: 'One plant’s output, in history', level: 'good', verdict: 'Metered, unless the plant notes say a meter is shared or the plant is shown whole.' },
	{ use: 'Generation by fuel, recent weeks and live week', level: 'ok', verdict: 'Dispatch data agrees closely with metered data nationally.' },
	{ use: 'Total generation and shares, from January 2009', level: 'ok', verdict: 'They include other embedded generation, a calculated estimate of about 2% of generation.', why: 'Totals step up by that much in January 2009.' },
	{ use: 'One station on a river chain, recent weeks and live week', level: 'care', verdict: 'The dispatch figure may not be what that station generated.', why: 'Some chains are dispatched as a block, so use the chain’s total or the metered history.' },
	{ use: 'Whether Huntly’s Rankine units burned coal or gas', level: 'no', verdict: 'The market data doesn’t say which fuel they burned.' },
]} />

<h2 id="limitations"><span id="limits"></span>Accuracy and limitations</h2>
<div class="tbl">
	<table>
		<thead><tr><th>Figure</th><th>Status</th><th>Typical accuracy</th></tr></thead>
		<tbody>
			<tr><td>Output by plant and fuel, metered months</td><td>Metered</td><td>As published by the EA, apart from the shared meters we split</td></tr>
			<tr><td>Output by plant and fuel, recent weeks and live week</td><td>Dispatch</td><td>National wind and hydro within 0.2% of metered output, September 2020 to September 2026</td></tr>
			<tr><td>Battery output, all periods</td><td>Dispatch</td><td>Dispatch nets each battery’s charging, so it is used in metered months too</td></tr>
			<tr><td>Filled 5-minute intervals</td><td>Calculated estimate</td><td>A straight line between the intervals either side</td></tr>
			<tr><td>Embedded solar</td><td>Calculated estimate</td><td>About ±9% on clear days and ±19% under cloud (see <a href="/methods/embedded-solar#uncertainty">its uncertainty</a>)</td></tr>
			<tr><td>Other embedded generation, from January 2009</td><td>Calculated estimate</td><td>In the newest weeks, a month’s average out by about 9% (see <a href="/methods/other-embedded#limitations">its limits</a>)</td></tr>
			<tr><td>Ngāwhā and Teviot, months without metered generation</td><td>Calculated estimate</td><td>A month’s average out by 4.9 MW for Ngāwhā and 2.3 MW for Teviot</td></tr>
			<tr><td>Total generation, from January 2009</td><td>Calculated estimate</td><td>The sum of the figures above, so it carries their errors</td></tr>
		</tbody>
	</table>
</div>
<p>Other embedded generation is the largest estimated part of the total outside embedded solar. In the live week and the newest weeks it is a typical day from earlier months, so it doesn’t follow rain, outages or new plant. Its split by fuel comes partly from the registry of installed generation. Teviot’s output in those weeks is also entirely a typical day.</p>
<p>Before January 2009, plants on local networks that Elenz doesn’t show later are missing, about 2% of generation.</p>
<p>Dispatch data isn’t a meter reading. For most plants it is a target, and for wind and solar it is a snapshot of output at the time. Dispatched solar farms matched their metered output within 1–2% by half-hour in September 2026.</p>
<p>Dispatch and metered generation agree within a fraction of a percent for most plants. The exceptions are Glenbrook, Kawerau (Onepu) and the stations of block-dispatched river chains. Dispatch half-hours also reach slightly further at their extremes (see <a href="/methods/history#seam">where the sources hand over</a>).</p>
<p>Some river chains are <a href={ref('block')}>dispatched as one block</a>, which the market system calls a <a href={ref('dispatch')}>“block”</a>. The generator must meet the chain’s total but can divide it between stations, so one station’s dispatch figure may differ from what it generated. The chain’s total holds, and the metered history has each station’s output.</p>
<p>Huntly’s Rankine units are shown as coal/gas because the market data doesn’t say which fuel they burned. Their emissions use Genesis’s reported coal share each quarter (see <a href="/methods/emissions">Emissions intensity</a>).</p>

<h2 id="coverage">Historical coverage</h2>
<p>Each row marks a change in what the record can show. <a href="/methods/history#gaps">History since 1997</a> lists every known gap, including missing stations and months.</p>
<div class="tbl">
	<table>
		<thead><tr><th>From</th><th>Change</th></tr></thead>
		<tbody>
			<tr><td>August 1997</td><td>Metered generation starts, covering stations connected to the national grid.</td></tr>
			<tr><td>October 1998</td><td>Embedded generation meters start, most of them from April 1999. We use only stations that Elenz also shows later, so totals don’t jump in 2009.</td></tr>
			<tr><td>January 2009</td><td>Metered generation starts covering stations on local networks. Other embedded generation starts, as a calculated estimate, and totals step up by about 2% of generation.</td></tr>
			<tr><td>January 2013</td><td>Kawerau (Onepu) starts, shown as geothermal. The grid import meter stands in for it until January 2020.</td></tr>
			<tr><td>August 2013</td><td>Embedded solar starts, because the registry of installed systems starts then. It is a calculated estimate.</td></tr>
			<tr><td>10 September 2020</td><td>Daily dispatch files start, so unit-level dispatch data is available from here.</td></tr>
			<tr><td>November 2026</td><td>Kawerau (Onepu) moved to geothermal from January 2013, and other embedded generation joined totals and shares from January 2009. Both changes moved published figures.</td></tr>
		</tbody>
	</table>
</div>

<h2 id="references">References</h2>
<References slug="generation" />
