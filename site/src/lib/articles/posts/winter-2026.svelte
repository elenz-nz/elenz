<script module lang="ts">
	export const meta = {
		title: 'Winter 2026: a record peak, a dry north and a full south',
		dek: 'Demand set a new high in an August cold snap, South Island water flowed north in record amounts, and new solar farms set records in mid-winter. Thermal generation fell to its smallest winter share.',
		date: '2026-10-15',
		kind: 'Quarterly review',
		draft: true,
	} as const;
</script>

<script lang="ts">
	// Figures from analysis/winter_2026.py, which also writes the chart data in ../data/winter-2026.json.
	import Record from '#lib/articles/Record.svelte';
	import Figure from '#lib/articles/Figure.svelte';
	import Note from '#lib/articles/Note.svelte';
	import Stats from '#lib/articles/Stats.svelte';
	import Columns from '#lib/articles/charts/Columns.svelte';
	import HBars from '#lib/articles/charts/HBars.svelte';
	import DotRank from '#lib/articles/charts/DotRank.svelte';
	import Lines from '#lib/articles/charts/Lines.svelte';
	import TimeStack from '#lib/articles/charts/TimeStack.svelte';
	import { num } from '#lib/articles/charts/util.js';
	type Table = { [k: string]: number[] };
	import D from '#lib/articles/data/winter-2026.json';

	const years = D.years.map(String);
	const hi26 = (ys: (number | string)[], tok = '--accent', rest = '--f-hvdc') => ys.map((y) => (String(y) === '2026' ? tok : rest));
	const gwh = (v: number) => `${num(v)} GWh`;
	const mw = (v: number) => `${num(v)} MW`;

	const FUELS = [
		{ k: 'geo', name: 'Geothermal', tok: '--f-geo' },
		{ k: 'coal', name: 'Coal/gas, Rankine', tok: '--f-coal' },
		{ k: 'gas', name: 'Gas', tok: '--f-gas' },
		{ k: 'diesel', name: 'Diesel', tok: '--f-diesel' },
		{ k: 'hydro', name: 'Hydro', tok: '--f-hydro' },
		{ k: 'wind', name: 'Wind', tok: '--f-wind' },
		{ k: 'solar', name: 'Solar, grid', tok: '--f-solar' },
	] as const;
	const snap = D.snap;
	const snapLayers = [...FUELS, { k: 'batt', name: 'Battery', tok: '--f-batt' }]
		.map((f) => ({ name: f.name, tok: f.tok, values: (snap.fuels as Table)[f.k] }));

	const mixSeries = FUELS.filter((f) => f.k !== 'diesel').map((f) => ({ name: f.name, tok: f.tok, values: (D.mix as Table)[f.k] }));
	const renPct = D.years.map((_, i) => {
		const tot = FUELS.reduce((a, f) => a + (D.mix as Table)[f.k][i], 0);
		return Math.round((1000 * ['geo', 'hydro', 'wind', 'solar'].reduce((a, k) => a + (D.mix as Table)[k][i], 0)) / tot) / 10;
	});

	const peakRows = D.peaks.map((p) => ({ label: p.t, value: p.mw, tok: p.y === 2026 ? '--accent' : '--f-hvdc' }));

	const schemeRows = D.schemes.map((s) => ({
		label: s.name, value: s.pct, tok: s.isl === 'SI' ? '--p-si' : '--p-ni',
		note: `${num(s.gwh)} GWh this winter, against ${num(s.base)} GWh on average`,
	}));

	const durYears = D.hvdc_years.map(String);
	const durStyle: { [y: string]: { tok: string } } = { '2026': { tok: '--accent' }, '2023': { tok: '--f-gas' }, '2024': { tok: '--f-diesel' } };
	const durSeries = durYears.map((y) => ({
		name: `Winter ${y}`, values: (D.hvdc_duration as Table)[y],
		tok: durStyle[y]?.tok ?? '--f-hvdc', faint: !durStyle[y],
	}));

	const MON = new Intl.DateTimeFormat('en-NZ', { month: 'short', year: 'numeric', timeZone: 'UTC' });
	const solarCats = D.solar_months.map((s) => MON.format(new Date(s.m + '-01T00:00:00Z')));
	const solarX = D.solar_months.map((s) => (s.m.endsWith('-01') ? s.m.slice(0, 4) : s.m.endsWith('-07') ? 'Jul' : null));
	const solarTops = D.solar_months.map((s) => (s.m === '2026-08' || s.m === '2025-12' ? s.gwh.toFixed(1) : null));
	const newFarms = D.farms.filter((f) => f.first >= '2026-05-01');
	const DAYF = new Intl.DateTimeFormat('en-NZ', { day: 'numeric', month: 'short', timeZone: 'UTC' });
	const farmDate = (d: string) => DAYF.format(new Date(d + 'T00:00:00Z'));
