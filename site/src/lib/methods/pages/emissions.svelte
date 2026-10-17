<script lang="ts">
	// Every factor on this page is read from the code that applies it (src/lib/tracker/emissions.js and fuels.js).
	import {
		COAL, GAS, GAS_FLEET, GAS_PLANT, GEO_ASSUMED, GEO_DEFAULT, GEO_YEAR_COLS, GEO_YEARS, RANKINE_COAL_SHARE_GENESIS,
		RANKINE_COAL_SHARE_MBIE, RANKINE_HEAT_RATE, STRATFORD_TCC, rankineFactor,
	} from '#lib/tracker/emissions.js';
	import { FUELS } from '#lib/tracker/fuels.js';
	import { REPO } from '../registry.js';

	const diesel = FUELS.find((f: { k: string }) => f.k === 'diesel')?.ef ?? 0.8;
	const f2 = (v: number) => v.toFixed(2);

	// the Rankines' coal share by financial year (FY ends 30 June), Q1 (Jul–Sep) to Q4 (Apr–Jun)
	type Q = { share: number; src: 'MBIE' | 'Genesis' };
	const years = new Map<string, (Q | null)[]>();
	for (const [rows, src] of [[RANKINE_COAL_SHARE_MBIE, 'MBIE'], [RANKINE_COAL_SHARE_GENESIS, 'Genesis']] as const) {
		for (const [q, share] of rows as [string, number][]) {
			const fy = q.slice(0, 4), n = Number(q.slice(-1));
			const row = years.get(fy) ?? years.set(fy, [null, null, null, null]).get(fy)!;
			row[n - 1] = { share, src };
		}
	}
	const fyLabel = (fy: string) => { const y = 2000 + Number(fy.slice(2)); const yy = y > 2090 ? y - 100 : y; return `${yy - 1}–${String(yy).slice(2)}`; };
	const firstGenesis = RANKINE_COAL_SHARE_GENESIS[0][0];
	const latest = RANKINE_COAL_SHARE_GENESIS[RANKINE_COAL_SHARE_GENESIS.length - 1] as [string, number];

	const GEO_NAMES: Record<string, string> = {
		wairakei: 'Wairakei (whole site)', te_mihi: 'Te Mihi', poihipi: 'Poihipi', ohaaki: 'Ōhaaki', te_huka: 'Te Huka',
		rotokawa: 'Rotokawa', nga_awa_purua: 'Nga Awa Pūrua', mokai: 'Mokai', ngatamariki: 'Ngā Tamariki',
		kawerau_kgl: 'Kawerau (KGL)', te_ahi_o_maui: 'Te Ahi O Maui', ngawha_oec4: 'Ngāwhā (OEC4)',
		tauhara: 'Tauhara', te_huka_3: 'Te Huka 3', topp2: 'Kawerau (TOPP2)',
	};
	const geoRows = Object.entries(GEO_YEARS as Record<string, number[]>);
	const assumed = Object.entries(GEO_ASSUMED as Record<string, number>).filter(([k]) => k in GEO_NAMES);
	const GAS_NOTES: Record<string, string> = {
		'Otahuhu B': 'Combined cycle, 1999–2015', 'New Plymouth': 'Steam, gas and some oil, to 2008',
		'Otahuhu A': 'Open-cycle turbines', 'Southdown': 'Combined cycle, to 2016', 'Te Awamutu': 'Dairy factory cogeneration, to 2007',
	};
</script>

<h2 id="meaning">What it means</h2>
<p>Emissions intensity is how much greenhouse gas is released for each unit of electricity generated, in grams of CO₂-equivalent per kilowatt-hour (g CO₂e/kWh). A kilowatt-hour runs a 1 kW heater for an hour. CO₂-equivalent counts other greenhouse gases, such as methane, as the amount of CO₂ with the same warming effect.</p>
<p>Hydro, wind and solar release almost nothing as they generate, so intensity is low when they supply most of the power and rises when gas and coal plants run. Geothermal sits in between, as the steam carries some CO₂ up from underground. Because it is per unit, intensity shows how clean the electricity is at any moment, whether demand is high or low.</p>

<h2 id="calc">The calculation</h2>
<p class="formula">Intensity (g/kWh) = Σ (each source’s MW × its emission factor in t/MWh) ÷ total generation in MW × 1,000
<small>total generation as on the <a href="/methods/generation#totals">generation page</a>: every source while positive, including embedded solar and battery discharge</small></p>
<ul>
	<li>Factors count the emissions at the power station only (operational, not lifecycle: building the plant and extracting the fuel aren’t included).</li>
	<li>Geothermal and gas use each station’s own factor, weighted by its output; the other fuels use one factor each.</li>
	<li>An island’s intensity is of its own generation. Power arriving over the HVDC link isn’t counted, so it is not the intensity of what that island consumes.</li>
	<li>Over a range, the average is weighted by generation (total emissions ÷ total generation), not a plain average of the intervals.</li>
