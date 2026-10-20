<script lang="ts">
	// The table of plants whose capacity changed is read from capacity.json (ingest/capacity.py), so it stays in step.
	import { REPO } from '../registry.js';
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
			return { name: p.name, fuel: FUEL[p.fuel] ?? p.fuel, isl: p.isl, text };
		})
		.sort((a, b) => (a.fuel < b.fuel ? -1 : a.fuel > b.fuel ? 1 : a.name < b.name ? -1 : 1));
</script>

<h2 id="use">What it is for</h2>
<p>Capacity is how much a plant can generate at once. The Generation tab’s mix table divides each fuel’s output over the range by the capacity it had over the same time, to give its capacity factor:</p>
<p class="formula">Capacity factor = energy generated ÷ (installed MW × hours)<small>installed MW day by day, so a plant that opens or closes part way through counts only while it exists</small></p>
<p>Geothermal runs close to flat out, so its capacity factor is high; wind and solar follow the weather; peaking gas plant and Huntly’s Rankine units run when they are needed, so theirs are low.</p>

<h2 id="sources">Where the figures come from</h2>
<p>Every plant the tracker shows has a row in <a href={REPO + 'facilities/plant_capacity.csv'}><code>facilities/plant_capacity.csv</code></a>, with its MW, the dates each figure applies, and where it comes from. Most come straight from the EA’s plant register. The register gives each plant’s capacity today, though, not its history, and it misses some plants, so about a third of the rows are corrections:</p>
<ul>
	<li><b>Upgrades and derating:</b> Manapōuri, Clyde, Arapuni, Whakamaru, Karāpiro, Benmore and Ōhau B and C; Wairakei, Mokai, Ngāwhā, Ngā Tamariki and Ōhaaki. The register shows today’s figure for the whole history.</li>
	<li><b>Closures and retired plant:</b> New Plymouth, Ōtāhuhu A and B, the old Stratford gas turbines, Te Awamutu, Edgecumbe, Te Rapa, and the Taranaki Combined Cycle (closed March 2026).</li>
	<li><b>Staged commissioning:</b> Turitea, Te Rere Hau and Harapaki, which opened in stages.</li>
	<li><b>Figures counted twice:</b> the register repeats a station’s figure on each of its connections or units at Benmore (2009–12), Matahina and Whareroa, and splits West Wind’s 142.6 MW as 80 + 80.</li>
</ul>
<p>Corrections come from the operators’ announcements, Wikipedia’s station histories, and steps in the metered output itself, where a plant starts generating above its old figure. Each row says which.</p>

<h2 id="rules">How capacity is counted</h2>
<ul>
	<li><b>From when the history has the plant.</b> Capacity counts from the first month the history has a plant’s output, even if the plant is older, so a gap in the data doesn’t drag its capacity factor down. This affects the embedded stations before April 1999 (the metered files start then), Highbank before March 2002 and Kawerau Mill before 2020.</li>
	<li><b>Consent limits:</b> where a plant is installed bigger than it is allowed to run, the limit counts. Manapōuri has 854 MW installed but may run at 800 MW.</li>
	<li><b>Stored units count:</b> a unit that is mothballed but not retired still counts. One of Huntly’s Rankine units was in storage from 2013 to 2021, so their capacity factor over those years is lower than for the units running.</li>
	<li><b>Embedded solar</b> uses the distributed generation registry’s installed capacity by month, less the dispatched solar farms (see <a href="/methods/embedded-solar">embedded solar</a>), with the latest month carried on.</li>
	<li><b>Batteries</b> count discharge only, against their power rating.</li>
	<li>Each island’s capacity is the sum of its plants; New Zealand’s is both islands.</li>
</ul>

