<script lang="ts">
	import { REPO } from '../registry.js';
</script>

<h2 id="what">What it covers</h2>
<p>Solar panels on local distribution networks that the system operator doesn’t dispatch: home and business rooftops, and ground-mounted arrays of up to about 10 MW. Their output never reaches the market data as generation; it shows up only as less demand at the grid exit point. The site models it so that generation and underlying demand include it. It is shown hatched and marked as an estimate everywhere it appears.</p>
<p>Dispatched solar farms, including those on local networks such as Kōwhai Park and Lauriston, are measured in the dispatch data and shown as grid solar, not here.</p>

<p class="formula">Embedded solar = Σ over 35 points and 3 system types: installed MW × modelled output per MW (from satellite sunshine) × calibration</p>

<h2 id="capacity">1. How much is installed</h2>
<p>The EA’s monthly record of installed distributed generation (EMI report GUEHMT, from the registry) gives solar capacity at each grid exit point (Root NSP), for systems of 10 kW or less and over 10 kW. Registry capacity is the lesser of the panels’ total and the inverter or injection limit, so it is roughly the AC rating.</p>
<ul>
	<li><b>About 1,270 MW</b> was registered in September 2026.</li>
	<li><b>Less about 410 MW</b> of eleven dispatched solar farms the registry also counts, already shown as grid solar: Kohirā, Lauriston, Te Puna Mauri ō Omaru (Ruawai), Pukenui, Rangitaiki, Twin Rivers, Taiohi, Pāmu Rā ki Whitianga, Papareireiā, Omeheu and Kōwhai Park. Each is removed at its own grid exit point, in the month the registry added it. A data build warns when the registry jumps 5 MW or more at a point where a solar farm dispatches, so new farms can be added to the list.</li>
	<li><b>Leaves about 860 MW</b> (North Island ~574, South Island ~287), split three ways:</li>
</ul>
<div class="tbl">
	<table>
		<thead><tr><th>Type</th><th class="n">Sep 2026</th><th>What it is</th></tr></thead>
		<tbody>
			<tr><td>Small</td><td class="n">~470 MW</td><td>Systems up to 10 kW, mostly homes</td></tr>
			<tr><td>Large</td><td class="n">~290 MW</td><td>Systems over 10 kW: businesses, farm sheds</td></tr>
			<tr><td>Ground-mounted</td><td class="n">~100 MW</td><td>Growth in systems over 10 kW in months when a grid exit point’s new systems averaged 1 MW or more each: arrays rather than roofs (largest at Paeroa, Blenheim, Southbrook, Huntly and Takanini)</td></tr>
		</tbody>
	</table>
</div>
<p>The registry is published monthly. Past its latest month, the recent growth is carried forward, for up to 120 days.</p>

<h2 id="where">2. Where it is</h2>
<p>Capacity is placed at 35 irradiance points (22 in the North Island, 13 in the South), one for each distribution network’s reporting region, at the capacity-weighted centre of its grid exit points. Regions with under 2 MW are merged into the nearest, and regions within 5 km of a bigger one share its point. Every grid exit point belongs to one point (<a href={REPO + 'facilities/rooftop_nsp.csv'}><code>facilities/rooftop_nsp.csv</code></a>).</p>

<h2 id="sun">3. How much sun</h2>
<dl>
	<dt>Live and from 2016</dt>
	<dd>Himawari satellite irradiance through Open-Meteo: global and diffuse sunshine every 10 minutes at each point, each value the mean of the 10 minutes before it. It arrives about 45 minutes behind real time.</dd>
	<dt>The last hour</dt>
	<dd>For the intervals the satellite hasn’t reached yet, the latest clear-sky index (measured sunshine ÷ clear-sky sunshine) is carried forward, for up to two hours, and applied to each interval’s clear-sky sunshine. Tested on past data, this has a median error of 4–7% at 30–90 minutes ahead (90th percentile about 20%).</dd>
	<dt>Gaps</dt>
	<dd>The satellite leaves the low-sun hours and a couple of housekeeping slots a day blank; these are filled from the nearest valid clear-sky index. Short gaps in a series are bridged; anything longer shows as zero, never extrapolated.</dd>
	<dt>Aug 2013 – 2015</dt>
	<dd>Before the satellite archive starts: ERA5 reanalysis (hourly, ~30 km grid) through Open-Meteo. Fine for daily and monthly totals, smoother within the day. There was 6–40 MW installed then.</dd>
	<dt>Before Aug 2013</dt>
	<dd>Zero: the registry starts in August 2013, with about 6 MW.</dd>
	<dt>Fallback</dt>
	<dd>If the satellite falls more than two hours behind or stops, Open-Meteo’s forecast irradiance stands in until it returns.</dd>
</dl>

