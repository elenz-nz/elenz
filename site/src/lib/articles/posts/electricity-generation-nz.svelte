<script module lang="ts">
	export const meta = {
		title: 'Electricity generation in New Zealand: where the power comes from',
		dek: 'Hydro, geothermal and wind made almost 90% of New Zealand’s electricity in the 12 months to October 2026, and 95.3% of it was renewable, the highest since our records began in 1997.',
		description: 'How New Zealand generates its electricity: hydro, geothermal, wind, solar, gas and coal, by island and by month, from the latest 12 months of data.',
		date: '2026-11-16',
		kind: 'Guide',
		image: '/articles/electricity-generation-nz.png',
		imageLight: '/articles/electricity-generation-nz-light.png',
	} as const;
</script>

<script lang="ts">
	// Figures from analysis/generation_nz.py, which also writes the chart data in ../data/electricity-generation-nz.json.
	import Figure from '#lib/articles/Figure.svelte';
	import ReviewCover from '#lib/articles/ReviewCover.svelte';
	import cover from '#lib/articles/covers/electricity-generation-nz.json';
	import Note from '#lib/articles/Note.svelte';
	import Stats from '#lib/articles/Stats.svelte';
	import HBars from '#lib/articles/charts/HBars.svelte';
	import Columns from '#lib/articles/charts/Columns.svelte';
	import SplitBar from '#lib/articles/charts/SplitBar.svelte';
	import { num } from '#lib/articles/charts/util.js';
	import D from '#lib/articles/data/electricity-generation-nz.json';
	type Table = { [k: string]: number };

	const mix = D.mix as Table;
	const pct = (v: number) => `${v.toFixed(1)}%`;
	const gwh = (v: number) => `${num(Math.round(v))} GWh`;
	const share = (v: number) => (100 * v) / D.total;

	// the 12-month mix, largest first (diesel, under 1 GWh, left out)
	const SOURCES = [
		{ k: 'hydro', name: 'Hydro', tok: '--f-hydro' },
		{ k: 'geo', name: 'Geothermal', tok: '--f-geo' },
		{ k: 'wind', name: 'Wind', tok: '--f-wind' },
		{ k: 'roof', name: 'Embedded solar (est.)', tok: '--f-solar' },
		{ k: 'gas', name: 'Gas', tok: '--f-gas' },
		{ k: 'oemb', name: 'Other embedded (est.)', tok: '--f-oemb' },
		{ k: 'solar', name: 'Grid solar', tok: '--f-solar' },
		{ k: 'coal', name: 'Coal/gas, Rankine', tok: '--f-coal' },
		{ k: 'waste', name: 'Waste heat', tok: '--f-waste' },
		{ k: 'bio', name: 'Bioenergy', tok: '--f-bio' },
	];
	const mixRows = SOURCES.map((s) => ({ label: s.name, value: share(mix[s.k]), tok: s.tok, note: gwh(mix[s.k]) }))
		.sort((a, b) => b.value - a.value);

	// how hard each source ran: generation over the 12 months against its installed capacity
	const cf = D.cf as Table;
	const cfRows = [
		{ label: 'Geothermal', value: cf.geo, tok: '--f-geo' },
		{ label: 'Hydro', value: cf.hydro, tok: '--f-hydro' },
		{ label: 'Wind', value: cf.wind, tok: '--f-wind' },
		{ label: 'Embedded solar (est.)', value: cf.roof, tok: '--f-solar' },
		{ label: 'Grid solar', value: cf.solar, tok: '--f-solar' },
		{ label: 'Gas', value: cf.gas, tok: '--f-gas' },
		{ label: 'Coal/gas, Rankine', value: cf.coal, tok: '--f-coal' },
		{ label: 'Diesel', value: cf.diesel, tok: '--f-diesel' },
	];

	// month by month: the tracker's fuels, with grid and embedded solar joined and the smallest as Other
	const M = D.monthly as { [k: string]: number[] };
	const add = (...ks: string[]) => M.hydro.map((_, i) => ks.reduce((a, k) => a + M[k][i], 0));
	const monthSeries = [
		{ name: 'Geothermal', tok: '--f-geo', values: M.geo },
		{ name: 'Other', tok: '--f-oemb', values: add('oemb', 'bio', 'waste', 'diesel') },
		{ name: 'Coal/gas, Rankine', tok: '--f-coal', values: M.coal },
		{ name: 'Gas', tok: '--f-gas', values: M.gas },
		{ name: 'Hydro', tok: '--f-hydro', values: M.hydro },
		{ name: 'Wind', tok: '--f-wind', values: M.wind },
		{ name: 'Solar', tok: '--f-solar', values: add('solar', 'roof') },
	];
	const monthX = D.months.map((m) => m.slice(0, 3));

	// each island's mix
	const ISL = D.islands as { [isl: string]: Table };
	const islandParts = (isl: string) => [
		{ name: 'Hydro', tok: '--f-hydro', v: ISL[isl].hydro },
		{ name: 'Geothermal', tok: '--f-geo', v: ISL[isl].geo },
		{ name: 'Wind', tok: '--f-wind', v: ISL[isl].wind },
		{ name: 'Solar', tok: '--f-solar', v: ISL[isl].solar + ISL[isl].roof },
		{ name: 'Gas and coal/gas', tok: '--f-gas', v: ISL[isl].gas + ISL[isl].coal + ISL[isl].diesel },
		{ name: 'Other', tok: '--f-oemb', v: ISL[isl].oemb + ISL[isl].bio + ISL[isl].waste },
	].filter((p) => p.v >= 1).map((p) => ({ name: p.name, tok: p.tok, value: p.v }));

	// calendar 2025 against the 12 months
	const Y = D.y2025 as Table;
	const changeRows = [
		{ name: 'Hydro', a: Y.hydro, b: mix.hydro },
		{ name: 'Geothermal', a: Y.geo, b: mix.geo },
		{ name: 'Wind', a: Y.wind, b: mix.wind },
		{ name: 'Solar, grid and embedded', a: Y.solar + Y.roof, b: mix.solar + mix.roof },
		{ name: 'Gas', a: Y.gas, b: mix.gas },
		{ name: 'Coal/gas, Rankine', a: Y.coal, b: mix.coal },
	];
	const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${num(Math.abs(Math.round(v)))}`;

	const YEAR = 'range=1y&end=2026-10-31';
</script>

<ReviewCover data={cover} kicker="ELECTRICITY GENERATION IN NEW ZEALAND" title="95.3% renewable"
	range="1 November 2025 – 31 October 2026 · 44.1 TWh"
	label="Electricity generation in New Zealand, 1 November 2025 to 31 October 2026: each day's generation stacked by fuel" />

<p>New Zealand generated <strong>44.1 TWh</strong> of electricity in the 12 months to October 2026. Hydro supplied 57.8% of it, geothermal 22.3% and wind 9.3%. Solar supplied 3.8%, two-thirds of it from rooftops and other small systems. Gas, diesel and Huntly’s Rankine units, which burn coal or gas, together supplied 3.5%.</p>

<Stats items={[
	{ label: 'Generated', value: '44.1', unit: 'TWh', note: '12 months to October 2026', tok: '--accent' },
	{ label: 'Renewable', value: pct(D.renewable), note: 'the highest since our records began in 1997', tok: '--g-ren' },
	{ label: 'Hydro', value: pct(share(mix.hydro)), note: '92% of South Island generation', tok: '--f-hydro' },
	{ label: 'Geothermal', value: pct(share(mix.geo)), note: 'the North Island’s largest source', tok: '--f-geo' },
]} />

<p>This guide covers where that electricity came from: each source, how hard it ran, how the two islands differ and how the mix moved month by month. The figures cover 1 November 2025 to 31 October 2026, the latest 12 months the Electricity Authority (EA) has metered.</p>

<h2>Where New Zealand’s electricity comes from</h2>
<p>Three renewable sources supply most of New Zealand’s electricity. Hydro, geothermal and wind together made 39,415 GWh, or 89.4% of the total. The rest came from a long tail of smaller sources, each under 3%.</p>

<Figure caption="Share of New Zealand’s electricity generation by source, 1 November 2025 to 31 October 2026" source="EA metered generation. Embedded solar is modelled and other embedded generation comes from the EA’s reconciliation data; both are calculated estimates. Diesel, under 1 GWh, is left out.">
	<HBars rows={mixRows} fmt={pct} tickFmt={(v) => `${v}%`} label="Source" valueLabel="Share of generation" labelWidth={150} />
</Figure>

<p>These figures include generation on local networks that never reaches the national grid. Embedded solar is solar on homes, businesses and small ground-mounted sites. Other embedded generation is mostly small hydro and landfill gas. The market doesn’t dispatch either, so we make a calculated estimate of both. Together they supplied 4.6% of the total. Open the <a href="/tracker?{YEAR}&int=1mo">Generation tab for the same 12 months</a> to see this mix month by month.</p>

<h3>Hydro</h3>
<p>Hydro stations generated <strong>25,493 GWh</strong>, 57.8% of the total. About three-quarters of it came from the South Island, where the Waitaki, Clutha and Manapōuri schemes hold the country’s largest stations. Manapōuri alone generated 5,303 GWh, 12.0% of New Zealand’s electricity and more than every wind farm put together. Benmore, Clyde and Roxburgh were next, so the four largest stations were all South Island hydro.</p>
<p>Hydro lakes store water, so hydro output can rise and fall to follow demand. How much it can generate over a year depends on how much rain and snowmelt reaches the lakes. Hydro generated 1,993 GWh more in these 12 months than in calendar 2025. See every <a href="/tracker?{YEAR}&fuel=hydro">hydro station over the 12 months</a>, or group them <a href="/tracker?{YEAR}&by=scheme">by scheme</a>.</p>

<h3>Geothermal</h3>
<p>Geothermal stations generated <strong>9,840 GWh</strong>, 22.3% of the total. Every one is in the North Island, and geothermal is now the North Island’s largest source, at 41.8% of its generation. Te Mihi and Tauhara were the largest geothermal stations, at about 3% of New Zealand’s generation each.</p>
<p>Geothermal stations run steadily, day and night, through the year. They ran at 82% of their installed capacity on average, far more than any other source. Geothermal generated 564 GWh more than in calendar 2025, as new stations and expansions came into service. See every <a href="/tracker?{YEAR}&fuel=geo">geothermal station over the 12 months</a>.</p>

<h3>Wind</h3>
<p>Wind farms generated <strong>4,081 GWh</strong>, 9.3% of the total. Most wind farms are in the North Island, which made 85% of New Zealand’s wind generation. Wind output follows the weather. Wind farms ran at 34% of their capacity on average, and their output changes far more from hour to hour than hydro or geothermal. <a href="/tracker?{YEAR}&by=site&chart=lines&fuel=wind">Compare every wind farm</a> on one chart.</p>

<h3>Solar</h3>
<p>Solar generated <strong>1,685 GWh</strong>, 3.8% of the total, and 558 GWh more than in calendar 2025. Grid solar farms generated 559 GWh. By 31 October 2026 they had 636 MW of capacity, and several were still building up their output after starting during the year.</p>
<p>Embedded solar generated about 1,126 GWh, two-thirds of all solar. We make a calculated estimate of it from installed capacity, 892 MW in October 2026, and satellite measurements of sunshine. The <a href="/methods/embedded-solar">embedded solar method</a> explains how.</p>

<h3>Gas, coal and diesel</h3>
<p>Gas stations generated <strong>1,020 GWh</strong>, 2.3% of the total. Huntly’s Rankine units, which burn coal or gas, generated 502 GWh, 1.1%. These stations mostly run when renewable output falls short of demand, in dry spells and at peak times. Over the 12 months, gas stations ran at 11% of their capacity and the Rankine units at 8%. Whirinaki, a 156 MW diesel station, generated less than 1 GWh.</p>
<p>Gas generated 2,112 GWh less than in calendar 2025, and the Rankine units 667 GWh less. Over the 12 months to September 2026, gas, coal/gas and diesel generated 1,505 GWh between them, 3.4% of the total. That is the least of any 12 months in our records, in energy and as a share. Their peak was 14,511 GWh, in the 12 months to April 2006.</p>

<h3>Other sources</h3>
<p>Other embedded generation supplied about 912 GWh, 2.1% of the total. NZ Steel’s Glenbrook mill generated 440 GWh from the waste heat and gases of ironmaking, which we don’t count as renewable. Kinleith pulp and paper mill generated 123 GWh from wood waste.</p>
<p>The four grid batteries, 335 MW in total, discharged 71 GWh. Batteries store electricity rather than generate it, so they are left out of these totals.</p>

<h2>Installed capacity isn’t output</h2>
<p>A station’s capacity is the most it can generate at once. Its capacity factor is what it actually generated over a period, as a share of what it would have generated at full capacity throughout. The sources differ widely.</p>

<Figure caption="Capacity factor by source: generation from 1 November 2025 to 31 October 2026 as a share of installed capacity" source="EA metered generation; installed capacity from the EA plant register and Elenz’s capacity table. Embedded solar is a calculated estimate. Grid solar includes farms that started generating during the year.">
	<HBars rows={cfRows} fmt={(v) => `${v.toFixed(0)}%`} max={100} label="Source" valueLabel="Capacity factor" labelWidth={150} />
</Figure>

<p>Geothermal has 11.6% of New Zealand’s installed capacity but made 22.3% of its electricity. Solar, grid and embedded, has 12.8% of capacity and made 3.8%, because it generates only in daylight and most strongly near noon. Gas, coal/gas and diesel have 15.7% of capacity and made 3.5%. Much of that capacity stands ready for dry years, cold snaps and windless evenings.</p>

<h2>Two islands, two mixes</h2>
<p>The North Island generated 23,529 GWh, 53.4% of the total, and the South Island 20,567 GWh, 46.6%. The two islands make their electricity in very different ways.</p>

<Figure caption="Generation by source in each island, 1 November 2025 to 31 October 2026" source="EA metered generation. Solar and Other include calculated estimates. Other is other embedded generation, waste heat and bioenergy.">
	<h4 class="isl">North Island</h4>
	<SplitBar parts={islandParts('NI')} fmt={gwh} totalName="North Island" />
	<h4 class="isl">South Island</h4>
	<SplitBar parts={islandParts('SI')} fmt={gwh} totalName="South Island" />
</Figure>

<p>The South Island’s generation is 92.2% hydro, and almost all of the rest is wind, solar and small embedded hydro. It has no gas or coal stations, so its renewable share rounds to 100%. The North Island has the country’s geothermal, most of its wind and all of its gas and coal. Its renewable share was 91.3%.</p>
<p>The HVDC link joins the two islands’ grids under Cook Strait. It sent a net 3.7 TWh north over the 12 months, about 18% of the South Island’s generation, and its net flow was northward on 346 of the 365 days. Compare the <a href="/tracker?{YEAR}&region=NI">North Island</a> and the <a href="/tracker?{YEAR}&region=SI">South Island</a> over the 12 months.</p>

<h2>Through the year</h2>
<p>The mix shifts with the seasons. The renewable share was lowest from March to June 2026, when gas generation rose to 235 GWh in April and the renewable share fell to 91.4%. In September 2026 it reached <strong>98.0%</strong>, the <a href="/records/ren_max?period=month">highest of any month</a> in our records.</p>

<Figure caption="Generation by source each month, November 2025 to October 2026, with the renewable share above each month, to the nearest percent" source="EA metered generation. Solar includes embedded solar, and Other includes other embedded generation, both calculated estimates. Other is also waste heat, bioenergy and diesel." wide>
	<Columns cats={D.months} xlabels={monthX} series={monthSeries} stacked tops={D.ren_monthly.map((v) => `${Math.round(v)}%`)}
		unit="GWh" height={300} fmt={gwh} label="Month" />
</Figure>

<p>Hydro generated most in July and August 2026, at 2,528 GWh and 2,440 GWh. Geothermal generated between 568 GWh and 930 GWh a month. Solar generated most in October 2026, 256 GWh, more than in any summer month, because so much solar capacity was added during the year. Its lowest month was June 2026, at 73 GWh.</p>

<h2>How much of New Zealand’s electricity is renewable?</h2>
<p>In the 12 months to October 2026, <strong>{pct(D.renewable)}</strong> of New Zealand’s electricity came from renewable sources. That is the highest share of any 12 months in Elenz’s history. The previous best was 91.4%, in the 12 months to June 2023. In calendar 2025 the share was 88.7%, and in 2024 it was 85.8%.</p>
<p>Compared with calendar 2025, hydro, geothermal, wind and solar generated 3,440 GWh more, and gas and coal/gas 2,779 GWh less. Hydro supplied more than half of the increase.</p>

<Figure caption="Generation by source, calendar 2025 against the 12 months to October 2026" source="EA metered generation. Solar includes embedded solar, a calculated estimate.">
	<table>
		<thead><tr><th>Source</th><th class="n">2025 (GWh)</th><th class="n">Nov 2025–Oct 2026 (GWh)</th><th class="n">Change (GWh)</th></tr></thead>
		<tbody>
			{#each changeRows as r}
				<tr><td>{r.name}</td><td class="n">{num(Math.round(r.a))}</td><td class="n">{num(Math.round(r.b))}</td><td class="n">{signed(r.b - r.a)}</td></tr>
			{/each}
		</tbody>
	</table>
</Figure>

<p>The Ministry of Business, Innovation and Employment (MBIE) publishes New Zealand’s official energy statistics. Its <a href="https://www.mbie.govt.nz/building-and-energy/energy-and-natural-resources/energy-statistics-and-modelling/energy-publications-and-technical-papers/energy-in-new-zealand/energy-in-new-zealand-2026/electricity">Energy in New Zealand 2026</a> gives a renewable share of 88.5% for 2025 and 85.5% for 2024. Our figures for the same years are within 0.3 percentage points of MBIE’s. MBIE gives total generation in 2025 as 44,140 GWh, against our 43,438 GWh.</p>

<h2>See it live</h2>
<ul>
	<li>The <a href="/now">Now</a> page shows what each source is generating at this moment, updated every 5 minutes.</li>
	<li>The <a href="/tracker?{YEAR}&by=rf">Generation tab grouped as renewable and fossil</a> shows the 12 months in this guide.</li>
	<li>The <a href="/tracker?{YEAR}&fold=price,demand,hvdc,co2">renewable share chart</a> sits under the Generation chart.</li>
	<li>The <a href="/records">Records</a> page lists the records for hydro, wind and solar output, fossil generation and the renewable share.</li>
	<li><a href="/articles/welcome-to-elenz">Welcome to Elenz</a> shows how the mix has changed since 1998.</li>
</ul>

<Note title="How these figures are made">
	<p>Grid generation is the EA’s metered data. Embedded solar is modelled from installed capacity and satellite sunshine. Other embedded generation comes from the EA’s reconciliation data. The renewable share counts hydro, geothermal, wind, solar, bioenergy and the renewable part of other embedded generation. Gas, coal/gas, diesel and waste heat aren’t renewable.</p>
	<p>Other embedded generation is counted from January 2009, so the shares for earlier years leave it out. That doesn’t affect the record: the highest 12-month renewable share before 2009 was 77.5%. MBIE compiles its figures differently, so its yearly totals and ours aren’t identical.</p>
</Note>

<h2>Sources</h2>
<p>The figures in this guide use Elenz’s published history, built from these EA datasets, all published under CC BY 4.0. The <a href="/methods/sources">source register</a> describes every dataset we use.</p>
<ul>
	<li><a href="https://www.emi.ea.govt.nz/Wholesale/Datasets/Generation/Generation_MD">Metered generation</a> (<code>Generation_MD</code>)</li>
	<li><a href="https://www.emi.ea.govt.nz/Wholesale/Datasets/Volumes/Reconciliation">Reconciliation data</a> (<code>ReconciledInjectionAndOfftake</code>)</li>
	<li><a href="https://www.emi.ea.govt.nz/Wholesale/Datasets/Metered_data/HVDC_Flows">HVDC flows</a> (<code>HVDC_Flows</code>)</li>
</ul>
<p>Embedded solar also uses the EA’s distributed generation registry and Open-Meteo’s satellite irradiance, as described on the <a href="/methods/embedded-solar">embedded solar method</a> page. MBIE’s figures are from <a href="https://www.mbie.govt.nz/building-and-energy/energy-and-natural-resources/energy-statistics-and-modelling/energy-publications-and-technical-papers/energy-in-new-zealand/energy-in-new-zealand-2026/electricity">Energy in New Zealand 2026: Electricity</a>.</p>

<style>
	.isl { margin: 12px 0 6px; font-size: 0.9rem; font-weight: 650; }
</style>
