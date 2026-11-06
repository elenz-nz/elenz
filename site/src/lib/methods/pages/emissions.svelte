<script lang="ts">
	// Every factor on this page is read from the code that applies it (src/lib/tracker/emissions.js and fuels.js).
	import Calculations from '../Calculations.svelte';
	import DataSources from '../DataSources.svelte';
	import GoodFor from '../GoodFor.svelte';
	import References from '../References.svelte';
	import {
		COAL, GAS, GAS_FLEET, GAS_PLANT, GEO_ASSUMED, GEO_CONTACT, GEO_CONTACT_FY, GEO_DEFAULT, GEO_REPORTED, GEO_YEAR_COLS, GEO_YEARS, RANKINE_COAL_SHARE_GENESIS,
		RANKINE_COAL_SHARE_MBIE, RANKINE_HEAT_RATE, STRATFORD_TCC, rankineFactor,
	} from '#lib/tracker/emissions.js';
	import { FUELS } from '#lib/tracker/fuels.js';
	import { ref, sourceHref } from '../registry.js';

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
	const latest = RANKINE_COAL_SHARE_GENESIS[RANKINE_COAL_SHARE_GENESIS.length - 1] as [string, number];
	// a quarter in words: FY26Q4 is April to June 2026
	const QNAME = ['July to September', 'October to December', 'January to March', 'April to June'];
	const quarter = (q: string) => { const fy = 2000 + Number(q.slice(2, 4)), n = Number(q.slice(-1)); return `${QNAME[n - 1]} ${n > 2 ? fy : fy - 1}`; };

	const GEO_NAMES: Record<string, string> = {
		wairakei: 'Wairakei (whole site)', te_mihi: 'Te Mihi', poihipi: 'Poihipi', ohaaki: 'Ōhaaki', te_huka: 'Te Huka',
		rotokawa: 'Rotokawa', nga_awa_purua: 'Ngā Awa Pūrua', mokai: 'Mokai', ngatamariki: 'Ngā Tamariki',
		kawerau_kgl: 'Kawerau (KGL)', te_ahi_o_maui: 'Te Ahi O Maui', kawerau_onepu: 'Kawerau (Onepu): TOPP1 and GDL', ngawha_oec4: 'Ngāwhā (OEC4)',
		tauhara: 'Tauhara', te_huka_3: 'Te Huka 3', topp2: 'Kawerau (TOPP2)',
	};
	const geoRows = Object.entries(GEO_YEARS as Record<string, number[]>);
	// the published station factors' range, g/kWh → t/MWh (assumed figures left out)
	const contactRows = Object.entries(GEO_CONTACT as Record<string, (number | null)[]>);
	const geoAll = [...geoRows.flatMap(([, v]) => v), ...contactRows.flatMap(([, v]) => v.filter((x) => x !== null) as number[])];
	const geoRange = `${f2(Math.min(...geoAll) / 1000)}–${f2(Math.max(...geoAll) / 1000)}`;
	const assumed = Object.entries(GEO_ASSUMED as Record<string, number>).filter(([k]) => k in GEO_NAMES);
	const GAS_NOTES: Record<string, string> = {
		'Ōtāhuhu B': 'Combined cycle, 1999–2015', 'New Plymouth': 'Steam, gas and some oil, to 2008',
		'Ōtāhuhu A': 'Open-cycle turbines', 'Southdown': 'Combined cycle, to 2016', 'Te Awamutu': 'Dairy factory cogeneration, to 2007',
	};
</script>

<aside class="mt-caveats" aria-label="Key caveats">
	<p class="k">Key caveats</p>
	<ul>
		<li>Figures cover power station emissions only. Half-hourly values rely on average factors, and Huntly’s coal share is a quarterly figure.</li>
		<li>Intensity reads about 1.5–2% lower from January 2009, because other embedded generation joins the total and is mostly renewable.</li>
		<li>Geothermal before 2020 uses 2020’s station factors, which probably understate it.</li>
	</ul>
	<p><a href="#limitations">Accuracy and limitations</a> has the detail.</p>
