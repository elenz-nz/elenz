# Elenz website

SvelteKit (Svelte 5) with `adapter-static`: every page is prerendered and served by the Worker in `../worker/`.
See the root `README.md` and `CLAUDE.md` for how the data gets here.

| Page | Route | Main files |
| --- | --- | --- |
| Landing | `/` | `src/routes/+page.svelte`, previews in `src/lib/landing/` |
| Now (live) | `/now` | `src/routes/now/+page.svelte`, `src/lib/home/` |
| Tracker | `/tracker` | `src/routes/tracker/+page.svelte`, `src/lib/tracker/` (canvas charts in `tracker.js`) |
| About | `/about` | `src/routes/about/+page.svelte` |
| Articles | `/articles`, `/articles/<slug>` | `src/routes/articles/`, one file per article in `src/lib/articles/posts/` (registry, charts and covers in `src/lib/articles/`) |

Shared: `src/lib/site/` (masthead, footer, logo, Buy Me a Coffee link), `src/lib/tracker/tracker.css` (colour tokens,
light and dark), `src/lib/tracker/fuels.js` (fuel colours and order), `src/lib/tracker/emissions.js` (emission factors).

```sh
npm install
npm run dev        # http://localhost:5173, using the snapshot in static/data/
npm run check      # type-check the Svelte and TypeScript files (the plain .js chart code isn't type-checked)
npm run build      # static site in build/
npm run preview    # serve the build (history views need the live Worker, so they stay empty locally)
```

Each page sets its own `<meta name="description">` in `<svelte:head>`; `src/app.html` has none, so pages don't
end up with two.