</script>

<p>This review compares winter 2026, from 1 June to 31 August, with the five winters before it, back to 2021. Every figure comes from the Electricity Authority's market data, averaged over trading periods, the half-hours the wholesale market is settled in. A record here means the highest or lowest of those six winters.</p>

<Stats items={[
	{ label: 'Peak demand', value: '7,421', unit: 'MW', note: 'Thu 6 Aug, 7:30 am', tok: '--accent' },
	{ label: 'Renewable share', value: `${renPct[5]}%`, note: `of grid generation, up from ${renPct[4]}% in 2025`, tok: '--g-ren' },
	{ label: 'Sent north on the HVDC', value: '1.2', unit: 'TWh', note: 'net, 31% more than the next highest winter', tok: '--f-hvdc' },
	{ label: 'Grid solar', value: '366', unit: 'MW', note: 'trading period record, 18 Aug, beating every summer too', tok: '--f-solar' },
]} />

<h2>The coldest week</h2>
<p>Demand climbed each morning and evening from Monday 3 August, and on Thursday 6 August the trading period from 7:30 am averaged <strong>7,421 MW</strong>. Transpower's own measure put that morning at 7,415 MW.</p>

<Record label="Peak demand, New Zealand" value="7,421" unit="MW" when="7:30 am Thursday 6 August 2026" previous="7,134 MW at 6:00 pm on 9 August 2021" fuel="--accent" />

<p>The four days from 4 to 7 August set five of the six highest peaks of the six winters, and eight of the top ten are from this winter. Demand reached 7,000 MW in 31 trading periods this winter, against eight in the previous five winters combined. Each island set its own record too: 4,979 MW in the North Island and 2,445 MW in the South.</p>

<Figure caption="The twelve highest peaks of the six winters, one per morning or evening" source="EMI real-time dispatch, trading-period averages of grid demand">
	<DotRank rows={peakRows} lo={6950} hi={7450} unit="MW" label="Trading period" valueLabel="Demand (MW)"
		legend={[{ name: 'Winter 2026', tok: '--accent', kind: 'dot' }, { name: 'Earlier winters', tok: '--f-hvdc', kind: 'dot' }]} />
</Figure>

<p>At the peak, hydro supplied 5,105 MW, its highest trading period of the six winters, with 3,381 MW from the South Island alone. Wind was almost absent, at 157 MW. Thermal plant ran at 1,020 MW, and batteries discharged 191 MW, also their most. The Haywards price reached $2,097/MWh at the peak, and $4,943/MWh at 7:30 pm on Tuesday 4 August, the highest of the week.</p>

<Figure caption="Generation by fuel and grid demand through the cold snap, 3–8 August 2026, with the Haywards price" source="EMI real-time dispatch and final energy prices, by trading period" wide>
	<TimeStack t0={snap.t0} step={snap.step} layers={snapLayers} line={{ name: 'Demand', tok: '--ink', values: snap.demand }}
		panel={{ name: 'Price at Haywards', tok: '--p-ni', values: snap.price, unit: '$/MWh', fmt: (v) => `$${num(v)}/MWh`, height: 100 }} height={320} />
</Figure>

<p>Total winter demand barely moved, at 11.1 TWh, the same as 2023. What changed was the shape of the day. Winter peaks used to come at about 6 pm; this year 30% of winter days peaked in the morning, against 13–16% in 2021–2023.</p>

<Figure caption="Share of winter days whose highest trading period came before noon, with each winter's total demand" source="EMI real-time dispatch">
	<Columns cats={years} series={[{ name: 'Morning peaks', tok: '--f-hvdc', values: D.morning }]} colors={hi26(D.years)} tops={D.morning.map((v) => `${v}%`)}
		line={{ name: 'Total winter demand', tok: '--ink', values: D.demand_gwh, unit: 'GWh', fmt: (v) => `${num(v)} GWh` }}
		unit="% of days" height={220} fmt={(v) => `${v}%`} label="Winter" />