</aside>

<h2 id="introduction"><span id="meaning"></span>Introduction</h2>
<p>Emissions intensity is how much greenhouse gas is released for each unit of electricity generated, in grams of CO₂-equivalent per kilowatt-hour (g CO₂e/kWh). A kilowatt-hour runs a 1 kW heater for an hour. CO₂-equivalent counts other greenhouse gases, such as methane, by their warming effect compared with CO₂.</p>
<p>Hydro, wind and solar release almost nothing as they generate, so intensity is low when they supply most of the power. It rises when gas and coal plants run. Geothermal sits in between, because the steam carries some CO₂ up from underground.</p>

<h2 id="data-sources">Data sources</h2>
<p>Emissions intensity multiplies the generation data on the <a href="/methods/generation#data-sources">Generation page</a> by an emission factor for each source. It is a calculated estimate in every period, because the factors are published averages or assumptions. These datasets supply the factors.</p>
<DataSources slug="emissions" />

<h2 id="how-it-works">How it works</h2>

<h3 id="calc">The calculation</h3>
<p>Emissions intensity divides the greenhouse gas released in an interval by the electricity generated, excluding battery discharge. We exclude it because that energy and its emissions were counted when the energy was generated.</p>
<p>Factors count the emissions at the power station only. Building the plant and extracting the fuel aren’t included. Geothermal and gas use each station’s own factor, weighted by its output, and the other fuels use one factor each.</p>
<p>An island’s intensity covers its own generation. Power arriving over the HVDC link isn’t counted, so it isn’t the intensity of what that island consumes. Over a range, the average is total emissions divided by total generation.</p>
<Calculations>
	<p class="formula">Intensity (g CO₂e/kWh) = 1,000 × the sum of (output × emission factor) ÷ (total generation − battery discharge)</p>
	<div class="tbl">
		<table>
			<thead><tr><th>Term</th><th>Meaning</th><th>Unit</th></tr></thead>
			<tbody>
				<tr><td>Output</td><td>Each source’s output in that region and interval</td><td>MW</td></tr>
				<tr><td>Emission factor</td><td>The factor for that source, from the table below</td><td>t CO₂e/MWh</td></tr>
				<tr><td>Total generation</td><td>Every source, including embedded solar, other embedded generation and battery discharge</td><td>MW</td></tr>
				<tr><td>Battery discharge</td><td>Battery output while discharging</td><td>MW</td></tr>
				<tr><td>1,000</td><td>Converts t/MWh to g/kWh</td><td>None</td></tr>
			</tbody>
		</table>
	</div>
	<p class="k">Worked example</p>
	<p>These figures are illustrative.</p>
	<div class="tbl">
		<table>
			<thead><tr><th>Source</th><th class="n">Output (MW)</th><th class="n">Factor (t CO₂e/MWh)</th><th class="n">Emissions rate (t CO₂e an hour)</th></tr></thead>
			<tbody>
				<tr><td>Hydro</td><td class="n">2,800</td><td class="n">0</td><td class="n">0</td></tr>
				<tr><td>Wind</td><td class="n">600</td><td class="n">0</td><td class="n">0</td></tr>
				<tr><td>Geothermal</td><td class="n">1,000</td><td class="n">0.05</td><td class="n">50</td></tr>
				<tr><td>Gas</td><td class="n">400</td><td class="n">0.46</td><td class="n">184</td></tr>
				<tr><td>Coal/gas Rankine</td><td class="n">200</td><td class="n">0.90</td><td class="n">180</td></tr>
				<tr><td>Batteries</td><td class="n">50</td><td class="n">0</td><td class="n">0</td></tr>
				<tr><td><b>Total</b></td><td class="n">5,050</td><td class="n"></td><td class="n">414</td></tr>
			</tbody>
		</table>
	</div>
	<p>Generation excluding battery discharge is 5,050 − 50 = 5,000 MW. Intensity is 1,000 × 414 ÷ 5,000 = 82.8 g CO₂e/kWh.</p>
	<p>The Rankine factor assumes 70% coal, which gives {f2(rankineFactor(0.7))} t CO₂e/MWh. Geothermal uses a fleet average for simplicity, although the method applies each station’s own factor.</p>
