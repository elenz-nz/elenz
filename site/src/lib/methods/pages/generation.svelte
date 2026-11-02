<script lang="ts">
	import { REPO, ref } from '../registry.js';
</script>

<h2 id="shows">What the chart shows</h2>
<p>The generation chart stacks every source in MW, from the base: geothermal, bioenergy, waste heat, Huntly’s coal/gas Rankine units, gas, diesel, hydro, wind, grid-scale solar and embedded solar (hatched, as it is an estimate), with batteries as a separate layer (below zero while charging). On an island’s own chart, HVDC is shown like the batteries: arriving over the link it is stacked on top, leaving it goes below zero, so the top of the stack is what the island generated plus what it imported. It can also show each source as a percentage of total generation, group the sources in other ways (see <a href="/methods/groupings">groupings</a>), and drill down, from the list beside the chart, from a fuel to its plants and from a plant to its grid connections or units.</p>
<p>The chart buttons switch it between the stack and lines: each source drawn on its own from zero, in the same units, so plants or fuels can be compared directly. Fuels and groups keep their colours; when two to eight plants or sites of one fuel are shown, each gets its own colour from a separate palette chosen to stay distinguishable with colour-blindness, and keeps it while others are hidden or shown. Embedded solar is dashed and HVDC dotted. The stack’s highest and lowest points are labelled; the lines view leaves that to the tooltip and the list.</p>
<p>$ Price draws the island reference prices over the chart on a right-hand axis (both for New Zealand, the island’s own on an island’s chart), on the same spike-proof scale as the Prices tab (see <a href="/methods/prices#scales">price scales</a>). It is off unless chosen. Each chart’s unit is written under the top label of its axis: MW for 5-minute and half-hourly points, energy (MWh, GWh or TWh) for days and longer, or % for shares.</p>

<h2 id="live">The live week: dispatch data</h2>
<p>Every five minutes the system operator runs a dispatch case: a solve of the whole market that sets each generating unit’s output for the next interval and the price at every node. The site reads each case from the Electricity Authority’s real-time dispatch feed, usually a minute or two after the interval starts, and keeps the last seven days at 5-minute resolution.</p>
<ul>
	<li>Each row in the feed is one unit at one grid connection point, keyed by both (for example <code>MPE1101 KWK0</code>, Kaiwaikawe wind farm). Fuel and plant are looked up per unit, so a connection point with more than one kind of plant isn’t a problem.</li>
	<li>Dispatch MW is what each unit was dispatched to generate. For most plant that follows what it actually did: dispatched solar farms matched their metered output within 1–2% by half-hour in September 2026. Once the metered data for a month is published, history uses that instead (see <a href="/methods/history">history</a>).</li>
	<li>Some river chains are <a href={ref('block')}>dispatched as one block</a> (<a href={ref('dispatch')}>“blocks” in the market system</a>): the owner only has to meet the chain’s total, so the dispatch figure for a single station on such a chain is not necessarily what that station generated. The chain’s total is right. The metered history has each station’s real output.</li>
	<li>The live week comes from the feed alone. An interval the site missed is asked for again (the feed keeps about a month), and one the feed has no case for, about 7–8% of 5-minute intervals, is filled by a straight line between the intervals either side. The EA’s daily dispatch files, the same cases 1–4 days later, are used once days move into the history behind the live week.</li>
	<li>Now and then a case arrives from the feed incomplete, with whole groups of rows missing (on 19 Oct 2026 at 1 pm, an island’s load and most generation for ten minutes). An interval whose island load (Tiwai aside) or national generation is under three-quarters of the intervals either side, or that has far fewer rows than usual, is treated the same way and fetched again for the next six hours. The summary table says “interpolated” when the time line is on a filled interval.</li>
	<li>The page shows “Live” while the newest interval is under 15 minutes old, and “Delayed” after that.</li>
</ul>

<h2 id="mapping">From units to plants and fuels</h2>
<p>Each unit is matched to a plant, a fuel and an island through the EA’s register of dispatched generation (<code>DispatchedGenerationPlant.csv</code>). The register keeps dated rows as units are added, moved and retired; the latest row for each unit wins, and retired units and old connections stay mapped so the history can use them.</p>
<div class="tbl">
	<table>
		<thead><tr><th>Register fuel</th><th>Shown as</th></tr></thead>
		<tbody>
			<tr><td>Hydro, Wind, Geothermal, Solar, Diesel, Gas</td><td>The same</td></tr>
			<tr><td>Coal/Gas</td><td>Coal/gas, Rankine: Huntly units 1, 2 and 4 burn coal or gas, and the market data doesn’t say which</td></tr>
			<tr><td>Electrical energy</td><td>Battery</td></tr>
		</tbody>
	</table>