</Figure>

<h2>A wet south and a dry north</h2>
<p>The South Island's hydro stations generated <strong>5,212 GWh</strong> over the winter, the most of the six winters and 16% above the 2021–2025 average. North Island hydro gave 1,911 GWh, 8% below average and 21% less than last winter. Only 2021 was lower.</p>

<Figure caption="Hydro generation by island, June to August" source="EMI real-time dispatch">
	<Columns cats={years} series={[{ name: 'South Island', tok: '--p-si', values: D.hydro.SI }, { name: 'North Island', tok: '--p-ni', values: D.hydro.NI }]}
		unit="GWh" height={250} fmt={gwh} label="Winter" />
</Figure>

<p>Total hydro output, 7,124 GWh, was close to an ordinary winter. Its location wasn't. Every main South Island scheme ran above its average, led by the Clutha, while every main North Island scheme ran below, led by Tongariro. Prices showed the same split: Haywards cleared at least $10 above Benmore in 18.5% of trading periods, more than in any of the six winters except 2021.</p>

<Figure caption="Winter 2026 hydro generation by scheme, against each scheme's 2021–2025 winter average" source="EMI real-time dispatch; the main schemes as grouped on the tracker (the small Rangitaiki and Waipori schemes are left out)">
	<HBars rows={schemeRows} fmt={(v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(0)}%`} label="Scheme" valueLabel="Change on average"
		legend={[{ name: 'South Island', tok: '--p-si' }, { name: 'North Island', tok: '--p-ni' }]} />
</Figure>

<h2>Power heading north</h2>
<p>The HVDC link carried South Island power north almost without pause. Over the winter it sent a net <strong>1,201 GWh</strong> north, 31% more than the next highest winter, 2023. It flowed north in 95% of trading periods, and on 62 of the 92 days it never flowed south at all. August, at 494 GWh, was the link's biggest month of any since 2021, winter or not.</p>

<Figure caption="Net energy sent north on the HVDC link each winter" source="EMI metered HVDC flows (HVDC_Flows), mid-link">
	<Columns cats={durYears} series={[{ name: 'Net northward transfer', tok: '--f-hvdc', values: D.hvdc_net }]} colors={hi26(D.hvdc_years)}
		tops={D.hvdc_net.map((v) => num(v))} unit="GWh" height={230} fmt={gwh} label="Winter" />
</Figure>

<p>The link also spent far longer running hard. It carried 1,000 MW or more for 184 trading periods this winter. In the previous five winters combined it did so for 44, all of them in 2023. Two years earlier the picture was reversed: in the dry South Island winter of 2024 the link sent a net 258 GWh south.</p>

<Figure caption="How long the link ran at each level: every trading period of each winter, sorted by transfer, with the highest northward transfer at the right (each winter has 4,416 trading periods)" source="EMI metered HVDC flows, mid-link">
	<Lines xs={D.hvdc_duration_tp} series={durSeries} reverse xfmt={(v) => num(v)} xtitle="Trading periods at or above each level"
		titleFmt={(v) => `${num(v)} trading periods at or above`} fmt={(v) => `${num(Math.abs(v))} MW ${v < 0 ? 'south' : 'north'}`}
		ytick={(v) => `${num(Math.abs(v))} MW`} ytop="North" ybottom="South" left={66} height={310}
		legend={[{ name: 'Winter 2026', tok: '--accent', kind: 'line' }, { name: '2023', tok: '--f-gas', kind: 'line' }, { name: '2024', tok: '--f-diesel', kind: 'line' }, { name: '2021, 2022 and 2025', tok: '--f-hvdc', kind: 'line', faint: true }]} />
</Figure>

<h2>Solar records in mid-winter</h2>
<p>Grid-connected solar farms generated 99 GWh this winter, more than double last winter's 47 GWh. New farms meant the records fell in the darkest months. The trading period record fell at 1 pm on 18 August, when grid solar reached <strong>366 MW</strong>, the highest of the six winters and higher than any summer trading period too: the best before this winter was 219 MW in February. The same day set the daily record. Its 2,564 MWh beat the best summer day, 2,131 MWh on 7 February, by 20%, and the five best days for grid solar up to the end of August all came in August 2026. August's 47.7 GWh came within 1.3 GWh of the best summer month.</p>

<Record label="Grid solar, trading period" value="366" unit="MW" when="1:00 pm Tuesday 18 August 2026" previous="219 MW on 7 February 2026, in summer" fuel="--f-solar" />

<Figure caption="Grid solar generation each month since January 2024" source="EMI real-time dispatch (dispatched solar farms only, not rooftops)">
	<Columns cats={solarCats} xlabels={solarX} series={[{ name: 'Grid solar', tok: '--f-solar', values: D.solar_months.map((s) => s.gwh) }]} tops={solarTops}
		unit="GWh" height={230} fmt={(v) => `${v.toFixed(1)} GWh`} label="Month" />
</Figure>

<p>Five farms first generated between May and August:</p>

<Figure caption="Solar farms that first generated around winter 2026" source="EMI real-time dispatch">
	<table>
		<thead><tr><th>Farm</th><th>Island</th><th>First output</th><th class="n">Highest trading period</th><th class="n">Winter output</th></tr></thead>
		<tbody>
			{#each newFarms as f}
				<tr><td>{f.name.replace(/ Solar Farm$/, '')}</td><td>{f.isl === 'NI' ? 'North' : 'South'}</td><td>{farmDate(f.first)}</td><td class="n">{f.max} MW</td><td class="n">{f.w26_gwh.toFixed(1)} GWh</td></tr>
			{/each}
		</tbody>
	</table>
</Figure>

<p>Tauhei, which started on 30 June and reached 141 MW in August, supplied 139 MW of the record trading period on its own. The nine farms that first generated after last winter produced about half of this winter's grid solar. Kōwhai Park only appeared for two days of test output in August, so its effect is still to come.</p>

<h2>The cleanest of the six winters</h2>
<p>Renewables supplied <strong>{renPct[5]}%</strong> of grid generation this winter, up from {renPct[4]}% in 2025 and {renPct[3]}% in the dry winter of 2024. Gas generation fell to 377 GWh, a third of last winter's and less than a quarter of 2021's. Huntly's Rankine units added 184 GWh. On 34 days thermal output averaged under 200 MW; in the five earlier winters that happened once.</p>

<Figure caption="Winter generation by fuel, as shares of the total; renewable share above each column" source="EMI real-time dispatch; diesel (under 0.2%) left out">
	<Columns cats={years} series={mixSeries} stacked percent tops={renPct.map((v) => `${v}%`)} height={280} label="Winter" fmt={gwh} />
</Figure>

<p>Wind had its best winter of the six, 1,119 GWh, up 30% on last year, with its highest trading period, 1,091 MW, on 31 August. New farms supplied 105 GWh of the increase. Kaiwera Downs stage 2 in Southland first generated in April and gave 96 GWh at up to 120 MW, more than doubling South Island wind output. Kaiwaikawe in Northland joined the market in mid-July and added 9 GWh. Existing farms supplied the other 150 GWh or so, led by Turitea, up 40 GWh.</p>

<p>Geothermal also had its best winter, 2,677 GWh, 8% more than in 2025. Eastland Generation's TOPP2 station at Kawerau, generating since December, added 107 GWh. Ngā Tamariki now runs at up to 134 MW, against 86 MW a year ago, and gave 94 GWh more. Tauhara, in its third winter, gave 48 GWh more. Several older stations gave a little less.</p>

<p>With water plentiful in the south and little fuel being burnt, prices were the lowest of the six winters: Haywards averaged $56/MWh and Benmore $47/MWh, against $133 and $131 last winter and more than $360 in 2024.</p>

<Figure caption="Average wholesale price each winter at the island reference nodes" source="EMI final energy prices">
	<Columns cats={years} series={[{ name: 'Haywards (North Island)', tok: '--p-ni', values: D.price.HAY }, { name: 'Benmore (South Island)', tok: '--p-si', values: D.price.BEN }]}
		unit="$/MWh" height={230} fmt={(v) => `$${v.toFixed(0)}/MWh`} label="Winter" />
</Figure>

<Note title="How these figures are measured">
	<p>Demand and generation are dispatch figures, so they differ slightly from metered figures, such as Transpower's. HVDC figures use the EA's metered flows at Benmore and Haywards. Solar here means dispatched solar farms. Rooftop and other embedded solar isn't included while we refine our estimates of it.</p>
</Note>