</ul>

<h2 id="factors">Every factor</h2>
<div class="tbl">
	<table>
		<thead><tr><th>Source</th><th class="n">t CO₂e/MWh</th><th>From</th></tr></thead>
		<tbody>
			<tr><td>Coal/gas, Rankine (Huntly 1, 2, 4)</td><td class="n">{f2(rankineFactor(0))}–{f2(rankineFactor(1))}</td><td>By quarter, from the share of their fuel that was coal (<a href="#rankine">below</a>)</td></tr>
			<tr><td>Gas</td><td class="n">{f2(GAS_FLEET)}</td><td>Today’s fleet average; closed plants their own (<a href="#gas">below</a>)</td></tr>
			<tr><td>Diesel (Whirinaki)</td><td class="n">{f2(diesel)}</td><td>A typical factor for diesel turbines; it runs rarely</td></tr>
			<tr><td>Geothermal</td><td class="n">0.02–0.30</td><td>Each station by year (<a href="#geothermal">below</a>)</td></tr>
			<tr><td>Bioenergy (Kinleith, Kawerau mill)</td><td class="n">0</td><td>Wood waste and black liquor: biogenic CO₂, counted as zero, as in national inventories</td></tr>
			<tr><td>Waste heat (Glenbrook)</td><td class="n">0</td><td>NZ Steel’s ironmaking gases; the emissions are counted with the ironmaking (industrial processes). UN CDM methodology ACM0004 also counts waste-gas generation as zero</td></tr>
			<tr><td>Hydro, wind, solar, embedded solar</td><td class="n">0</td><td>Nothing burned</td></tr>
			<tr><td>Batteries</td><td class="n">0</td><td>Discharge only; the energy that charged them was counted when it was generated</td></tr>
		</tbody>
	</table>
</div>

<h2 id="rankine">Huntly’s Rankine units</h2>
<p>Huntly units 1, 2 and 4 can burn coal or gas, and the market data doesn’t say which. Genesis reports each quarter what share of the Rankines’ fuel was coal (for the Rankines together, not per unit). The factor follows that share:</p>
<p class="formula">Rankine factor = {RANKINE_HEAT_RATE} GJ/MWh × (coal share × {COAL} + gas share × {GAS}) kg/GJ ÷ 1,000
<small>{f2(rankineFactor(0))} t/MWh all on gas, {f2(rankineFactor(1))} all on coal</small></p>
<dl>
	<dt>Gas, {GAS} kg/GJ</dt>
	<dd>The Ministry for the Environment’s factor for natural gas burned in stationary plant.</dd>
	<dt>Coal, {COAL} kg/GJ</dt>
	<dd>Fitted to Genesis’s quarterly fuel burned and reported generation emissions, with the gas factor fixed. (Fitting both gives coal 89.7 and gas 57.1.)</dd>
	<dt>Heat rate, {RANKINE_HEAT_RATE} GJ/MWh</dt>
	<dd>Genesis’s coal burned per coal-fired MWh, the median over quarters at least 85% on coal (range 10.8–11.9).</dd>
	<dt>From {firstGenesis} (Jul 2020)</dt>
	<dd>Genesis’s quarterly performance reports. Each new quarter is added as Genesis reports it, about three weeks after the quarter ends; until then the latest ({latest[0]}, {Math.round(latest[1] * 100)}% coal) is carried forward.</dd>
	<dt>Before that</dt>
	<dd>MBIE’s quarterly electricity generation from coal, less Glenbrook’s metered output (MBIE counts Glenbrook as coal), divided by the Rankines’ metered output. Over FY21–FY25, where both exist, this reproduces Genesis’s own figures to within a few points in most quarters. A quarter with under 100 GWh of Rankine output keeps the quarter before’s share.</dd>
