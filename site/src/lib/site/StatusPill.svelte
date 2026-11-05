<script lang="ts">
	// The Live / History / Delayed status on Now and both tracker tabs: the last thing on its line, and a button that
	// opens a small panel saying where the data comes from (test report TRK-01, 4 Nov 2026: it took over from a
	// separate About this data button). kind: 'live', 'hist' or 'stale', or '' until the data arrives, when it only
	// holds its place so the buttons beside it don't move. label: what the pill says; children: the panel.
	import type { Snippet } from 'svelte';

	let { kind, title, id, label, children }: { kind: string; title: string; id: string; label: Snippet; children: Snippet } = $props();
	let open = $state(false);
	let btn = $state<HTMLButtonElement>(), box = $state<HTMLDivElement>();
	function shut(e: Event) {
		if (!open) return;
		if (e instanceof KeyboardEvent) {
			if (e.key === 'Escape') { open = false; btn?.focus(); }
			return;
		}
		const t = e.target as Node;
		if (!box?.contains(t) && !btn?.contains(t)) open = false;
	}
</script>

<svelte:window onkeydown={shut} onpointerdown={shut} />

<button type="button" class="pill {kind}" class:waiting={!kind} disabled={!kind} bind:this={btn} aria-expanded={open} aria-controls={id} {title} onclick={() => (open = !open)}>
	{@render label()}
	<svg class="pcaret" class:up={open} width="10" height="10" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 5l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" /></svg>
</button>
<div class="info-pop" {id} role="region" aria-label="About this data" bind:this={box} hidden={!open}>
	{@render children()}
</div>
