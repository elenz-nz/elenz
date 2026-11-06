<script lang="ts">
	// Data and methods: the overview. How the data joins up, a card per figure, what the status labels mean, the
	// conventions every chart shares, and the glossary that method pages link to.
	import Preview from '#lib/site/Preview.svelte';
	import Handover from '#lib/methods/Handover.svelte';
	import { REPO, REVIEWED, SOURCES, TOPICS, longDate } from '#lib/methods/registry.js';

	const LEDE = 'Where every figure on Elenz comes from, how it is calculated and checked, and what it can’t tell you.';
	const GLOSSARY: [string, string, string][] = [
		['block-dispatch', 'Block dispatch', 'Dispatching a group of stations on one river as a single total. The dispatch figure for one station may not be what it generated.'],
		['capacity-factor', 'Capacity factor', 'A plant’s actual output as a share of what it would produce at full capacity over the same time.'],
		['connection-point', 'Connection point', 'A place where a power station, local network or large user connects to the national grid. EA data identifies each one with a code such as HAY2201.'],
		['dispatch', 'Dispatch', 'The system operator’s instruction to each generating unit on how much to generate. For most plants, dispatch data records these targets. For wind and solar, it records a snapshot of output at the time.'],
		['dispatch-case', 'Dispatch case', 'One run of the market for a 5-minute interval. It sets each generating unit’s output and the price at each node.'],
		['embedded-generation', 'Embedded generation', 'Generation connected to a local network instead of the national grid. Unless it is dispatched, it appears in market data as lower demand.'],
		['final-price', 'Final price', 'The price the market settles on for a trading period. Since 1 November 2022 it has been the time-weighted average of the period’s prices.'],
		['gxp', 'Grid exit point (GXP)', 'A connection point where electricity leaves the national grid for a local network or large user.'],
		['gip', 'Grid injection point (GIP)', 'A connection point where a power station feeds electricity into the national grid.'],
		['hvdc', 'HVDC link', 'The high-voltage direct current connection between Benmore and Haywards, which joins the two islands’ power systems.'],
		['local-network', 'Local network', 'A lines company’s network that takes electricity from the national grid to homes and businesses.'],
		['location-factor', 'Location factor', 'The relationship between a node’s price and its island’s reference price.'],
		['metering', 'Metering', 'The recording of energy delivered at a given point. Metered data is published later than dispatch data, and is what Elenz treats as the record of what happened.'],
		['national-grid', 'National grid', 'Transpower’s high-voltage transmission network, which links large power stations to local networks and major users.'],
		['node', 'Node', 'A point on the national grid where the market sets a price.'],
		['offer', 'Offer', 'A generator’s statement of how much electricity it will supply, and at what price, in a trading period.'],
		['reconciliation', 'Reconciliation data', 'The EA’s monthly record of metered electricity injected and taken off at each grid exit point, by local network, trader and half-hour.'],
		['reference-node', 'Reference node', 'A node chosen to stand for prices across a wider area. Elenz uses Haywards and Benmore, at the two ends of the HVDC link.'],
		['spot-price', 'Spot price', 'The wholesale market price at a node, before lines charges, retail margins and GST.'],
		['system-operator', 'System operator', 'The organisation that runs the power system in real time. Transpower holds this role.'],
		['trader', 'Trader', 'A retailer, generator or purchaser that buys electricity from the market or sells electricity to it.'],
		['trading-period', 'Trading period', 'One of the market’s half-hours, and the market’s own term for one. Trading period 1 starts at midnight, so an ordinary day has 48. Days the clocks change have 46 or 50.'],
		['typical-day', 'Typical day', 'A grid exit point’s or plant’s average output for each half-hour of the day, taken from earlier months. Elenz uses it where the metered figures haven’t been published.'],
		['unclassified', 'Unclassified', 'Other embedded generation whose fuel no public document or registry entry states. It counts in total generation but not as renewable.'],
	];
</script>

<svelte:head>
	<title>Data and methods · ELENZ</title>
	<meta name="description" content={LEDE} />
	<Preview title="Data and methods · ELENZ" description={LEDE} path="/methods" />
</svelte:head>

