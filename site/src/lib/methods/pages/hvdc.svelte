<script lang="ts">
	import { REPO } from '../registry.js';
	import DataSources from '../DataSources.svelte';
	import GoodFor from '../GoodFor.svelte';
	import References from '../References.svelte';
</script>

<aside class="mt-caveats" aria-label="Key caveats">
	<p class="k">Key caveats</p>
	<ul>
		<li>Live and recent figures are estimates, with a mean error of about 10 MW. They can be tens of MW out at times.</li>
		<li>Link losses for those periods come from a formula, not a measurement.</li>
		<li>Elenz has no data on individual poles, constraints or reserve sharing.</li>
	</ul>
	<p><a href="#limitations">Accuracy and limitations</a> has the detail.</p>
</aside>

<h2 id="introduction"><span id="shows"></span>Introduction</h2>
<p>The HVDC link connects the power systems of the two islands. It runs between Benmore in the South Island and Haywards in the North Island, and includes undersea cables across Cook Strait. HVDC stands for high-voltage direct current.</p>
<p>HVDC transfer is the amount of power on the link and its direction. Elenz counts northward flow as positive and southward flow as negative.</p>
<p>The New Zealand view shows the transfer at the midpoint of the link, which we call the mid-link figure. Each island’s view shows the flow at its own end. The two ends differ because some power is lost along the way.</p>

<h2 id="data-sources">Data sources</h2>
<DataSources slug="hvdc" roles={{
	hvdcflows: ['Main data', 'Provides metered flows at both ends of the link, and the record the estimate was fitted to.'],
	rtd: ['Live data', 'Provides each island’s generation and grid demand for the live estimate.'],
	dispatch: ['Recent data', 'Provides the same inputs for recent weeks.'],
}} />

<h2 id="how-it-works">How it works</h2>

<h3 id="metered">Metered flows</h3>
<p>Where HVDC flows are published, Elenz uses them directly. The mid-link figure is the average of the two ends.</p>

<h3 id="estimate">Estimated flows <span class="est-tag">Estimate</span></h3>
<p>The dispatch data has no row for the HVDC link. For any period without metered flows, we estimate the transfer from each island’s balance of generation and demand. The estimate is a straight-line fit to metered flows. We chose it because a simple average of the two island balances read about 22 MW low.</p>
<p class="formula">Mid-link MW = 0.653 × (South Island generation − South Island demand)
  + 0.339 × (North Island demand − North Island generation)
  − 0.064 × South Island demand
  + 0.023 × North Island demand
  + 41.3</p>
<div class="tbl">
	<table>
		<thead><tr><th>Term</th><th>Meaning</th><th>Unit</th></tr></thead>
		<tbody>
			<tr><td>Mid-link MW</td><td>Transfer at the midpoint of the link, positive northward</td><td>MW</td></tr>
			<tr><td>Generation</td><td>Dispatched generation in that island, excluding embedded solar</td><td>MW</td></tr>
			<tr><td>Demand</td><td>Grid demand in that island</td><td>MW</td></tr>
			<tr><td>0.653, 0.339, 0.064, 0.023 and 41.3</td><td>Fitted coefficients, rounded here from the values in the code</td><td>None</td></tr>
		</tbody>
	</table>
</div>

<h3 id="losses">Link losses</h3>
<p>Losses rise with the square of the transfer. The same formula turns the estimated mid-link figure into a figure for each end.</p>
<p class="formula">Losses = 0.0000586 × (mid-link MW)²
Benmore end = mid-link MW + losses ÷ 2
Haywards end = mid-link MW − losses ÷ 2</p>
<p>Losses come to about 59 MW at a transfer of 1,000 MW.</p>

<h3 id="worked-example">Worked example</h3>
<p>These figures are illustrative. South Island generation is 3,000 MW and demand is 2,000 MW. North Island generation is 3,800 MW and demand is 4,750 MW.</p>
<div class="tbl">
	<table>
		<thead><tr><th>Part of the formula</th><th>Calculation</th><th class="n">MW</th></tr></thead>
		<tbody>
			<tr><td>South Island balance</td><td>0.653 × (3,000 − 2,000)</td><td class="n">653.00</td></tr>
			<tr><td>North Island balance</td><td>0.339 × (4,750 − 3,800)</td><td class="n">322.05</td></tr>
			<tr><td>South Island demand term</td><td>−0.064 × 2,000</td><td class="n">−128.00</td></tr>
			<tr><td>North Island demand term</td><td>0.023 × 4,750</td><td class="n">109.25</td></tr>
			<tr><td>Constant</td><td></td><td class="n">41.30</td></tr>
			<tr><td><b>Mid-link transfer</b></td><td>Sum of the above</td><td class="n">997.60</td></tr>
		</tbody>
	</table>
