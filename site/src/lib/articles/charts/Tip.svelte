<script module lang="ts">
	export type TipRow = { tok?: string; name: string; value: string; strong?: boolean };
</script>

<script lang="ts">
	// The hover readout shared by the article charts: value first, then the series it belongs to.
	let { x, y, w, title, rows }: { x: number; y: number; w: number; title: string; rows: TipRow[] } = $props();
	let el: HTMLDivElement | undefined = $state();
	let tw = $state(180);
	$effect(() => { if (el) tw = el.offsetWidth; });
	// keep it inside the chart: right of the pointer, or left of it near the right edge
	const left = $derived(x + 14 + tw > w ? Math.max(0, x - 14 - tw) : x + 14);
</script>

<div class="ch-tip" bind:this={el} style="left:{left}px; top:{Math.max(0, y)}px" role="status">
	<p class="ch-tip-t">{title}</p>
	{#each rows as r}
		<p class="ch-tip-r" class:strong={r.strong}>
			{#if r.tok}<i style="background: var({r.tok})"></i>{:else}<i class="none"></i>{/if}
			<b>{r.value}</b><span>{r.name}</span>
		</p>
	{/each}
</div>
