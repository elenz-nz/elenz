<script lang="ts">
	// The one account of how the live, recent and history layers join: shown on the overview and on History since 1997.
	// Other pages put the short form in their Data sources section and link here.
</script>

<p>Elenz joins three layers of data into one record. Each period uses the most reliable data published so far.</p>
<ul class="mt-flow">
	<li><b>History</b><strong>Metered history</strong><span>August 1997 to the latest month the Electricity Authority (EA) has fully published. It holds half-hourly energy recorded by meters. Each month’s generation and demand data usually arrives 5 to 6 weeks after the month ends.</span></li>
	<li><b>Recent</b><strong>Recent dispatch data</strong><span>The end of the metered history to the newest daily dispatch file, usually 1 to 4 days old. This layer usually covers 5 to 10 weeks. Dispatch figures aren’t meter readings. For most plants they are the market system’s 5-minute targets, and for wind and solar they are a snapshot of output at the time. Elenz averages them to half-hours.</span></li>
	<li><b>Live</b><strong>The live week</strong><span>The last 7 days of 5-minute data from the real-time dispatch feed. The 24-hour, 3-day and 7-day views use this layer alone. Longer views use the history, then add live data only for the days not yet in a daily file.</span></li>
</ul>
<p>When a month’s metered data is complete, it replaces that month’s dispatch figures. Dispatch data still fills in plants the meters don’t cover, such as batteries and new solar farms.</p>
<p>Each figure moves to better data on its own timetable, and this table sets that out.</p>
<div class="tbl">
	<table>
		<thead><tr><th>Figure</th><th>Metered or final</th><th>Recent weeks</th><th>Latest days and the 24-hour to 7-day views</th></tr></thead>
		<tbody>
			<tr><td>Generation</td><td>Metered, once the month is complete</td><td>Daily dispatch files</td><td>Real-time dispatch feed</td></tr>
			<tr><td>Grid demand</td><td>Metered, on the same timetable as generation</td><td>Daily dispatch files</td><td>Real-time dispatch feed</td></tr>
			<tr><td>HVDC transfer</td><td>Metered, usually about 2 weeks after the month ends</td><td>A calculated estimate from island balances until the month is published</td><td>A calculated estimate from island balances</td></tr>
			<tr><td>Prices</td><td>Final prices, usually the next day, marked interim for the first day or two</td><td>Final prices</td><td>Dispatch prices. The 24-hour to 7-day views keep showing them after a final price is published.</td></tr>
			<tr><td>Embedded solar</td><td>A calculated estimate, from August 2013</td><td>A calculated estimate, modelled in the same way</td><td>A calculated estimate, with the last hour carried forward</td></tr>
			<tr><td>Other embedded generation</td><td>A calculated estimate from metered injection, from January 2009</td><td>A calculated estimate, from reconciliation data where it has been published and otherwise a typical day</td><td>A calculated estimate, from a typical day</td></tr>
		</tbody>
	</table>
</div>
<p>Three consequences follow from this:</p>
<ul>
	<li>The same half-hour can show a dispatch price in the 7-day view and a final price in the 30-day view.</li>
	<li>HVDC transfer moves to metered data earlier than generation. Its switch falls 2 to 6 weeks behind today, always at the start of a month.</li>
	<li>Before 10 September 2020 there are no daily dispatch files, so metered data stands alone.</li>
</ul>