</Calculations>

<h3 id="factors">Every factor</h3>
<p>This table lists the factor for each source, in t CO₂e/MWh.</p>
<div class="tbl">
	<table>
		<thead><tr><th>Source</th><th class="n">t CO₂e/MWh</th><th>Where the factor comes from</th></tr></thead>
		<tbody>
			<tr><td>Coal/gas, Rankine (Huntly 1, 2 and 4)</td><td class="n">{f2(rankineFactor(0))}–{f2(rankineFactor(1))}</td><td>Set by quarter, from the share of their fuel that was coal (see <a href="#rankine">Huntly’s Rankine units</a>).</td></tr>
			<tr><td>Gas</td><td class="n">{f2(GAS_FLEET)}</td><td>Today’s fleet average. Closed plants have their own factors (see <a href="#gas">Gas</a>).</td></tr>
			<tr><td>Diesel (Whirinaki)</td><td class="n">{f2(diesel)}</td><td>Assumed, a typical factor for diesel turbines. Whirinaki’s heat rate is about 10.9 GJ/MWh (<a href={ref('stack2020')}>2020 stack report</a>), and <a href={ref('em6')}>em6</a> uses 0.76. It runs rarely.</td></tr>
			<tr><td>Geothermal</td><td class="n">{geoRange}</td><td>Set for each station by year (see <a href="#geothermal">Geothermal</a>).</td></tr>
			<tr><td>Bioenergy (Kinleith)</td><td class="n">0</td><td>Wood waste and black liquor release biogenic CO₂, counted as zero as in national inventories (<a href={ref('ipcc')}>IPCC guidelines</a>). The <a href={sourceHref('mfe')}>Ministry for the Environment</a> and <a href={ref('ojifs2025')}>Oji</a> report it separately.</td></tr>
			<tr><td>Waste heat (Glenbrook)</td><td class="n">0</td><td>The fuel is <a href={ref('nzsteel')}>NZ Steel’s ironmaking gases</a>, whose emissions are counted with ironmaking. UN CDM methodology <a href={ref('acm0004')}>ACM0004</a> also counted waste-gas generation as zero.</td></tr>
			<tr><td>Hydro, wind, grid solar and embedded solar</td><td class="n">0</td><td>Nothing is burned.</td></tr>
			<tr><td>Other embedded generation: gas</td><td class="n">0.46</td><td>The fleet average for gas.</td></tr>
			<tr><td>Other embedded generation: diesel</td><td class="n">{f2(diesel)}</td><td>The diesel factor.</td></tr>
			<tr><td>Other embedded generation: geothermal</td><td class="n">{f2(GEO_DEFAULT / 1000)}</td><td>The 2023 fleet average, {GEO_DEFAULT} g CO₂e/kWh.</td></tr>
			<tr><td>Other embedded generation: hydro, wind, landfill gas and unclassified output</td><td class="n">0</td><td>Hydro and wind burn nothing, and landfill gas is biogenic. Unclassified output has no known fuel, so it has no factor.</td></tr>
			<tr><td>Batteries</td><td class="n">0</td><td>Discharge only. The energy that charged them was counted when it was generated.</td></tr>
		</tbody>
	</table>
</div>

