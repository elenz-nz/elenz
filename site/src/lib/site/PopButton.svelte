<script lang="ts">
	// The button that enlarges a chart or card over the page, or shrinks it back. It sits in the top right corner of its
	// chart or card (.pop-btn in tracker.css; the card needs position: relative).
	let { open, name, onclick }: { open: boolean; name: string; onclick: () => void } = $props();
</script>

<button type="button" class="pop-btn" {onclick} aria-pressed={open}
	aria-label={open ? `Shrink the ${name}` : `Enlarge the ${name}`} title={open ? 'Close' : 'Enlarge'}>
	{#if open}
		<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
	{:else}
		<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5L9 7M2.5 13.5L7 9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
	{/if}
</button>
