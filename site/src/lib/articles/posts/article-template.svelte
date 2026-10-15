<script module lang="ts">
	// A layout sample showing every building block. Kept as a draft: it never appears once Articles go public,
	// and can be deleted once real articles exist (or copied as the starting point for a new one).
	export const meta = {
		title: 'Article template',
		dek: 'A sample of every building block an article can use: headings, a record callout, a figure with its source, a note and a table.',
		date: '2026-10-14',
		kind: 'Guide',
		draft: true,
	} as const;
</script>

<script lang="ts">
	import Record from '#lib/articles/Record.svelte';
	import Figure from '#lib/articles/Figure.svelte';
	import Note from '#lib/articles/Note.svelte';
</script>

<p>Articles open with a short paragraph that says what happened and why it matters, in plain words. This one is a layout sample, using the August 2021 price example from the tracker's notes, so the figures are real but the piece isn't an article.</p>

<Record label="Example · dispatch price peak, Haywards" value="$356,621" unit="/MWh" when="9 August 2021" previous="The record callout's last line names the record it beat" fuel="--f-gas" />

<h2>A section heading</h2>
<p>Body text runs to about 68 characters a line for easy reading. Links look <a href="/tracker">like this</a>, and <strong>bold</strong> picks out a figure in the text.</p>
<ul>
	<li>Lists work for a few short points.</li>
	<li>Keep them parallel and brief.</li>
</ul>

<Figure caption="Dispatch and final prices at Haywards, 9 August 2021" source="EMI dispatch (NodalPricesAndVolumes) and final energy prices, Electricity Authority">
	<table>
		<thead><tr><th>Haywards, 9 Aug 2021</th><th class="n">Dispatch</th><th class="n">Final</th></tr></thead>
		<tbody>
			<tr><td>Daily average</td><td class="n">$16,270</td><td class="n">$360</td></tr>
			<tr><td>Peak</td><td class="n">$356,621</td><td class="n">$2,698</td></tr>
		</tbody>
	</table>
</Figure>

<Note title="Dispatch and final prices">
	<p>Notes set apart a method or caveat. Dispatch prices are the market's 5-minute results; final prices are settled afterwards and can differ widely under scarcity pricing. Elenz's history uses final prices.</p>
</Note>

<h2>Charts</h2>
<p>A figure can hold a chart drawn from the history files, a table, or an image. Charts for articles will reuse the tracker's fuel colours so a reader moves between the two without relearning anything.</p>
