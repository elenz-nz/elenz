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
		<li>This figure is a calculated estimate and has never been measured. Its uncertainty is about ±9% on clear days and ±19% under cloud.</li>
		<li>The satellite runs about 45 minutes behind real time, so the live figure carries the latest cloud cover forward over the last hour.</li>
		<li>Rooftop orientations are assumptions, and local cloud can make a regional half-hour materially wrong.</li>
	</ul>
	<p><a href="#limitations">Accuracy and limitations</a> has the detail.</p>
</aside>

<h2 id="introduction"><span id="what"></span>Introduction</h2>
<p>Embedded solar is solar generation on local networks that the system operator doesn’t dispatch. It covers home and business rooftops, and small solar farms of up to about 10 MW. Its output doesn’t appear in market data as generation. It appears only as lower demand at the grid exit point, where electricity leaves the national grid for a local network.</p>
<p>Elenz models this output so that total generation and demand with embedded generation can include it. It is hatched on the charts and marked “est.” in the readouts.</p>
<p>Dispatched solar farms are a separate figure. They appear in the dispatch data and later metering, and are shown as grid solar, including farms on local networks such as Kōwhai Park and Lauriston.</p>

<h2 id="data-sources">Data sources</h2>
<p>Embedded solar is a calculated estimate in every period. Only the source of its sunshine data changes over time.</p>
<DataSources slug="embedded-solar" />

<h2 id="how-it-works">How it works</h2>
<p>The method has five steps. It works out how much is installed and where, how much sun reached those places, how much electricity that sun produced, and how far to adjust the result.</p>

<h3 id="capacity">1. How much is installed</h3>
<p>The Electricity Authority’s (EA’s) <a href={sourceHref('guehmt')}>monthly record of installed distributed generation</a> gives solar capacity at each grid exit point, for systems of 10 kW or less and over 10 kW. <a href={ref('dg-capacity')}>Registry capacity is meant to be the lesser</a> of the panels’ total and the inverter or injection limit, so it is roughly the AC rating.</p>
<p>About 1,270 MW was registered in September 2026. About 410 MW of that is dispatched solar farms, which we take off to avoid counting them twice. That leaves about 860 MW: about 574 MW in the North Island and about 287 MW in the South Island.</p>
<div class="tbl">
	<table>
		<thead><tr><th>Type</th><th class="n">Sep 2026</th><th>Description</th></tr></thead>
		<tbody>
			<tr><td>Small</td><td class="n">about 470 MW</td><td>Systems up to 10 kW, mostly homes.</td></tr>
			<tr><td>Large</td><td class="n">about 280 MW</td><td>Systems over 10 kW, such as businesses and farm sheds.</td></tr>
			<tr><td>Small solar farms</td><td class="n">about 110 MW</td><td>Growth in systems over 10 kW, in months when a grid exit point’s new systems averaged 1 MW or more each. The test is 500 kW at Ashburton.</td></tr>
		</tbody>
	</table>
</div>
<p>Fifteen solar farms are dispatched, about 636 MW in all, and all are shown as grid solar. Eleven are also in the registry. We remove each of these at its own grid exit point, in the month the registry added it. The eleven are Kohirā, Lauriston, Te Puna Mauri ō Omaru (Ruawai), Pukenui, Rangitaiki, Twin Rivers, Taiohi, Pāmu Rā ki Whitianga, Papareireiā, Omeheu and Kōwhai Park.</p>
<p>The other four aren’t in the registry, so there is nothing to take off: Tauhei, Clandeboye, Dannevirke and Te Herenga o Te Rā, about 227 MW in all. Each data build warns when the registry jumps by 5 MW or more at a point where a solar farm dispatches.</p>
<p>The registry is published monthly. After its latest month, we carry the recent growth forward for up to 120 days.</p>

<h3 id="where">2. Where it is</h3>
<p>We place capacity at 35 irradiance points, 22 in the North Island and 13 in the South Island. Each point stands for one local network’s reporting region, at the capacity-weighted centre of its grid exit points. Regions with under 2 MW are merged into the nearest one, and regions within 5 km of a bigger one share its point. <a href={REPO + 'facilities/rooftop_nsp.csv'}><code>facilities/rooftop_nsp.csv</code></a> lists the point for each grid exit point.</p>