</dl>
<div class="tbl">
	<table class="grid">
		<thead><tr><th>Year to June</th><th class="n">Jul–Sep</th><th class="n">Oct–Dec</th><th class="n">Jan–Mar</th><th class="n">Apr–Jun</th><th>Source</th></tr></thead>
		<tbody>
			{#each [...years] as [fy, qs] (fy)}
				<tr>
					<td>{fyLabel(fy)}</td>
					{#each qs as q, i (i)}<td class="n">{q ? Math.round(q.share * 100) + '%' : ''}</td>{/each}
					<td>{qs.find((q) => q)?.src}</td>
				</tr>
			{/each}
		</tbody>
		<caption>Share of the Rankines’ fuel that was coal, by quarter. A share of s gives a factor of {f2(rankineFactor(0))} + {f2(rankineFactor(1) - rankineFactor(0))} × s t/MWh.</caption>
	</table>
</div>
<p><b>Check.</b> Applied to the dispatch data, these factors reproduce Genesis’s reported Huntly emissions (Rankines and units 5 and 6) within ±5% in 20 of 23 quarters since 2020, and −0.4% over the whole period. The dispatch data’s Rankine output matches Genesis’s reported Rankine output within 1–2% each quarter.</p>

<h2 id="gas">Gas</h2>
<p>All gas plant uses <b>{f2(GAS_FLEET)} t/MWh</b>, the generation-weighted average of today’s fleet over the dispatch history (by quarter 0.44–0.52, depending on how much Huntly 5 ran):</p>
<ul>
	<li>Huntly 5 (combined cycle): 7.6 GJ/MWh, from Genesis’s gas burned less the Rankines’ gas, so 0.41 t/MWh.</li>
	<li>Assumed heat rates for the rest: Huntly 6 and McKee 10.5 GJ/MWh; Stratford’s peakers 9.0; Junction Road and cogeneration 9.5 (0.49–0.57 t/MWh).</li>
</ul>
<p>Plants that have closed appear in the metered history, and were much more or less efficient than today’s fleet, so they get their own factor from typical heat rates at {GAS} kg/GJ (estimates, not reported figures):</p>
<div class="tbl">
	<table>
		<thead><tr><th>Plant</th><th class="n">t/MWh</th><th>Notes</th></tr></thead>
		<tbody>
			{#each Object.entries(GAS_PLANT as Record<string, number>) as [name, ef] (name)}
				<tr><td>{name}</td><td class="n">{f2(ef)}</td><td>{GAS_NOTES[name] ?? ''}</td></tr>
			{/each}
			<tr><td>Taranaki Combined Cycle</td><td class="n">{f2(STRATFORD_TCC)}</td><td>Part of Stratford until it closed in March 2026</td></tr>
		</tbody>
	</table>
</div>

<h2 id="geothermal">Geothermal</h2>
<p>Geothermal fluid carries CO₂ and some methane from underground, and how much varies widely between fields; stations increasingly reinject it. Each station’s own operational emissions come from the NZ Geothermal Association’s emissions working group (McLean et al.), for 2020, 2022 (published as lifecycle, less its 10 g/kWh allowance for the plant itself) and 2023. Each year uses the newest figure published for that year or before it; years before 2020 use 2020’s, which probably understates them, as reinjection was less common.</p>
<div class="tbl">
	<table>
		<thead><tr><th>Station</th>{#each GEO_YEAR_COLS as y (y)}<th class="n">{y}</th>{/each}</tr></thead>
		<tbody>
			{#each geoRows as [k, v] (k)}
				<tr><td>{GEO_NAMES[k] ?? k}</td>{#each v as x, i (i)}<td class="n">{x}</td>{/each}</tr>
			{/each}
			{#each assumed as [k, v] (k)}
				<tr class="sub"><td>{GEO_NAMES[k]} (assumed)</td><td class="n" colspan={GEO_YEAR_COLS.length}>{v}</td></tr>
			{/each}
		</tbody>
		<caption>g CO₂e/kWh (= kg/MWh). Assumed figures are TIMES-NZ’s, until the NZGA publishes them. Ngāwhā’s OEC4 opened in 2021; until 2023 it uses the field’s figure before reinjection. Any other station: {GEO_DEFAULT}, the 2023 fleet average.</caption>
	</table>
</div>
<p>Weighted by output, dispatched geothermal came to about 70 g/kWh in 2021, 60 in 2023 and 54 in 2025. New years are added as the NZGA publishes them (each November).</p>

<h2 id="checks">Checks against national figures</h2>
<p>Coal, gas and diesel emissions in the history follow the national inventory’s “energy industries” series year to year, after taking out its roughly 1.2 Mt of refining and gas processing: 4.4 Mt against 4.4 in 1998, 6.8 against 6.8 in 2001, 8.8 against 9.1 in 2005, 8.2 against 8.5 in 2008, 5.3 against 5.7 in 2010. The pattern matches too: the 2001 and 2005–06 peaks, the 2007 dip and the 2011 low.</p>

<h2 id="limits">Known limits</h2>
<ul>
	<li>The Rankines’ coal share is for the three units together and for a whole quarter: within a quarter, a coal-heavy week and a gas-heavy week get the same factor.</li>
	<li>Gas plants other than the closed ones share one average factor, so a peaker running alone reads cleaner than it is, and Huntly 5 dirtier.</li>
	<li>Geothermal before 2020 likely reads low.</li>
	<li>Industrial cogeneration that isn’t dispatched isn’t included.</li>
</ul>

<p class="note">Code: <a href={REPO + 'site/src/lib/tracker/emissions.js'}><code>site/src/lib/tracker/emissions.js</code></a> (every factor, applied in the browser). Evidence: <a href={REPO + 'analysis/emission_factors.py'}><code>analysis/emission_factors.py</code></a>, <a href={REPO + 'analysis/README.md'}><code>analysis/README.md</code></a>.</p>
