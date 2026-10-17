<script lang="ts">
	import { REPO } from '../registry.js';
</script>

<h2 id="shows">What it shows</h2>
<p>The HVDC link carries power between Benmore in the South Island and Haywards in the North, through the Cook Strait cables. Positive is northward. The New Zealand view shows the transfer at mid-link; each island’s view shows its own end, what leaves Benmore or arrives at Haywards, as part of that island’s supply. The difference between the ends is the link’s losses.</p>

<h2 id="metered">Metered, in history</h2>
<p>The EA publishes metered flows at both ends of the link (<code>HVDC_Flows</code>) about two weeks after each month, back to October 1996. Wherever they exist, the history uses them, and the mid-link figure is the average of the two ends.</p>
<p>The file’s layout changed twice, and all three are read:</p>
<ul>
	<li>To about 1999: one row per direction at each end (northward and southward at Benmore and Haywards).</li>
	<li>Then one row per pole.</li>
	<li>From the mid-2000s: flows at the Benmore and Haywards connection points (<code>BEN2201</code>, <code>BEN0161</code>, <code>HAY2201</code>, <code>HAY1101</code>). The 350 kV rows (<code>BEN3501</code>, <code>HAY3501</code>) repeat the totals and are left out.</li>
</ul>

<h2 id="estimate">Estimated, for the live week <span class="est-tag">Estimate</span></h2>
<p>The dispatch data has no row for the HVDC link, so for the live week, and for the weeks of history before the metered file arrives, the transfer is estimated from each island’s balance of generation and load. A simple average of the two balances read about 22 MW low on average. A straight-line fit against the metered flows does better:</p>
<p class="formula">Mid-link MW = 0.653 × (SI generation − SI demand)
  + 0.339 × (NI demand − NI generation)
  − 0.064 × SI demand + 0.023 × NI demand + 41.3
<small>generation is dispatched generation (embedded solar left out); demand is grid demand</small></p>
<ul>
	<li>Fitted on 2,877 half-hours: 72 days between December 2025 and October 2026. Its mean error is about 10 MW with no bias, checked on days left out of the fit and on each month left out in turn (better in five of six).</li>
	<li>Losses grow with the square of the transfer:</li>
</ul>
<p class="formula">Losses = 0.0000586 × MW²
Benmore end = mid-link + losses ÷ 2
Haywards end = mid-link − losses ÷ 2<small>about 59 MW of losses at 1,000 MW</small></p>
<p>The same loss formula turns the estimated mid-link figure into each end’s.</p>

<h2 id="limits">Known limits</h2>
<ul>
	<li>The estimate is a fit to 72 days of data. Each island’s balance also holds its own grid losses, which the fit only absorbs on average, and if the system changes (a new connection, the link run differently) the fit can drift until it is refitted.</li>
	<li>Where the history switches from metered to estimated flows, about two weeks back, the series can step slightly.</li>
</ul>

<p class="note">Code: <a href={REPO + 'ingest/hvdc.py'}><code>ingest/hvdc.py</code></a>. Fit: <a href={REPO + 'analysis/README.md'}><code>analysis/README.md</code></a>.</p>
