<script lang="ts">
	// The image credits and the counts are read from credits.json (ingest/plant_pages.py), so they stay in step with
	// the pages.
	import { REPO } from '../registry.js';
	import Calculations from '../Calculations.svelte';
	import DataSources from '../DataSources.svelte';
	import GoodFor from '../GoodFor.svelte';
	import References from '../References.svelte';
	import CREDITS from '#lib/plants/credits.json';

	const { summary, photos, imagery } = CREDITS;
	const n = (v: number) => v.toLocaleString('en-NZ');
</script>

<aside class="mt-caveats" aria-label="Key caveats">
	<p class="k">Key caveats</p>
	<ul>
		<li>A page shows only the facts we have checked against a source, so a missing row means not checked yet, not that the fact doesn’t apply. {summary.reviewed} of {summary.pages} pages have been checked in full.</li>
		<li>Installed MW is Elenz’s figure from its capacity table. An owner’s or another source’s rating can differ, and the page lists it as another rating with its basis.</li>
		<li>Output in recent weeks is dispatch data, which can differ from what a plant generated.</li>
	</ul>
	<p><a href="#limitations">Accuracy and limitations</a> has the detail.</p>
</aside>

<h2 id="introduction">Introduction</h2>
<p>Every plant the tracker shows has its own page at <a href="/plants">/plants</a>. Each page puts two things side by side. The first is a short set of facts about the plant, such as when it was commissioned, who owns it and where it is, each with a numbered source. The second is Elenz’s own figures for the plant: its output now, its output by year and month since 1997, and its installed capacity over time.</p>
<p>The facts come from public documents we have read and checked. The figures come from the Electricity Authority’s (EA’s) data, built the same way as everywhere else on Elenz.</p>

<h2 id="data-sources">Data sources</h2>
<p>The facts come from a file Elenz keeps for each plant, which cites a public source for every fact it publishes. The output figures use the same data as the Generation tab. Recent figures come from dispatch data. Elenz replaces them with metered data as the Electricity Authority publishes each month, and <a href="/methods/history#layers">History since 1997</a> explains how the layers fit together.</p>
<DataSources slug="plants" />

<h2 id="how-it-works">How it works</h2>

<h3 id="page">What a page shows</h3>
<p>The header gives the plant’s name, its fuel, island, owner, status and installed MW. These come from Elenz’s data, so they match the tracker. The owner is the plant’s group in the tracker’s By owner view (<a href="/methods/groupings#groupings">Renewable share and groupings</a>). Where a source names the owner, the Facts list shows that owner.</p>
<p>Below the header sit the Now panel, a picture panel with photos and the plant’s location, and the charts. The side column holds the Facts list. The Sources list at the foot of the page numbers every source the facts cite, with the date we last read it. Related links lead to the other stations on the same hydro scheme, the owner’s other plants and the largest other plants of the same fuel on the same island.</p>

<h3 id="facts">Facts and their sources</h3>
<p>Each plant has one file in <a href={REPO + 'facilities/plants'}><code>facilities/plants/</code></a>. A file can hold these facts: other names, commissioned, closed, units, hydro scheme, geothermal field, river or lake, region, district, owner, previous owners, grid connection, other capacity ratings, the stations that make up the plant, and a short About text. Each fact holds a value, the source it comes from, a grade for that source and the date a person checked it. What other sources say is kept beside it for comparison, and never shown.</p>
<p id="grades">The grade says what kind of source a fact rests on:</p>
<div class="tbl">
	<table>
		<thead><tr><th>Grade</th><th>Source</th><th>Shown on the page</th></tr></thead>
		<tbody>
			<tr><td>A</td><td>The plant’s owner or an official document, such as the EA’s registers, an owner’s annual report or the New Zealand Gazette.</td><td>Yes, once checked.</td></tr>
			<tr><td>B</td><td>A good secondary source, such as a Wikipedia article with a reference or Engineering New Zealand’s heritage records.</td><td>Yes, once checked.</td></tr>
			<tr><td>C</td><td>A lead only, including anything only our own research notes say.</td><td>No. It stays in the plant file until a better source confirms it.</td></tr>
		</tbody>
	</table>