<h2 id="model">4. From sunshine to output</h2>
<p>A photovoltaic model, written for the site and checked against the standard pvlib library (sun position within 0.02°, irradiance on the panels within 0.5%, AC output within 1%), runs for each point and system type:</p>
<ol>
	<li><b>Sun position</b>: the NOAA solar position algorithm, at each interval’s midpoint.</li>
	<li><b>Sunshine on the panels</b>: the Hay–Davies model, splitting sunshine into direct, diffuse and ground-reflected light for each tilt and direction.</li>
	<li><b>Reflection losses</b> at low sun angles (ASHRAE incidence angle model).</li>
	<li><b>Panel temperature</b> from the Sandia model (close roof mount for rooftops, open rack for ground arrays), with air temperature from a latitude and season climatology; hot panels produce less.</li>
	<li><b>DC output and inverter limit</b> (PVWatts-style), with fixed losses for soiling, shading, wiring, ageing and downtime.</li>
</ol>
<div class="tbl">
	<table>
		<thead><tr><th>Type</th><th>Panels (tilt, direction, share)</th><th class="n">DC/AC</th><th class="n">Losses</th><th class="n">Calibration</th></tr></thead>
		<tbody>
			<tr><td>Small</td><td>20°: 40% north, 15% north-east, 15% north-west, 10% east, 10% west; 10% at 10° north</td><td class="n">1.2</td><td class="n">11.5%</td><td class="n">0.95</td></tr>
			<tr><td>Large</td><td>10°: 35% north, 20% east, 20% west; 25% at 25° north</td><td class="n">1.2</td><td class="n">11.5%</td><td class="n">0.95</td></tr>
			<tr><td>Ground-mounted</td><td>20°, all north (fixed)</td><td class="n">1.35</td><td class="n">8%</td><td class="n">1.0</td></tr>
		</tbody>
		<caption>Rooftop orientations are assumptions, not measured. Rooftop losses: soiling 2%, shading 3%, wiring and mismatch 3%, ageing 2.5%, downtime 1.5%; ground arrays have no shading and are newer.</caption>
	</table>
</div>
<p>Before calibration, the model gave about 1,516 kWh per kW of registered (AC) capacity over 2025, or 1,264 kWh per kW of panels.</p>

<h2 id="calibration">5. Calibration and checks</h2>
<dl>
	<dt>Rooftops × 0.95</dt>
	<dd>The same satellite-and-model chain, run for dispatched solar farms whose output is known, gives 88–98% of their measured output once they are established (Lauriston, Omeheu, Rangitaiki, Kohirā, Te Herenga o Te Rā, Dannevirke), and the satellite’s yearly sunshine runs up to about 5% above NIWA’s long-term figures in places. So rooftops are scaled by 0.95, give or take about 6%.</dd>
	<dt>Ground arrays</dt>
	<dd>Fitted directly to the metered output of ground-mounted arrays at Blenheim and Southbrook, which have flat-topped clear-day output (the inverter limit): fixed north-facing panels at 15–25° with DC/AC 1.3–1.4. Modelled as rooftops they came out about 20% low; as their own type, both places come within about 2%.</dd>
	<dt>Metered exports</dt>
	<dd>The EA’s reconciliation data has the metered energy that embedded systems export to local networks, by half-hour. In September 2026, solar exports were 46.6 GWh (peak 363 MW), against 95 GWh of modelled generation: about half of rooftop output is exported, the rest used on site. Daily totals follow the model closely (correlation 0.985–0.991), the exported share is steady, and exports never exceed modelled generation nationally.</dd>
	<dt>Growth</dt>
	<dd>September exports per registered MW rose from 0.039 GWh in 2021 to 0.056 GWh in 2026, so the registry’s growth looks real, not inflated.</dd>
	<dt>Sunshine</dt>
	<dd>2025 totals at the points are close to NIWA’s long-term figures: Christchurch 1,468, Wellington 1,467, Dunedin 1,277 kWh/m²; Auckland’s 1,623 may be about 5% high.</dd>
</dl>

<h2 id="uncertainty">6. Uncertainty</h2>
<p>The band on the demand chart and the ± on the readouts is one standard deviation, combining independent errors as the root of the sum of squares:</p>
<p class="formula">± = output × √(capacity² + calibration² + model²)
<small>capacity 4%, calibration 6%; model 5% when clear (clear-sky index 0.8 or more), rising in a straight line to 18% at 0.3 and below. Carried-forward intervals add 12%.</small></p>
<p>That is about ±9% on clear days and ±19% under cloud, more over the last hour.</p>

<h2 id="limits">Known limits</h2>
<ul>
	<li>Solar farms enter the registry late or not at all: Rangitaiki appeared about 17 months after it was commissioned, and Clandeboye, Dannevirke and Te Herenga o Te Rā aren’t in it yet. When one appears it has to be added to the list removed above, or it would be counted twice; the build’s warning catches the larger ones.</li>
	<li>One satellite pixel can’t place every cloud: half-hour changes in grid exit point load follow the model less closely than daily totals.</li>
	<li>Rooftop orientations and air temperatures are assumptions; together they move the result by a few per cent at most.</li>
	<li>Other embedded generation (small hydro, wind, cogeneration not dispatched) isn’t modelled yet.</li>
</ul>

<p class="note">Code: <a href={REPO + 'ingest/rooftop.py'}><code>ingest/rooftop.py</code></a> (capacity, irradiance, uncertainty), <a href={REPO + 'ingest/pv.py'}><code>ingest/pv.py</code></a> (the PV model). Evidence for every constant: <a href={REPO + 'analysis/README.md'}><code>analysis/README.md</code></a>.</p>
