<script lang="ts">
	// The tracker's views, as tabs under the masthead: Generation (/tracker) and Prices (/tracker/prices).
	// Add a view here; the masthead's Tracker link covers every page under /tracker.
	import { page } from '$app/state';

	const TABS = [
		{ href: '/tracker', name: 'Generation' },
		{ href: '/tracker/prices', name: 'Prices' }
	];
	const current = (href: string) => page.url.pathname.replace(/\/$/, '') === href;
</script>

<nav class="tabs" aria-label="Tracker views">
	{#each TABS as t}
		<a href={t.href} aria-current={current(t.href) ? 'page' : undefined}>{t.name}</a>
	{/each}
</nav>

<style>
	.tabs { display: flex; gap: 2px; overflow-x: auto; scrollbar-width: none; border-bottom: 1px solid var(--line); margin-bottom: -14px; }
	a { display: inline-flex; align-items: center; min-height: 40px; padding: 0 14px; font-weight: 600; font-size: 0.92rem; color: var(--ink-2); text-decoration: none; border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap; }
	a:first-child { padding-left: 2px; }
	a:hover { color: var(--ink); }
	a[aria-current='page'] { color: var(--accent); border-bottom-color: var(--accent); }
</style>
