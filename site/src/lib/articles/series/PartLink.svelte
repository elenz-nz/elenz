<script lang="ts">
	// A link from one part of the wholesale series to another: <PartLink to="water">Part 3</PartLink>.
	// It stays plain text while the target part is unpublished (a draft or scheduled), unless the page showing it is
	// itself unpublished, so published parts never lead readers to drafts but drafts under review still link up.
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { find, hidden } from '../registry.js';
	import { PARTS } from './wholesale.js';

	let { to, children }: { to: keyof typeof PARTS; children: Snippet } = $props();
	const href = $derived(PARTS[to]);
	const target = $derived(find(href.split('/').pop() ?? ''));
	const here = $derived(find(page.params.slug ?? ''));
	const open = $derived(!target || !hidden(target) || (!!here && hidden(here)));
</script>

{#if open}<a {href}>{@render children()}</a>{:else}{@render children()}{/if}
