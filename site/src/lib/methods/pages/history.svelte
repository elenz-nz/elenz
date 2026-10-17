<script lang="ts">
	import { REPO } from '../registry.js';
</script>

<h2 id="layers">Three sources, by age</h2>
<p>Each stretch of time uses the best data published for it. Going back from now:</p>
<ol>
	<li><b>The last seven days</b>: the real-time dispatch feed, every 5 minutes (missed intervals are asked for again; ones with no case are interpolated).</li>
	<li><b>Back to the latest metered month</b> (about five to six weeks): the EA’s daily dispatch files, the same dispatch cases, arriving 1–4 days late.</li>
	<li><b>Every month the EA has published metering for, back to August 1997</b>: metered data, what each station actually delivered to the grid, as the market settles it.</li>
</ol>
<p>Prices are the EA’s final prices throughout the history, and HVDC is metered wherever published (about two weeks behind). The history job runs every six hours, adds months as the EA publishes them, and rebuilds every month whenever the plant register, the corrections or the metered plant table change.</p>

<h2 id="metered">A metered month</h2>
<p>A month is built from the EA’s monthly metered files, half-hour by half-hour:</p>
<dl>
	<dt>Generation</dt>
	<dd><code>Generation_MD</code>: each station’s output by connection point and generator code. Each code is mapped to a plant, fuel and island in <a href={REPO + 'facilities/metered_plants.csv'}><code>facilities/metered_plants.csv</code></a> (118 generator codes plus the old embedded meters, with date ranges and shares), and connection points the dispatch data never uses, many of them retired, get their island from the EA’s network supply points table. The build warns about any code it doesn’t know.</dd>
	<dt>Embedded stations</dt>
	<dd><code>Generation_MD</code> covers stations on local networks only from January 2009. Before that, the site uses <code>Embedded_generation</code> under the old meter codes (Rotokawa <code>RKA0111</code>, Ngāwhā <code>NGA0331</code>, Kaimai <code>KMI0331</code>, Te Rapa <code>TRC0331</code>, Tararua <code>TWF0331</code>/<code>2</code>, Highbank <code>HBK0661</code> and others). Only stations the site also shows later are included, so totals don’t jump in 2009.</dd>
	<dt>Net meters</dt>
	<dd>At some embedded points <code>Generation_MD</code> records output net of local load (Mangahao about 10% of its gross output, Cobb about 35%, Whareroa about 50%). Where the embedded meter at a listed point reads more, the difference is added to that point’s plant.</dd>
	<dt>Shared meters</dt>
	<dd>Some meters see two plants, split by their shares in the dispatch data: Deep Stream hydro and Mahinerangi wind (30/70, from June 2011); Te Ahi O Maui and Kawerau’s TOPP2 (35/65, from December 2025). Pātea’s three unit rows (from June 2026) each repeat the station total, so one is used.</dd>
	<dt>Double readings</dt>
	<dd>Trustpower’s embedded meters (Kaimai, Rotokawa, Tararua, Highbank, Paerau, Waipori, Teviot) read double until July 2005: a month whose peak is more than 1.4 times the plant’s nameplate is halved.</dd>
	<dt>Gaps filled from dispatch</dt>
	<dd>Where the metering lacks a plant, its dispatch figures are used: batteries (always, as dispatch nets their charging), solar farms not in the metering yet, and any plant whose metered energy is under half its dispatch energy in a month.</dd>
	<dt>Demand and HVDC</dt>
	<dd>From the metered grid flows; see <a href="/methods/demand#history">demand</a> and <a href="/methods/hvdc#metered">HVDC</a>.</dd>
	<dt>Embedded solar</dt>
	<dd>The same model with each month’s installed capacity: none before the registry starts in August 2013, ERA5 reanalysis sunshine for 2013–15, the satellite from 2016. See <a href="/methods/embedded-solar">embedded solar</a>.</dd>
</dl>
<p>Plants that have closed are included: New Plymouth, Ōtāhuhu A and B, Southdown, Te Awamutu, and Taranaki Combined Cycle (within Stratford).</p>

<h2 id="seam">Where the sources hand over</h2>
<p>Over September 2020 to September 2026, where both exist, dispatch and metered figures agree closely (half-hourly national correlation 0.999 every month), but dispatch totals run 1–2% above metered ones every year: wind 3–4%, hydro 1–2%, geothermal, gas and coal within 2%. That is most likely because dispatch measures output at the generator and metering at the grid connection. The site uses each as published rather than scaling one to the other, so where the history switches from metered to dispatch data, about six weeks back, totals can step up slightly.</p>
<p>Plant by plant, the two can differ more. The Waikato stations are dispatched as one block, so their dispatch figures are the chain’s total split between stations, not each station’s output (correlation only 0.4–0.7 by half-hour); the metered figures are the real ones. Glenbrook’s metered output is about 1.45 times its dispatch, which sees only part of the plant.</p>

<h2 id="resolution">Resolution</h2>
<ul>
	<li>The 30-day view shows half-hours.</li>
	<li>1 year and All show days, or weeks, months and years. Each is the average over its half-hours, with peak demand and peak generation from each day’s highest half-hour.</li>
	<li>Energy figures add up the half-hours, so they are the same at any interval.</li>
</ul>

<h2 id="checks">Checks</h2>
<ul>
	<li>Against MBIE’s annual net generation, which also counts industrial cogeneration and small embedded plants the EA’s metering doesn’t see: the total is 1.4–3.2% below MBIE in 2000–08 and 3.9–5.7% below in 2009–19; hydro is 1.3–2.9% below throughout; geothermal within ±5% from 2001.</li>
	<li>Emissions follow the national inventory year to year (see <a href="/methods/emissions#checks">emissions</a>).</li>
	<li>Metered demand matches the dispatch data’s island load within 1–2% where both exist.</li>
</ul>

<h2 id="gaps">Known gaps</h2>
<ul>
	<li><b>1–9 September 2020</b>: no Huntly. <code>Generation_MD</code> has no rows for the Rankines or unit 5 that month, and the dispatch files start on 10 September.</li>
	<li><b>Matahina from October 2021</b>: no metered rows; the dispatch figures stand in.</li>
	<li><b>Before April 1999</b>: <code>Embedded_generation</code> doesn’t yet have Rotokawa, Ngāwhā, Kaimai and Tararua, about 1–2% of generation in 1997–99. Geothermal in 1998–2000 is up to 15% below MBIE’s for that reason.</li>
	<li><b>Highbank before October 2001</b>: no metered rows for it at all; it appears in <code>Embedded_generation</code> from then (25 MW).</li>
	<li><b>Mill Creek, April 2014 to August 2015</b>: its first 17 months aren’t in <code>Embedded_generation</code> or <code>Generation_MD</code> (60 MW of wind, about 330 GWh). They are in the EA’s reconciliation data, and are due to be added at the next full rebuild.</li>
	<li><b>Grid imports before 2003</b>: incomplete (see <a href="/methods/demand#history">demand</a>), so the stations’ own metered generation stands in.</li>
	<li><b>Owners</b>: today’s owners apply to the whole history.</li>
	<li><b>Geothermal emissions before 2020</b> use 2020’s station factors, which probably understate them.</li>
</ul>

<p class="note">Code: <a href={REPO + 'ingest/history.py'}><code>ingest/history.py</code></a> (the history job), <a href={REPO + 'ingest/metered.py'}><code>ingest/metered.py</code></a> (metered months). Evidence: <a href={REPO + 'analysis/metered_check.py'}><code>analysis/metered_check.py</code></a>, <a href={REPO + 'analysis/README.md'}><code>analysis/README.md</code></a>.</p>
