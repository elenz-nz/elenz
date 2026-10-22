<script lang="ts">
	import { REPO } from '../registry.js';
	import GoodFor from '../GoodFor.svelte';
</script>

<h2 id="what">What it covers</h2>
<p>Solar panels on local distribution networks that the system operator doesn’t dispatch: home and business rooftops, and small solar farms (ground-mounted arrays of up to about 10 MW). Their output never reaches the market data as generation; it shows up only as less demand at the grid exit point. The site models it so that generation and underlying demand include it. It is shown hatched and marked as an estimate everywhere it appears.</p>
<p>Dispatched solar farms, including those on local networks such as Kōwhai Park and Lauriston, are measured in the dispatch data and shown as grid solar, not here.</p>

<h2 id="good-for">What it’s good for</h2>
<GoodFor rows={[
	{ use: 'National monthly or annual solar energy', level: 'good', verdict: 'likely the strongest use.', why: 'Errors in individual hours largely cancel, and daily totals track metered exports closely.' },
	{ use: 'National daily generation profile', level: 'ok', verdict: 'supported by the metered exports, which follow the model day to day (correlation 0.98–0.99).' },
	{ use: 'National half-hourly generation', level: 'ok', verdict: 'a useful estimate, but cloud timing and the fleet assumptions (orientation, inverter sizing) matter.' },
	{ use: 'Regional half-hourly generation', level: 'care', verdict: 'material local errors are plausible.', why: 'One satellite pixel per region can’t place every cloud.' },
	{ use: 'Live 5-minute demand with embedded solar', level: 'care', verdict: 'an indicative signal, not a precise measurement.', why: 'The satellite is about 45 minutes behind, so the last hour is carried forward.' },
	{ use: 'Generation from one rooftop or one installation', level: 'no', verdict: 'the model isn’t built for it.' },
]} />

<p class="formula">Embedded solar = Σ over 35 points and 3 system types: installed MW × modelled output per MW (from satellite sunshine) × calibration</p>

<h2 id="capacity">1. How much is installed</h2>
<p>The EA’s monthly record of installed distributed generation (EMI report GUEHMT, from the registry) gives solar capacity at each grid exit point (Root NSP), for systems of 10 kW or less and over 10 kW. Registry capacity is the lesser of the panels’ total and the inverter or injection limit, so it is roughly the AC rating.</p>
<ul>
	<li><b>About 1,270 MW</b> was registered in September 2026.</li>
	<li><b>Less about 410 MW</b> for the dispatched solar farms the registry also counts. Fifteen solar farms are dispatched (about 636 MW), and all fifteen are shown as grid solar, measured. Eleven of them are in the registry too, so they’d be counted twice if left in: Kohirā, Lauriston, Te Puna Mauri ō Omaru (Ruawai), Pukenui, Rangitaiki, Twin Rivers, Taiohi, Pāmu Rā ki Whitianga, Papareireiā, Omeheu and Kōwhai Park. Each is removed at its own grid exit point, in the month the registry added it. The other four, Tauhei, Clandeboye, Dannevirke and Te Herenga o Te Rā (about 227 MW), aren’t in the registry, so there’s nothing to take off. A data build warns when the registry jumps 5 MW or more at a point where a solar farm dispatches, so a farm can be added to the list when it appears.</li>
	<li><b>Leaves about 860 MW</b> (North Island ~574, South Island ~287), split three ways:</li>
</ul>
<div class="tbl">
	<table>
		<thead><tr><th>Type</th><th class="n">Sep 2026</th><th>What it is</th></tr></thead>
		<tbody>
			<tr><td>Small</td><td class="n">~470 MW</td><td>Systems up to 10 kW, mostly homes</td></tr>
			<tr><td>Large</td><td class="n">~290 MW</td><td>Systems over 10 kW: businesses, farm sheds</td></tr>
			<tr><td>Small solar farms</td><td class="n">~110 MW</td><td>Growth in systems over 10 kW in months when a grid exit point’s new systems averaged 1 MW or more each (500 kW at Ashburton): arrays rather than roofs (largest at Piako, Blenheim, Southbrook, Ashburton, Huntly, Takanini and Huirangi; see <a href="#ground">the check below</a>)</td></tr>
		</tbody>
	</table>
</div>
<p>The registry is published monthly. Past its latest month, the recent growth is carried forward, for up to 120 days.</p>
<p><b>All solar together</b> was about 1,500 MW in October 2026: about 860 MW embedded (this estimate) and about 636 MW in the fifteen dispatched farms. That is the figure to compare a peak against. On the clear days of 18 and 19 October 2026, grid and embedded solar together reached about 1,340 MW, about 90% of it.</p>

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
			<tr><td>Small solar farms</td><td>20°, all north (fixed)</td><td class="n">1.35</td><td class="n">8%</td><td class="n">1.0</td></tr>
		</tbody>
		<caption>Rooftop orientations are assumptions, not measured. Rooftop losses: soiling 2%, shading 3%, wiring and mismatch 3%, ageing 2.5%, downtime 1.5%; small solar farms have no shading and are newer.</caption>
	</table>
</div>
<p>Before calibration, the model gave about 1,516 kWh per kW of registered (AC) capacity over 2025, or 1,264 kWh per kW of panels.</p>

