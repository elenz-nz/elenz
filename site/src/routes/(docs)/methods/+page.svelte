<script lang="ts">
	// Data and methods: the overview. How the data flows, the conventions every chart shares, and a card per series.
	import { REPO, SOURCES, TOPICS } from '#lib/methods/registry.js';
</script>

<svelte:head>
	<title>Data and methods · ELENZ</title>
	<meta name="description" content="Where every figure on Elenz comes from, how it is calculated and checked, and what it can't tell you." />
</svelte:head>

<main class="mt-page" aria-labelledby="mt-h">
	<header class="mt-head">
		<p class="mt-kicker"><a href="/about">Elenz</a></p>
		<h1 id="mt-h">Data and methods</h1>
		<p class="mt-lede">Everything on Elenz is built from public data, almost all of it the Electricity Authority’s market data. These pages set out where each figure comes from, how it is calculated, how it has been checked, and what it can’t tell you.</p>
	</header>

	<div class="mt-body">
		<h2 id="flow">How the data flows</h2>
		<p>Three kinds of data, from the newest to the most accurate, are joined into one series on one time axis:</p>
		<ul class="mt-flow">
			<li><b>Live</b><strong>The last 7 days</strong><span>The EA’s real-time dispatch feed, every 5 minutes, a minute or two after each interval. Updated by a job that runs every 5 minutes.</span></li>
			<li><b>Recent</b><strong>The last 5–6 weeks</strong><span>The EA’s daily dispatch files: the same dispatch cases, 1–4 days late. They fill gaps in the live feed.</span></li>
			<li><b>History</b><strong>Back to August 1997</strong><span>Metered data: what each station delivered and each grid point took, half-hourly, as the market settles it. Final prices throughout.</span></li>
		</ul>
		<p>The history job runs every six hours and picks up each month’s metering as the EA publishes it. <a href="/methods/history">History since 1997</a> explains where the sources hand over.</p>

		<h2 id="series">How each series is built</h2>
		<ul class="mt-cards">
			{#each TOPICS as t (t.slug)}
				<li><a href="/methods/{t.slug}"><b>{t.title}{#if t.estimate}<span class="est-tag">Est.</span>{/if}</b><span>{t.summary}</span></a></li>
			{/each}
		</ul>
		<p><a href="/methods/sources">Every data source</a> lists all {SOURCES.length} datasets, with what each is used for, how far back it goes, how soon it is published and its licence.</p>

		<h2 id="conventions">Conventions</h2>
		<dl>
			<dt>Time</dt>
			<dd>New Zealand time, NZST or NZDT as it applies on the day. The market works in half-hour trading periods (TP), numbered from midnight: TP 1 starts at 12:00 am. Dispatch runs every 5 minutes; an interval is labelled by its start.</dd>
			<dt>Units</dt>
			<dd>Power in megawatts (MW), averaged over each interval. Energy in megawatt-hours: GWh (1,000 MWh) and TWh (1,000 GWh). Prices in $/MWh ($100/MWh is 10 c/kWh). Emissions intensity in g CO₂e/kWh.</dd>
			<dt>Regions</dt>
			<dd>New Zealand, the North Island or the South Island. Each island’s figures are its own generation and demand; the HVDC link carries the difference between them.</dd>
			<dt>Estimates</dt>
			<dd>Embedded solar and the live HVDC transfer are modelled, not measured. They are hatched on the charts, marked “est.” in the readouts, and embedded solar has an uncertainty band.</dd>
			<dt>Gaps</dt>
			<dd>About 7–8% of 5-minute intervals have no dispatch case in either the feed or the daily files. They are filled by a straight line between the intervals either side. Longer gaps in a few series (some price nodes, irradiance) are left empty or shown as zero; the method pages say which.</dd>
			<dt>Live, Delayed, History</dt>
			<dd>“Live” means the newest interval is under 15 minutes old; “Delayed” that it is older; “History” that the view is past the live week. The page checks for new data once the next interval is due.</dd>
			<dt>Longer intervals</dt>
			<dd>30-minute, daily, weekly, monthly and yearly figures are averages of the intervals within them, weighted by time. Peaks are the highest single interval or half-hour, not the highest average.</dd>
		</dl>

		<h2 id="code">Corrections and code</h2>
		<p>The EA’s data is used as published, except for a short list of curated corrections: plants not yet in the register, fuels the register has wrong, stations the metered history sees whole, and meters that are shared or net. Each is listed on its method page. The code that builds every figure is public on <a href="https://github.com/elenz-nz/elenz">GitHub</a>, including the corrections (<a href={REPO + 'facilities/overrides.toml'}><code>facilities/overrides.toml</code></a>, <a href={REPO + 'facilities/metered_plants.csv'}><code>facilities/metered_plants.csv</code></a>) and the analysis behind every constant (<a href={REPO + 'analysis/README.md'}><code>analysis/README.md</code></a>).</p>

		<h2 id="credit">Licence and credit</h2>
		<p>Data from <a href="https://www.emi.ea.govt.nz">www.emi.ea.govt.nz</a> provided by the Electricity Authority (New Zealand), under CC BY 4.0. Irradiance: Himawari satellite data (JMA/JAXA) and ERA5 reanalysis (Copernicus) via <a href="https://open-meteo.com">Open-Meteo</a>, CC BY 4.0. Emission factors draw on published figures from Genesis Energy, MBIE, the Ministry for the Environment and the NZ Geothermal Association, cited where they are used. Elenz isn’t affiliated with any organisation, and neither the Electricity Authority nor any other data provider endorses it.</p>

		<p class="note">Spotted something wrong, or a better source? Email <a href="mailto:hello@elenz.co.nz">hello@elenz.co.nz</a>.</p>
	</div>
</main>
