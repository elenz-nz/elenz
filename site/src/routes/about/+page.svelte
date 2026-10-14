<script lang="ts">
	import Masthead from '#lib/site/Masthead.svelte';
	import SiteFooter from '#lib/site/SiteFooter.svelte';
</script>

<svelte:head>
	<title>About · ELENZ</title>
	<meta name="description" content="What Elenz shows, and where its New Zealand electricity data comes from." />
</svelte:head>

<div class="wrap">
	<Masthead />

	<main class="about">
		<section>
			<h1>About Elenz</h1>
			<p>Elenz shows how New Zealand's electricity system is running: what is generating, by fuel and by plant, the wholesale price in each island, demand, transfer on the HVDC link between the islands, and the emissions intensity of the mix. The live view updates every five minutes from the Electricity Authority's market data, and history goes back to September 2020.</p>
		</section>

		<section aria-labelledby="shows-h">
			<h2 id="shows-h">What the tracker shows</h2>
			<ul>
				<li>Generation stacked by fuel, or grouped by site, hydro scheme, owner, flexibility, renewable vs fossil, or inverter-based vs synchronous.</li>
				<li>Wholesale prices at the island reference nodes, Haywards and Benmore.</li>
				<li>Demand, metered at the grid and with embedded solar added back, and the Tiwai Point smelter's share.</li>
				<li>HVDC transfer between the islands, emissions intensity and renewable share.</li>
				<li>Any range from the last 24 hours to the whole history since 2020, for New Zealand or either island.</li>
			</ul>
		</section>

		<section class="sources" id="sources" aria-labelledby="src-h">
			<h2 id="src-h">Where the data comes from</h2>
			<p>Live series come from the Electricity Authority's EMI real-time dispatch feed, about a minute after each 5-minute dispatch case runs. The EA's daily dispatch files carry the same data, fill any gaps, and provide the history back to September 2020. Both are published under CC BY 4.0.</p>
			<div class="tbl-wrap">
				<table class="src">
					<thead><tr><th scope="col">Chart</th><th scope="col">Source</th><th scope="col">How it's built</th></tr></thead>
					<tbody>
						<tr><td>Generation</td><td>EMI real-time dispatch: MW per connection point and unit</td><td>Each unit mapped to a plant and fuel through the EA plant register (<code>DispatchedGenerationPlant.csv</code>) plus a curated list of newer plant, then summed by plant, fuel and island. Peak generation is the highest 5-minute total (half-hour in history), including embedded solar. Huntly's Rankine units are shown as coal/gas, because the market data doesn't say which fuel they burned</td></tr>
						<tr><td>Embedded solar</td><td>Modelled from installed capacity and satellite irradiance</td><td>Solar on local distribution networks that isn't dispatched: home and business rooftops, and ground-mounted arrays of up to about 10 MW. Capacity: the EA's monthly record of installed distributed solar by grid exit point (EMI report GUEHMT: about 1,270 MW in September 2026), less the eleven dispatched solar farms on local networks that it also counts (about 410 MW, shown as grid solar), so about 860 MW: 470 MW of systems up to 10 kW, about 290 MW of larger rooftops and about 100 MW of ground-mounted arrays (systems added in months when a grid exit point's new systems averaged a megawatt or more). Beyond the latest month, recent growth is carried forward. Irradiance: Himawari satellite data (Open-Meteo, 10-minute) at 35 points, one per distribution network area, about 45 minutes behind real time; for the last hour the latest cloudiness is carried forward. Output: a photovoltaic model for each type: rooftops with a mix of orientations and tilts, scaled by 0.95 after checking against the output of dispatched solar farms; ground-mounted arrays as fixed north-facing panels, fitted to the metered output of arrays at Blenheim and Southbrook; with panel temperature, inverter limits and losses. Checked against metered exports from embedded systems (daily totals agree in pattern to within a correlation of 0.99; about half of the output is exported) and against grid exit point load at Blenheim and Southbrook. Uncertainty, shown as a band on the demand chart and as ± in the readouts: about ±9% on clear days and ±19% under cloud (one standard deviation), more over the carried-forward last hour. Shown hatched because it is an estimate</td></tr>
						<tr><td>Wholesale price</td><td>EMI real-time dispatch: nodal prices</td><td>Island reference nodes Haywards (HAY2201) and Benmore (BEN2201). The live week shows dispatch prices; history uses the EA's final prices (<code>FinalEnergyPrices</code>) once published, usually the next day. Dispatch prices can differ a lot: on 9 Aug 2021 they averaged over $16,000/MWh at Haywards against a final average of $360</td></tr>
						<tr><td>Demand</td><td>EMI real-time dispatch: load by connection point</td><td>Metered grid demand. Embedded solar is added back for the dashed line. Tiwai is the Tiwai Point smelter (TWI2201)</td></tr>
						<tr><td>HVDC transfer</td><td>Metered (EMI <code>HVDC_Flows</code>) where published, otherwise estimated</td><td>History uses metered flows at Benmore and Haywards, published about two weeks after each month. The live week and the latest weeks of history are estimated from the balance of generation and load in each island, fitted against the metered flows (mean error about 10 MW), since the dispatch feed doesn't include HVDC flow. The headline figure is the transfer at mid-link; each island's view shows what leaves Benmore or arrives at Haywards, the difference being link losses (about 60 MW at 1,000 MW). Positive is northward</td></tr>
						<tr><td>Emissions intensity</td><td>Calculated</td><td>Fuel mix × emission factors. Provisional factors: coal/gas Rankine 0.95, gas 0.50, diesel 0.80, geothermal 0.07 t CO₂e/MWh</td></tr>
						<tr><td>History</td><td>EMI daily dispatch files (<code>NodalPricesAndVolumes</code>), from 10 Sep 2020; final prices from <code>FinalEnergyPrices</code></td><td>The same dispatch cases as the live feed, published 1–4 days late. Each trading period is the average of its 5-minute intervals; the 30-day view shows half-hours, longer ranges daily averages, with each day's highest half-hour kept for peak demand and peak generation. The live week fills in the latest days. Embedded solar uses the same model with each month's installed capacity (about 140 MW in September 2020) and the satellite archive. HVDC is metered wherever published</td></tr>
						<tr><td>Source groups</td><td>Grouped from the fuel mix</td><td>Thermal and fossils are coal/gas Rankine, gas and diesel. Renewables are geothermal, hydro, wind and solar (grid and embedded). Flexibility: inflexible is geothermal, slow flexible is Huntly's Rankine units, fast flexible is gas, diesel and hydro, and variable is wind and solar. Inverter-based vs synchronous splits wind and solar from the synchronous machines (hydro, geothermal and thermal). By site shows the plants making up 95% of each fuel (at most 12 per fuel) and groups the rest as "Other". By hydro scheme shows hydro only, grouped by river system (Tekapo, Waitaki, Waikato, Clutha and so on). By owner uses each plant's operator in the EA register, with Manawa Energy counted as Contact (acquired July 2025); current owners apply to all history. Batteries and HVDC are always shown separately, because they can charge or export. Grouping is by fuel, so gas cogeneration plant counts as fast flexible</td></tr>
					</tbody>
				</table>
			</div>
		</section>
	</main>

	<SiteFooter />
</div>