<main class="mt-page" aria-labelledby="mt-h">
	<header class="mt-head">
		<p class="mt-kicker"><a href="/about">Elenz</a></p>
		<h1 id="mt-h">Data and methods</h1>
		<p class="mt-lede">Elenz is built from public data, most of it the Electricity Authority’s market data. These pages set out where each figure comes from, how it is calculated and checked, and how far it can be relied on.</p>
		<p class="mt-meta"><span>Reviewed against the code on {longDate(REVIEWED)}</span></p>
	</header>

	<div class="mt-body">
		<h2 id="flow">How the data fits together</h2>
		<Handover />
		<p><a href="/methods/history">History since 1997</a> explains how each month is built and where the data has gaps.</p>

		<h2 id="series">How each figure is built</h2>
		<ul class="mt-cards">
			{#each TOPICS as t (t.slug)}
				<li><a href="/methods/{t.slug}"><b>{t.title}{#if t.estimate}<span class="est-tag">Est.</span>{/if}</b><span>{t.summary}</span></a></li>
			{/each}
		</ul>
		<p>The <a href="/methods/sources">source register</a> lists all {SOURCES.length} datasets behind Elenz, then the <a href="/methods/sources#references">reports and references</a> that the method pages cite.</p>

		<h2 id="status">What the status labels mean</h2>
		<p>Every figure on these pages carries one of six labels. A calculated figure takes the weakest label of its inputs. The order, from strongest, is metered or final, then published, then dispatch, then calculated estimate.</p>
		<div class="tbl">
			<table>
				<thead><tr><th>Label</th><th>Meaning</th><th>Examples</th></tr></thead>
				<tbody>
					<tr><td>Metered</td><td>Recorded by a meter and published by the EA.</td><td>Metered generation, grid exports and imports, HVDC flows.</td></tr>
					<tr><td>Dispatch</td><td>A 5-minute figure from the market system, not a meter reading. It is a target for most plants, and a snapshot of output at the time for wind and solar.</td><td>Unit output and island load in the live week, dispatch prices.</td></tr>
					<tr><td>Final price</td><td>The price the market settles on, as published by the EA. It is marked interim until it is confirmed.</td><td>Final energy prices.</td></tr>
					<tr><td>Published</td><td>A figure another organisation reports, which isn’t a meter reading or a market price and which we haven’t worked out.</td><td>Register capacities, generator offers, Genesis’s coal share, the NZ Geothermal Association’s station factors.</td></tr>
					<tr><td>Calculated</td><td>Arithmetic on other figures, with no added assumption.</td><td>Total generation, the island spread, capacity factors.</td></tr>
					<tr><td>Calculated estimate</td><td>A figure that is modelled, fitted, assumed or filled in. Each method page says how it was made and how close it is.</td><td>Embedded solar, other embedded generation, HVDC transfer in the live week, emissions intensity, split meters, interpolated intervals.</td></tr>
				</tbody>
			</table>
		</div>
		<p>Embedded solar and other embedded generation are hatched on the charts and marked “est.” in the readouts. HVDC transfer is also hatched on an island’s chart, in every period.</p>

		<h2 id="conventions">Conventions</h2>
		<dl>
			<dt>Time</dt>
			<dd>New Zealand time, as it applies on the day. The market works in half-hours called trading periods, numbered from midnight. Dispatch runs every 5 minutes, and each interval is labelled by its start.</dd>
			<dt>Units</dt>
			<dd>Power is in megawatts (MW), averaged over each interval. Energy is in megawatt-hours: GWh (1,000 MWh) and TWh (1,000 GWh). Prices are in New Zealand dollars per MWh, and $100/MWh is 10c a kWh. Emissions intensity is in g CO₂e/kWh.</dd>
			<dt>Regions</dt>
			<dd>Figures are shown for New Zealand, the North Island or the South Island. Each island’s figures are its own generation and demand, and the HVDC link carries the difference between them.</dd>
			<dt>Gaps</dt>
			<dd>About 8% of 5-minute intervals have no dispatch case in either the feed or the daily files. We fill each one with a straight line between the intervals either side. We do the same for the rare cases that arrive incomplete, and the Generation tab labels these intervals “interpolated”. Each method page says how its figure treats longer gaps.</dd>
			<dt>Live, Delayed and History</dt>
			<dd>“Live” means the newest interval is under 15 minutes old. “Delayed” means it is older than that. “History” means the view ends before the live week. A page checks for new data once the next interval is due.</dd>
			<dt>Longer intervals</dt>
			<dd>On day, week, month and year intervals, the generation chart shows the energy generated in each interval. Demand, HVDC transfer and prices show the interval’s average, weighted by time. The renewable share and emissions intensity are weighted by generation. A peak is the highest single half-hour or 5-minute interval, not the highest average.</dd>
		</dl>

		<h2 id="glossary">Glossary</h2>
		<p>Method pages explain each market term the first time it matters, and link here for the rest.</p>
		<dl>
			{#each GLOSSARY as [id, term, meaning] (id)}
				<dt {id}>{term}</dt>
				<dd>{meaning}</dd>
			{/each}
		</dl>

		<h2 id="code">Corrections and code</h2>
		<p>We use the EA’s data as published, apart from a short list of corrections. These cover plants not yet in the register, plants we show on a different fuel from the register, stations the metered history sees whole, and meters that are shared or net. Each method page lists the corrections that affect it.</p>
		<p>The code behind every figure is public on <a href="https://github.com/elenz-nz/elenz">GitHub</a>. That includes the corrections (<a href={REPO + 'facilities/overrides.toml'}><code>facilities/overrides.toml</code></a> and <a href={REPO + 'facilities/metered_plants.csv'}><code>facilities/metered_plants.csv</code></a>) and the evidence behind each constant (<a href={REPO + 'analysis/README.md'}><code>analysis/README.md</code></a>).</p>

		<h2 id="credit">Licence and credit</h2>
		<p>Market data comes from <a href="https://www.emi.ea.govt.nz">www.emi.ea.govt.nz</a>, provided by the Electricity Authority (New Zealand) under CC BY 4.0. Irradiance comes from Himawari satellite data (JMA/JAXA) and ERA5 reanalysis (Copernicus) through <a href="https://open-meteo.com">Open-Meteo</a>, also under CC BY 4.0. Emission factors draw on published figures from Genesis Energy, MBIE, the Ministry for the Environment and the NZ Geothermal Association, cited where they are used.</p>
		<p>Elenz isn’t affiliated with any organisation, and neither the Electricity Authority nor any other data provider endorses it.</p>

		<p class="note">Spotted something wrong, or know a better source? Email <a href="mailto:hello@elenz.co.nz">hello@elenz.co.nz</a>.</p>
	</div>
</main>
