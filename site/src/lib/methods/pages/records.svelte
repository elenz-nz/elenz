<script lang="ts">
	// The list of records comes from the Records pages' own definitions, so this page can't drift from them.
	import { LISTED as DEFS, GROUPS, NEW_DAYS, NEW_LAG } from '#lib/records/records.js';
	import { REPO } from '../registry.js';
	// what each record measures, in a line (the definitions' own `sub` is written for the Records list, where some say
	// only "Half-hour")
	const WHAT: Record<string, string> = {
		demand_max: 'Grid demand: metered, not counting embedded solar', demand_min: 'Grid demand: metered, not counting embedded solar',
		ren_max: 'Renewable share of generation', ren_min: 'Renewable share of generation',
		ren_run: 'Half-hours in a row at 90% renewable or more', fossil_min: 'Huntly’s Rankines, gas, diesel and waste heat',
		fossil_max: 'Huntly’s Rankines, gas, diesel and waste heat', huntly_off_run: 'Half-hours in a row with no Huntly Rankine generating',
		hydro_max: 'Hydro generation', hydro_min: 'Hydro generation: a dry spell', wind_max: 'Wind generation',
		solar_max: 'Solar farms the market dispatches', roof_max: 'Rooftops and small arrays on local networks, modelled',
		price_max: 'Island reference price (final)', price_min: 'Island reference price (final)',
		gap_max: 'Haywards price against Benmore', low_price_run: 'Half-hours in a row under $5/MWh (New Zealand: both islands)',
		hvdc_n_max: 'Benmore to Haywards', hvdc_s_max: 'Haywards to Benmore',
	};
	const kept = (d: any) => (d.kind === 'run' ? 'Run (any length)' : 'Half-hour, day, week, month, year');
	const DATA: Record<string, string> = { gen: 'Metered generation and demand', price: 'Final prices', hvdc: 'Metered HVDC' };
	const dataOf = (d: any) => (d.est ? 'Modelled (embedded solar)' : DATA[d.fam]);
	const regions = (r: string[]) => (r.length === 3 ? 'New Zealand, each island' : r.map((x) => ({ NZ: 'New Zealand', NI: 'North Island', SI: 'South Island' })[x]).join(', '));
</script>

<h2 id="what">What counts as a record</h2>
<p>The <a href="/records">Records</a> page keeps the highest and lowest values in the history since 1 August 1997, for New Zealand and for each island. A record has to beat the one before it; equalling it doesn’t count. There are three kinds.</p>

<h3 id="half-hours">Half-hours</h3>
<p>The highest or lowest half-hour: each trading period’s average, as the history holds it.</p>

<h3 id="periods">Days, weeks, months and years</h3>
<p>Each half-hour record also has its highest or lowest day, week (Monday to Sunday), calendar month and calendar year, in New Zealand time. Pick the period with the buttons in the records list’s title bar, or on a record’s page.</p>
<ul>
	<li><b>Averages, not totals.</b> A period’s figure is its average over its half-hours (MW, or $/MWh for prices), so periods of different lengths compare fairly: a February isn’t the lowest-demand month just for being short. The renewable share is renewable energy over all the period’s generation.</li>
	<li><b>Energy alongside.</b> A period record also shows its energy (the average times the period’s hours), but it is ranked by the average.</li>
	<li><b>Whole periods only.</b> The history’s first part-year (1997) and the period still under way don’t count, and a day needs 90% of its half-hours.</li>
	<li><b>Official or provisional.</b> A period is official when every day in it is; a newer one beyond the record is provisional.</li>
	<li><b>Lowest price and lowest hydro</b> have half-hour records like the rest, but their periods say more: a month or a year of them marks a glut of cheap power or a dry spell. A half-hour of either is usually overnight, and prices often fall to a few cents.</li>
	<li>These replace the earlier month records for the renewable share and wind, whose pages still work.</li>
</ul>