</div>
<p id="checking">A fact is shown only when a person has opened its source, confirmed the value and dated the check, its grade is A or B, and every source it cites is public, with a title, an address and the date we opened it. Our checks test these rules for every plant on every change, and a change that breaks one can’t go live, so an unchecked fact can’t reach the site. Where sources disagree, the page shows the best-graded value. A fact with no checked value is left off the page rather than shown blank. The grades themselves stay in the plant files, and the page shows the numbered sources instead.</p>
<p>A page we haven’t checked in full says so at the top, and its Facts list ends “More facts appear here once they’re checked.” A checked page gives the newest date any of its facts was checked. The About text is two to four sentences in our own words, written from the sources the page cites.</p>
<p>The steps we follow to check a plant are in <a href={REPO + 'facilities/PLANTS.md'}><code>facilities/PLANTS.md</code></a>. We never use what someone knows from their own work as a source. Every fact rests on a public document or the EA’s data.</p>

<h3 id="dates">Commissioned and closed dates</h3>
<p>Commissioned is a year unless a source gives the day. The EA register’s 1 January dates count as years. Which date we use depends on the plant:</p>
<ul>
	<li>A plant metered from its start uses its first metered output: the first day the EA’s metered generation records at least 1 MWh from it. Smaller readings days or months earlier are meter tests or the station’s own supply, not output.</li>
	<li>A plant commissioned before August 1997, one that ran for a time before it was metered, or one that was never metered, uses its owner’s commissioning date.</li>
	<li>A plant whose meter started after the plant did uses its owner’s date. So does a plant that shares a meter with another, or has no meter reading of its own.</li>
</ul>
<p>Other dates, such as an owner’s opening ceremony or a “fully commissioned” announcement, go in the fact’s ⓘ note. These dates are for the Facts list only. The installed capacity chart keeps the dates in the capacity table.</p>

<h3 id="capacity">Installed capacity and other ratings</h3>
<p>The installed MW on every page is Elenz’s figure from its capacity table, the same figure the tracker uses for capacity factors. <a href="/methods/capacity#table">Installed capacity</a> explains how each row is chosen and sourced. The installed capacity chart shows each change since 1997, with each step’s source in its ⓘ note.</p>
<p>Sources often give other figures for the same plant. A solar farm can be rated in MWp, the panels’ peak output, or in MWac, what its inverters can send out. Other figures include the EA register’s nameplate, an owner’s maximum capacity, and the total of a plant’s units or turbines. The page lists these as other ratings, each with its basis and source, and keeps Elenz’s figure as the headline.</p>

<h3 id="locations">Locations</h3>
<p>Each plant’s point is on the station itself: the powerhouse, the turbines, the panels or the plant buildings, not its switchyard. Every point was read from <a href="/methods/sources#linz-basemaps">LINZ aerial imagery</a>, or taken from a public source and confirmed on it. A plant made of several stations far apart gives each station its own point, with the plant’s point on the largest. Where its stations sit together, one point covers the whole site, and the page says which.</p>
<p>The grid connection is the code and name of the connection point the plant uses, from the EA’s network supply points table. Its point on the aerial is the substation. Region and district come from testing the station’s point against <a href="/methods/sources#statsnz-boundaries">Stats NZ’s boundaries</a>, and we check that the grid connection point gives the same answer.</p>
<p>OpenStreetMap is useful for finding a station, but its data is under a licence that doesn’t suit ours, so no point or value on the pages comes from it.</p>

<h3 id="images">Photos and aerial views</h3>
<p>Every page has a LINZ aerial view of its site, centred on its checked point and credited with the imagery collection it comes from. A plant made of several stations has a view of each station with its own point. The Map view shows the same point on LINZ’s topographic basemap.</p>
<p>A photo appears only once we have read its licence on the file’s own page. We use photos under CC BY, CC BY-SA or CC0, or in the public domain. We don’t use NonCommercial or NoDerivatives licences, because we resize and crop every photo. An owner’s photos appear only with the owner’s written permission. Photos taken by the Elenz team are credited “Elenz team” and published under CC BY 4.0, like the rest of Elenz. Photos people send through <a href="/plants/share">Share what you know</a> need the sender’s copyright and their agreement to publish under CC BY 4.0. We never present an AI-made picture as a photo.</p>
<p>Each photo is credited under it with its author, a link to its source and its licence. Photos under CC BY-SA keep that licence when we resize them, and the credit says so. Every credit is also listed under Image credits.</p>

