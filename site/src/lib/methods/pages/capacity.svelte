<script lang="ts">
	// The table of plants whose capacity changed is read from capacity.json (ingest/capacity.py), so it stays in step.
	import { REPO, ref } from '../registry.js';
	import Calculations from '../Calculations.svelte';
	import DataSources from '../DataSources.svelte';
	import GoodFor from '../GoodFor.svelte';
	import References from '../References.svelte';
	import Shot from '../Shot.svelte';
	import CAPACITY from '#lib/tracker/capacity.json';
	import { FUELS } from '#lib/tracker/fuels.js';

	const FUEL: Record<string, string> = Object.fromEntries(FUELS.map((f) => [f.k, f.name]));
	const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	const when = (s: string) => { const [y, m] = s.split('-'); return `${MON[+m - 1]} ${y}`; };
	const mw = (v: number) => (Number.isInteger(v) ? v.toLocaleString('en-NZ') : v.toFixed(1));
	const dayAfter = (s: string) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
	type P = { name: string; fuel: string; isl: string; rows: [string | null, string | null, number][] };
	// a plant's capacity as steps: "585 → 700 (May 2002) → 800 (Jan 2008)", and when it closed
	const changed = (CAPACITY.plants as P[])
		.filter((p) => p.rows.length > 1 || (p.rows[0][1] !== null))
		.map((p) => {
			let text = '';
			p.rows.forEach((r, i) => {
				const gap = i > 0 && p.rows[i - 1][1] && r[0] && r[0] !== dayAfter(p.rows[i - 1][1]!);
				if (i === 0) text = `${mw(r[2])}${r[0] && r[0] > '1997-08-01' ? ` from ${when(r[0])}` : ''}`;
				else text += gap ? `; ${mw(r[2])} from ${when(r[0]!)}` : ` → ${mw(r[2])} (${when(r[0]!)})`;
			});
			const last = p.rows[p.rows.length - 1][1];
			if (last) text += `; closed ${when(dayAfter(last))}`;
			return { name: p.name.replace(/^Nga Awa/, 'Ngā Awa'), fuel: FUEL[p.fuel] ?? p.fuel, isl: p.isl, text };
		})
		.sort((a, b) => (a.fuel < b.fuel ? -1 : a.fuel > b.fuel ? 1 : a.name < b.name ? -1 : 1));
</script>

<aside class="mt-caveats" aria-label="Key caveats">
	<p class="k">Key caveats</p>
	<ul>
		<li>Installed capacity isn’t available capacity. Plant can be out for maintenance, short of fuel or water, or held in reserve.</li>
		<li>Other embedded generation has no installed capacity on Elenz, so it isn’t in capacity factors or spare dispatchable capacity.</li>
		<li>Some rows for older plants are uncertain, and each is marked in the data file.</li>
	</ul>
	<p><a href="#limitations">Accuracy and limitations</a> has the detail.</p>
</aside>

<h2 id="introduction"><span id="use"></span>Introduction</h2>
<p>Installed capacity is how much a plant can generate at once, in megawatts (MW). The Generation tab uses it for two things.</p>
<p>A fuel’s capacity factor is its actual output as a share of what it would produce at full capacity over the same time. Geothermal runs close to flat out, so its capacity factor is high. Wind and solar follow the weather. Peaking gas plant and Huntly’s Rankine units run when they are needed, so theirs are low.</p>
<p>Spare dispatchable capacity, also called headroom, is how much plant that can be called on wasn’t generating.</p>

<h2 id="data-sources"><span id="sources"></span>Data sources</h2>
<p>The main source is a table Elenz keeps, because no public dataset gives each plant’s capacity through time. Offers show what generators made available from 2013.</p>
<DataSources slug="capacity" />

<h2 id="how-it-works">How it works</h2>

<h3 id="table">The capacity table</h3>
<p>Every plant the tracker shows has a row in <a href={REPO + 'facilities/plant_capacity.csv'}><code>facilities/plant_capacity.csv</code></a>, with its MW, the dates each figure applies and its source. Most rows come straight from the Electricity Authority’s (EA’s) plant register. The register gives each plant’s capacity today and not its history, and it misses some plants, so nearly half the rows are corrections.</p>
<div class="tbl">
	<table>
		<thead><tr><th>Correction</th><th>Plants</th></tr></thead>
		<tbody>
			<tr><td>Upgrades and derating. The register shows today’s figure for the whole history.</td><td>Manapōuri, Clyde, Arapuni, Whakamaru, Karāpiro, Benmore, Ōhau B and C, Wairakei, Mokai, Ngāwhā, Ngā Tamariki and Ōhaaki</td></tr>
			<tr><td>Closures and retired plant.</td><td>New Plymouth, Ōtāhuhu A and B, the old Stratford gas turbines, Te Awamutu, Edgecumbe, Te Rapa, and the Taranaki Combined Cycle (closed March 2026)</td></tr>
			<tr><td>Staged commissioning. These plants opened in stages.</td><td>Turitea, Te Rere Hau and Harapaki</td></tr>
			<tr><td>Output above the listed figure. These plants run above the register’s figure all the time, so their capacity is what they run at.</td><td>Coleridge (42 MW from May 2026), Ngā Awa Pūrua (148 MW from April 2023) and Te Huka 3 (54 MW)</td></tr>
			<tr><td>Figures counted twice. The register repeats a station’s figure on each of its connections or units.</td><td>Benmore (2009 to 2012), Matahina and Whareroa. West Wind’s 142.6 MW is also listed as 80 + 80.</td></tr>
		</tbody>
	</table>