</div>
<p>Losses are 0.0000586 × 997.6² = 58.3 MW. Benmore sends about 1,026.8 MW, and Haywards receives about 968.4 MW.</p>

<h2 id="interpretation"><span id="good-for"></span>How to interpret it</h2>
<p>A positive figure means power is moving north, and a negative figure means it is moving south. The size shows how much power one island is supplying to the other at that moment.</p>
<p>A large transfer doesn’t by itself show that the link is at a limit, because Elenz has no data on the link’s limit at any given time. A gap between island prices is a better sign (see <a href="/methods/prices#derived">Islands priced apart</a>).</p>
<GoodFor rows={[
	{ use: 'Monthly or yearly transfer, in history', level: 'good', verdict: 'Metered at both ends of the link.' },
	{ use: 'Half-hourly flow, in history', level: 'good', verdict: 'Metered wherever the month has been published.' },
	{ use: 'Direction and rough size, live and recent weeks', level: 'ok', verdict: 'Estimated from island balances, with a mean error of about 10 MW.' },
	{ use: 'Exact MW at a given moment, live week', level: 'care', verdict: 'It can be tens of MW out.', why: 'The fit absorbs each island’s grid losses only on average.' },
	{ use: 'Link losses, live and recent weeks', level: 'care', verdict: 'Calculated from a formula until the metered month arrives.' },
	{ use: 'Individual poles, constraints or reserve sharing', level: 'no', verdict: 'These aren’t in the data Elenz uses.' },
]} />

<h2 id="limitations"><span id="limits"></span>Accuracy and limitations</h2>
<div class="tbl">
	<table>
		<thead><tr><th>Figure</th><th>Status</th><th>Typical accuracy</th></tr></thead>
		<tbody>
			<tr><td>Flow at each end, metered months</td><td>Metered</td><td>As published by the EA</td></tr>
			<tr><td>Mid-link transfer, metered months</td><td>Calculated</td><td>The average of the two metered ends</td></tr>
			<tr><td>Receiving end, the early months listed below</td><td>Estimated</td><td>Mean error under 2 MW</td></tr>
			<tr><td>Mid-link transfer, live and recent weeks</td><td>Estimated</td><td>Mean error about 10 MW, with no bias</td></tr>
			<tr><td>Losses, live and recent weeks</td><td>Estimated</td><td>Calculated from the loss formula, not measured</td></tr>
		</tbody>
	</table>
</div>
<p>The fit uses 2,877 half-hours from 72 days between December 2025 and October 2026. We tested it on days left out of the fit, and by leaving out each month in turn. It beat the simple average in five of six months.</p>
<p>Each island’s balance includes its own grid losses, and the fit absorbs these only on average. If the system changes, for example through a new connection or a different way of running the link, the fit can drift until we refit it.</p>
<p>The series can step slightly where it moves from metered to estimated data.</p>

<h2 id="coverage">Historical coverage</h2>
<p>The EA’s file starts in October 1996, and Elenz’s history starts in August 1997. The file’s layout has changed over time, and we read each layout.</p>
<div class="tbl">
	<table>
		<thead><tr><th>Period</th><th>Status</th><th>Data</th></tr></thead>
		<tbody>
			<tr><td>August 1997 to October 2000, most months</td><td>Metered</td><td>One set of rows for each pole, with each end’s northward and southward flow.</td></tr>
			<tr><td>December 1997, August 1998, June and September 1999, most of 2000, and all of 2001 and 2002</td><td>Part estimated</td><td>The file holds only each end’s sending side. We estimate the receiving side as the power sent less the link’s losses, fitted on months that meter both ends.</td></tr>
			<tr><td>January 2003 to the latest published month</td><td>Metered</td><td>Flows at the Benmore and Haywards connection points (<code>BEN2201</code>, <code>BEN0161</code>, <code>HAY2201</code>, <code>HAY1101</code>). The 350 kV rows (<code>BEN3501</code>, <code>HAY3501</code>) repeat the totals, so we leave them out.</td></tr>
			<tr><td>After the latest published month</td><td>Estimated</td><td>The estimate above. The change falls 2 to 6 weeks before today, always at the start of a month.</td></tr>
		</tbody>
	</table>
</div>

<h2 id="references">References</h2>
<References slug="hvdc" inBody />
<p class="note">Code: <a href={REPO + 'ingest/hvdc.py'}><code>ingest/hvdc.py</code></a>. Fit and evidence: <a href={REPO + 'analysis/README.md'}><code>analysis/README.md</code></a>.</p>
