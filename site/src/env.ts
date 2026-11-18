// Environment variables (SvelteKit's defineEnvVars), set in Cloudflare's build settings, never committed.
import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	LINZ_BASEMAPS_KEY: {
		public: true,
		static: true,
		schema: (v) => v ?? '',
		description: "The LINZ Basemaps API key for the plant index's map (/plants). The key isn't secret (it is in the page's tile addresses; LINZ restricts a developer key to our sites). Empty: the map falls back to the drawn outline."
	}
});
