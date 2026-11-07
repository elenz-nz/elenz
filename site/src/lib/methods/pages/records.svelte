<script lang="ts">
	// The list of records comes from the Records pages' own definitions, so this page can't drift from them.
	import { LISTED as DEFS, GROUPS, NEW_DAYS, NEW_LAG } from '#lib/records/records.js';
	import { REPO, ref } from '../registry.js';
	import Calculations from '../Calculations.svelte';
	import DataSources from '../DataSources.svelte';
	import GoodFor from '../GoodFor.svelte';
	import References from '../References.svelte';
	import Shot from '../Shot.svelte';
	// what each record measures, in a line (the definitions' own `sub` is written for the Records list, where some say
	// only "Half-hour")
	const WHAT: Record<string, string> = {
		demand_max: 'Grid demand: metered, not counting embedded solar', demand_min: 'Grid demand: metered, not counting embedded solar',
		ren_max: 'Renewable share of generation', ren_min: 'Renewable share of generation',
		ren_run: 'Half-hours in a row at 90% renewable or more', fossil_min: 'Huntly’s Rankines, gas, diesel and waste heat',
		fossil_max: 'Huntly’s Rankines, gas, diesel and waste heat', huntly_off_run: 'Half-hours in a row with no Huntly Rankine generating',
		hydro_max: 'Hydro generation', hydro_min: 'Hydro generation: a dry spell', wind_max: 'Wind generation',
		solar_max: 'Solar farms the market dispatches', roof_max: 'Rooftops and small solar farms on local networks, modelled',
		price_max: 'Island reference price (final)', price_min: 'Island reference price (final)',
		gap_max: 'Haywards price against Benmore', low_price_run: 'Half-hours in a row under $5/MWh (New Zealand: both islands)',
		hvdc_n_max: 'Benmore to Haywards', hvdc_s_max: 'Haywards to Benmore',
	};
	const kept = (d: any) => (d.kind === 'run' ? 'Run (any length)' : 'Half-hour, day, week, month, year');
	const DATA: Record<string, string> = { gen: 'Metered generation and demand', price: 'Final prices', hvdc: 'Metered HVDC flows' };
	const dataOf = (d: any) => (d.est ? 'Calculated estimate (embedded solar)' : d.id.startsWith('ren') ? 'Metered generation, with calculated estimates for embedded generation' : DATA[d.fam]);
	const regions = (r: string[]) => (r.length === 3 ? 'New Zealand, each island' : r.map((x) => ({ NZ: 'New Zealand', NI: 'North Island', SI: 'South Island' })[x]).join(', '));
</script>

<aside class="mt-caveats" aria-label="Key caveats">
	<p class="k">Key caveats</p>
	<ul>
		<li>A record from dispatch data stays provisional until metered data confirms it. “All-time” means since August 1997.</li>
		<li>From January 2009, renewable-share records include other embedded generation, which is a calculated estimate.</li>
		<li>Embedded solar records are modelled, not metered.</li>
	</ul>
	<p><a href="#limitations">Accuracy and limitations</a> has the detail.</p>
</aside>

<h2 id="introduction"><span id="what"></span>Introduction</h2>
<p>A record is the highest or lowest value in the history since 1 August 1997, for New Zealand or for one island. A record has to beat the one before it, so equalling it doesn’t count. Elenz keeps three kinds: half-hours, longer periods and runs.</p>

<h2 id="data-sources">Data sources</h2>
<p>Official records rest on metered data and final prices. Anything newer rests on dispatch data, corrected, and is provisional. <a href="/methods/history#layers">History since 1997</a> explains how the layers fit together.</p>
<DataSources slug="records" />

<h2 id="how-it-works"><span id="how"></span>How it works</h2>

<h3 id="half-hours">Half-hours</h3>
<p>A half-hour record is the highest or lowest half-hour, using each half-hour’s average as the history holds it.</p>