<h2 id="calibration">5. Calibration and checks</h2>
<dl>
	<dt>Rooftops × 0.95</dt>
	<dd>
		<p>The same satellite-and-model chain, run for dispatched solar farms whose output is measured, says how much the satellite and model over- or under-state. Once established, the farms produced between 88% and 98% of what the chain predicted for them (Lauriston, Omeheu, Rangitaiki, Kohirā, Te Herenga o Te Rā, Dannevirke), and the satellite’s yearly sunshine runs up to about 5% above NIWA’s long-term figures in places.</p>
		<p>So rooftop output is multiplied by 0.95, the middle of that evidence. The “about 6%” is how uncertain that factor is: the right figure could plausibly be anywhere from about 0.89 to 1.01 (one standard deviation). It isn’t applied on top of the 0.95; it is one of the parts of the uncertainty band below.</p>
	</dd>
	<dt id="ground">Small solar farms</dt>
	<dd>
		<p>Small solar farms are ground-mounted arrays on local networks, up to about 10 MW, that the market doesn’t dispatch. Which registry capacity is one comes from the registry itself: growth in systems over 10 kW in months when a grid exit point’s new systems averaged 1 MW or more (500 kW at Ashburton, below). That gives about 112 MW in September 2026, largest at Piako (Thames Valley), Blenheim, Southbrook, Ashburton, Huntly, Takanini and Huirangi.</p>
		<p>To check it, every solar export series in the EA’s reconciliation data for August and September 2026 was looked at: 208 series of 0.5 MW or more, one per grid exit point, network and retailer. On their sunniest days, 11 had flat-topped output, at least 2½ hours within 3% of the day’s peak. That shape comes from a big installation whose panels outrun its inverter (or from an export limit); rooftops added together give a rounded curve instead. They were at Blenheim (two, about 22 MW between them), Takanini (11 MW), Southbrook (two, 11 MW), Tuai (4.6 MW), Ashburton, Masterton, Huntly, Waihou and Waikino (2.5–3.7 MW each).</p>
		<p>Eight of those nine places are among those the registry rule picks out. Ashburton’s arrays went in as batches of smaller systems (6.5 MW across 8 in December 2024, 4.6 MW across 8 in August 2025, averaging 500–800 kW), below the rule’s 1 MW, so the rule uses 500 kW there: about 11 MW (October 2026). Piako and Huirangi export a rounded curve, but that comes from using much of their output on site, or from tracking the sun; what is modelled is their generation, not their exports, so they stay small solar farms.</p>
		<p>The ground type’s settings were fitted to the metered output at Blenheim and Southbrook, the largest flat-topped sites: fixed north-facing panels at 15–25° with DC/AC 1.3–1.4. Modelled as rooftops they came out about 20% low; as their own type, both places come within about 2%.</p>
	</dd>
	<dt>Metered exports</dt>
	<dd>The EA’s reconciliation data has the metered energy that embedded systems export to local networks, by half-hour. In September 2026, solar exports were 46.6 GWh (peak 363 MW), against 95 GWh of modelled generation: about half of rooftop output is exported, the rest used on site. Daily totals follow the model closely (correlation 0.985–0.991), the exported share is steady, and exports never exceed modelled generation nationally.</dd>
	<dt>Clear-day peaks</dt>
	<dd>
		<p>At its highest so far, at 1 pm on 18 October 2026, the estimate was 748 MW, about 87% of the registered capacity then (744 MW the next day). The registry’s figure is roughly the inverter (AC) rating, and panels usually exceed it by 10–30%, so a clear spring noon can come close to it. For comparison, South Australia’s rooftop fleet peaked at 2,070 MW on 7 October 2026, about 73% of its installed panel capacity, which on an inverter basis would be about 85–95%.</p>
		<p>The metered exports give a second check. On September’s clearest days (peak estimate 560–680 MW), exports peaked at 290–363 MW, and through each day every extra modelled MW turned up as 0.57–0.63 MW of extra exports. That is consistent with roughly 40% of extra output used on site, but it can’t rule out the estimate being somewhat high on clear days. October’s metered data (published early November) will allow the same check on 18–19 October.</p>
	</dd>
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
	<li>Solar farms enter the registry late or not at all: Rangitaiki appeared about 17 months after it was commissioned, and Tauhei, Clandeboye, Dannevirke and Te Herenga o Te Rā aren’t in it yet. When one appears it has to be added to the list removed above, or it would be counted twice; the build’s warning catches the larger ones.</li>
	<li>One satellite pixel can’t place every cloud: half-hour changes in grid exit point load follow the model less closely than daily totals.</li>
	<li>Rooftop orientations and air temperatures are assumptions; together they move the result by a few per cent at most.</li>
	<li>Other embedded generation (small hydro, wind, cogeneration not dispatched) isn’t modelled yet.</li>
</ul>

<p class="note">Code: <a href={REPO + 'ingest/rooftop.py'}><code>ingest/rooftop.py</code></a> (capacity, irradiance, uncertainty), <a href={REPO + 'ingest/pv.py'}><code>ingest/pv.py</code></a> (the PV model). Evidence for every constant: <a href={REPO + 'analysis/README.md'}><code>analysis/README.md</code></a>.</p>
