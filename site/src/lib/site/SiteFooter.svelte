<script lang="ts">
	// The footer on every page: © line, the data credits the CC BY licences require, links out, and the Buy Me a
	// Coffee button under them.
	// Social accounts: fill in a href to show one; entries with no href stay hidden until the account exists.
	import Mark from './Mark.svelte';
	import Coffee from './Coffee.svelte';

	const YEAR = new Date().getFullYear();
	type Link = { k: string; name: string; href: string };
	const LINKS: Link[] = [
		{ k: 'linkedin', name: 'LinkedIn', href: '' },
		{ k: 'bluesky', name: 'Bluesky', href: '' },
		{ k: 'x', name: 'X', href: '' },
		{ k: 'instagram', name: 'Instagram', href: '' },
		{ k: 'facebook', name: 'Facebook', href: '' },
		{ k: 'github', name: 'GitHub', href: 'https://github.com/elenz-nz/elenz' },
		{ k: 'mail', name: 'Email hello@elenz.co.nz', href: 'mailto:hello@elenz.co.nz' },
	];
	const shown = LINKS.filter((l) => l.href);
</script>

<footer class="site-foot">
	<p class="brand"><Mark size={18} /><span>© {YEAR} Elenz</span></p>
	<div class="side">
		<ul class="links" aria-label="Elenz elsewhere">
			{#each shown as l}
				<li>
					<a href={l.href} title={l.name} aria-label={l.name} {...l.href.startsWith('http') ? { target: '_blank', rel: 'noopener' } : {}}>
						<svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
							{#if l.k === 'github'}
								<path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
							{:else if l.k === 'linkedin'}
								<path fill="currentColor" d="M14.5 0h-13C.7 0 0 .7 0 1.5v13c0 .8.7 1.5 1.5 1.5h13c.8 0 1.5-.7 1.5-1.5v-13C16 .7 15.3 0 14.5 0zM4.8 13.6H2.4V6h2.4v7.6zM3.6 5a1.4 1.4 0 1 1 0-2.8 1.4 1.4 0 0 1 0 2.8zm10 8.6h-2.4V9.9c0-.9 0-2-1.2-2s-1.4 1-1.4 2v3.7H6.2V6h2.3v1c.3-.6 1.1-1.2 2.3-1.2 2.4 0 2.9 1.6 2.9 3.7v4.1z" />
							{:else if l.k === 'bluesky'}
								<path fill="currentColor" d="M3.5 1.9C5.3 3.3 7.2 6 8 7.6c.8-1.6 2.7-4.3 4.5-5.7 1.3-1 3.5-1.7 3.5.7 0 .5-.3 4.1-.5 4.7-.6 2.1-2.8 2.6-4.7 2.3 3.4.6 4.2 2.5 2.4 4.4-3.5 3.5-5-.9-5.4-2l-.3-.9-.3.9c-.4 1.1-1.9 5.5-5.4 2-1.8-1.9-1-3.8 2.4-4.4-1.9.3-4.1-.2-4.7-2.3C.3 6.7 0 3.1 0 2.6c0-2.4 2.2-1.7 3.5-.7z" />
							{:else if l.k === 'x'}
								<path fill="currentColor" d="M9.5 6.8 15.3 0h-1.4L8.9 5.9 4.9 0H.3l6.1 8.9L.3 16h1.4l5.3-6.2 4.3 6.2h4.6L9.5 6.8zM7.6 9l-.6-.9L2.1 1h2.1l4 5.7.6.9 5.2 7.4h-2.1L7.6 9z" />
							{:else if l.k === 'instagram'}
								<rect x="1" y="1" width="14" height="14" rx="4" fill="none" stroke="currentColor" stroke-width="1.5" /><circle cx="8" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="1.5" /><circle cx="12" cy="4" r="0.9" fill="currentColor" />
							{:else if l.k === 'facebook'}
								<path fill="currentColor" d="M16 8a8 8 0 1 0-9.25 7.9v-5.59H4.72V8h2.03V6.24c0-2 1.2-3.11 3.02-3.11.87 0 1.79.16 1.79.16v1.97h-1.01c-.99 0-1.3.62-1.3 1.25V8h2.22l-.35 2.31H9.25v5.6A8 8 0 0 0 16 8z" />
							{:else if l.k === 'mail'}
								<rect x="1" y="3" width="14" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="m1.8 4 6.2 5 6.2-5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
							{/if}
						</svg>
					</a>
				</li>
			{/each}
		</ul>
		<Coffee />
	</div>
	<p class="credits">
		<span>Data from <a href="https://www.emi.ea.govt.nz" target="_blank" rel="noopener">www.emi.ea.govt.nz</a> provided by the Electricity Authority (New Zealand), CC BY 4.0.</span>
		<span>Irradiance: Himawari satellite data (JMA/JAXA) via <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a>, CC BY 4.0.</span>
	</p>
</footer>

<style>
	/* overrides the shared footer rule in tracker.css */
	/* © line with the credits under it on the left; link icons and the coffee button on the right */
	.site-foot { display: grid !important; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: 'brand side' 'credits side'; align-items: start; gap: 8px 24px; border-top: 1px solid var(--line); padding-top: 18px; margin-top: 8px; color: var(--muted); font-size: 0.8rem; }
	.brand { grid-area: brand; }
	.side { grid-area: side; display: grid; justify-items: end; gap: 8px; }
	.credits { grid-area: credits; }
	/* phones: the credits take the full width under the © line and the links */
	@media (max-width: 640px) { .site-foot { grid-template-areas: 'brand side' 'credits credits'; } }
	.brand { margin: 0; min-height: 34px; display: inline-flex; align-items: center; gap: 8px; color: var(--ink-2); font-weight: 600; font-size: 0.85rem; }
	.links { list-style: none; margin: 0; padding: 0; display: flex; gap: 4px; }
	.links a { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; color: var(--muted); transition: color 0.15s, background 0.15s; }
	.links a:hover { color: var(--ink); background: var(--grid); }
	.links a:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
	/* one credit per line */
	.credits { margin: 0; display: grid; gap: 2px; line-height: 1.5; }
	.credits a { color: inherit; white-space: nowrap; }
</style>
