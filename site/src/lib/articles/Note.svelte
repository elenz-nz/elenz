<script lang="ts">
	// A side note: method, caveat or definition, set apart from the main text.
	//   <Note title="How records are counted">…</Note>
	import type { Snippet } from 'svelte';
	let { title = '', children }: { title?: string; children: Snippet } = $props();
</script>

<aside class="note">
	{#if title}<p class="n-title">{title}</p>{/if}
	{@render children()}
</aside>

<style>
	.note { margin: 4px 0; padding: 12px 16px; border-radius: 4px; background: var(--grid); display: grid; gap: 6px; max-width: 74ch; }
	.n-title { font-size: 0.72rem !important; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--muted) !important; }
	.note :global(p) { font-size: 0.88rem; }
</style>