<h3 id="rankine">Huntly’s Rankine units</h3>
<p>Huntly units 1, 2 and 4 can burn coal or gas, and the market data doesn’t say which. Genesis reports each quarter what share of the Rankines’ fuel was coal, for the three units together. The Rankine factor follows that share.</p>
<dl>
	<dt>Gas, {GAS} kg CO₂e/GJ</dt>
	<dd>The <a href={sourceHref('mfe')}>Ministry for the Environment’s</a> factor for natural gas burned in stationary plant. Its 2026 edition gives 54.19 for industrial use.</dd>
	<dt>Coal, {COAL} kg CO₂e/GJ</dt>
	<dd>Fitted to Genesis’s quarterly fuel burned and reported generation emissions, with the gas factor fixed. Fitting both gives coal 89.7 and gas 57.1.</dd>
	<dt>Heat rate, {RANKINE_HEAT_RATE} GJ/MWh</dt>
	<dd>Genesis’s coal burned per coal-fired MWh, the median over quarters at least 85% on coal. The range is 10.8 to 11.9.</dd>
	<dt>Coal share from July 2020</dt>
	<dd><a href={sourceHref('genesis')}>Genesis’s quarterly performance reports</a>. Until a new quarter is reported, the latest share ({quarter(latest[0])}, {Math.round(latest[1] * 100)}% coal) is carried forward.</dd>
	<dt>Coal share before July 2020</dt>
	<dd><a href={sourceHref('mbie')}>MBIE’s quarterly electricity generation</a> from coal, less Glenbrook’s metered output, divided by the Rankines’ metered output. MBIE doesn’t say its coal figure includes Glenbrook, but taking Glenbrook off is what reproduces Genesis’s figures. Where both exist, in the years to June 2021 to 2025, this comes within a few points of Genesis’s share in most quarters. A quarter with under 100 GWh of Rankine output keeps the previous quarter’s share.</dd>
</dl>
<Calculations>
	<p class="formula">Rankine factor (t CO₂e/MWh) = {RANKINE_HEAT_RATE} × (coal share × {COAL} + gas share × {GAS}) ÷ 1,000</p>
	<div class="tbl">
		<table>
			<thead><tr><th>Term</th><th>Meaning</th><th>Unit</th></tr></thead>
			<tbody>
				<tr><td>{RANKINE_HEAT_RATE}</td><td>Heat rate</td><td>GJ/MWh</td></tr>
				<tr><td>{COAL} and {GAS}</td><td>Emission factors for coal and gas</td><td>kg CO₂e/GJ</td></tr>
				<tr><td>Coal share and gas share</td><td>The shares of the Rankines’ fuel that quarter, adding up to 1</td><td>None</td></tr>
			</tbody>
		</table>
	</div>
	<p class="k">Worked example</p>
	<p>All on gas gives {f2(rankineFactor(0))} t CO₂e/MWh, and all on coal gives {f2(rankineFactor(1))}. A quarter at 70% coal gives {RANKINE_HEAT_RATE} × (0.7 × {COAL} + 0.3 × {GAS}) ÷ 1,000 = {f2(rankineFactor(0.7))} t CO₂e/MWh.</p>
</Calculations>
<p>This table gives the Rankines’ coal share by quarter.</p>
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
		<caption>Share of the Rankines’ fuel that was coal.</caption>
	</table>
</div>