<h3 id="runs">Runs</h3>
<p>The longest unbroken run of half-hours meeting a condition, joined across month boundaries: at least 90% renewable, prices under $5/MWh, or no Huntly Rankine running.</p>

<h2 id="milestones">Milestones</h2>
<p>The Milestones tab lists the first half-hour each record passed a round level, newest first, for New Zealand and each island side by side. They come from the records’ own progressions, so a milestone is the first record step at or over its level.</p>
<ul>
	<li><b>Wind:</b> 100, 250, 500, 750, 1,000, 1,250 and 1,500 MW.</li>
	<li><b>Grid solar</b> and <b>embedded solar</b> (estimated): 100, 250, 500, 750 and 1,000 MW.</li>
	<li><b>Renewable share:</b> 90%, 95%, 98% and 99%. The South Island, which has no fossil plant, has one milestone instead: 100% renewable in every half-hour since the data began in August 1997.</li>
	<li><b>Peak demand:</b> 6,000, 6,500, 7,000 and 7,500 MW for New Zealand; 4,500 and 5,000 MW for the North Island; 2,000 and 2,500 MW for the South Island.</li>
	<li>A level not reached yet isn’t listed, and an island lists only those that can apply there.</li>
</ul>

<h2 id="pages">A record’s page</h2>
<ul>
	<li><b>How the record grew</b> shows every time the record was broken since 1997, worked out from the half-hours that beat everything before them. A key above the chart names each line.</li>
	<li><b>The faint line</b> behind it is the best of each month (each year, for year records), so the near misses show.</li>
	<li><b>The month or year still running</b> sits in a hatched band, with its line dotted: it is the figure so far, not a finished period. Hovering there gives that figure and how long is left.</li>
	<li><b>The period it fell</b>: a day, week, month or year record’s page also charts the period itself (its half-hours, hours, days or weeks) around its average.</li>
	<li><b>“Has stood for”</b> counts from the end of the record’s half-hour, day, week, month or year, when it was set.</li>
	<li><b>Zoom</b>: drag across either chart with a mouse; Reset zoom or Escape goes back.</li>
</ul>

<h2 id="official">Official and provisional</h2>
<p>A record is official once it rests on final data. The history uses:</p>
<ul>
	<li>the EA’s metered generation and demand, for every month it has published (about 5–6 weeks after the month ends);</li>
	<li>final prices, usually the next day;</li>
	<li>metered HVDC flows, about two weeks after the month.</li>
</ul>
<p>See <a href="/methods/history">History since 1997</a>.</p>
<p>Anything newer comes from dispatch data, the market’s 5-minute targets. Records set there are <b>provisional</b>: shown as such, with when the metered data is due, and confirmed or dropped when it arrives. Dispatch runs 1–2% above metered generation (wind about 3.5%), so a provisional record that only just beats the old one often doesn’t survive. The page says which way it went for {NEW_DAYS} days.</p>
<p>The Now page checks the live week itself: when a half-hour of the live data beats a record for generation or demand, a “New record today” link above Generation now says so, on the day it was set. Prices and HVDC are left to the history:</p>
<ul>
	<li>live prices are dispatch prices, which can be far from the final ones (on 9 August 2021 dispatch prices peaked at $356,621/MWh, final prices at $2,698);</li>
	<li>live HVDC is an estimate.</li>
</ul>
<p>A record is marked <b>New</b> for {NEW_DAYS} days after it first appears in the official records, as long as its period ended recently: within about {NEW_LAG} days, since metered data runs weeks behind. A rebuild of the history that moves an old record doesn’t make it new.</p>

<h2 id="pace">On record pace</h2>
<p>Once half of the current day, week, month or year has gone, the records page lists any record it is on pace to break: where its average so far is ahead of where the record period was at the same point, as in a race.</p>
<ul>
	<li>Weeks, months and years compare whole days (the record period’s average after the same number of days); a day compares whole half-hours.</li>
	<li>The current period comes from the history and the live week after it, both dispatch data, so it is provisional.</li>
	<li>The rest of the period can still change it, so the page says what the rest would need to average to beat the record outright.</li>
