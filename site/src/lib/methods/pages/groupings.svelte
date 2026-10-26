<script lang="ts">
	import { REPO } from '../registry.js';
</script>

<h2 id="renewable">Renewable share</h2>
<p class="formula">Renewable share = renewable generation ÷ (total generation − battery discharge) × 100%</p>
<ul>
	<li><b>Renewable:</b> geothermal, bioenergy, hydro, wind, grid solar and embedded solar.</li>
	<li><b>Not renewable:</b> Huntly’s coal/gas Rankine units, gas, diesel and waste heat (Glenbrook).</li>
	<li><b>Neither:</b> batteries store energy rather than make it; their discharge counts towards total generation, but is left out of the renewable share altogether (as em6 does): that energy was generated, and counted, when the battery charged. The HVDC link isn’t generation.</li>
</ul>
<p>Total generation is as on the <a href="/methods/generation#totals">generation page</a>, including embedded solar. Geothermal counts as renewable although it emits some CO₂ (about 0.05 t/MWh across the fleet now; see <a href="/methods/emissions#geothermal">emissions</a>). Glenbrook counts as zero emissions but not renewable: its fuel is the off-gas of coal-fed ironmaking. Over a range, the share is weighted by generation.</p>
<p class="note">Official figures, such as MBIE’s, count renewable generation over a year and include plants that aren’t in the market data, so they can differ from the share here.</p>

<h2 id="groupings">Grouping the generation chart</h2>
<p>The menu beside the generation chart regroups the same data. Batteries and the HVDC link always stay separate layers, because they can be negative (charging, exporting).</p>
<dl>
	<dt>Detailed</dt>
	<dd>Every fuel on its own.</dd>
	<dt>Simplified</dt>
	<dd>Five groups: geothermal; thermal (Huntly’s coal/gas Rankine units, gas, diesel, bioenergy and waste heat); hydro; wind; and solar, grid-scale and embedded together.</dd>
	<dt>Renewable vs fossil</dt>
	<dd>As in the renewable share above. Waste heat sits with the fossils.</dd>
	<dt>Flexibility</dt>
	<dd>By how readily output can follow demand. <b>Inflexible:</b> geothermal, which runs flat out around the clock, and industrial cogeneration (bioenergy and waste heat), which follows its mill or steelworks. <b>Slow flexible:</b> Huntly’s Rankine units, which take hours to start and ramp slowly. <b>Fast flexible:</b> hydro, gas and diesel. <b>Variable:</b> wind and solar, which follow the weather. Grouping is by fuel, so gas cogeneration counts as fast flexible.</dd>
	<dt>Inverter-based vs synchronous</dt>
	<dd><b>Inverter-based:</b> wind and solar, connected through power electronics. <b>Synchronous:</b> hydro, geothermal and thermal plant (including bioenergy and waste heat), whose spinning generators add inertia and system strength. Batteries are inverter-based too, but shown separately.</dd>
	<dt>By site</dt>
	<dd>The plants that together make up 95% of each fuel’s output over the range get a layer each, at most 12 per fuel; the rest of that fuel is grouped as “Other”. Plants are listed largest first by installed capacity, here and when a fuel or group is opened, so the order stays the same whatever the range.</dd>
	<dt>By hydro scheme</dt>
	<dd>Hydro only, by river system, each listed upstream to downstream: Tekapo (Takapō A, B); Waitaki (Ōhau A, B, C, Benmore, Aviemore, Waitaki); Waikato (Aratiatia to Karāpiro, eight stations); Manapōuri; Clutha (Clyde, Roxburgh); Tongariro (Tokaanu, Rangipo); Waikaremoana; Rangitaiki (Aniwhenua, Wheao and Flaxy, Matahina); Waipori (Deep Stream, Waipori 2A/3/4); and other hydro.</dd>
	<dt>By owner</dt>
	<dd>Each plant’s operator in the EA register, grouped as Meridian, Contact (including Manawa Energy, formerly Trustpower, which Contact took over in July 2025), Mercury (including Nga Awa Pūrua, which it operates), Genesis, Nova and other generators. Plants the register doesn’t list yet, and plants seen only in the metered history, have their owner set by hand. Today’s owners apply to the whole history, so earlier sales and transfers aren’t shown.</dd>
</dl>

<p class="note">The lists: <a href={REPO + 'facilities/overrides.toml'}><code>facilities/overrides.toml</code></a> (<code>[owners]</code>, <code>[plant_owners]</code>, <code>[hydro_schemes]</code>). Groupings: <a href={REPO + 'site/src/lib/tracker/tracker.js'}><code>site/src/lib/tracker/tracker.js</code></a>.</p>
