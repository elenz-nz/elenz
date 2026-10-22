<script lang="ts">
	// Thresholds and factors come straight from the explainer's own code, so this page can't drift from it.
	import { BELOW, FACTORS, RULES } from '#lib/now/explain.js';
	import { REPO } from '../registry.js';
	const R = RULES;
	const usd = (v: number) => '$' + v.toLocaleString('en-NZ');
</script>

<h2 id="what">What it does</h2>
<p>Under the price tiles on the <a href="/now">Now</a> page, one line says how the price compares with recent prices at this time, for example “$38/MWh is about what prices have been recently around this time on weekends”. Opened, it lists what is different from usual (wind, solar, hydro, gas and coal, peaking plants, demand, the HVDC link and the gap between the islands), each against its usual value, a 24-hour price chart against the usual range (which can be enlarged), and a possible price setter. It has three states:</p>
<dl>
	<dt>Quiet</dt>
	<dd>Just the line and a “Why this price?” button.</dd>
	<dt>Highlighted</dt>
	<dd>The line is outlined and asks to be opened: prices are well up, the islands have split, or a new low has begun.</dd>
	<dt>Open</dt>
	<dd>The panel opens by itself, at extremes only. Low prices never open it.</dd>
</dl>

<h2 id="usual">What counts as usual</h2>
<p>The history job keeps, for each of the week’s 336 half-hours (Monday 12:00 am = the first), the median and the 25th and 75th percentiles of the higher of the Haywards and Benmore prices, and the median of each factor, over the last 28 days of half-hourly history. For the price, each half-hour pools every half-hour on the same kind of day (weekday or weekend) within an hour of that time of day: 40 prices for a weekend half-hour, 100 for a weekday one. The same half-hour of the week alone gives only four prices, and two spill nights at a few cents among them made an ordinary $72 look six times usual (Saturday 11:30 pm, 17 October 2026: the four Saturdays were $0.02, $3.00, $20.76 and $66.55; pooled, the usual was $28). The panel doesn’t quote a multiple of usual for the same reason: it says prices are higher, or far above, what they have been recently around this time. It also keeps the median price over the past year, the <i>year median</i>, as a floor: when spilling hydro makes the usual price tiny, $20 against a usual $5 would otherwise count as four times usual.</p>
<p class="formula">Typical = median of max(Haywards, Benmore) on the same kind of day (weekday or weekend), within an hour of this time of day, last four weeks</p>
<p>Wind is the exception. It follows the weather, not the clock, so its usual value is its median over the whole four weeks, not at this half-hour. The panel then says how long it has been since wind was this low (or this high) before the current calm or windy spell, for example “Wind is lower than it has been for 5 days”, once that is at least {R.windDays} days; otherwise it says whether wind is above or below its four-week median. Wind now is its {R.avgMin}-minute average here.</p>

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
					<li>A new low: under {usd(R.low)} after {R.lowQuietH} hours without one, for its first {R.lowShowH} hours (“Why is the price so low?”). Prices under ${R.nearZero.toFixed(2)} are described as near zero; otherwise as low.</li>
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
	<li><b>Highlighted</b> 11% of the time over the whole period, 12.5% since 2021 (8–19% a year): about 400 episodes a year, on 54% of days, a median of 1½ hours each.</li>
	<li><b>Open</b> 0.6–0.7% of the time: about 33 times a year since 2021, on 6.2% of days. It would have opened on 9 August 2021, 8 May 2024, 12 December 2024 and 4 August 2026, and through August 2024’s dry-year prices (by the {usd(R.openAny)} rule).</li>
	<li><b>Lows</b> never open it: prices were under $5 for 14% of the time since 2021 and 26% of 2026, and the longest run was 354 hours at $0.01, from 22 December 2025 to 6 January 2026.</li>
</ul>
<p>Live, the rules run on dispatch prices, which spike more than final prices; the rates are to be checked against these after a month.</p>

<h2 id="factors">The reasons</h2>
<p>Each factor’s value now (the newest interval) is compared with its usual value for this half-hour of the week (wind: with its four-week median), for New Zealand or the island the panel is about. A factor is only mentioned when it is off by at least a set number of MW <i>and</i> a set share of usual:</p>
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
<p>Factors are ranked by how far off they are, relative to usual and in MW (a 300 MW swing counts in full), and the top two that tend to move the price the way it has gone lead the explanation. The panel doesn’t label each factor as pushing the price up or down: these are associations with the usual pattern, not a measured cause. Hydro counts for half: it is dispatched to balance everything else, so it follows the other factors more than it leads them. The HVDC transfer and the price gap between the islands are shown against usual too.</p>
<p><b>Plants below the past week.</b> The data carries no outages, so as a rough stand-in the panel lists baseload thermal, geothermal and cogeneration plants (not hydro or peaking plants, which move with the market) whose last 30 minutes are at least {BELOW.minDrop} MW lower than, and at most {Math.round(BELOW.maxShare * 100)}% of, the median of the same 30 minutes on the other days of the live week. Together they count as a reason when they are at least {BELOW.f.floor} MW below. A plant running low may be out for maintenance or a fault, or simply offered less.</p>
<p><b>Short jumps.</b> A state holds for {R.holdMin} minutes after its condition ends, so a price that jumps for a few 5-minute intervals and drops back stays highlighted for a while. The panel then says when the price jumped and that it is back, rather than looking for causes in conditions that have already passed. When nothing shown is pushing the price up, it says so, and names what it can't see: grid constraints, reserves, outages it can't detect, and changes in offers.</p>
<p>Each reason has two bars on one scale: its value now, in its colour, and its recent level for this half-hour of the week, in grey.</p>

<h2 id="setter">The possible price setter</h2>
<p>Generators’ offers are published the day after, so the newest available day’s final offers (<code>BidsAndOffers</code>, latest revision only) are used, for the same half-hour of the day. Each plant’s offers for that trading period are stacked cheapest first. A plant running part way up one of its offer blocks (at least 1 MW into it and 1 MW short of its end) is on the margin; of those whose block is priced within 25% of their island’s reference price now, the closest is named. None is named when the price is under $5, where many plants offer at similar prices and none stands out. It is labelled an estimate, and called possible rather than likely: offers change from day to day, and node prices differ from the reference price by losses.</p>

<h2 id="limits">Known limits</h2>
<ul>
	<li>Hydro lake storage, reserves and outages can all move the price, and aren’t in the explanation yet.</li>
	<li>The usual values come from the half-hourly history, which runs on final prices; live prices are dispatch prices.</li>
</ul>

<p class="note">Code: <a href={REPO + 'site/src/lib/now/explain.js'}><code>site/src/lib/now/explain.js</code></a> (rules and wording), <a href={REPO + 'ingest/explain.py'}><code>ingest/explain.py</code></a> (usual values, offers, price setter). Tests: <a href={REPO + 'analysis/price_triggers.py'}><code>analysis/price_triggers.py</code></a>.</p>