</div>
<p>Corrections come from operators’ announcements, <a href={ref('wikipedia')}>Wikipedia’s station histories</a>, and steps in the metered output itself, where a plant starts generating above its old figure. Each row says which.</p>

<h3 id="rules">How capacity is counted</h3>
<ul>
	<li>Capacity counts from the first month the history has a plant’s output, even if the plant is older, so a gap in the data doesn’t drag its capacity factor down. This affects stations on local networks before April 1999, Highbank before March 2002 and Kawerau (Onepu) before 2013.</li>
	<li>Where a plant is installed bigger than it is allowed to run, the consent limit counts. Manapōuri has 854 MW installed but may run at 800 MW.</li>
	<li>A unit that is mothballed but not retired still counts. One of Huntly’s Rankine units was in storage from 2013 to 2021, so their capacity factor over those years is lower than for the units running.</li>
	<li>Embedded solar uses the registry’s installed capacity by month, less the dispatched solar farms, with the latest month carried on.</li>
	<li>Battery output counts only while a battery is discharging, against its power rating.</li>
	<li>Each island’s capacity is the sum of its plants, and New Zealand’s is both islands.</li>
</ul>
<p>Other embedded generation has no capacity figure, because one grid exit point can hold several plants of unknown size.</p>

<h3 id="factor">Capacity factors</h3>
<p>The mix table divides each fuel’s energy over the range by the energy its installed capacity could have produced. Capacity is taken day by day, so a plant that opens or closes part way through counts only while it exists.</p>
<Calculations>
	<p class="formula">Capacity factor = energy generated ÷ (installed MW × hours)</p>
	<p class="k">Worked example</p>
	<p>These figures are illustrative. A fuel generated 600 GWh over 30 days, with 1,000 MW installed throughout. At full capacity it would have produced 1,000 × 720 hours = 720,000 MWh, or 720 GWh. Its capacity factor is 600 ÷ 720 = 83%.</p>
</Calculations>

<h3 id="headroom">Spare dispatchable capacity</h3>
<p>This chart covers hydro, gas, coal/gas, diesel and batteries. For each island and fuel, it takes capacity less output, never below zero, then adds the results up. It leaves out geothermal, bioenergy and waste heat, because they run close to flat out as a rule. It leaves out wind and solar because they follow the weather. An island on its own counts only its own plant, not what the HVDC link could bring.</p>
<p>The chart gives three levels, which differ only in what counts as capacity:</p>
<dl>
	<dt>Installed</dt>
	<dd>Every unit’s installed MW from the capacity table. Every unit counts as available, so this is the most there could have been.</dd>
	<dt>Offered</dt>
	<dd>What generators offered for each half-hour in their final energy offers, from January 2013. Plant that is off and slow to start isn’t offered, so Huntly’s Rankine units drop out on most days. So do units out for maintenance or faults, and plant short of fuel.</dd>
	<dt>Under $1,000</dt>
	<dd>Only the part offered under $1,000/MWh. Generators offer water they want to keep, and peaking plant, at high prices. This level is what was there at a price the market usually pays. Whirinaki’s diesel units are usually offered above it.</dd>
</dl>
<p>On 16 October 2026 the lowest headroom was about 3,500 MW installed but 1,150 MW offered. Huntly 1, 2, 4 and 5 offered nothing, and Manapōuri offered 620 MW of its 800 MW.</p>
<p>Where an interval covers more data than it shows, each level is its lowest within that interval. The offers job keeps each day’s lowest offered headroom. Daily history keeps each day’s highest half-hour of dispatchable output, so the installed level’s lowest figure reaches back to 1997.</p>
<Calculations>
	<p class="formula">Headroom = the sum, over each island and fuel, of (capacity − output), counting each only above zero</p>
	<div class="tbl">
		<table>
			<thead><tr><th>Term</th><th>Meaning</th><th>Unit</th></tr></thead>
			<tbody>
				<tr><td>Capacity</td><td>Installed, offered or offered under $1,000/MWh, depending on the level</td><td>MW</td></tr>
				<tr><td>Output</td><td>That fuel’s generation in that island. For batteries, discharge only.</td><td>MW</td></tr>
			</tbody>
		</table>
	</div>
	<p class="k">Worked example</p>
	<p>These figures are illustrative. In one island, hydro has 3,000 MW offered and generates 2,400 MW, leaving 600 MW. Gas has 500 MW offered and generates 550 MW, which counts as zero, not −50 MW. Offered headroom is 600 + 0 = 600 MW.</p>
</Calculations>
<Shot name="tracker-headroom" alt="The spare dispatchable capacity chart on the Generation tab over 30 days, with its Levels and By fuel buttons." caption="Spare dispatchable capacity on the Generation tab, in the Levels view." />

