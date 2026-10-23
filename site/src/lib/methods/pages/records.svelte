<script lang="ts">
	// The list of records comes from the Records pages' own definitions, so this page can't drift from them.
	import { LISTED as DEFS, GROUPS, NEW_DAYS } from '#lib/records/records.js';
	import { REPO } from '../registry.js';
	const KIND: Record<string, string> = { hh: 'Half-hour', month: 'Calendar month', run: 'Run of half-hours' };
	const FAM: Record<string, string> = { gen: 'Metered generation and demand', price: 'Final prices', hvdc: 'Metered HVDC' };
	const regions = (r: string[]) => (r.length === 3 ? 'New Zealand, each island' : r.map((x) => ({ NZ: 'New Zealand', NI: 'North Island', SI: 'South Island' })[x]).join(', '));
</script>

<h2 id="what">What counts as a record</h2>
<p>The <a href="/records">Records</a> page keeps the highest and lowest values in the history since 1 August 1997, for New Zealand and for each island. There are three kinds:</p>
<dl>
	<dt>Half-hour records</dt>
	<dd>The highest or lowest half-hour: each trading period’s average, as the history holds it. A record has to beat the one before it; equalling it doesn’t count.</dd>
	<dt>Days, weeks, months and years</dt>
	<dd>Each half-hour record also has its highest or lowest day, week (Monday to Sunday), calendar month and calendar year, New Zealand time: the period’s average over its half-hours (MW, or $/MWh for prices), and for the renewable share, renewable energy over all the period’s generation. Averages rather than totals, so periods of different lengths compare fairly: a February isn’t the lowest-demand month just for being short. Only whole periods count, so the history’s first part-year (1997) and the period still under way are left out, and a day needs 90% of its half-hours. A period is official when every day in it is official, and a newer one beyond the record is provisional. Pick the period at the top of the records table or on a record’s page. (These replace the earlier month records for the renewable share and wind, whose pages still work.) The lowest price and lowest hydro are kept for these periods only: their half-hours say little (prices often fall to a few cents, and hydro is lowest overnight), but a month or a year of them marks a glut of cheap power or a dry spell. A period record shows its energy beside its average (the average times the period’s hours), though it is ranked by the average.</dd>
	<dt>Runs</dt>
	<dd>The longest unbroken run of half-hours meeting a condition, joined across month boundaries: at least 90% renewable, prices under $5/MWh, or no Huntly Rankine running.</dd>
</dl>
<p>Each record’s page shows how it grew: every time it was broken since 1997, worked out from the half-hours that beat everything before them.</p>

<h2 id="official">Official and provisional</h2>
<p>A record is official once it rests on final data. The history uses the EA’s metered generation and demand for every month it has published (about 5–6 weeks after the month ends), final prices (usually the next day) and metered HVDC flows (about two weeks after the month). See <a href="/methods/history">History since 1997</a>.</p>
<p>Anything newer comes from dispatch data, the market’s 5-minute targets. Records set there are <b>provisional</b>: shown as such, with when the metered data is due, and confirmed or dropped when it arrives. Dispatch runs 1–2% above metered generation (wind about 3.5%), so a provisional record that only just beats the old one often doesn’t survive. The page says which way it went for {NEW_DAYS} days.</p>
<p>The Now page checks the live week itself: when a half-hour of the live data beats a record for generation or demand, a line under the price tiles says so. Prices and HVDC are left to the history: live prices are dispatch prices, which can be far from the final ones (on 9 August 2021 dispatch prices peaked at $356,621/MWh, final prices at $2,698), and live HVDC is an estimate.</p>
<p>A record is marked <b>New</b> for {NEW_DAYS} days after it first appears in the official records.</p>

<h2 id="pace">On record pace</h2>
<p>Once half of the current day, week, month or year has gone, the records page lists any record it is on pace to break: where its average so far is ahead of where the record period was at the same point, as in a race. Weeks, months and years compare whole days (the record period’s average after the same number of days); a day compares whole half-hours. The current period comes from the history and the live week after it, both dispatch data, so it is provisional; the rest of the period can still change it, and the page says what the rest would need to average to beat the record outright.</p>

<h2 id="list">Every record</h2>
<p>Definitions follow the rest of the site: generation is each fuel’s output summed (battery discharge only, no HVDC); the renewable share is of that total less battery discharge, with geothermal, bioenergy, hydro, wind, grid solar and embedded solar counted as renewable (<a href="/methods/groupings">Renewable share and groupings</a>); fossil generation is Huntly’s Rankines, gas, diesel and waste heat; demand is metered grid demand (<a href="/methods/demand">Demand</a>); prices are at the island reference nodes, Haywards and Benmore, and New Zealand’s is the higher of the two.</p>
<div class="tbl">
	<table>
		<thead><tr><th>Record</th><th>Kind</th><th>Kept for</th><th>Official with</th></tr></thead>
		<tbody>
			{#each GROUPS as g}
				{#each DEFS.filter((d) => d.group === g) as d}
					<tr>
						<td><a href="/records/{d.id}">{d.name}</a>{#if d.est} <span class="est-tag">Estimate</span>{/if}<br /><small>{d.sub}</small></td>
						<td>{d.periods ? 'Day, week, month and year' : KIND[d.kind]}</td>
						<td>{regions(d.regions)}</td>
						<td>{FAM[d.fam]}</td>
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
	<li><b>The South Island</b> has no fossil plant, so its renewable share is always 100%; those records are shown as a note, not a date.</li>
	<li><b>Huntly’s Rankines</b> can burn coal or gas without the market seeing which, so the run counts the units being off, not coal being unused.</li>
</ul>

<h2 id="how">How it is worked out</h2>
<p>The history job boils each month down to a short summary when the month is built: for each half-hour record, every half-hour that beat everything earlier in the month (a record must be one of those, so joining the months in order gives every record and its progression); each month’s figures; and the runs at the month’s start and end and the longest inside it. It then publishes the records whenever the history is complete, with the time and a day’s worth of context for each half-hour record (that day’s series, demand, prices, HVDC and the biggest wind or solar farms).</p>
<p>Code: <a href="{REPO}ingest/records.py">ingest/records.py</a> (the records), <a href="{REPO}site/src/lib/records/records.js">site/src/lib/records/records.js</a> (names, wording and the live check).</p>