<h3 id="periods">Days, weeks, months and years</h3>
<p>Each half-hour record also has its highest or lowest day, week (Monday to Sunday), calendar month and calendar year, in New Zealand time.</p>
<p>A period’s figure is its average over its half-hours, in MW or in $/MWh for prices. Periods of different lengths therefore compare fairly, and a February isn’t the lowest-demand month just for being short. The renewable share is renewable energy over all the period’s generation. A period record also shows its energy, which is the average times the period’s hours, but it is ranked by the average.</p>
<p>Only whole periods count. The history’s first part-year (1997) and the period still under way don’t count, and a day needs 90% of its half-hours. A period is official when every day in it is official.</p>
<p>Lowest price and lowest hydro say more over a month or a year, where they mark a glut of cheap power or a dry spell. A half-hour of either is usually overnight, and prices often fall to a few cents.</p>
<p>By month lists the best half-hour and the best whole day of each calendar month since 1997, using official figures only. A month can therefore show its own best even when the all-time record holds.</p>

<h3 id="runs">Runs</h3>
<p>A run is the longest unbroken stretch of half-hours meeting a condition, joined across month boundaries. The conditions are at least 90% renewable, prices under $5/MWh, or no Huntly Rankine running.</p>

<h3 id="milestones">Milestones</h3>
<p>A milestone is the first half-hour a record passed a round level. Milestones come from the records’ own progressions, so each one is the first record step at or over its level. A level not reached yet isn’t listed, and an island lists only those that can apply there.</p>
<div class="tbl">
	<table>
		<thead><tr><th>Record</th><th>Levels</th></tr></thead>
		<tbody>
			<tr><td>Wind</td><td>100, 250, 500, 750, 1,000, 1,250 and 1,500 MW</td></tr>
			<tr><td>Grid solar and embedded solar</td><td>100, 250, 500, 750 and 1,000 MW</td></tr>
			<tr><td>Renewable share</td><td>90%, 95%, 98% and 99%. The South Island has one milestone instead: 100% renewable, from the start of the data in August 1997.</td></tr>
			<tr><td>Peak demand, New Zealand</td><td>6,000, 6,500, 7,000 and 7,500 MW</td></tr>
			<tr><td>Peak demand, North Island</td><td>4,500 and 5,000 MW</td></tr>
			<tr><td>Peak demand, South Island</td><td>2,000 and 2,500 MW</td></tr>
		</tbody>
	</table>
</div>

<h3 id="official">Official and provisional</h3>
<p>A record is official once it rests on final data. Newer figures are dispatch data, which is a target for most plants and a snapshot of output at the time for wind and solar. Dispatch and metered figures agree closely on average, but not quite at the extremes that make records. We therefore correct dispatch data in three steps before comparing it with a record.</p>
<ol>
	<li>We scale the two plants that dispatch reads consistently off to their meters. Glenbrook is multiplied by 1.469, and Kawerau (Onepu) by 0.681. Ngāwhā and Teviot aren’t scaled, because their missing output is <a href="/methods/other-embedded#named">filled in</a>.</li>
	<li>We take off each record’s usual shift: how far a month’s highest or lowest half-hour, day, week or month in dispatch data usually sits from the metered one. Wind’s highest half-hour, for example, reads about 10 MW high nationally.</li>
	<li>We set a margin for what is left, which is how far the corrected figure strays nine months in ten. It is about 10 MW for peak wind, 25–50 MW for demand, and 0.3–0.6 percentage points for the renewable share.</li>
</ol>
<p>A corrected figure beyond the record by more than the margin is a provisional record. It is shown with when the metered data is due, and is confirmed or dropped when that data arrives. A corrected figure within the margin, either side, is close to the record. Elenz says which way a provisional record went for {NEW_DAYS} days.</p>
<Calculations>
	<p class="formula">Corrected figure = dispatch figure, with Glenbrook and Kawerau (Onepu) scaled, − usual shift
Provisional record: corrected figure is beyond the record by more than the margin
Close to the record: corrected figure is within the margin of the record, either side</p>
	<p class="k">Worked example</p>
	<p>These figures are illustrative. A wind record stands at 1,300 MW. The dispatch data reads 1,315 MW in one half-hour. With a usual shift of 10 MW the corrected figure is 1,305 MW. With a margin of 9 MW, that is close to the record. It would need more than 1,309 MW to be a provisional record.</p>
</Calculations>
<p>Prices never set provisional records, because final prices arrive the next day.</p>
<p>The Now page checks the live week itself. When a half-hour of live data beats a generation or demand record, a link above Generation now says so, on the day it was set. Prices and HVDC transfer are left to the history, because live prices are dispatch prices and live HVDC transfer is a calculated estimate.</p>
<p>A record is marked New for {NEW_DAYS} days after it first appears in the official records, as long as its period ended within about {NEW_LAG} days of that. A rebuild of the history that moves an old record doesn’t make it new.</p>

