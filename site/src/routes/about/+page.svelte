<script lang="ts">
	import Masthead from '#lib/site/Masthead.svelte';
	import SiteFooter from '#lib/site/SiteFooter.svelte';
	import Coffee from '#lib/site/Coffee.svelte';
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
			<p>Elenz shows how New Zealand's electricity system is running: what is generating, by fuel and by plant, the wholesale price in each island, demand, transfer on the HVDC link between the islands, and the emissions intensity of the mix. The live view updates every five minutes from the Electricity Authority's market data, and history goes back to August 1997.</p>
		</section>

		<section aria-labelledby="shows-h">
			<h2 id="shows-h">What the tracker shows</h2>
			<ul>
				<li>Generation stacked by fuel, or grouped by site, hydro scheme, owner, flexibility, renewable vs fossil, or inverter-based vs synchronous; in MW, or with % as each source's share of total generation.</li>
				<li>Wholesale prices at the island reference nodes, Haywards and Benmore.</li>
				<li>Demand, metered at the grid and with embedded solar added back, with the Tiwai Point smelter's load in the summary table.</li>
				<li>HVDC transfer between the islands, emissions intensity and renewable share.</li>
				<li>Any range from the last 24 hours to the whole history since August 1997, for New Zealand or either island.</li>
			</ul>
		</section>

		<section class="support" id="support" aria-labelledby="sup-h">
			<h2 id="sup-h">Support Elenz</h2>
			<p>Elenz is free and has no ads. If you find it useful, a coffee helps keep it running and improving.</p>
			<div><Coffee label="Buy Elenz a coffee" /></div>
		</section>

		<section class="sources" id="sources" aria-labelledby="src-h">
			<h2 id="src-h">Where the data comes from</h2>
			<p>Live series come from the Electricity Authority's EMI real-time dispatch feed, about a minute after each 5-minute dispatch case runs. The EA's daily dispatch files carry the same data and fill any gaps; about 7–8% of 5-minute intervals have no dispatch case in either source, and are filled by interpolation. Most of the history, back to August 1997, comes from the EA's metered data instead: what each station actually delivered, as the market settles it. All of it is published under CC BY 4.0.</p>
			<nav class="m-toc" aria-label="Charts">
				{#each [['m-gen', 'Generation'], ['m-roof', 'Embedded solar'], ['m-price', 'Wholesale price'], ['m-demand', 'Demand'], ['m-hvdc', 'HVDC transfer'], ['m-co2', 'Emissions intensity'], ['m-hist', 'History'], ['m-groups', 'Source groups']] as [id, name]}
					<a href="#{id}">{name}</a>
				{/each}
			</nav>

			<div class="methods">
				<article class="method" id="m-gen">
					<h3>Generation</h3>
					<p class="m-src"><span>Source</span>EMI real-time dispatch: MW per connection point and unit; metered generation in history</p>
					<ul>
						<li>Each unit is mapped to a plant and fuel through the EA plant register (<code>DispatchedGenerationPlant.csv</code>) plus a curated list of newer plant, then summed by plant, fuel and island.</li>
						<li>A few stations are shown as one plant, because the metered history only sees them whole: Huntly's Rankine units, Stratford (Taranaki Combined Cycle and the peakers), Waikaremoana (Tuai, Piripaua and Kaitawa) and Te Mihi. Where dispatch data has them, their units can still be shown one by one.</li>
						<li>Peak generation is the highest 5-minute total (half-hour in history), including embedded solar.</li>
						<li>Huntly's Rankine units are shown as coal/gas, because the market data doesn't say which fuel they burned.</li>
					</ul>
				</article>

				<article class="method" id="m-roof">
					<h3>Embedded solar <span class="est">estimate</span></h3>
					<p class="m-src"><span>Source</span>Modelled from installed capacity and satellite irradiance</p>
					<p>Solar on local distribution networks that isn't dispatched: home and business rooftops, and ground-mounted arrays of up to about 10 MW. Shown hatched because it is an estimate.</p>
					<dl>
						<dt>Capacity</dt>
						<dd>
							<p>The EA's monthly record of installed distributed solar by grid exit point (EMI report GUEHMT): about 1,270 MW in September 2026.</p>
							<p>Less the eleven dispatched solar farms on local networks that it also counts (about 410 MW, shown as grid solar), leaving about 860 MW:</p>
							<ul class="figs">
								<li><b>470 MW</b> systems up to 10 kW</li>
								<li><b>290 MW</b> larger rooftops</li>
								<li><b>100 MW</b> ground-mounted arrays<small>systems added in months when a grid exit point's new systems averaged a megawatt or more</small></li>
							</ul>
							<p>Beyond the latest month, recent growth is carried forward.</p>
						</dd>
						<dt>Sunshine</dt>
						<dd><p>Himawari satellite data (Open-Meteo, every 10 minutes) at 35 points, one per distribution network area, about 45 minutes behind real time. For the last hour, the latest cloudiness is carried forward.</p></dd>
						<dt>Output</dt>
						<dd>
							<p>A photovoltaic model for each type, with panel temperature, inverter limits and losses:</p>
							<ul>
								<li>Rooftops: a mix of orientations and tilts, scaled by 0.95 after checking against the output of dispatched solar farms.</li>
								<li>Ground-mounted arrays: fixed north-facing panels, fitted to the metered output of arrays at Blenheim and Southbrook.</li>
							</ul>
						</dd>
						<dt>Checks</dt>
						<dd>
							<ul>
								<li>Metered exports from embedded systems: daily totals follow the model closely (correlation 0.99), with about half of the output exported.</li>
								<li>Grid exit point load at Blenheim and Southbrook.</li>
							</ul>
						</dd>
						<dt>Uncertainty</dt>
						<dd><p>About ±9% on clear days and ±19% under cloud (one standard deviation), more over the carried-forward last hour. Shown as a band on the demand chart and as ± in the readouts.</p></dd>
					</dl>
				</article>

				<article class="method" id="m-price">
					<h3>Wholesale price</h3>
					<p class="m-src"><span>Source</span>EMI real-time dispatch: nodal prices</p>
					<ul>
						<li>Island reference nodes: Haywards (HAY2201) and Benmore (BEN2201).</li>
						<li>The live week shows dispatch prices. History uses the EA's final prices (<code>FinalEnergyPrices</code>) once published, usually the next day.</li>
						<li>The two can differ a lot: on 9 Aug 2021 dispatch prices averaged over $16,000/MWh at Haywards, against a final average of $360.</li>
						<li>The <a href="/tracker/prices">Prices</a> tab adds Ōtāhuhu (OTA2201), Whakamaru (WKM2201), Islington (ISL2201) and Invercargill (INV2201). Live, these come from the real-time feed's bus rows, so where the week was filled in from the daily dispatch files (which have no bus rows) only Haywards, Benmore and Whakamaru have prices.</li>
						<li>Islands priced apart: Haywards and Benmore more than $10 and 10% apart, usually because the HVDC link or the grid near it is at a limit.</li>
						<li>Price captured by fuel: each fuel's output times its island's reference price, divided by its output, like Open Electricity's volume-weighted price. Batteries count discharge only; embedded solar isn't paid the spot price, so it's left out.</li>
						<li>Long ranges show each day's spread of half-hourly prices: the middle 80% (10th to 90th percentile), lowest and highest, and half-hours over $500 and $1,000. Weeks and months average the daily percentiles and take the lowest and highest half-hour.</li>
					</ul>
				</article>

				<article class="method" id="m-demand">
					<h3>Demand</h3>
					<p class="m-src"><span>Source</span>EMI real-time dispatch: load by connection point; metered grid flows in history</p>
					<ul>
						<li>Grid demand: what leaves the grid for consumers in each island, the dispatch data's island load.</li>
						<li>In metered history, the same thing from the grid meters: energy leaving the grid, less energy entering it at local networks and stations, plus generation. Embedded stations netted off at their grid point are added back, as dispatch counts them. Over 2020–26 this matches the dispatch data's island load within 1–2%. Before October 2000 there is no grid import file, so metered generation stands in for it.</li>
						<li>The dashed line adds embedded solar back.</li>
						<li>The summary table shows the Tiwai Point smelter's load (TWI2201) on its own.</li>
					</ul>
				</article>

				<article class="method" id="m-hvdc">
					<h3>HVDC transfer</h3>
					<p class="m-src"><span>Source</span>Metered (EMI <code>HVDC_Flows</code>) where published, otherwise estimated</p>
					<ul>
						<li>History uses metered flows at Benmore and Haywards, published about two weeks after each month.</li>
						<li>The dispatch feed doesn't include HVDC flow, so the live week and the latest weeks of history are estimated from the balance of generation and load in each island, fitted against the metered flows (mean error about 10 MW).</li>
						<li>The headline figure is the transfer at mid-link. Each island's view shows what leaves Benmore or arrives at Haywards; the difference is link losses (about 60 MW at 1,000 MW).</li>
						<li>Positive is northward.</li>
					</ul>
				</article>

				<article class="method" id="m-co2">
					<h3>Emissions intensity</h3>
					<p class="m-src"><span>Source</span>Calculated from the fuel mix, with factors checked against Genesis's reported emissions</p>
					<p><b>What it means.</b> Emissions intensity is how much greenhouse gas is released for each unit of electricity generated, in grams of CO₂-equivalent per kilowatt-hour (g CO₂e/kWh). A kilowatt-hour is enough to run a 1 kW heater for an hour. CO₂-equivalent counts other greenhouse gases, such as methane, as the amount of CO₂ with the same warming effect.</p>
					<p>Hydro, wind and solar release almost nothing as they generate, so intensity is low when they supply most of the power and rises when gas and coal plants run. Geothermal sits in between, since the steam carries some CO₂ up from underground. Because it is per unit, intensity shows how clean the electricity is at any moment, whether demand is high or low.</p>
					<p>It is the emissions from every generating plant divided by total generation, including estimated embedded solar. Each fuel's output is multiplied by its emission factor, in tonnes of CO₂e per MWh (the same as kg per kWh):</p>
					<ul class="figs wide">
						<li><b>0.6–1.0</b> Huntly Rankines<small>Varies with how much of their fuel was coal. Genesis reports the coal share each quarter (24% in Apr–Jun 2026); the latest is carried forward until the next report. Before July 2020 it comes from MBIE's quarterly generation from coal, less Glenbrook, over the Rankines' metered output: about a quarter coal around 2000, when Huntly burned Maui gas, and mostly coal from 2004 to 2015</small></li>
						<li><b>0.80</b> diesel</li>
						<li><b>0.46</b> gas<small>Average of the gas fleet: Huntly 5 combined cycle about 0.41, peakers and cogeneration about 0.5–0.57. Plants that have closed get their own estimate from typical heat rates: Otahuhu B and Taranaki Combined Cycle 0.40, Southdown and Te Awamutu 0.45, New Plymouth (steam) 0.60, Otahuhu A (open cycle) 0.62</small></li>
						<li><b>0.02–0.30</b> geothermal<small>Each station's own operational emissions by year (NZ Geothermal Association): from about 0.02 at Wairakei to 0.30 at Ōhaaki, and falling as stations reinject CO₂; about 0.05 across the fleet now. The latest published year carries forward until the next; years before 2020 use 2020's, which probably understates them, as reinjection was less common</small></li>
						<li><b>0</b> bioenergy<small>Kinleith (wood waste) and the Kawerau pulp mill's cogeneration (black liquor and wood): biogenic CO₂, counted as zero, as in national inventories. The EA register lists them as gas and geothermal</small></li>
						<li><b>0</b> waste heat<small>Glenbrook's cogeneration runs on waste gas and heat from NZ Steel's ironmaking, not pipeline gas. Its emissions are counted with the ironmaking (industrial processes), so the electricity counts as zero</small></li>
					</ul>
					<dl>
						<dt>How</dt>
						<dd><p>Gas 54.1 kg CO₂e/GJ (the Ministry for the Environment's factor for natural gas); coal 91.8, fitted to Genesis's quarterly fuel use and emissions. The Rankines use about 11.2 GJ of fuel per MWh, from Genesis's coal burned per coal-fired MWh.</p></dd>
						<dt>Check</dt>
						<dd><p>Applied to the dispatch data, these reproduce Genesis's reported Huntly emissions to within about 5% in most quarters since 2020, and 0.4% over the whole period. The dispatch data's Rankine output matches Genesis's reported Rankine output within 1–2% each quarter.</p></dd>
					</dl>
				</article>

				<article class="method" id="m-hist">
					<h3>History</h3>
					<p class="m-src"><span>Source</span>EMI metered data from August 1997; daily dispatch files from 10 Sep 2020; final prices from <code>FinalEnergyPrices</code></p>
					<ul>
						<li>Every month the EA has published metering for (about five to six weeks after it ends) uses metered generation: <code>Generation_MD</code>, half-hourly by station, and <code>Embedded_generation</code> for stations on local networks. Grid flows (<code>Grid_export</code>, <code>Grid_import</code>), the Tiwai smelter and the HVDC link are metered too.</li>
						<li>The weeks since come from the daily dispatch files (the same cases as the live feed, 1–4 days late), and the live week from the real-time feed.</li>
						<li>Metered and dispatch figures differ a little. Over September 2020 to September 2026, dispatch totals ran 1–2% above metered ones (wind about 3.5%, hydro 1–2%), probably because dispatch measures output at the generator and metering at the grid connection. So where the history switches from metered to dispatch data, about six weeks back, totals can step up slightly.</li>
						<li>Where the metering lacks a plant (batteries, solar farms not in it yet), its dispatch figures are used.</li>
						<li>Some meters see more than one plant: Deep Stream hydro and Mahinerangi wind share one, split 30/70 by their shares in the dispatch data. Where a grid-point meter is net of local load (Mangahao, Cobb), the embedded meter's gross figure is used where it exists.</li>
						<li>The 30-day view shows half-hours; longer ranges show daily averages, keeping each day's highest half-hour for peak demand and peak generation.</li>
						<li>Embedded solar uses the same model with each month's installed capacity: none before the registry starts in August 2013 (there was little); ERA5 reanalysis sunshine for 2013–15, before the satellite archive; the satellite from 2016.</li>
						<li>Prices are the EA's final prices throughout. HVDC is metered wherever published.</li>
					</ul>
				</article>

				<article class="method" id="m-groups">
					<h3>Source groups</h3>
					<p class="m-src"><span>Source</span>Grouped from the fuel mix</p>
					<dl>
						<dt>Renewable vs fossil</dt>
						<dd><p>Renewables are geothermal, bioenergy, hydro, wind and solar (grid and embedded). Fossils are coal/gas Rankine, gas, diesel and waste heat (Glenbrook, on NZ Steel's ironmaking gases).</p></dd>
						<dt>Flexibility</dt>
						<dd><p>Inflexible: geothermal, and the industrial cogeneration (bioenergy and waste heat). Slow flexible: Huntly's Rankine units. Fast flexible: gas, diesel and hydro. Variable: wind and solar. Grouping is by fuel, so gas cogeneration plant counts as fast flexible.</p></dd>
						<dt>Inverter-based</dt>
						<dd><p>Wind and solar, against the synchronous machines (hydro, geothermal and thermal).</p></dd>
						<dt>By site</dt>
						<dd><p>The plants making up 95% of each fuel (at most 12 per fuel); the rest are grouped as "Other".</p></dd>
						<dt>By hydro scheme</dt>
						<dd><p>Hydro only, grouped by river system (Tekapo, Waitaki, Waikato, Clutha and so on).</p></dd>
						<dt>By owner</dt>
						<dd><p>Each plant's operator in the EA register, with Manawa Energy counted as Contact (acquired July 2025). Current owners apply to all history.</p></dd>
					</dl>
					<p>Batteries and HVDC are always shown separately, because they can charge or export.</p>
				</article>
			</div>
		</section>
	</main>

	<SiteFooter />
</div>