</ul>

<h2 id="demand">Demand and embedded solar</h2>
<p>Demand records are metered grid demand: what the grid delivered. Embedded solar (rooftops and small arrays on local networks) meets part of the country’s use before it reaches a grid meter, so it isn’t in them.</p>
<p>Embedded solar is modelled rather than metered (<a href="/methods/embedded-solar">Embedded solar</a>), and starts in August 2013 (zero before, when the registry starts), so demand with it added back can’t be a record. The demand records’ pages show it for information:</p>
<ul>
	<li>a dashed line above the faint one: the same best each month (or day, week, month or year) with embedded solar added back;</li>
	<li>its figure in the tooltip, marked as an estimate.</li>
</ul>
<p>Half-hour lows fall overnight, when there is no solar, so the two lines meet there. Daytime and longer periods show the gap growing as rooftop solar has.</p>

<h2 id="list">Every record</h2>
<p>Definitions follow the rest of the site:</p>
<ul>
	<li><b>Generation</b> is each fuel’s output summed (battery discharge only, no HVDC).</li>
	<li><b>The renewable share</b> is of that total less battery discharge, with geothermal, bioenergy, hydro, wind, grid solar and embedded solar counted as renewable (<a href="/methods/groupings">Renewable share and groupings</a>).</li>
	<li><b>Fossil generation</b> is Huntly’s Rankines, gas, diesel and waste heat.</li>
	<li><b>Demand</b> is metered grid demand (<a href="/methods/demand">Demand</a>), which leaves out what rooftops and small arrays supply behind the meter.</li>
	<li><b>Prices</b> are at the island reference nodes, Haywards and Benmore; New Zealand’s is the higher of the two.</li>
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

<h2 id="limits">What is left out, and known limits</h2>
<ul>
	<li><b>Days the clocks change.</b> The EA’s metered generation files before 2009 number those days’ half-hours by the clock and leave out one hour (the last hour of the day when the clocks go forward, one of the two 2–3 am hours when they go back). The history puts each half-hour at its right time and fills the missing hour from the half-hour next to it, so those days count like any other, but the filled hour is an estimate.</li>
	<li><b>Embedded solar is modelled</b> (<a href="/methods/embedded-solar">Embedded solar</a>), so its records are estimates, and it counts towards the renewable share as it does everywhere on the site.</li>
	<li><b>Coverage.</b> The history has gaps (a few stations missing for some months; see <a href="/methods/history">History since 1997</a>). Totals before 2009 leave out embedded stations the tracker doesn’t show later.</li>
	<li><b>The South Island</b> has no fossil plant, so its renewable share has been 100% in every half-hour since 1997. Its list leaves out the records that can’t apply there, and Milestones shows its 100% instead.</li>
	<li><b>Huntly’s Rankines</b> can burn coal or gas without the market seeing which, so the run counts the units being off, not coal being unused.</li>
</ul>

<h2 id="how">How it is worked out</h2>
<p>When the history job builds a month, it boils it down to a short summary:</p>
<ul>
	<li>for each half-hour record, every half-hour that beat everything earlier in the month (a record must be one of those, so joining the months in order gives every record and its progression);</li>
	<li>each day’s sums, for the day, week, month and year records;</li>
	<li>the runs at the month’s start and end, and the longest inside it.</li>
</ul>
<p>It publishes the records whenever the history is complete, with the time and a day’s worth of context for each half-hour record (that day’s series, demand, prices, HVDC and the biggest wind or solar farms).</p>
<p class="note">Code: <a href={REPO + 'ingest/records.py'}><code>ingest/records.py</code></a> (the records), <a href={REPO + 'site/src/lib/records/records.js'}><code>site/src/lib/records/records.js</code></a> (names, wording and the live check).</p>
