<script lang="ts">
	// A link to copy, shown when the share sheet or the clipboard refused (owner's report SHR-03, 31 Oct 2026: Firefox on
	// Android asked to copy the address bar). Its Copy button is a fresh tap, which browsers allow to write the clipboard;
	// failing that the text is selected for the phone's own Copy.
	import { onMount } from 'svelte';
	let { url, onclose }: { url: string; onclose?: () => void } = $props();
	let input = $state<HTMLInputElement>();
	let copied = $state(false);

	onMount(() => input?.select());
	async function copy() {
		copied = false;
		try {
			await navigator.clipboard.writeText(url);
			copied = true;
		} catch {
			input?.focus(); input?.select();
			try { copied = document.execCommand('copy'); } catch { /* selected: the phone's own Copy works */ }
		}
		if (copied) setTimeout(() => (copied = false), 2000);
	}
</script>

<div class="copy-link" role="group" aria-label="Copy this link">
	<input bind:this={input} readonly value={url} aria-label="Link" onfocus={(e) => e.currentTarget.select()} />
	<button type="button" class="cl-go" onclick={copy}>{copied ? 'Copied' : 'Copy'}</button>
	{#if onclose}<button type="button" class="cl-x" aria-label="Close" onclick={onclose}>×</button>{/if}
</div>

<style>
	.copy-link { display: flex; align-items: center; gap: 6px; min-width: 0; }
	.copy-link input { flex: 1; min-width: 0; font: 0.76rem var(--font-data); padding: 6px 7px; border: 1px solid var(--line); border-radius: 3px; background: var(--bg); color: var(--ink); }
	.cl-go { flex: none; font: inherit; font-size: 0.8rem; font-weight: 600; min-height: 32px; padding: 0 12px; border-radius: 4px; border: 1px solid var(--accent); background: var(--surface); color: var(--accent); cursor: pointer; }
	.cl-go:hover { background: var(--accent-soft); }
	.cl-x { flex: none; font: inherit; font-size: 1.1rem; line-height: 1; width: 32px; height: 32px; border: 0; background: none; color: var(--muted); cursor: pointer; }
</style>
