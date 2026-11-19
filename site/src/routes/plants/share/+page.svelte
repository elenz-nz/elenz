<script lang="ts">
	// "Share what you know" (/plants/share): the plant pages' call for first-hand knowledge and photos (review of 19 Nov
	// 2026). An email to hello@elenz.co.nz, not a form: nothing to store or moderate on the site, and the reply comes
	// from the same address. Each plant page links here with ?plant=<slug>, which names the station in the email's
	// subject and first line. Hidden with the plant pages while PLANTS_PUBLIC is false (#lib/plants/registry.js).
	import { onMount } from 'svelte';
	import Preview from '#lib/site/Preview.svelte';
	import Masthead from '#lib/site/Masthead.svelte';
	import SiteFooter from '#lib/site/SiteFooter.svelte';
	import { PLANTS_PUBLIC } from '#lib/plants/registry.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const DESC = 'Worked on or with a New Zealand power station? Share what you know, or photos you’ve taken, with Elenz. We check everything before it appears.';
	const TO = 'hello@elenz.co.nz';
	let slug = $state('');
	const plant = $derived(data.names[slug] ?? '');
	const subject = $derived(plant ? `About ${plant}, for Elenz` : 'About a power station, for Elenz');
	const body = $derived([
		`Station: ${plant || ''}`,
		'',
		'What I know (history, how it runs, changes over the years, anything we’ve got wrong):',
		'',
		'',
		'How I know it (for example, worked there as an operator, 1985 to 2000):',
		'',
		'Credit me as (my name, or anonymous):',
		'',
		'Photos (if attached): I took the attached photos and own their copyright. Elenz may publish them under the Creative Commons Attribution 4.0 licence (CC BY 4.0), credited to: ',
		'Where and when each was taken:',
		''
	].join('\n'));
	const href = $derived(`mailto:${TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
	onMount(() => { slug = new URLSearchParams(location.search).get('plant') ?? ''; });
</script>

<svelte:head>
	<title>Share what you know · Plants · ELENZ</title>
	<meta name="description" content={DESC} />
	{#if !PLANTS_PUBLIC}<meta name="robots" content="noindex" />{/if}
	<Preview title="Share what you know about a power station · ELENZ" description={DESC} path="/plants/share" />
</svelte:head>

<div class="wrap">
	<Masthead />

	<main class="ask" aria-labelledby="h">
		<p class="crumb"><a href="/plants">Plants</a>{#if plant} › <a href="/plants/{slug}">{plant}</a>{/if}</p>
		<h1 id="h">Share what you know{plant ? ` about ${plant}` : ''}</h1>
		<p class="lede">We’re looking for first-hand knowledge from people who have worked on or with New Zealand’s power stations: how a station was built and run, what changed over the years, and photos you’ve taken.</p>

		<section class="panel">
			<h2>How it works</h2>
			<ol>
				<li>Email us at <a {href}>{TO}</a>. The button below starts the email for you.</li>
				<li>Tell us what you know and how you know it, for example the years you worked there and your role.</li>
				<li>Say how you’d like to be credited: by name, or anonymously.</li>
			</ol>
			<p>The Elenz team checks everything before any of it appears on the site, against public sources where we can. We may publish what you tell us, with your name or anonymously as you choose, and we may not use all of it.</p>
			<a class="btn" {href}>Email us{plant ? ` about ${plant}` : ''}</a>
		</section>

		<section class="panel">
			<h2>Sharing photos</h2>
			<p>We can publish a photo only if you took it, or otherwise own its copyright, and you agree to share it under an open licence. Attach the photos to your email, say where and when each was taken, and include this line, with the name you’d like credited:</p>
			<blockquote>I took the attached photos and own their copyright. Elenz may publish them under the Creative Commons Attribution 4.0 licence (CC BY 4.0), credited to [your name].</blockquote>
			<p><a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a> lets anyone reuse the photo as long as they credit you; it’s the licence our own data and writing use. Please don’t send photos of people who haven’t agreed to be shown, or of places you weren’t allowed to photograph.</p>
		</section>

		<p class="quiet">Your email address stays with us and is used only to reply; see <a href="/privacy#email">Privacy</a>. Spotted a mistake on a page? Email us the same way.</p>
	</main>

	<SiteFooter />
</div>

<style>
	.ask { display: grid; gap: 16px; max-width: 760px; }
	.crumb { margin: 6px 0 0; color: var(--muted); font-size: 0.82rem; }
	.crumb a { color: inherit; }
	h1 { font-size: clamp(1.7rem, 4vw, 2.3rem); letter-spacing: -0.01em; line-height: 1.15; margin: 0; }
	h2 { font-size: 1.05rem; margin: 0; }
	.lede { margin: 0; color: var(--ink-2); font-size: 1.05rem; line-height: 1.6; }
	.panel { background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 16px 18px; display: grid; gap: 10px; }
	.panel p, .panel ol { margin: 0; font-size: 0.95rem; line-height: 1.6; color: var(--ink-2); }
	.panel ol { padding-left: 1.3rem; display: grid; gap: 4px; }
	.panel a, .quiet a { color: var(--accent); }
	blockquote { margin: 0; padding: 10px 14px; border-left: 3px solid var(--accent); background: var(--grid); border-radius: 0 4px 4px 0; font-size: 0.92rem; line-height: 1.55; color: var(--ink); }
	.btn { justify-self: start; display: inline-block; background: var(--accent); color: var(--surface) !important; text-decoration: none; font-weight: 600; font-size: 0.92rem; border-radius: 4px; padding: 8px 16px; }
	.btn:hover { filter: brightness(1.08); }
	.quiet { margin: 0; color: var(--muted); font-size: 0.86rem; line-height: 1.5; }
</style>