<h2 id="headroom">Spare dispatchable capacity</h2>
<p>The Generation tab’s spare dispatchable capacity chart (headroom) shows how much plant that can be called on was not generating, three ways:</p>
<p class="formula">Headroom = capacity − output, for hydro, gas, coal/gas (Huntly’s Rankines), diesel and batteries<small>for each island and fuel, never below zero, then added up; batteries count discharge only</small></p>
<ul>
	<li><b>Installed:</b> capacity is every unit’s installed MW, from the table below. Every unit counts as available, so this is the most there could have been.</li>
	<li><b>Offered:</b> capacity is what generators offered for each half-hour in their final energy offers (the EA’s daily offers files, from January 2013). The EA holds no reliable offer records before December 2012, apart from the offers used in final pricing, so on ranges that reach back further the offered levels start in 2013 and the chart says so. Plant that is off and slow to start isn’t offered, so most days Huntly’s Rankine units drop out, as do units out for maintenance or faults and plant short of fuel. On 16 October 2026 the lowest headroom was about 3,500 MW installed but 1,150 MW offered: Huntly 1, 2, 4 and 5 offered nothing, and Manapōuri offered 620 of its 800 MW.</li>
	<li><b>Under $1,000:</b> only the part offered under $1,000/MWh. Generators offer water they want to keep, and peaking plant, at high prices, so this is what was there at a price the market usually pays. Whirinaki’s diesel units are usually offered above it.</li>
</ul>
<p>Geothermal, bioenergy and waste heat are left out because they run close to flat out as a rule, and wind and solar because they follow the weather. An island on its own counts only its own plant, not what the HVDC link could bring. Thermal plant and batteries sit at the bottom of the By fuel view and hydro on top; <b>Include hydro</b> takes hydro out.</p>
<p>The chart follows the range and interval. Where a point covers more data than it shows (days built from half-hours, or weeks and months), each level is its lowest within the point. The offers job (<a href={REPO + 'ingest/offered.py'}><code>ingest/offered.py</code></a>) keeps each day’s lowest offered headroom; for installed capacity on the 1-year and All ranges the lowest needs each day’s highest half-hour of dispatchable output, which daily history gains at its next rebuild (late October 2026). Until then those ranges show installed headroom as daily averages.</p>
<p>Even offered headroom overstates the margin a little:</p>
<ul>
	<li>offers are published the day after, so the newest day has none (shaded);</li>
	<li>capacity held as reserve on running plant is still counted;</li>
	<li>a unit offered but needing hours to reach full output, or a river chain that can’t run every station at once, counts in full;</li>
	<li>output the grid can’t carry, and transmission outages, aren’t considered.</li>
</ul>
<p>Offers don’t say why MW wasn’t offered: an outage, maintenance, a unit not committed, or fuel or water kept back all look the same. Transpower’s security-of-supply reports and the system operator’s residual generation figures take outages and reserves into account.</p>

<h2 id="changes">Plants whose capacity changed since 1997</h2>
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

<h2 id="limits">Known limits</h2>
<ul>
	<li><b>Uncertain rows.</b> New Plymouth counts its full 600 MW until it was mothballed in December 2007, though its output says units were run down earlier. Ōtāhuhu A counts its four 45 MW turbines, without two later units whose size wasn’t found. Ōhaaki’s derating from 104 MW to about 65 MW isn’t dated. Clyde’s rise to 464 MW is dated from its output (November 2015), not the consent change (2005). Each is marked in the file.</li>
	<li><b>Dispatch and metered output differ:</b> dispatch figures run 1–2% above metered (see <a href="/methods/history#seam">history</a>), so capacity factors for the latest weeks, which use dispatch data, read slightly high.</li>
	<li>Plants not in the market data, such as small embedded hydro and industrial cogeneration that isn’t metered, aren’t counted in either the output or the capacity.</li>
</ul>

<p class="note">Table: <a href={REPO + 'facilities/plant_capacity.csv'}><code>facilities/plant_capacity.csv</code></a>, checked on every change by <a href={REPO + 'ingest/capacity.py'}><code>ingest/capacity.py</code></a>. Evidence: <a href={REPO + 'analysis/capacity_check.py'}><code>analysis/capacity_check.py</code></a> and <a href={REPO + 'analysis/README.md'}><code>analysis/README.md</code></a>. Calculation: <a href={REPO + 'site/src/lib/generation/data.js'}><code>site/src/lib/generation/data.js</code></a>.</p>
