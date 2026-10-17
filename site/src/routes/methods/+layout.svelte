<script lang="ts">
	// Data and methods: masthead, the contents (overview, sources, one page per series) beside the page, footer.
	import { page } from '$app/state';
	import Masthead from '#lib/site/Masthead.svelte';
	import SiteFooter from '#lib/site/SiteFooter.svelte';
	import { TOPICS } from '#lib/methods/registry.js';
	import '#lib/methods/methods.css';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
	const path = $derived(page.url.pathname.replace(/\/$/, ''));
	const cur = (href: string) => (path === href ? 'page' : undefined);
</script>

<div class="wrap">
	<Masthead />
	<div class="mt">
		<nav class="mt-nav" aria-label="Data and methods">
			<div>
				<p>Data and methods</p>
				<ul>
					<li><a href="/methods" aria-current={cur('/methods')}>Overview</a></li>
					<li><a href="/methods/sources" aria-current={cur('/methods/sources')}>Every data source</a></li>
				</ul>
			</div>
			<div>
				<p>How each series is built</p>
				<ul>
					{#each TOPICS as t (t.slug)}
						<li><a href="/methods/{t.slug}" aria-current={cur(`/methods/${t.slug}`)}>{t.title}{#if t.estimate}<span class="est-dot" title="Includes estimates"></span>{/if}</a></li>
					{/each}
				</ul>
			</div>
			<div>
				<p>Elenz</p>
				<ul><li><a href="/about">About</a></li></ul>
			</div>
		</nav>
		{@render children()}
	</div>
	<SiteFooter />
</div>
