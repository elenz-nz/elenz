<script lang="ts">
	// Reset zoom and Pinned · Release for a record page's chart, in its card's heading row (so they never cover the
	// chart). The chart binds its zoom and pin to the page, which passes them here.
	let { zoomed = false, pinned = false, text = '', onreset, onrelease }: {
		zoomed?: boolean; pinned?: boolean; text?: string; onreset?: () => void; onrelease?: () => void } = $props();
</script>

{#if pinned}<button type="button" class="rel" title="Let go of the pinned point (Escape)" onclick={onrelease}>Pinned · <b>Release</b></button>{/if}
{#if zoomed}
	<button type="button" class="zoom-chip" title="Back to the whole chart (Escape)" onclick={onreset}>
		<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="m10.5 10.5 3.5 3.5M5 7h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
		{#if text}<span>{text}</span>{/if}<b>Reset zoom</b>
	</button>
{/if}

<style>
	.rel { font: inherit; font-size: 0.75rem; color: var(--muted); background: none; border: 1px solid var(--line); border-radius: 999px; padding: 3px 10px; min-height: 28px; cursor: pointer; }
	.rel b { color: var(--accent); font-weight: 600; }
	.rel:hover b { text-decoration: underline; }
</style>
