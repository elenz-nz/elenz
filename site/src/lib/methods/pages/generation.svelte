<script lang="ts">
	import { REPO } from '../registry.js';
</script>

<h2 id="shows">What the chart shows</h2>
<p>The generation chart stacks every source in MW, from the base: geothermal, bioenergy, waste heat, Huntly’s coal/gas Rankine units, gas, diesel, hydro, wind, grid-scale solar and embedded solar (hatched, as it is an estimate), with batteries as a separate layer (below zero while charging). On an island’s own chart, HVDC is shown like the batteries: arriving over the link it is stacked on top, leaving it goes below zero, so the top of the stack is what the island generated plus what it imported. It can also show each source as a percentage of total generation, group the sources in other ways (see <a href="/methods/groupings">groupings</a>), and drill down from a fuel to its plants, and from a plant to its grid connections or units.</p>

<h2 id="live">The live week: dispatch data</h2>
<p>Every five minutes the system operator runs a dispatch case: a solve of the whole market that sets each generating unit’s output for the next interval and the price at every node. The site reads each case from the Electricity Authority’s real-time dispatch feed, usually a minute or two after the interval starts, and keeps the last seven days at 5-minute resolution.</p>
<ul>
	<li>Each row in the feed is one unit at one grid connection point, keyed by both (for example <code>MPE1101 KWK0</code>, Kaiwaikawe wind farm). Fuel and plant are looked up per unit, so a connection point with more than one kind of plant isn’t a problem.</li>
	<li>Dispatch MW is what each unit was dispatched to generate. For most plant that follows what it actually did: dispatched solar farms matched their metered output within 1–2% by half-hour in September 2026. Once the metered data for a month is published, history uses that instead (see <a href="/methods/history">history</a>).</li>
	<li>The Waikato hydro stations are dispatched as one block: Mercury only has to meet the chain’s total, so the dispatch figure for a single Waikato station is not necessarily what that station generated. The chain’s total is right. The metered history has each station’s real output.</li>
	<li>The live week comes from the feed alone. An interval the site missed is asked for again (the feed keeps about a month), and one the feed has no case for, about 5–8% of 5-minute intervals, is filled by a straight line between the intervals either side. The EA’s daily dispatch files, the same cases 1–4 days later, are used once days move into the history behind the live week. Now and then a case arrives from the feed incomplete, with whole groups of rows missing (on 19 Oct 2026 at 1 pm, an island’s load and most generation for ten minutes). An interval whose island load (Tiwai aside) or national generation is under three-quarters of the intervals either side, or that has far fewer rows than usual, is treated the same way and fetched again for the next six hours. The summary table says “interpolated” when the time line is on a filled interval.</li>
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
			<tr><td>Bioenergy</td><td>Kinleith (<code>KIN0112</code>)</td><td>Oji Fibre Solutions’ wood-waste cogeneration; the register says gas</td></tr>
			<tr><td>Bioenergy</td><td>Kawerau pulp mill cogeneration (<code>KAW0112 ONU0</code>)</td><td>The mill’s recovery and bark boilers (black liquor and wood); the register says geothermal</td></tr>
			<tr><td>Waste heat</td><td>Glenbrook (<code>GLN0332</code>)</td><td>Runs on waste gas and heat from NZ Steel’s ironmaking, not pipeline gas</td></tr>
			<tr><td>Island</td><td><code>OHG1101</code>, <code>OHG2201</code></td><td>Pātea moved to OHG1101 in June 2026, and the feed gives it no island</td></tr>
			<tr><td>Battery charging</td><td><code>RUK99</code>, <code>GLB99</code>, <code>RHO99</code>, <code>HLY91</code></td><td>Charging is dispatched as load on a separate unit; it is netted against its battery (Ruakākā, Glenbrook-Ohurua, Rotohiko, Huntly)</td></tr>
			<tr><td>One name</td><td>Pātea units 1–3; Kaimai 5; Ngāwhā B</td><td>Shown as Pātea, Kaimai and Ngāwhā, the names the metered history uses</td></tr>
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
<p>Two plants generate onto two buses and can be split by grid connection: Arapuni (<code>ARI1101</code>, <code>ARI1102</code>) and Roxburgh (<code>ROX2201</code>, <code>ROX1101</code>).</p>

<h2 id="totals">Totals, peaks and capacity</h2>
<p class="formula">Total generation = Σ every source’s output while positive
<small>includes battery discharge and embedded solar; leaves out the HVDC link and battery charging</small></p>
<ul>
	<li>An island’s total is that island’s own generation; power arriving over the HVDC link isn’t counted.</li>
	<li>Peak generation is the highest 5-minute total in the range (half-hourly in the 30-day view; on longer ranges, each day’s highest half-hour).</li>
	<li>With no point in time selected, the summary table shows each source’s energy over the range: MW × hours, summed, in GWh (TWh once the total passes 10,000 GWh).</li>
	<li>Where each point is a day, week, month or year, the generation chart and the summary at a point show energy (the average MW × the point’s hours) in MWh, GWh or TWh to suit the size, rather than an average MW, which reads low for anything that varies through the day. These views start at the first whole period in the range; the period still in progress shows its energy so far and isn’t counted as a high or low. A single plant’s nameplate line shows only on the MW views.</li>
	<li>A plant’s capacity is the sum of its units’ nameplate MW in the register. For plants seen only in the metered history, it is the most nameplate the register ever had installed at once.</li>
</ul>

<h2 id="limits">Known limits</h2>
<ul>
	<li>Small plants on local networks that aren’t dispatched (some hydro, wind and cogeneration) don’t appear as generation in the live week: their output shows up as lower demand at the grid. Embedded solar is the exception, and is modelled. The metered history includes the embedded stations the live data also shows.</li>
	<li>Dispatch runs 1–2% above metered generation overall (wind 3–4%, hydro 1–2%), probably because dispatch measures at the generator and metering at the grid connection. See <a href="/methods/history#seam">where the sources hand over</a>.</li>
	<li>Huntly’s Rankine units are shown as coal/gas, because the market data doesn’t say which fuel they burned. Their emissions use Genesis’s reported coal share each quarter (see <a href="/methods/emissions">emissions</a>).</li>
</ul>

<p class="note">Code: <a href={REPO + 'ingest/build_tracker.py'}><code>ingest/build_tracker.py</code></a> (units to plants and fuels), <a href={REPO + 'ingest/update.py'}><code>ingest/update.py</code></a> (the 5-minute job), <a href={REPO + 'ingest/emi_live.py'}><code>ingest/emi_live.py</code></a> (the feed).</p>