<h3 id="sun">3. How much sun</h3>
<p>Irradiance is the sunshine reaching the ground. From 2016, we use Himawari satellite irradiance at each point, with global and diffuse values every 10 minutes. Each value is the mean of the 10 minutes before it, and the data arrives about 45 minutes behind real time.</p>
<p>For intervals the satellite hasn’t reached, we carry the latest clear-sky index forward for up to 2 hours. The clear-sky index is measured sunshine divided by the sunshine under a clear sky. Each interval then uses its own clear-sky sunshine, multiplied by that index. If the satellite falls more than 2 hours behind or stops, forecast irradiance stands in until it returns.</p>
<p>The satellite leaves the low-sun hours and a couple of housekeeping slots each day blank. We fill these from the nearest valid clear-sky index and bridge short gaps. Anything longer shows as zero.</p>
<p>Before 2016, we use ERA5 reanalysis, which is hourly on a grid of about 30 km. It suits daily and monthly totals, but is smoother within the day. Only 6 to 40 MW was installed in those years.</p>

<h3 id="model">4. From sunshine to output</h3>
<p>A photovoltaic model runs for each point and system type. We wrote it for Elenz and check it against the standard <a href={ref('pvlib')}>pvlib</a> library. Sun position agrees within 0.02°, irradiance on the panels within 0.5%, and AC output within 1%. The model has five stages:</p>
<ol>
	<li>The sun’s position at each interval’s midpoint, from the <a href={ref('noaa')}>NOAA solar position algorithm</a>.</li>
	<li>Sunshine on the panels, split into direct, diffuse and ground-reflected light for each tilt and direction, using the <a href={ref('pvlib')}>Hay–Davies model</a>.</li>
	<li>Reflection losses at low sun angles, using the <a href={ref('ashrae')}>ASHRAE incidence angle model</a>.</li>
	<li>Panel temperature from the <a href={ref('sandia')}>Sandia model</a>, with air temperature from a climatology by latitude and season. Hot panels produce less.</li>
	<li>DC output and the inverter limit, in the style of <a href={ref('pvwatts')}>PVWatts</a>, with fixed losses for soiling, shading, wiring, ageing and downtime.</li>
</ol>
<div class="tbl">
	<table>
		<thead><tr><th>Type</th><th>Panels (tilt, direction and share)</th><th class="n">DC/AC ratio</th><th class="n">Losses</th><th class="n">Calibration</th></tr></thead>
		<tbody>
			<tr><td>Small</td><td>20°: 40% north, 15% north-east, 15% north-west, 10% east, 10% west. Also 10% at 10° north.</td><td class="n">1.2</td><td class="n">11.5%</td><td class="n">0.95</td></tr>
			<tr><td>Large</td><td>10°: 35% north, 20% east, 20% west. Also 25% at 25° north.</td><td class="n">1.2</td><td class="n">11.5%</td><td class="n">0.95</td></tr>
			<tr><td>Small solar farms</td><td>20°, all north and fixed.</td><td class="n">1.35</td><td class="n">8%</td><td class="n">1.0</td></tr>
		</tbody>
		<caption>Rooftop orientations are assumptions, not measurements. Rooftop losses are soiling 2%, shading 3%, wiring and mismatch 3%, ageing 2.5% and downtime 1.5%. Small solar farms have no shading and are newer.</caption>
	</table>
</div>
<p>Before calibration, the model gave about 1,516 kWh per kW of registered capacity over 2025, or 1,264 kWh per kW of panels.</p>

<h3 id="calibration">5. Calibration</h3>
<p>We multiply rooftop output by 0.95. To choose that factor, we ran the same satellite and model for dispatched solar farms, whose real output is known. Once established, Lauriston, Omeheu, Rangitaiki, Kohirā, Te Herenga o Te Rā and Dannevirke produced between 88% and 98% of what the model predicted. The satellite’s 2025 sunshine also ran 6–9% above <a href={ref('niwa')}>NIWA’s 1991–2020 averages</a> at the four main centres.</p>
<p>The 0.95 factor has an uncertainty of about 6%, so its true value probably lies between 0.89 and 1.01 (one standard deviation). That uncertainty feeds into the band described under <a href="#uncertainty">Uncertainty</a>. It doesn’t change the 0.95 itself.</p>
<p>Small solar farms have their own settings, fitted to the metered output at Blenheim and Southbrook, so they take no calibration factor.</p>
<Calculations>
	<p class="formula">Embedded solar = the sum, over 35 points and three system types, of (installed MW × modelled output per MW × calibration)</p>
	<div class="tbl">
		<table>
			<thead><tr><th>Term</th><th>Meaning</th><th>Unit</th></tr></thead>
			<tbody>
				<tr><td>Installed MW</td><td>Capacity of that type at that point, from step 1 and step 2</td><td>MW</td></tr>
				<tr><td>Modelled output per MW</td><td>AC output for each MW of capacity, from step 3 and step 4</td><td>MW per MW</td></tr>
				<tr><td>Calibration</td><td>0.95 for rooftops and 1.0 for small solar farms, from step 5</td><td>None</td></tr>
			</tbody>
		</table>
	</div>
	<p class="k">Worked example</p>
	<p>These figures are illustrative. One point has 40 MW of small systems, and the model gives 0.6 MW of output per MW. Its small systems contribute 40 × 0.6 × 0.95 = 22.8 MW. The same sum runs for each type at each point, and the results add up to the national figure.</p>