<h3 id="pace">On record pace</h3>
<p>Once half of the current day, week, month or year has gone, Elenz lists any record it is on pace to break. A period is on pace when its average so far is ahead of where the record period was at the same point. Weeks, months and years compare whole days, and a day compares whole half-hours. When the dispatch data has a figure close to the record and above it, the current period must be ahead of that figure too, so a period that can only match the close figure isn’t listed.</p>
<p>Periods still under way can combine metered and dispatch data, so they are provisional. The rest of the period can still change the result, so Elenz says what the rest would need to average to beat the record outright.</p>
<Shot name="records-list" alt="Heading for a record: tiles for records that could fall soon, with a Show all button." caption="Heading for a record, at the top of the Records page." />

<h3 id="demand"><span id="solar"></span>Demand and embedded solar</h3>
<p>Demand records are metered grid demand: what the grid delivered. Generation on local networks meets part of the country’s use before it reaches a grid meter, so it isn’t in them.</p>
<p>A demand record’s page shows a dashed line for information, with embedded solar added back. It uses embedded solar only. The Tracker’s dashed line, demand with embedded generation, also adds other embedded generation. Embedded solar is modelled and starts in August 2013, so demand with it added back can’t be a record.</p>
<p>Half-hour lows fall overnight, when there is no solar, so the two lines meet there. Daytime and longer periods show the gap growing as embedded solar has.</p>

<h3 id="list">Every record</h3>
<p>Definitions follow the rest of Elenz.</p>
<ul>
	<li>Generation is each source’s output summed, with battery discharge only and no HVDC transfer. From January 2009 it includes other embedded generation.</li>
	<li>The renewable share is of that total less battery discharge. It counts other embedded generation’s renewable part, and its unclassified output counts as not renewable (see <a href="/methods/groupings">Renewable share and groupings</a>).</li>
	<li>Fuel records, such as hydro and wind, stay on the plants Elenz shows, so they leave other embedded generation out.</li>
	<li>Fossil generation is Huntly’s Rankines, gas, diesel and waste heat. It leaves out the gas and diesel in other embedded generation.</li>
	<li>Demand is metered grid demand (see <a href="/methods/demand">Demand</a>).</li>
	<li>Prices are at the island reference nodes, Haywards and Benmore. New Zealand’s price is the higher of the two.</li>