<h3 id="gas">Gas</h3>
<p>Today’s gas plant uses {f2(GAS_FLEET)} t CO₂e/MWh, the generation-weighted average of the fleet over the dispatch history. By quarter it runs from 0.44 to 0.52, depending on how much Huntly 5 ran.</p>
<p>Huntly 5 is a combined-cycle unit. Its heat rate of 7.6 GJ/MWh comes from Genesis’s gas burned less the Rankines’ gas, which gives 0.41 t CO₂e/MWh. The other heat rates are assumed: Huntly 6 and McKee at 10.5 GJ/MWh, Stratford’s peakers at 9.0, and Junction Road and cogeneration at 9.5. These give 0.49 to 0.57 t CO₂e/MWh.</p>
<p>The <a href={ref('stack2020')}>2020 thermal generation stack update</a> has Huntly 5 at 7.4, Huntly 6 at 10.5 and Stratford’s peakers at 8.9. It gives no figure for McKee or Junction Road, where <a href={ref('em6')}>em6’s</a> factors, from the generators, are 0.569 and 0.548 t CO₂e/MWh.</p>
<p>Plants that have closed appear in the metered history, and were more or less efficient than today’s fleet. Each has its own factor from typical heat rates at {GAS} kg CO₂e/GJ, which is a calculated estimate. The <a href={ref('stack2011')}>2011 generation data update</a> has Ōtāhuhu B and the Taranaki Combined Cycle at 7.4 GJ/MWh, and Southdown’s combined cycle at 7.4 and its E105 turbine at 10.6.</p>
<div class="tbl">
	<table>
		<thead><tr><th>Plant</th><th class="n">t CO₂e/MWh</th><th>Notes</th></tr></thead>
		<tbody>
			{#each Object.entries(GAS_PLANT as Record<string, number>) as [name, ef] (name)}
				<tr><td>{name}</td><td class="n">{f2(ef)}</td><td>{GAS_NOTES[name] ?? ''}</td></tr>
			{/each}
			<tr><td>Taranaki Combined Cycle</td><td class="n">{f2(STRATFORD_TCC)}</td><td>Part of Stratford until it closed in March 2026</td></tr>
		</tbody>
	</table>
</div>

<h3 id="geothermal">Geothermal</h3>
<p>Geothermal fluid carries CO₂ and some methane from underground. The amount varies widely between fields, and stations increasingly reinject it. Each station’s operational emissions come from the <a href={sourceHref('nzga')}>NZ Geothermal Association’s (NZGA’s) emissions working group</a> for <a href={ref('mclean2021')}>2020</a>, 2022 and <a href={ref('mclean2024')}>2023</a>. The 2022 figures are published as lifecycle emissions, so we take off the working group’s 10 g CO₂e/kWh allowance for the plant itself.</p>
<p>Each year uses the newest figure published for that year or before it. Years before 2020 use 2020’s figures.</p>
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
			<tr class="sub"><td>Ngāwhā, from {GEO_REPORTED.ngawha_oec4.from}</td><td class="n" colspan={GEO_YEAR_COLS.length}>{GEO_REPORTED.ngawha_oec4.g}</td></tr>
		</tbody>
		<caption>g CO₂e/kWh, which equals kg CO₂e/MWh. Assumed figures are <a href={ref('times')}>TIMES-NZ’s</a>, until the NZGA publishes them. Kawerau (Onepu) is the NZGA’s <a href={ref('nzga2021')}>TOPP1</a> and <a href={ref('nzga2023')}>GDL</a> figures weighted by size (24 and 9 MW), with 2021’s in the 2020 column, the earliest found for both. <a href={ref('topenergy')}>Top Energy</a> reports 2024 as the first year all of Ngāwhā’s geothermal emissions were avoided. Ngāwhā’s OEC4 opened in 2021, and until 2023 it uses the field’s figure before reinjection. Any other station uses {GEO_DEFAULT}, the 2023 fleet average.</caption>
	</table>
</div>
<p>From July 2022, Contact’s stations use Contact’s own figures from its <a href={ref('contact-gbp')}>green borrowing reports</a>, in place of the table above. They cover every Contact station except Ōhaaki, and show reinjection taking effect at Te Huka. <a href={ref('em6')}>em6</a> lists Tauhara at 80, close to its figure while commissioning.</p>
<div class="tbl">
	<table>
		<thead><tr><th>Station</th>{#each GEO_CONTACT_FY as y (y)}<th class="n">{y}</th>{/each}</tr></thead>
		<tbody>
			{#each contactRows as [k, v] (k)}
				<tr><td>{GEO_NAMES[k] ?? k}</td>{#each v as x, i (i)}<td class="n">{x === null ? 'Not reported' : x.toFixed(x % 1 ? 1 : 0)}</td>{/each}</tr>
			{/each}
		</tbody>
		<caption>g CO₂e/kWh by year to June, rounded here. Until a new year is reported, the latest carries forward.</caption>
	</table>
</div>
<p>Weighted by output, dispatched geothermal came to about 70 g CO₂e/kWh in 2021, 60 in 2023 and 50 in 2025.</p>

<h2 id="interpretation"><span id="good-for"></span>How to interpret it</h2>
<p>Intensity is a ratio, so it can fall while total emissions rise. A low figure means the electricity generated at that time came mostly from sources with low emissions. It doesn’t mean a new load would be met by those sources.</p>
<GoodFor rows={[
	{ use: 'Yearly or quarterly intensity, New Zealand', level: 'good', verdict: 'Huntly’s emissions come within ±5% of Genesis’s reported figures in 20 of 23 quarters, and fossil emissions follow the national inventory from year to year.' },
	{ use: 'Trends over months and years', level: 'good', verdict: 'The same factors apply throughout, changing only where the evidence does.', why: 'Comparing across January 2009 carries a step of about 1.5–2%.' },
	{ use: 'Half-hourly intensity', level: 'ok', verdict: 'It uses average factors.', why: 'A plant’s real efficiency changes with how hard it runs, and Huntly’s coal share is a quarterly average.' },
	{ use: 'One gas plant’s emissions', level: 'care', verdict: 'Today’s gas plants share one average factor, so a peaker reads cleaner than it is and Huntly 5 reads dirtier.' },
	{ use: 'Whether Huntly burned coal or gas in a given week or hour', level: 'no', verdict: 'The market data doesn’t say. The quarter’s share applies to every hour of it.' },
	{ use: 'Lifecycle emissions', level: 'no', verdict: 'The factors cover operational emissions only, so they exclude building the plant and extracting the fuel.' },
]} />

<h2 id="limitations"><span id="limits"></span>Accuracy and limitations</h2>
<div class="tbl">
	<table>
		<thead><tr><th>Figure</th><th>Status</th><th>Typical accuracy</th></tr></thead>
		<tbody>
			<tr><td>Emissions intensity, all periods</td><td>Calculated estimate</td><td>Huntly’s emissions within ±5% of Genesis’s reports in 20 of 23 quarters, and −0.4% over the whole period</td></tr>
			<tr><td>Rankine coal share, from July 2020</td><td>Published by Genesis</td><td>A quarterly figure for the three units together</td></tr>
			<tr><td>Rankine coal share, before July 2020</td><td>Calculated estimate</td><td>Within a few points of Genesis’s share in most quarters where both exist</td></tr>
			<tr><td>Geothermal factors, 2020 onward</td><td>Published by the NZGA and Contact</td><td>Station averages for a year</td></tr>
			<tr><td>Geothermal factors, before 2020</td><td>Calculated estimate</td><td>Use 2020’s figures, which probably understate them, because reinjection was less common</td></tr>
		</tbody>
	</table>
</div>

<h3 id="checks">Checks against national figures</h3>
<p>Coal, gas and diesel emissions in the history follow the <a href={sourceHref('inventory')}>national inventory’s</a> energy industries series from year to year, after taking out its roughly 1.2 Mt of refining and gas processing. The pattern matches too, including the 2001 and 2005–06 peaks, the 2007 dip and the 2011 low.</p>
<div class="tbl">
	<table>
		<thead><tr><th>Year</th><th class="n">Elenz (Mt CO₂e)</th><th class="n">National inventory (Mt CO₂e)</th></tr></thead>
		<tbody>
			<tr><td>1998</td><td class="n">4.4</td><td class="n">4.4</td></tr>
			<tr><td>2001</td><td class="n">6.8</td><td class="n">6.8</td></tr>
			<tr><td>2005</td><td class="n">8.8</td><td class="n">9.1</td></tr>
			<tr><td>2008</td><td class="n">8.2</td><td class="n">8.5</td></tr>
			<tr><td>2010</td><td class="n">5.3</td><td class="n">5.7</td></tr>
		</tbody>
	</table>
</div>
<p>Applied to the dispatch data, the factors reproduce Genesis’s reported Huntly emissions, for the Rankines and units 5 and 6, within ±5% in 20 of 23 quarters since 2020. The dispatch data’s Rankine output matches Genesis’s reported Rankine output within 1–2% each quarter.</p>
<p><a href={ref('em6')}>em6’s</a> factors are close where they cover the same plant. The Rankines are 1.01 t CO₂e/MWh on coal and 0.589 on gas, against {f2(rankineFactor(1))} and {f2(rankineFactor(0))} on Elenz. Huntly 5 is 0.40 against 0.41, and the Taranaki Combined Cycle is 0.40.</p>

<h3 id="other-limits">Other limits</h3>
<ul>
	<li>The Rankines’ coal share is for the three units together and for a whole quarter. Within a quarter, a coal-heavy week and a gas-heavy week get the same factor.</li>
	<li>Geothermal stations other than Contact’s and Ngāwhā carry 2023’s figures forward until newer ones are published.</li>
	<li>Kinleith counts as zero, which leaves out the gas it burns. Oji calls its generation <a href={ref('oji-ea')}>biomass cogeneration</a>, but natural gas is <a href={ref('stack2020')}>cofired in the power boiler</a> to manage steam demand. Fossil fuels were 2.1 PJ of the 12.2 PJ the mill burned in <a href={ref('ojifs2025')}>2025</a>. We have found no document saying how much of that is behind its electricity. <a href={ref('em6')}>em6</a> uses 0.364 t CO₂e/MWh, from the generator, with no year or basis given. At that rate, Kinleith would have added about 2 g CO₂e/kWh to New Zealand’s intensity in 2024.</li>
	<li>Kawerau (Onepu) uses the factors of TOPP1 and GDL, because <a href="/methods/generation#onepu">they look like most of what its meter sends into the grid</a>. No public document we have found confirms that. <a href={ref('em6')}>em6</a> uses 0.06 t CO₂e/MWh for it.</li>
	<li>Other embedded generation’s unclassified output has no factor. If some of it burns fossil fuel, intensity reads slightly low.</li>
	<li>Industrial cogeneration that doesn’t export to a local network isn’t included.</li>
</ul>

<h2 id="coverage">Historical coverage</h2>
<p>Each row marks a change in how emissions are worked out.</p>
<div class="tbl">
	<table>
		<thead><tr><th>From</th><th>Change</th></tr></thead>
		<tbody>
			<tr><td>August 1997</td><td>Emissions intensity starts. The Rankines’ coal share comes from MBIE, and closed gas plants use their own factors.</td></tr>
			<tr><td>January 2009</td><td>Other embedded generation joins the total. It lowers intensity by about 1.5–2% a year, because it is mostly renewable. That is measured with a flat factor for geothermal, so it is approximate.</td></tr>
			<tr><td>January 2013</td><td>Kawerau (Onepu) joins geothermal.</td></tr>
			<tr><td>2020</td><td>Geothermal station factors start. Earlier years use 2020’s figures.</td></tr>
			<tr><td>July 2020</td><td>The Rankines’ coal share comes from Genesis’s reports.</td></tr>
			<tr><td>July 2022</td><td>Contact’s stations use Contact’s own figures.</td></tr>
			<tr><td>{GEO_REPORTED.ngawha_oec4.from}</td><td>Ngāwhā’s factor falls to {GEO_REPORTED.ngawha_oec4.g}.</td></tr>
		</tbody>
	</table>
</div>

<h2 id="references">References</h2>
<References slug="emissions" />
