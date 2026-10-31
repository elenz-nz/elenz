<script lang="ts">
	// About and Data and methods share this frame: masthead, the contents (About, the methods overview, every source,
	// one page per series) beside the page, footer. A route group, so the addresses stay /about and /methods/...
	import { page } from '$app/state';
	import Masthead from '#lib/site/Masthead.svelte';
	import SiteFooter from '#lib/site/SiteFooter.svelte';
	import { TOPICS } from '#lib/methods/registry.js';
	import '#lib/methods/methods.css';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
	const path = $derived(page.url.pathname.replace(/\/$/, ''));
	const cur = (href: string) => (path === href ? 'page' : undefined);
	// on About, the sidebar's Contact is the current item while the address ends in #contact
	const atContact = $derived(page.url.hash === '#contact');
	// phones: the contents are a dropdown naming the page you're on, instead of a row of pills (owner's call DOC-04,
	// 31 Oct 2026); it closes when a page is chosen
	const here = $derived(path === '/about' ? (atContact ? 'Contact' : 'About') : path === '/privacy' ? 'Privacy' : path === '/methods' ? 'Data and methods'
		: path === '/methods/sources' ? 'Every data source' : (TOPICS.find((t) => path === `/methods/${t.slug}`)?.title ?? 'Contents'));
	let dropOpen = $state(false);
	$effect(() => { void page.url.href; dropOpen = false; });
</script>

{#snippet lists()}
	<div>
		<p>Elenz</p>
		<ul>
			<li><a href="/about" aria-current={cur('/about') && !atContact ? 'page' : undefined}>About</a></li>
			<li><a href="/about#contact" aria-current={cur('/about') && atContact ? 'location' : undefined}>Contact</a></li>
			<li><a href="/privacy" aria-current={cur('/privacy')}>Privacy</a></li>
		</ul>
	</div>
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
{/snippet}

<div class="wrap">
	<Masthead />
	<div class="mt">
		<nav class="mt-nav" aria-label="Data and methods">{@render lists()}</nav>
		<details class="mt-drop" bind:open={dropOpen}>
			<summary><span class="mt-drop-k">Contents</span><span class="mt-drop-v">{here}</span></summary>
			<nav aria-label="Data and methods">{@render lists()}</nav>
		</details>
		{@render children()}
	</div>
	<SiteFooter />
</div>
