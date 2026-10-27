<script lang="ts">
	// link to Elenz's support page (Buy Me a Coffee); the label stays first-person plural, never "me"
	let { label = 'Support Elenz' }: { label?: string } = $props();
</script>

<a class="coffee" href="https://buymeacoffee.com/elenz" target="_blank" rel="noopener">
	{label}<span class="sr">(opens in a new tab)</span>
</a>

<style>
	.coffee { display: inline-flex; align-items: center; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--line); background: var(--surface);
		color: var(--ink); font-weight: 600; font-size: 0.84rem; text-decoration: none; white-space: nowrap; transition: border-color 0.15s, color 0.15s; }
	.coffee:hover { border-color: var(--f-gas); }
	.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