</div>
<p>The register is updated about twice a year, so it lags what is happening on the grid. A curated file of corrections (<a href={REPO + 'facilities/overrides.toml'}><code>facilities/overrides.toml</code></a>) fills the gaps, and every data build warns about any generating unit it can’t map:</p>
<div class="tbl">
	<table>
		<thead><tr><th>Correction</th><th>Units</th><th>Why</th></tr></thead>
		<tbody>
			<tr><td>Added</td><td>Kaiwaikawe wind (<code>MPE1101 KWK0</code>), Kōwhai Park solar (<code>ISL0661 KPS0</code>), Ruakākā solar (<code>BRB0331 RUS0</code>)</td><td>Dispatching, but not in the register yet</td></tr>
			<tr><td>Bioenergy</td><td>Kinleith (<code>KIN0112</code>)</td><td>Oji Fibre Solutions’ cogeneration, on <a href={ref('kinleith')}>wood waste</a> and black liquor, with <a href={ref('stack2020')}>natural gas as a secondary fuel</a>; the register says gas</td></tr>
			<tr><td>Bioenergy</td><td>Kawerau mill site (<code>KAW0112 ONU0</code>)</td><td>The register says geothermal. The site has <a href={ref('tasman')}>biomass</a> and geothermal generation, and what this meter covers isn’t confirmed, so it is shown as bioenergy for now. Oji reports 96 GWh generated at its Tasman mill in <a href={ref('ojifs2025')}>2025</a>, against about 240 GWh here</td></tr>
			<tr><td>Waste heat</td><td>Glenbrook (<code>GLN0332</code>)</td><td>Runs on <a href={ref('nzsteel')}>waste gas and heat from NZ Steel’s ironmaking</a>, not pipeline gas</td></tr>
			<tr><td>Island</td><td><code>OHG1101</code>, <code>OHG2201</code></td><td>Pātea moved to OHG1101 in June 2026, and the feed gives it no island</td></tr>
			<tr><td>Battery charging</td><td><code>RUK99</code>, <code>GLB99</code>, <code>RHO99</code>, <code>HLY91</code></td><td>Charging is dispatched as load on a separate unit; it is netted against its battery (Ruakākā, Glenbrook-Ohurua, Rotohiko, Huntly)</td></tr>
			<tr><td>One name</td><td>Pātea units 1–3; Kaimai 5; Ngāwhā B; West Wind 1 and 2</td><td>Shown as Pātea, Kaimai, Ngāwhā and West Wind: the names the metered history uses, and one farm for West Wind’s two connections</td></tr>
		</tbody>
	</table>
</div>

<h3 id="whole">Stations shown whole</h3>
<p>The metered history only sees some stations as a whole, so they are one plant everywhere on the site, with their register plants as units where the dispatch data has them:</p>
<ul>
	<li><b>Huntly Rankines</b>: Huntly units 1–4.</li>
	<li><b>Stratford</b>: Taranaki Combined Cycle (closed March 2026) and Stratford peakers 1 and 2.</li>
	<li><b>Waikaremoana</b>: Tuai, Piripaua and Kaitawa.</li>
	<li><b>Te Mihi</b>: Te Mihi 1 and 2.</li>
	<li><b>Southdown</b>: Southdown and Southdown 5.</li>
</ul>
<p>Three plants generate onto two buses and can be split by grid connection: Arapuni (<code>ARI1101</code>, <code>ARI1102</code>), Roxburgh (<code>ROX2201</code>, <code>ROX1101</code>) and West Wind (<code>WWD1102</code>, <code>WWD1103</code>). The metered history has more than one point for some other plants, but those are meters rather than grid connections (an embedded plant’s local network point, a connection that moved), so those plants are shown whole.</p>
<p>The metered history sees the stations above only whole, so over a range that reaches back into it they show a “Whole station (metered)” row beside their units, which cover only the dispatch data’s weeks.</p>
<p>A few other plants are counted differently in the metered history than in the dispatch data:</p>
<ul>
	<li><b>Kaimai</b> and <b>Ngāwhā</b>: the metered history has the whole scheme or station, but the dispatch data has only one dispatched unit (Kaimai 5; Ngāwhā B), so the live week shows less than their full output.</li>
	<li><b>Deep Stream</b> and <b>Mahinerangi</b>: one meter (<code>WPG0331</code>) carries both from June 2011, split 30% and 70% by their average shares in the dispatch data, 2020–26.</li>
	<li><b>Kawerau (Te Ahi O Maui)</b> and <b>Kawerau (TOPP2)</b>: one metered code at <code>KAW2201</code> carries both from December 2025, split 35% and 65% by their dispatch shares.</li>
	<li><b>Glenbrook</b>: its metered output runs about 1.45 times the dispatch data’s figure.</li>
</ul>
<p>When the tracker drills into one of these plants, or a station shown whole, it says what its metered history counts, and lists any other names the plant has had or goes by (Taranaki Combined Cycle for Stratford, Tekapo for Takapō, Waverley for Waipipi, and the project names newer solar farms were built under, such as Kaitaia for Kohirā and Waiotahe for Te Herenga o Te Rā). The list’s filter and the search on Now find plants by those names too.</p>

