<script lang="ts">
	// Thresholds and factors come straight from the explainer's own code, so this page can't drift from it.
	import { FACTORS, RULES } from '#lib/now/explain.js';
	import { REPO } from '../registry.js';
	const R = RULES;
	const usd = (v: number) => '$' + v.toLocaleString('en-NZ');
</script>

<h2 id="what">What it does</h2>
<p>Under the price tiles on the <a href="/now">Now</a> page, one line says whether the price is usual for the time of week, for example “$138 is about usual for a Saturday at 10:30 am”. Opened, it lists what is different from usual (wind, solar, hydro, gas and coal, peaking plants, demand, the HVDC link and the gap between the islands), each against its usual value, a 24-hour price chart against the usual range, and the likely price setter. It has three states:</p>
<dl>
	<dt>Quiet</dt>
	<dd>Just the line and a “Why this price?” button.</dd>
	<dt>Highlighted</dt>
	<dd>The line is outlined and asks to be opened: prices are well up, the islands have split, or a new low has begun.</dd>
	<dt>Open</dt>
	<dd>The panel opens by itself, at extremes only. Low prices never open it.</dd>
</dl>

<h2 id="usual">What counts as usual</h2>
<p>The history job keeps, for each of the week’s 336 half-hours (Monday 12:00 am = the first), the median and the 25th and 75th percentiles of the higher of the Haywards and Benmore prices, and the median of each factor, over the last 28 days of half-hourly history. It also keeps the median price over the past year, the <i>year median</i>, as a floor: when spilling hydro makes the usual price tiny, $20 against a usual $5 would otherwise count as four times usual.</p>
<p class="formula">Typical = median of max(Haywards, Benmore) at the same half-hour of the week, last four weeks</p>

<h2 id="rules">When it is highlighted or opens</h2>
<p>The rules test the {R.avgMin}-minute average of the 5-minute dispatch prices, and each state holds for {R.holdMin} minutes after its condition ends, so it doesn’t flicker.</p>
<div class="tbl">
	<table>
		<thead><tr><th>State</th><th>Any of</th></tr></thead>
		<tbody>
			<tr><td>Highlighted</td><td>
				<ul>
					<li>The higher island price ≥ {R.hlRatio}× typical <i>and</i> ≥ {R.hlLevel}× the year median</li>
					<li>The islands more than {usd(R.splitGap)} <i>and</i> {Math.round(R.splitRel * 100)}% apart (“Why is the North Island dearer?”)</li>
					<li>A new low: under {usd(R.low)} after {R.lowQuietH} hours without one, for its first {R.lowShowH} hours (“Why is the price so low?”)</li>
				</ul>
			</td></tr>
			<tr><td>Open</td><td>
				<ul>
					<li>The higher island price ≥ {R.openRatio}× typical <i>and</i> ≥ {R.openLevel}× the year median <i>and</i> ≥ {usd(R.openFloor)}</li>
					<li>≥ {usd(R.openAny)} at any time (a dry year raises typical prices too, so the relative test alone would miss it)</li>
				</ul>
			</td></tr>
		</tbody>
	</table>
</div>
<h3 id="tested">How often, tested on 30 years</h3>
<p>The rules were tested on every half-hour of the EA’s final prices at Haywards and Benmore from March 1997 to September 2026:</p>
<ul>
	<li><b>Highlighted</b> 11% of the time over the whole period, 13% since 2021 (9–22% a year): about 460 episodes a year, on 57% of days, a median of an hour each.</li>
	<li><b>Open</b> 0.6–0.7% of the time: about 34 times a year since 2021, on 6.5% of days. It would have opened on 9 August 2021, 8 May 2024, 12 December 2024 and 4 August 2026, and through August 2024’s dry-year prices (by the {usd(R.openAny)} rule).</li>
	<li><b>Lows</b> never open it: prices were under $5 for 14% of the time since 2021 and 26% of 2026, and the longest run was 354 hours at $0.01, from 22 December 2025 to 6 January 2026.</li>
</ul>
<p>Live, the rules run on dispatch prices, which spike more than final prices; the rates are to be checked against these after a month.</p>

<h2 id="factors">The reasons</h2>
<p>Each factor’s value now (the newest interval) is compared with its usual value for this half-hour of the week, for New Zealand or the island the panel is about. A factor is only mentioned when it is off by at least a set number of MW <i>and</i> a set share of usual:</p>
<div class="tbl">
	<table>
		<thead><tr><th>Factor</th><th>When above usual, the price tends to</th><th class="n">At least</th><th class="n">And</th></tr></thead>
		<tbody>
			{#each FACTORS as f (f.k)}
				<tr><td>{f.name}</td><td>{f.sign > 0 ? 'rise' : 'fall'}</td><td class="n">{f.floor} MW</td><td class="n">{Math.round((f.rel ?? 0.15) * 100)}%</td></tr>
			{/each}
		</tbody>
		<caption>Solar is grid solar plus embedded solar; gas and coal is coal/gas Rankine, gas and diesel; peakers are Junction Road, McKee, Stratford’s peakers, Huntly 6 and Whirinaki; demand is grid demand.</caption>
	</table>
</div>
<p>Factors are ranked by how far off they are, relative to usual and in MW (a 300 MW swing counts in full), and the top two pushing the way the price has moved lead the explanation. Hydro counts for half: it is dispatched to balance everything else, so it follows the other factors more than it leads them. The HVDC transfer and the price gap between the islands are shown against usual too.</p>

<h2 id="setter">The likely price setter</h2>
<p>Generators’ offers are published the day after, so the newest available day’s final offers (<code>BidsAndOffers</code>, latest revision only) are used, for the same half-hour of the day. Each plant’s offers for that trading period are stacked cheapest first. A plant running part way up one of its offer blocks (at least 1 MW into it and 1 MW short of its end) is on the margin; of those whose block is priced within 25% of their island’s reference price now, the closest is named. None is named when the price is under $5, where there is no single plant at the margin. It is labelled an estimate: offers change from day to day, and node prices differ from the reference price by losses.</p>

<h2 id="limits">Known limits</h2>
<ul>
	<li>Hydro lake storage, reserves and outages can all move the price, and aren’t in the explanation yet.</li>
	<li>The usual values come from the half-hourly history, which runs on final prices; live prices are dispatch prices.</li>
</ul>

<p class="note">Code: <a href={REPO + 'site/src/lib/now/explain.js'}><code>site/src/lib/now/explain.js</code></a> (rules and wording), <a href={REPO + 'ingest/explain.py'}><code>ingest/explain.py</code></a> (usual values, offers, price setter). Tests: <a href={REPO + 'analysis/price_triggers.py'}><code>analysis/price_triggers.py</code></a>.</p>