<h3 id="credits">Image credits</h3>
<p>{summary.with_photo} of the {summary.pages} plant pages have a photo. The list gives all {summary.photos} photos, by plant.</p>
<details class="calc">
	<summary>
		<svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="m3 6 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
		<span class="to-show">Show the photo credits</span><span class="to-hide">Hide the photo credits</span>
	</summary>
	<div class="calc-body tbl credits">
		<table>
			<thead><tr><th>Plant</th><th>Photo</th><th>Author</th><th>Licence</th></tr></thead>
			<tbody>
				{#each photos as p, i (i)}
					<tr>
						<td><a href="/plants/{p.slug}">{p.name}</a></td>
						<td><a href={p.source_url} target="_blank" rel="noopener">{p.title}</a></td>
						<td>{p.author}</td>
						<td>{#if p.licence_url}<a href={p.licence_url} target="_blank" rel="noopener">{p.licence}</a>{:else}{p.licence}{/if}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</details>
<p>The aerial views come from these {imagery.length} LINZ imagery collections, each credited Toitū Te Whenua LINZ, CC BY 4.0.</p>
<details class="calc">
	<summary>
		<svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="m3 6 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
		<span class="to-show">Show the imagery collections</span><span class="to-hide">Hide the imagery collections</span>
	</summary>
	<div class="calc-body tbl">
		<table>
			<thead><tr><th>Imagery collection</th><th>Plant pages using it</th></tr></thead>
			<tbody>
				{#each imagery as c (c.collection)}
					<tr><td>{c.collection}</td><td>{n(c.pages)}</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
</details>

<h3 id="output">Output and capacity factor</h3>
<p>The Now panel shows the plant’s output in the newest 5-minute interval and over the last 7 days, as Now’s “Every generator right now” does. <a href="/methods/generation">Generation</a> explains how each unit’s output is matched to its plant. A closed plant has no Now panel.</p>
<p>The charts below use each plant’s output by month since August 1997, or since its first month of output. Metered months come from the metered history, and the newest months from dispatch data until the meters are published. Generation by year shows each calendar year’s energy, and a year with fewer than 12 whole months of the plant’s data is hatched as a part year. The last 24 months shows each whole month. The figures above them give the latest 12 whole months and the most in any calendar year in our records. A closed plant shows its total, its best year and its last month instead.</p>
<p>A plant’s capacity factor is its output as a share of what its installed capacity could have produced running at full output over the same months. Capacity is taken month by month from the capacity table, so a change partway through the history counts only from its date. Hours follow the New Zealand clock, so a month with a clock change has 743 or 745 hours.</p>
<Calculations>
	<p class="formula">Capacity factor = energy generated ÷ (installed MW × hours)</p>
	<div class="tbl">
		<table>
			<thead><tr><th>Term</th><th>Meaning</th><th>Unit</th></tr></thead>
			<tbody>
				<tr><td>Energy generated</td><td>The plant’s output over the months counted. For a battery, discharge only.</td><td>MWh</td></tr>
				<tr><td>Installed MW</td><td>The plant’s installed capacity in each month, from the capacity table</td><td>MW</td></tr>
				<tr><td>Hours</td><td>The hours in each month by the New Zealand clock</td><td>h</td></tr>
			</tbody>
		</table>
	</div>
	<p class="k">Worked example</p>
	<p>These figures are illustrative. A 50 MW plant generates 18,000 MWh in a 30-day month without a clock change, which has 720 hours. At full output it would have produced 50 × 720 = 36,000 MWh. Its capacity factor is 18,000 ÷ 36,000 = 50%. Over several months, the energy and the MW × hours are each added up before dividing.</p>
</Calculations>
<p>Where the metered history counts a plant differently from the dispatch data, a note under the generation chart says how.</p>

<h3 id="plant-notes">Plant notes</h3>
<ul>
	<li>Kawerau (Onepu) has no commissioned date, because one meter covers several stations commissioned at different times. Its Units fact names the stations.</li>
	<li>Kawerau (TOPP2) shares a meter with Te Ahi O Māui, and the Glenbrook-Ohurua and Huntly batteries, Taiohi and Twin Rivers have no meter reading of their own, so each uses its owner’s commissioned date.</li>
	<li>Kōwhai Park, Clandeboye and Kaiwaikawe read zero in metered generation. Kōwhai Park’s commissioned date is its first output on the embedded generation meter. The other two give the year their sources say they started.</li>
</ul>

<h2 id="interpretation">How to interpret it</h2>
<p>The facts describe the plant as its sources do, on the date we checked them. A fact can go out of date when a plant is sold, upgraded or closed, so each source shows when we last read it. The figures describe what Elenz’s data records, which starts in August 1997, so a station’s earlier output isn’t in them.</p>
<p>A low capacity factor isn’t a fault. Peaking plants run when they are needed, hydro follows the water, and wind and solar follow the weather. Comparing one plant with others of its fuel says more than its figure alone.</p>
<GoodFor rows={[
	{ use: 'A plant’s installed capacity', level: 'good', verdict: 'From the capacity table, which names a source for every row.' },
	{ use: 'Where a station is', level: 'good', verdict: 'Every point shown was read from LINZ aerial imagery or confirmed on it.' },
	{ use: 'A plant’s output by year', level: 'good', verdict: 'Metered for every month the EA has fully published.', why: 'The newest months are dispatch data until the meters are published.' },
	{ use: 'When a plant was commissioned', level: 'ok', verdict: 'Checked against a source, using the rule for that kind of plant.', why: 'Another source can give a different date, such as an opening ceremony.' },
	{ use: 'Who owns a plant today', level: 'ok', verdict: 'Checked against the owner’s or the EA’s documents.', why: 'A recent sale can take time to reach the page.' },
	{ use: 'A plant’s output in recent weeks', level: 'ok', verdict: 'Dispatch data, close to metered for most plants.', why: 'It can differ for Glenbrook, Kawerau (Onepu) and stations on block-dispatched chains.' },
	{ use: 'Who owned a plant in the past', level: 'care', verdict: 'Listed only where a source we could open names them.', why: 'Many older stations’ pages don’t list them yet.' },
]} />

<h2 id="limitations">Accuracy and limitations</h2>
<div class="tbl">
	<table>
		<thead><tr><th>Figure</th><th>Status</th><th>Typical accuracy</th></tr></thead>
		<tbody>
			<tr><td>Facts and About text</td><td>Published</td><td>As published by the source each fact cites, on the date we checked it</td></tr>
			<tr><td>Installed MW</td><td>Published, or a calculated estimate for corrected rows</td><td>Each row of the capacity table names its source</td></tr>
			<tr><td>Location</td><td>Our reading of LINZ’s published aerial imagery</td><td>On the station itself, as the aerial shows it</td></tr>
			<tr><td>Output by month and year</td><td>Metered, or dispatch for the newest months</td><td>As the history, with the differences <a href="/methods/history#seam">Where the sources hand over</a> describes</td></tr>
			<tr><td>Capacity factor</td><td>Calculated</td><td>Takes the status of the output it uses</td></tr>
			<tr><td>Now panel</td><td>Dispatch</td><td>A 5-minute figure from the market system, not a meter reading</td></tr>
		</tbody>
	</table>
</div>
<p>The largest limit is how much has been checked. {summary.reviewed} of the {summary.pages} pages have been checked in full. The others show every fact checked so far, and say at the top that checking isn’t finished. Previous owners, unit histories and closing dates are the facts most often missing, because older records are often in archives we couldn’t open.</p>
<p>{summary.pages - summary.with_photo} pages have no photo yet, and show the aerial view alone. Aerial imagery can be several years old, so a plant built since the imagery was flown may not show on it. Each view names its collection and the years it was flown.</p>
<p>Only plants in Elenz’s data have a page. Stations on local networks that the market data doesn’t show on their own, and stations that closed before 1997, have none.</p>
<p>Output for recent weeks is dispatch data. Some river chains are dispatched as one block: the generator must meet the chain’s total but can divide it between stations, so one station’s dispatch figure may differ from what it generated. The metered months replace it once the EA publishes them.</p>

<h2 id="coverage">Historical coverage</h2>
<p>The facts describe each plant’s whole life where a source covers it. The figures start with the history.</p>
<div class="tbl">
	<table>
		<thead><tr><th>From</th><th>Change</th></tr></thead>
		<tbody>
			<tr><td>August 1997</td><td>Output, capacity factors and installed capacity start, for plants connected to the grid.</td></tr>
			<tr><td>April 1999</td><td>Output starts for most stations on local networks.</td></tr>
			<tr><td>23 November 2026</td><td>The plant pages were published, one for each of the {summary.pages} plants the tracker shows.</td></tr>
		</tbody>
	</table>
</div>

<h2 id="references">References</h2>
<p>Each plant page lists its own sources at its foot. This page rests on the plant files and the code below.</p>
<References slug="plants" />

<style>
	.credits td:last-child { white-space: nowrap; }
</style>