</ul>
<div class="tbl">
	<table>
		<thead><tr><th>Record</th><th>Kept for</th><th>Regions</th><th>Rests on</th></tr></thead>
		<tbody>
			{#each GROUPS as g}
				{#each DEFS.filter((d) => d.group === g) as d}
					<tr>
						<td><a href="/records/{d.id}">{d.name}</a>{#if d.est} <span class="est-tag">Estimate</span>{/if}<br /><small>{WHAT[d.id] ?? d.sub}</small></td>
						<td>{kept(d)}</td>
						<td>{regions(d.regions)}</td>
						<td>{dataOf(d)}</td>
					</tr>
				{/each}
			{/each}
		</tbody>
	</table>
</div>

<h3 id="summary">From months to records</h3>
<p>Each month’s build produces a summary with three parts:</p>
<ul>
	<li>for each half-hour record, every half-hour that beat everything earlier in the month</li>
	<li>each day’s sums, for the day, week, month and year records</li>
	<li>the runs at the month’s start and end, and the longest inside it</li>
</ul>
<p>Joining the months in order gives every record and its progression, because a record must be one of those half-hours. Elenz publishes the records whenever the history is complete.</p>

<h2 id="interpretation"><span id="pages"></span>How to interpret it</h2>
<p>A record says a figure is the highest or lowest in this history. It doesn’t say why, and a generation or demand record partly reflects a growing system.</p>
<p>On a record’s page, the faint line is the best of each month, or each year for year records, so the near misses show. A hatched band marks the month or year still running, whose figure is so far and not final. “Has stood for” counts from the end of the record’s period.</p>
<Shot name="record-compare" alt="A record’s progression chart with one point pinned and another read beside it." caption="How the record grew, with one point pinned and a second read beside it." />
<GoodFor rows={[
	{ use: 'Official generation, demand, price and HVDC records', level: 'good', verdict: 'Metered data and final prices.' },
	{ use: 'Renewable-share records from 2009', level: 'ok', verdict: 'Rest on metered generation with embedded generation added as calculated estimates.' },
	{ use: 'Provisional records', level: 'ok', verdict: 'Corrected dispatch data, and clear of the margin.', why: 'In a test over 73 months, none failed to be confirmed.' },
	{ use: 'Close to the record', level: 'care', verdict: 'Too close for dispatch data to call. In the test, 49 of 320 turned out to be records.' },
	{ use: 'Embedded solar records', level: 'care', verdict: 'Calculated estimates, with an uncertainty of about ±9% on clear days.' },
	{ use: 'Anything before August 1997', level: 'no', verdict: 'The history starts in August 1997, so “all-time” means since then.' },
]} />

<h2 id="limitations"><span id="limits"></span>Accuracy and limitations</h2>
<div class="tbl">
	<table>
		<thead><tr><th>Figure</th><th>Status</th><th>Typical accuracy</th></tr></thead>
		<tbody>
			<tr><td>Official generation and demand records</td><td>Metered</td><td>As published by the EA, apart from the corrections listed in <a href="/methods/history#metered">History since 1997</a></td></tr>
			<tr><td>Official price records</td><td>Final price</td><td>As published by the EA</td></tr>
			<tr><td>Official HVDC records</td><td>Metered</td><td>Flows at each end of the link, with early months as described in <a href="/methods/hvdc#coverage">HVDC transfer</a></td></tr>
			<tr><td>Renewable-share records, from January 2009</td><td>Calculated estimate</td><td>Other embedded generation is a calculated estimate, about 2% of generation</td></tr>
			<tr><td>Embedded solar records</td><td>Calculated estimate</td><td>About ±9% on clear days</td></tr>
			<tr><td>Provisional records</td><td>Calculated estimate</td><td>Corrected dispatch data. None was wrongly claimed in the test below.</td></tr>
		</tbody>
	</table>
</div>
<p>We tested the corrections month by month from September 2020 to September 2026, 73 months in all. Each month’s corrections were worked out without that month. Of the 165 records the meters confirmed, none was wrongly claimed after correction, against 27 uncorrected, and 2 were missed. Of 320 close calls, 49 turned out to be records. The corrections are kept in <a href={REPO + 'facilities/dispatch_adjust.json'}><code>facilities/dispatch_adjust.json</code></a>.</p>
<p>The history has gaps, which <a href="/methods/history#coverage">History since 1997</a> lists. Totals before 2009 leave out embedded stations that Elenz doesn’t show later.</p>
<p>The South Island’s generation is almost all renewable. Other embedded generation adds about 1 MW of unclassified output there, which isn’t fossil plant, so the South Island has no lowest renewable share records. Its list also leaves out other records that can’t apply there.</p>
<p>Huntly’s Rankines can burn coal or gas without the market seeing which, so the run counts the units being off, not coal being unused.</p>

<h2 id="coverage">Historical coverage</h2>
<p>Each row marks a change that affects the records.</p>
<div class="tbl">
	<table>
		<thead><tr><th>From</th><th>Change</th></tr></thead>
		<tbody>
			<tr><td>August 1997</td><td>The records start. Days the clocks change count like any other, although a filled hour on those days before 2009 is a calculated estimate.</td></tr>
			<tr><td>January 2009</td><td>Generation and the renewable share start to include other embedded generation.</td></tr>
			<tr><td>August 2013</td><td>Embedded solar records start.</td></tr>
			<tr><td>1 November 2022</td><td><a href={ref('rtp')}>Real-time pricing</a> starts, which changes how final prices are set. Price records on either side of this date were set under different rules.</td></tr>
			<tr><td>6 November 2026</td><td>Other embedded generation joined the records, and no new records resulted. New Zealand’s highest renewable half-hour moved from 99.6% on 20 September 2024 to 99.4% on 5 September 2026. The North Island’s moved from 99.3% to 98.9%. Highest renewable days and months fell by 0.2 to 0.5 points on the same dates, New Zealand’s highest renewable week moved to 5 January 2026, and the 90% renewable run became half an hour shorter.</td></tr>
		</tbody>
	</table>
</div>

<h2 id="references">References</h2>
<References slug="records" />
