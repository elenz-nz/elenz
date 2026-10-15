<script module lang="ts">
	export type LegendItem = { name: string; tok: string; kind?: 'rect' | 'line' | 'dot'; faint?: boolean };
</script>

<script lang="ts">
	// Chart legend: the key mirrors the mark (rect for bars and areas, line for lines, dot for dots).
	let { items }: { items: LegendItem[] } = $props();
</script>

<ul class="ch-legend">
	{#each items as it}
		<li><i class="k-{it.kind ?? 'rect'}" class:faint={it.faint} style="--c: var({it.tok})"></i>{it.name}</li>
	{/each}
</ul>
