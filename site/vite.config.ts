import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { SCRIPT_SRC } from './scripts/csp.js';

export default defineConfig({
	// Vite 8 otherwise rewrites `max-width` rules as `width<=`, which Safari only reads from 16.4: older iPhones then skip
	// every width rule and get the desktop layout. scripts/check-css.js fails the build check if it comes back.
	build: { cssTarget: ['safari15', 'ios15', 'chrome100', 'edge100', 'firefox100'] },
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			// asset addresses from the site root (/_app/...), not relative to the page: the not-found page (404.html) is
			// served at any address, e.g. /records/not-a-record, where relative ones would point to /records/_app/...
			paths: { relative: false },
			// each page's inline scripts allowed by hash only (scripts/csp.js)
			csp: { mode: 'hash', directives: { 'script-src': SCRIPT_SRC } }
		})
	]
});
