# Elenz website

SvelteKit (Svelte 5) with `adapter-static`: every page is prerendered and served by the Worker in `../worker/`.
See the root `README.md` and `CLAUDE.md` for how the data gets here.

| Page | Route | Main files |
| --- | --- | --- |
| Landing | `/` | `src/routes/+page.svelte`, previews in `src/lib/landing/` |
| Now (live) | `/now` | `src/routes/now/+page.svelte`, `src/lib/home/` |
| Tracker | `/tracker` | `src/routes/tracker/+page.svelte`, `src/lib/tracker/` (canvas charts in `tracker.js`) |
| About | `/about` | `src/routes/about/+page.svelte` |

Shared: `src/lib/site/` (masthead, footer, logo, Buy Me a Coffee link), `src/lib/tracker/tracker.css` (colour tokens,
light and dark), `src/lib/tracker/fuels.js` (fuel colours and order), `src/lib/tracker/emissions.js` (emission factors).

```sh
npm install
npm run dev        # http://localhost:5173, using the snapshot in static/data/
npm run build      # static site in build/
npm run preview    # serve the build (history views need the live Worker, so they stay empty locally)
```
