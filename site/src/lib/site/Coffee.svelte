<script lang="ts">
	// link to Elenz's Buy Me a Coffee page
	let { label = 'Buy me a coffee' }: { label?: string } = $props();
</script>

<a class="coffee" href="https://buymeacoffee.com/elenz" target="_blank" rel="noopener">
	<svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
		<path d="M3.5 7.5h10v4.5a4 4 0 0 1-4 4h-2a4 4 0 0 1-4-4Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
		<path d="M13.5 9h1.2a2.1 2.1 0 0 1 0 4.2h-1.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
		<path d="M6.5 2.5c-.6.8.6 1.4 0 2.4M9.5 2.5c-.6.8.6 1.4 0 2.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
	</svg>
	{label}<span class="sr">(opens in a new tab)</span>
</a>

<style>
	.coffee { display: inline-flex; align-items: center; gap: 7px; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--line); background: var(--surface);
		color: var(--ink); font-weight: 600; font-size: 0.84rem; text-decoration: none; white-space: nowrap; transition: border-color 0.15s, color 0.15s; }
	.coffee svg { color: var(--f-gas); }
	.coffee:hover { border-color: var(--f-gas); }
	.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
