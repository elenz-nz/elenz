<script lang="ts">
	// The tracker's views, as tabs under the masthead: Generation (/tracker) and Prices (/tracker/prices).
	// Add a view here; the masthead's Tracker link covers every page under /tracker.
	// The links carry the current address's shared settings (region, range, interval, date: #lib/site/view.js), so
	// switching tabs keeps the same window, plus the other tab's own settings from its last visit (its drill-down,
	// grouping or chart options). Worked out as the link is used, since the pages update the address as views change.
	// children: the page's status (Live / History / Delayed pill and the About this data button), at the line's right.
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import { tabHref } from '#lib/site/view.js';

	let { children }: { children?: Snippet } = $props();

	const TABS = [
		{ href: '/tracker', name: 'Generation' },
		{ href: '/tracker/prices', name: 'Prices' }
	];
	const current = (href: string) => page.url.pathname.replace(/\/$/, '') === href;
	const carry = (e: Event, href: string) => { (e.currentTarget as HTMLAnchorElement).href = tabHref(href); };
</script>

<div class="tabline">
	<nav class="tabs" aria-label="Tracker views">
		{#each TABS as t}
			<a href={t.href} aria-current={current(t.href) ? 'page' : undefined}
				onpointerdown={(e) => carry(e, t.href)} onfocus={(e) => carry(e, t.href)} onclick={(e) => carry(e, t.href)}>{t.name}</a>
		{/each}
	</nav>
	{@render children?.()}
</div>

<style>
	/* the grey rule is an inset shadow, so the current tab's accent border paints over it */
	.tabline { display: flex; align-items: stretch; gap: 8px; box-shadow: inset 0 -1px 0 var(--line); margin-bottom: -14px; }
	.tabline > :global(.status) { align-self: center; min-width: 0; }
	.tabs { display: flex; gap: 2px; flex: none; }
	a { display: inline-flex; align-items: center; min-height: 40px; padding: 0 14px; font-weight: 600; font-size: 0.92rem; color: var(--ink-2); text-decoration: none; border-bottom: 2px solid transparent; white-space: nowrap; }
	a:first-child { padding-left: 2px; }
	a:hover { color: var(--ink); }
	@media (max-width: 400px) { a { padding: 0 9px; } .tabline { gap: 4px; } .tabline > :global(.status) { gap: 2px; } }
	a[aria-current='page'] { color: var(--accent); border-bottom-color: var(--accent); }
</style>