</Calculations>

<h2 id="interpretation"><span id="good-for"></span>How to interpret it</h2>
<p>Embedded solar is a modelled figure. Errors in individual hours largely cancel across the country and over a month, so it is strongest as a national monthly or annual total. It is weakest for one place at one moment.</p>
<p>To compare a peak with installed capacity, use all solar together. That was about 1,500 MW in October 2026: about 860 MW of embedded solar and about 636 MW of dispatched farms. On the clear days of 18 and 19 October 2026, grid and embedded solar together reached about 1,340 MW, about 90% of that.</p>
<GoodFor rows={[
	{ use: 'National monthly or annual solar energy', level: 'good', verdict: 'This is the strongest use.', why: 'Errors in individual hours largely cancel, and daily totals track metered exports closely.' },
	{ use: 'National daily generation profile', level: 'ok', verdict: 'Metered exports follow the model from day to day, with a correlation of 0.98 to 0.99.' },
	{ use: 'National half-hourly generation', level: 'ok', verdict: 'A useful estimate, but cloud timing and the assumed orientation and inverter sizing all matter.' },
	{ use: 'Regional half-hourly generation', level: 'care', verdict: 'Material local errors are plausible.', why: 'One satellite pixel for each region can’t place every cloud.' },
	{ use: 'Live 5-minute demand with embedded generation', level: 'care', verdict: 'An indicative signal, not a precise measurement.', why: 'The satellite is about 45 minutes behind, so the latest cloud cover is carried forward over the last hour.' },
	{ use: 'Generation from one rooftop or one installation', level: 'no', verdict: 'The model describes fleets of systems, not one installation.' },
]} />

<h2 id="limitations"><span id="limits"></span>Accuracy and limitations</h2>
<div class="tbl">
	<table>
		<thead><tr><th>Figure</th><th>Status</th><th>Typical accuracy</th></tr></thead>
		<tbody>
			<tr><td>Embedded solar, from 2016</td><td>Calculated estimate</td><td>About ±9% on clear days and ±19% under cloud</td></tr>
			<tr><td>Embedded solar, last hour of the live week</td><td>Calculated estimate</td><td>Wider than the figures above: carrying cloud cover forward has a median error of 4–7% at 30 to 90 minutes ahead, and about 20% at the 90th percentile</td></tr>
			<tr><td>Embedded solar, August 2013 to 2015</td><td>Calculated estimate</td><td>Suits daily and monthly totals, and is smoother within the day</td></tr>
		</tbody>
	</table>
</div>

<h3 id="uncertainty">Uncertainty</h3>
<p>The band on the demand chart and the ± in the readouts show one standard deviation. They combine three independent errors: installed capacity, calibration, and the model itself. The model’s error grows as cloud increases. Intervals that carry cloud cover forward add a fourth error.</p>
<Calculations>
	<p class="formula">Uncertainty = output × √(capacity² + calibration² + model²)</p>
	<div class="tbl">
		<table>
			<thead><tr><th>Term</th><th>Value</th></tr></thead>
			<tbody>
				<tr><td>Capacity</td><td>4%</td></tr>
				<tr><td>Calibration</td><td>6%</td></tr>
				<tr><td>Model</td><td>5% at a clear-sky index of 0.8 or more, rising in a straight line to 18% at 0.3 or less</td></tr>
				<tr><td>Carried-forward intervals</td><td>A further 12%, added in the same way</td></tr>
			</tbody>
		</table>
	</div>
	<p class="k">Worked example</p>
	<p>On a clear day: √(4² + 6² + 5²) = √77 = 8.8%, or about ±9%. Under cloud: √(4² + 6² + 18²) = √376 = 19.4%, or about ±19%.</p>
</Calculations>

