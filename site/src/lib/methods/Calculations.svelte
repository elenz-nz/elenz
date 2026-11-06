<script lang="ts">
	// A method's working, closed until asked for (design decision, 6 Nov 2026): the page reads in words, and this button
	// holds the formulas, their terms and the worked example. A native <details>, so it works without JavaScript.
	import type { Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();
</script>

<details class="calc">
	<summary>
		<svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="m3 6 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
		<span class="to-show">Show calculations</span><span class="to-hide">Hide calculations</span>
	</summary>
	<div class="calc-body">{@render children()}</div>
</details>
