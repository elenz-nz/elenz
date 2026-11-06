<script lang="ts">
	import { REPO, ref } from '../registry.js';
	import Calculations from '../Calculations.svelte';
	import DataSources from '../DataSources.svelte';
	import GoodFor from '../GoodFor.svelte';
	import References from '../References.svelte';
</script>

<aside class="mt-caveats" aria-label="Key caveats">
	<p class="k">Key caveats</p>
	<ul>
		<li>The renewable share includes embedded solar and other embedded generation, both calculated estimates, and excludes battery discharge. It can differ from official figures such as MBIE’s.</li>
		<li>Other embedded generation starts in January 2009. Its unclassified output counts in the total but not as renewable.</li>
		<li>The By owner view applies today’s owners to the whole history, so earlier sales and transfers aren’t shown.</li>
	</ul>
	<p><a href="#limitations">Accuracy and limitations</a> has the detail.</p>
</aside>

<h2 id="introduction">Introduction</h2>
<p>The renewable share is the part of generation that comes from renewable sources, as a percentage. It appears on the Tracker’s charts and on the Now page.</p>
<p>A grouping is a different way of stacking the same generation chart. The groupings show generation by fuel, by flexibility, by connection type, by site, by hydro scheme and by owner. They don’t change the total.</p>

<h2 id="data-sources">Data sources</h2>
<p>The renewable share and the groupings use the generation data described on the <a href="/methods/generation#data-sources">Generation page</a>. These datasets decide where each plant goes.</p>
<DataSources slug="groupings" />

<h2 id="how-it-works">How it works</h2>

<h3 id="renewable">Renewable share</h3>
<p>We divide renewable generation by total generation, leaving battery discharge out of the total. Over a range, the share is weighted by generation.</p>
<div class="tbl">
	<table>
		<thead><tr><th>How it counts</th><th>Sources</th></tr></thead>
		<tbody>
			<tr><td>Renewable</td><td>Geothermal, bioenergy, hydro, wind, grid solar, embedded solar, and the hydro, geothermal, wind and landfill gas in other embedded generation.</td></tr>
			<tr><td>In the total, not renewable</td><td>Huntly’s coal/gas Rankine units, gas, diesel, waste heat at Glenbrook, and the gas, diesel and unclassified output in other embedded generation.</td></tr>
			<tr><td>Outside the share</td><td>Battery discharge, and the HVDC link, which isn’t generation.</td></tr>
		</tbody>
	</table>
</div>
<p>Batteries store energy and don’t make it. We leave their discharge out, <a href={ref('em6')}>as em6 does</a>, because that energy was counted when it was generated.</p>
<p>Geothermal counts as renewable although it emits some CO₂, about 0.05 t CO₂e/MWh across the fleet (see <a href="/methods/emissions#geothermal">Emissions intensity</a>). Glenbrook has no emissions of its own on Elenz but isn’t renewable, because its fuel is the off-gas of coal-fed ironmaking.</p>
<Calculations>
	<p class="formula">Renewable share = 100 × renewable generation ÷ (total generation − battery discharge)</p>
	<div class="tbl">
		<table>
			<thead><tr><th>Term</th><th>Meaning</th><th>Unit</th></tr></thead>
			<tbody>
				<tr><td>Renewable generation</td><td>The sources counted as renewable above</td><td>MW</td></tr>
				<tr><td>Total generation</td><td>The sum of every source, as on the <a href="/methods/generation#totals">Generation page</a></td><td>MW</td></tr>
				<tr><td>Battery discharge</td><td>Battery output while discharging</td><td>MW</td></tr>
			</tbody>
		</table>
	</div>
	<p class="k">Worked example</p>
	<p>These figures are illustrative. Hydro is 3,000 MW, geothermal 1,000 MW, wind 500 MW, gas 400 MW and batteries 50 MW. Other embedded generation is 120 MW, of which 100 MW is renewable.</p>
	<p>Renewable generation is 3,000 + 1,000 + 500 + 100 = 4,600 MW. Total generation is 5,070 MW, or 5,020 MW without battery discharge. The share is 100 × 4,600 ÷ 5,020 = 91.6%.</p>
</Calculations>

