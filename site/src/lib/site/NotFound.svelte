<script lang="ts">
	// The page for an address that doesn't exist (SITE-07, 30 Oct 2026). Used twice: prerendered as /404 (build/404.html,
	// which Cloudflare serves with status 404 for any address with no file: `not_found_handling` in wrangler.jsonc), and
	// by the root +error.svelte when a link inside the site leads nowhere. The address asked for is shown only once the
	// page is running in the browser: the prerendered copy only knows "/404".
	import { onMount } from 'svelte';
	import Masthead from '#lib/site/Masthead.svelte';
	import SiteFooter from '#lib/site/SiteFooter.svelte';
	import ReportLink from '#lib/site/ReportLink.svelte';

	let { title = 'We can’t find that page', note = '' }: { title?: string; note?: string } = $props();
	let asked = $state('');
	onMount(() => {
		const p = location.pathname;
		if (p !== '/404' && p !== '/404.html') asked = decodeURIComponent(p);
	});

	// where people most likely meant to go: the closest section to the address first
	const PLACES = [
		{ href: '/now', name: 'Now', what: 'The power system at this moment' },
		{ href: '/tracker', name: 'Tracker', what: 'Generation, prices and demand since 1997' },
		{ href: '/records', name: 'Records', what: 'Highs and lows since 1997' },
		{ href: '/articles', name: 'Articles', what: 'Reviews and analysis' },
		{ href: '/methods', name: 'Data and methods', what: 'Where every figure comes from' }
	];
	const near = $derived(PLACES.find((p) => asked.startsWith(p.href + '/')));
</script>

<div class="wrap">
	<Masthead />
	<main class="nf" aria-labelledby="nf-h">
		<p class="nf-code">404 · Not found</p>
		<h1 id="nf-h">{title}</h1>
		<p class="nf-lede">
			{#if asked}There’s nothing at <code>{asked}</code>.{:else}There’s nothing at this address.{/if}
			{note || 'It may have moved, or the link may have a typo.'}
		</p>
		<div class="nf-go">
			<a class="nf-home" href="/">Go to the home page</a>
			{#if near}<a class="nf-near" href={near.href}>Back to {near.name}</a>{/if}
		</div>
		<ul class="nf-list" aria-label="Pages">
			{#each PLACES as p (p.href)}
				<li><a href={p.href}><b>{p.name}</b><span>{p.what}</span></a></li>
			{/each}
		</ul>
		<p class="nf-foot">Followed a link on Elenz to get here? <ReportLink label="Tell us" /> and we’ll fix it.</p>
	</main>
	<SiteFooter />
</div>

<style>
	.nf { max-width: 760px; padding: 40px 0 56px; }
	.nf-code { margin: 0 0 6px; color: var(--accent); font-size: 0.74rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
	h1 { margin: 0; font-size: clamp(1.7rem, 4.6vw, 2.4rem); font-weight: 800; line-height: 1.12; text-wrap: balance; }
	.nf-lede { margin: 12px 0 0; color: var(--ink-2); font-size: 1.02rem; max-width: 60ch; }
	code { font-family: var(--font-data); font-size: 0.88em; background: var(--grid); padding: 1px 6px; border-radius: 4px; overflow-wrap: anywhere; }
	.nf-go { display: flex; flex-wrap: wrap; gap: 10px; margin: 22px 0 28px; }
	.nf-go a { padding: 9px 16px; border-radius: 7px; font-weight: 600; text-decoration: none; border: 1px solid var(--accent); }
	.nf-home { background: var(--accent); color: var(--surface); }
	.nf-near { color: var(--accent); background: var(--surface); }
	.nf-list { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; }
	.nf-list a { display: grid; gap: 2px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink); text-decoration: none; }
	.nf-list a:hover, .nf-list a:focus-visible { border-color: var(--accent); }
	.nf-list b { font-weight: 650; }
	.nf-list span { color: var(--muted); font-size: 0.86rem; }
	.nf-foot { margin: 26px 0 0; color: var(--muted); font-size: 0.9rem; }
	.nf-foot :global(a) { color: var(--accent); }
</style>