<h3 id="checks">Checks</h3>
<p>The EA’s reconciliation data has the metered energy that embedded systems export to local networks, by half-hour. We pick out solar series by their shape, with under 5% of their energy between 9 pm and 5 am. <a href="/methods/other-embedded#sorting">Other embedded generation</a> uses the same test.</p>
<p>In September 2026, solar exports were 46.6 GWh, with a peak of 363 MW. Modelled generation was 95 GWh, so about half of rooftop output is exported and the rest is used on site. Daily totals follow the model closely, with a correlation of 0.985 to 0.991. The exported share is steady, and exports never exceed modelled generation nationally.</p>
<p>On September’s clearest days, the estimate peaked at 560 to 680 MW and exports at 290 to 363 MW. Through each day, every extra modelled MW turned up as 0.57 to 0.63 MW of extra exports. That is consistent with roughly 40% of extra output being used on site. It can’t rule out the estimate being somewhat high on clear days.</p>
<p>The estimate’s highest figure so far is 748 MW, at 1 pm on 18 October 2026. That is about 87% of the registered capacity then. Registry capacity is roughly the inverter rating, and panels often exceed that: <a href={ref('eeca-dcac')}>EECA’s study of homes</a> uses DC:AC ratios of 1.0 and 1.2. So a clear spring noon can come close to it.</p>
<p>South Australia offers a comparison. Its rooftop fleet <a href={ref('sa-peak')}>peaked at 2,070 MW</a> on 7 October 2026. That is about 73% of its <a href={ref('cec')}>installed panel capacity</a> at the end of 2025, or about 85–95% on an inverter basis.</p>
<p>Registry growth looks real. September exports per registered MW rose from 0.039 GWh in 2021 to 0.056 GWh in 2026.</p>
<p>Satellite sunshine in 2025 ran above <a href={ref('niwa')}>NIWA’s 1991–2020 averages</a>. It was 1,468 against about 1,370 kWh/m² at Christchurch, 1,467 against 1,385 at Wellington, 1,277 against 1,200 at Dunedin, and 1,623 against 1,490 at Auckland. This is one year against a 30-year average, at network points and not NIWA’s stations, so it is a rough check.</p>

<h3 id="ground">Small solar farms</h3>
<p>Small solar farms are picked out from the registry alone, by the rule under <a href="#capacity">How much is installed</a>. That gives about 110 MW in September 2026, largest at Piako (Thames Valley), Blenheim, Southbrook, Ashburton, Huntly, Takanini and Huirangi.</p>
<p>To check the rule, we looked at 208 solar export series in the reconciliation data for August and September 2026, each of 0.5 MW or more. On their sunniest days, 11 had flat-topped output, at least 2½ hours within 3% of the day’s peak. That shape comes from a big installation whose panels outrun its inverter, or from an export limit. Rooftops added together give a rounded curve.</p>
<p>The flat-topped series were at Blenheim, Takanini, Southbrook, Tuai, Ashburton, Masterton, Huntly, Waihou and Waikino. Eight of those nine places are among those the rule picks out. Ashburton’s arrays went in as batches of smaller systems, below the rule’s 1 MW, so the rule uses 500 kW there.</p>
<p>Piako and Huirangi export a rounded curve. That can come from using much of their output on site or from tracking the sun, and the model covers generation, not exports, so they stay small solar farms.</p>
<p>Fixed north-facing panels at 15–25° with a DC/AC ratio of 1.3 to 1.4 fit the metered output at Blenheim and Southbrook. Modelled as rooftops, those two sites came out about 20% low. As their own type, both come within about 2%.</p>

<h3 id="other-limits">Other limits</h3>
<p>Solar farms enter the registry late or not at all. Rangitaiki appeared about 17 months after it was commissioned. If a dispatched farm joins the registry and isn’t removed, it is counted twice, although the build’s warning catches the larger ones.</p>
<p>One satellite pixel can’t place every cloud, so half-hour changes in load at a grid exit point follow the model less closely than daily totals do. Rooftop orientations and air temperatures are assumptions. Together they move the result by a few percent at most.</p>

<h2 id="coverage">Historical coverage</h2>
<p>Embedded solar starts small, at about 6 MW, so it makes no visible step in totals.</p>
<div class="tbl">
	<table>
		<thead><tr><th>Period</th><th>Status</th><th>Data</th></tr></thead>
		<tbody>
			<tr><td>August 1997 to July 2013</td><td>Not shown</td><td>The registry of installed systems starts in August 2013, so embedded solar is zero before then.</td></tr>
			<tr><td>August 2013 to December 2015</td><td>Calculated estimate</td><td>ERA5 reanalysis, with about 6 MW installed at the start and about 40 MW at the end.</td></tr>
			<tr><td>January 2016 onward</td><td>Calculated estimate</td><td>Satellite irradiance through Himawari.</td></tr>
		</tbody>
	</table>
</div>

<h2 id="references">References</h2>
<References slug="embedded-solar" />