<h3 id="groupings">Grouping the generation chart</h3>
<p>The HVDC link is always a layer of its own, because it can be negative. Batteries are a layer of their own in Detailed, Simplified and Renewable vs fossil. In Flexibility, Inverter vs synchronous and By owner, their discharge counts in its group, and their charging is one layer below zero.</p>
<dl>
	<dt>Detailed</dt>
	<dd>Every fuel on its own, with other embedded generation as its own layer.</dd>
	<dt>Simplified</dt>
	<dd>Six groups: geothermal, hydro, wind, solar (grid and embedded together), other embedded generation, and thermal. Thermal covers Huntly’s coal/gas Rankine units, gas, diesel, bioenergy and waste heat.</dd>
	<dt>Renewable vs fossil</dt>
	<dd>The sources are divided as they are for the renewable share, and waste heat sits with the fossil fuels. Other embedded generation is its own group, because it is part renewable and part unclassified.</dd>
	<dt>Flexibility</dt>
	<dd>
		<p>This groups fuels by how readily their output can follow demand.</p>
		<ul>
			<li><b>Inflexible:</b> geothermal, which runs flat out around the clock, industrial cogeneration (bioenergy and waste heat), which follows its mill or steelworks, and other embedded generation.</li>
			<li><b>Slow flexible:</b> Huntly’s Rankine units, which take hours to start and ramp slowly.</li>
			<li><b>Fast flexible:</b> hydro, gas, diesel and battery discharge.</li>
			<li><b>Variable:</b> wind and solar, which follow the weather.</li>
		</ul>
		<p>Grouping is by fuel, so gas cogeneration counts as fast flexible.</p>
	</dd>
	<dt>Inverter vs synchronous</dt>
	<dd>Inverter-based generation is wind, solar and battery discharge, connected through power electronics. Synchronous generation is hydro, geothermal and thermal plant, including bioenergy and waste heat, whose spinning generators add inertia and system strength. Other embedded generation sits here too, because it is mostly small hydro.</dd>
	<dt>By site</dt>
	<dd>Every plant has a layer of its own, batteries included. Embedded solar and other embedded generation each have one row per island. Plants are listed largest first by installed capacity, so the order stays the same whatever the range.</dd>
	<dt>By hydro scheme</dt>
	<dd>
		<p>Hydro only, by river system, each listed upstream to downstream.</p>
		<ul>
			<li>Tekapo: Tekapo A and B</li>
			<li>Waitaki: Ōhau A, B and C, Benmore, Aviemore and Waitaki</li>
			<li>Waikato: Aratiatia to Karāpiro, eight stations</li>
			<li>Manapōuri</li>
			<li>Clutha: Clyde and Roxburgh</li>
			<li>Tongariro: Tokaanu and Rangipo</li>
			<li>Waikaremoana</li>
			<li>Rangitaiki: Aniwhenua, Wheao and Flaxy, and Matahina</li>
			<li>Waipori: Deep Stream and Waipori 2A, 3 and 4</li>
			<li>Other hydro</li>
		</ul>
	</dd>
	<dt>By owner</dt>
	<dd>
		<p>Each plant’s operator in the Electricity Authority’s register, grouped as Meridian, Contact, Mercury, Genesis, Nova and other generators. Batteries count with their owner. Other embedded generation has one row per island.</p>
		<p>Contact includes Manawa Energy, formerly Trustpower, which it <a href={ref('manawa')}>took over in July 2025</a>. Mercury includes Ngā Awa Pūrua, which it operates. We set the owner by hand for plants the register doesn’t list, and for plants seen only in the metered history. We also set it for Kinleith: the register’s operator is Manawa, but Oji Fibre Solutions owns it, so it counts under other generators.</p>
	</dd>
</dl>
<p>When a fuel or group is opened, other embedded generation shows one row per island, like embedded solar. The lists of owners and hydro schemes are in <a href={REPO + 'facilities/overrides.toml'}><code>facilities/overrides.toml</code></a>.</p>

<h2 id="interpretation">How to interpret it</h2>
<p>A high renewable share usually means plenty of hydro or wind, and little thermal generation running. It says nothing about how much electricity is being used. A low share often comes with dry years, calm spells or winter peaks.</p>
<p>Inverter-based generation gives a view of how much of the system runs through power electronics. Flexibility gives a view of what could follow demand, though it goes by fuel and not by what each plant was doing.</p>
<GoodFor rows={[
	{ use: 'Renewable share over a month or year', level: 'good', verdict: 'The metered history covers most of the figure, and the estimated parts are small.' },
	{ use: 'Renewable share at one half-hour', level: 'ok', verdict: 'Embedded solar and other embedded generation are calculated estimates in that half-hour.' },
	{ use: 'Comparing the share with MBIE’s annual figure', level: 'care', verdict: 'MBIE counts plants that aren’t in the market data, so the two can differ.' },
	{ use: 'Who owned a plant in an earlier year', level: 'no', verdict: 'Today’s owners apply to the whole history.' },
]} />

<h2 id="limitations">Accuracy and limitations</h2>
<div class="tbl">
	<table>
		<thead><tr><th>Figure</th><th>Status</th><th>Typical accuracy</th></tr></thead>
		<tbody>
			<tr><td>Renewable share, August 1997 to December 2008</td><td>Calculated</td><td>Arithmetic on metered generation, and leaves out plants on local networks that Elenz doesn’t show later</td></tr>
			<tr><td>Renewable share, from January 2009</td><td>Calculated estimate</td><td>On a year’s figure, other embedded generation moves the share by 0.1 percentage points or less. Unclassified output counts as not renewable.</td></tr>
			<tr><td>Groupings by fuel</td><td>Calculated</td><td>Each plant’s fuel comes from the register, with the corrections on the <a href="/methods/generation#mapping">Generation page</a></td></tr>
			<tr><td>Fuel within other embedded generation</td><td>Calculated estimate</td><td>Stated where a public document gives the fuel, and otherwise taken from the registry</td></tr>
		</tbody>
	</table>
</div>
<p class="note">Official figures, such as MBIE’s, count renewable generation over a year and include plants that aren’t in the market data, so they can differ from the share on Elenz.</p>

<h2 id="coverage">Historical coverage</h2>
<p>The groupings cover the whole history. Other embedded generation appears in them from January 2009, and embedded solar from August 2013.</p>
<p>Today’s owners apply to every year, including to plants sold since. Kawerau (Onepu) counts as geothermal from January 2013.</p>

<h2 id="references">References</h2>
<References slug="groupings" />
