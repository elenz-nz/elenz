<script lang="ts">
	import { REPO } from '../registry.js';
</script>

<h2 id="shows">What the chart shows</h2>
<dl>
	<dt>Grid demand</dt>
	<dd>The solid line: electricity taken from the grid in each island, as the market measures it. It includes everything supplied through local networks and the Tiwai Point smelter, counted like any other consumer, and leaves out battery charging.</dd>
	<dt>With embedded solar</dt>
	<dd>The dashed line, with its uncertainty band: grid demand plus modelled <a href="/methods/embedded-solar">embedded solar</a>, the power used on rooftops and local networks that never passes through the grid. It is closer to how much electricity people actually used.</dd>
</dl>
<p class="formula">Demand with embedded solar = grid demand + embedded solar</p>

<h2 id="live">The live week</h2>
<p>Each dispatch case gives the load at every node. Grid demand for an island is the sum of the load at all its nodes, leaving out the units that are batteries charging (charging is netted against each battery’s output instead). Missing intervals are filled the same way as generation (see <a href="/methods/generation#live">generation</a>).</p>
<p>The dispatch data counts dispatched plants on local networks as generation, not as less load, so their output is part of demand here too.</p>

<h2 id="history">In the metered history</h2>
<p>For every month the EA has published metering for, demand is built from the grid’s own meters, defined the same way as the dispatch data’s island load:</p>
<p class="formula">Demand = energy leaving the grid − energy entering the grid at local networks and stations + generation
<small>by island and half-hour: <code>Grid_export</code> − <code>Grid_import</code> + metered generation</small></p>
<ul>
	<li>Adding generation back counts embedded stations that are netted off at their grid connection, as dispatch counts them, and takes grid losses out of generation.</li>
	<li>Before October 2000 there is no grid import file, and until about 2003 it covered only local networks’ injections. For the connection points it lacks, the stations’ metered generation (<code>Generation_MD</code>, then grid stations only, which inject at their own connection point) stands in.</li>
</ul>
<p>Over September 2020 to September 2026, where both exist, metered demand matches the dispatch data’s island load within 1–2%.</p>

<h2 id="ranges">Long ranges</h2>
<ul>
	<li>The 30-day view shows half-hours; 1 year and All show daily averages (or weekly, monthly and yearly).</li>
	<li>Peak demand on long ranges is each day’s highest half-hour, not the highest daily average, so the peak isn’t flattened.</li>
</ul>

<h2 id="limits">Known limits</h2>
<ul>
	<li>Embedded generation other than solar (small hydro, wind and cogeneration on local networks that isn’t dispatched) still shows as lower grid demand; it isn’t added back yet.</li>
	<li>Demand with embedded solar is only as good as the solar estimate: about ±9% of the solar on clear days and ±19% under cloud.</li>
</ul>

<p class="note">Code: <a href={REPO + 'ingest/state.py'}><code>ingest/state.py</code></a> (island load from the feed), <a href={REPO + 'ingest/metered.py'}><code>ingest/metered.py</code></a> (metered demand).</p>