<h3 id="changes">Plant notes: capacity changes since 1997</h3>
<p>This table lists every plant whose capacity changed, or that closed, since August 1997.</p>
<div class="tbl">
	<table>
		<thead><tr><th>Plant</th><th>Fuel</th><th>MW, and when it changed</th></tr></thead>
		<tbody>
			{#each changed as c (c.name)}
				<tr><td>{c.name}</td><td>{c.fuel}</td><td>{c.text}</td></tr>
			{/each}
		</tbody>
	</table>
</div>

<h2 id="interpretation">How to interpret it</h2>
<p>A high capacity factor means a fuel ran close to flat out. A low one can mean a peaking plant doing its job, not a problem. Wind and solar capacity factors depend mainly on the weather.</p>
<p>Spare dispatchable capacity shows how much room the system had, not how secure it was. The offered level is the better guide, and the under $1,000 level the most cautious. Offers don’t say why MW wasn’t offered. An outage, maintenance, a unit not committed, or fuel or water kept back all look the same.</p>
<GoodFor rows={[
	{ use: 'Capacity factor by fuel over a year', level: 'good', verdict: 'Uses metered or dispatch output against capacity day by day.' },
	{ use: 'Capacity factor for one plant in recent weeks', level: 'care', verdict: 'Dispatch output is used, which can differ for Glenbrook, Kawerau (Onepu) and stations on block-dispatched chains.' },
	{ use: 'Spare capacity from the offered level', level: 'ok', verdict: 'Uses what generators actually offered, from January 2013.', why: 'It still overstates the margin a little, as Accuracy and limitations explains.' },
	{ use: 'Spare capacity from the installed level', level: 'care', verdict: 'It treats every unit as available.' },
	{ use: 'Whether the system has enough generation', level: 'no', verdict: 'Elenz doesn’t see outages or reserves.', why: 'Use Transpower’s security-of-supply reports instead.' },
]} />

<h2 id="limitations"><span id="limits"></span>Accuracy and limitations</h2>
<div class="tbl">
	<table>
		<thead><tr><th>Figure</th><th>Status</th><th>Typical accuracy</th></tr></thead>
		<tbody>
			<tr><td>Installed capacity, register rows</td><td>Published</td><td>As published by the EA</td></tr>
			<tr><td>Installed capacity, corrected rows</td><td>Calculated estimate</td><td>Each row names its source, and the uncertain rows are listed below</td></tr>
			<tr><td>Capacity factors</td><td>Calculated</td><td>Take the status of the output they use</td></tr>
			<tr><td>Offered capacity</td><td>Calculated</td><td>Summed from final offers as published by the EA</td></tr>
			<tr><td>Spare dispatchable capacity</td><td>Calculated</td><td>Overstates the margin, for the reasons below</td></tr>
		</tbody>
	</table>
</div>
<p>Four rows are uncertain:</p>
<ul>
	<li>New Plymouth counts its full 600 MW until it was mothballed in December 2007, though its output suggests units were run down earlier.</li>
	<li>Ōtāhuhu A counts its four 45 MW turbines, without two later units whose size we haven’t found.</li>
	<li>Ōhaaki’s derating from 104 MW to about 65 MW has no date.</li>
	<li>Clyde’s rise to 464 MW is dated from its output (November 2015), not the consent change (2005).</li>
</ul>
<p>Offered headroom overstates the margin a little, for four reasons:</p>
<ul>
	<li>Capacity held as reserve on running plant is still counted.</li>
	<li>A unit that needs hours to reach full output counts in full, as does a river chain that can’t run every station at once.</li>
	<li>Output the grid can’t carry, and transmission outages, aren’t considered.</li>
	<li>Offers are published the day after, and a day occasionally arrives later, so recent days without them are shaded on the chart.</li>
</ul>
<p><a href={ref('sos')}>Transpower’s security-of-supply reports</a> and the system operator’s residual generation figures take outages and reserves into account.</p>
<p>Dispatch and metered output differ for a few plants (see <a href="/methods/history#seam">Where the sources hand over</a>), so their capacity factors for the latest weeks differ from the metered ones. Generation that isn’t in the market data, such as industrial cogeneration that doesn’t export to a local network, isn’t counted in output or capacity.</p>

<h2 id="coverage">Historical coverage</h2>
<p>Capacity runs from August 1997. The offered levels start later.</p>
<div class="tbl">
	<table>
		<thead><tr><th>From</th><th>Change</th></tr></thead>
		<tbody>
			<tr><td>August 1997</td><td>The capacity table and the installed level start.</td></tr>
			<tr><td>January 2013</td><td>The offered levels start. <a href={ref('ea-offers')}>The EA holds no reliable offer records before December 2012</a>, apart from the offers used in final pricing, so the chart says so on ranges that reach back further.</td></tr>
			<tr><td>August 2013</td><td>Embedded solar capacity starts with the registry.</td></tr>
		</tbody>
	</table>
</div>

<h2 id="references">References</h2>
<References slug="capacity" />