<h2 id="totals">Totals, peaks and capacity</h2>
<p class="formula">Total generation = Σ every source’s output while positive
<small>includes battery discharge and embedded solar; leaves out the HVDC link and battery charging</small></p>
<ul>
	<li>An island’s total is that island’s own generation; power arriving over the HVDC link isn’t counted.</li>
	<li>Peak generation is the highest 5-minute total in the range (half-hourly in the 30-day view; on longer ranges, each day’s highest half-hour).</li>
	<li>With no point in time selected, the summary table shows each source’s energy over the range: MW × hours, summed, in GWh (TWh once the total passes 10,000 GWh).</li>
	<li>Where each point is a day, week, month or year, the generation chart and the summary at a point show energy (the average MW × the point’s hours) in MWh, GWh or TWh to suit the size, rather than an average MW, which reads low for anything that varies through the day. These views start at the first whole period in the range; the period still in progress shows its energy so far and isn’t counted as a high or low. A single plant’s nameplate line shows only on the MW views.</li>
	<li>When the tracker drills into one plant, its nameplate line and capacity factor use the sum of its units’ nameplate MW in the register today (for plants seen only in the metered history, the most the register ever had installed at once). The mix table’s capacity factors use each plant’s capacity history instead (see <a href="/methods/capacity">installed capacity</a>).</li>
</ul>

<h2 id="time-of-day">By time of day</h2>
<p>Under the Generation tab’s charts, the time-of-day map shows the renewable share, or one fuel’s output, for every half-hour of the day: one column per half-hour from midnight, so daily and seasonal patterns stand out. Its buttons pick the same choices as the share card above it: renewables, wind, solar, inverter-based (wind and solar), hydro, gas and coal/gas.</p>
<ul>
	<li><b>Rows.</b> It follows the range: one row per day (at least the last seven days, up to 400 days, from the half-hourly history and the live week), scrolling once there are more than 40, newest at the foot. On All it has one row per month (or per year, on the yearly interval), each the average of that half-hour across the month, from a file the history job keeps of every month’s time-of-day averages.</li>
	<li><b>Renewable share colours.</b> Fixed bands, so different periods compare: under 80% (brown, half-hours that leaned on thermal plant), 80–88%, 88–93%, 93–96%, 96–98%, and 98% and over (green). “Scale to this view” sets the bands at the sixths of the shares shown instead, which the early years need: most of their half-hours are under 80%.</li>
	<li><b>A fuel’s colours.</b> Six steps on a fixed scale set by today’s installed capacity of that fuel in the region shown, the top step starting at 80% of it for half-hours (60% for monthly averages, which smooth out the peaks). Earlier years show fainter colour where less was built, in light and dark mode alike. “Scale to this view” fits the steps to the output shown.</li>
	<li>The renewable share is worked out as on the <a href="/methods/groupings#renewable">groupings page</a>; embedded solar counts, battery discharge doesn’t.</li>
</ul>

<h2 id="limits">Known limits</h2>
<ul>
	<li>Plants on local networks that aren’t dispatched don’t appear as generation in the live week: their output shows up as lower demand at the grid. Embedded solar is the exception, and is modelled. The rest came to about 120–165 MW on average in January, June and September 2026, close to 3% of generation and steady day and night: mostly small hydro, Ngāwhā’s older units (about 25 MW) and landfill gas (about 20 MW), with a little wind, gas and diesel. So a 24% solar share in the live week is about 23% of all generation, and the renewable share reads slightly low. (Measured from the EA’s <a href="/methods/sources#reconciliation">reconciled injection</a> less the dispatch data, grid point by grid point.)</li>
	<li>The metered history already counts all of Ngāwhā and Teviot’s own meter, so both step down where the history hands over to the dispatch data. The other plants are missing from the history too, about 2% of generation.</li>
	<li>Dispatch and metered generation agree within a fraction of a percent for most plants, but not for Ngāwhā, Glenbrook, Kawerau Mill or the stations of block-dispatched river chains, and dispatch half-hours reach slightly further at their extremes. See <a href="/methods/history#seam">where the sources hand over</a>.</li>
	<li>Huntly’s Rankine units are shown as coal/gas, because the market data doesn’t say which fuel they burned. Their emissions use Genesis’s reported coal share each quarter (see <a href="/methods/emissions">emissions</a>).</li>
</ul>

<p class="note">Code: <a href={REPO + 'ingest/build_tracker.py'}><code>ingest/build_tracker.py</code></a> (units to plants and fuels), <a href={REPO + 'ingest/update.py'}><code>ingest/update.py</code></a> (the 5-minute job), <a href={REPO + 'ingest/emi_live.py'}><code>ingest/emi_live.py</code></a> (the feed).</p>
