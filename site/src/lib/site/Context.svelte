<script lang="ts">
	// What a chart covers, under its title: the range first (as a chip), then the dates, region and anything else.
	// Built from #lib/site/context.js. locked: the chart keeps its own span whatever range is picked (the 30-day heat
	// maps), shown by a padlock in the chip; the text says why.
	let { range, items = [], locked = '' }: { range: string; items?: (string | null | undefined | false)[]; locked?: string } = $props();
	const rest = $derived(items.filter(Boolean) as string[]);
</script>

<p class="ctx"><b class:locked title={locked || undefined}>{#if locked}<svg width="10" height="11" viewBox="0 0 10 11" aria-hidden="true"><rect x="1" y="4.6" width="8" height="5.9" rx="1.2" fill="currentColor" /><path d="M2.9 4.8V3.3a2.1 2.1 0 0 1 4.2 0v1.5" fill="none" stroke="currentColor" stroke-width="1.3" /></svg>{/if}{range}{#if locked}<span class="vh">. {locked}</span>{/if}</b>{#each rest as it, i}<span class="it">{#if i}<span class="dot" aria-hidden="true">·</span>{/if}{it}</span>{/each}</p>

<style>
	.ctx { display: flex; flex-wrap: wrap; align-items: center; gap: 3px 7px; margin: 3px 0 0; font-size: 0.76rem; color: var(--ink-2); line-height: 1.5; }
	.ctx b.locked { display: inline-flex; align-items: center; gap: 4px; cursor: help; }
	.ctx b.locked svg { color: var(--muted); flex: none; }
	.vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
	.ctx b { font-weight: 500; color: var(--ink); background: var(--grid); border-radius: 3px; padding: 0 6px; font-family: var(--font-data); font-size: 0.72rem; }
	/* each item carries its own dot, so a dot wraps with its item rather than ending a line */
	.it { white-space: nowrap; }
	.dot { color: var(--muted); margin-right: 7px; }
</style>
