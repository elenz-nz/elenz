import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
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
			paths: { relative: false }
		})
	]
});
