# Elenz: notes for Claude

Public NZ electricity tracker modelled on openelectricity.org.au. The owner knows the power system well but is new
to web development and hosting, so give step-by-step instructions for anything they have to do themselves.
This repository is public: never commit keys, tokens or personal details.

## Layout

- `site/`: SvelteKit 3 + Svelte 5, `adapter-static`, every page prerendered. Hosted on Cloudflare Workers as static
  assets (`wrangler.jsonc` at the repo root; build command `cd site && npm ci && npm run build`, deploy command
  `npx wrangler deploy`). Every push to `main` redeploys. The tracker page markup is in
  `src/routes/+page.svelte`; the canvas chart code is `src/lib/tracker/tracker.js` (vanilla JS, driven by
  element ids in the page), styles in `src/lib/tracker/tracker.css` (colour tokens, light/dark).
- `ingest/`: Python. `emi_live.py` (API client: latest / range / watch), `sync.py` (EMI blob container +
  Open-Meteo), `build_tracker.py` (builds `site/static/data/tracker.json`), `common.py` (paths, overrides).
- `facilities/overrides.toml`: curated corrections; `facilities/connection_points.csv`: POC → island.
- `data/`: raw downloads, git-ignored.

## Facts learned from the data (Oct 2026)

- The real-time dispatch API (`https://emi.azure-api.net/real-time-dispatch/`, header `Ocp-Apim-Subscription-Key`)
  returns the same RTD case as the daily `NodalPricesAndVolumes` files: identical MW, prices within a cent.
  Rows are keyed `"POC UNIT"` for generators, so fuel mapping is per unit. About 568 rows per interval; ~300 are
  bus nodes with no load or generation.
- `FiveMinuteIntervalDatetime` is NZ local time without an offset; `RunDateTime` is UTC without a marker.
  The case for interval T runs at about T−1 min.
- The API keeps roughly one month of history (`$filter=FiveMinuteIntervalDatetime eq datetime'YYYY-MM-DDTHH:MM'`).
  Older data must come from the EMI files, so every interval must be stored as it arrives.
- Limits: 60 calls/min, 60 MB/hour. Send `Accept-Encoding: gzip` (168 KB → 11 KB per interval).
- About 8% of 5-minute intervals have no dispatch case in either source. They are interpolated and the page says so.
- Daily files arrive 1–4 days late. Island reference prices: HAY2201 and BEN2201 rows exist in the API; the
  daily files lack them, but nodal price ÷ location factor gives the identical figure.
- Battery charging is load on separate units (RUK99, GLB99, RHO99, HLY91); net it against the battery unit.
- Huntly Rankine units 1, 2, 4 are "Coal/Gas" in the register and can switch fuel invisibly to the market, so they
  are labelled coal/gas. Huntly 5 and 6 are gas.
- Arapuni (ARI1101, ARI1102) and Roxburgh (ROX2201, ROX1101) generate onto two buses each, so they appear as two
  rows. The site splits a plant by grid connection only where it feeds more than one bus.
- The plant register lags reality: Kaiwaikawe (MPE1101 KWK0), Kōwhai Park (ISL0661 KPS0) and Ruakākā solar
  (BRB0331 RUS0) were missing; Pātea moved from HWA1101 to OHG1101 in June 2026 and OHG1101 has no island in
  the feed. These are fixed in `facilities/overrides.toml`.
- HVDC flow isn't in the dispatch feed; it is estimated from the island balance until `HVDC_Flows` arrives (~2 weeks).

## Status and next steps

1. Site on Cloudflare Workers (free `*.workers.dev` address; domain elenz.nz to be bought later).
2. Move the poller onto an always-on Ubuntu server: `emi_live.py watch --build`, publish `tracker.json` to
   Cloudflare R2, and point the site at it instead of the committed snapshot.
3. Then the brief's build order: history and plant pages, map, hydro panel and records, offer stacks and downloads.

Open questions: emission factors (and how to treat the Rankines), rooftop solar capacity from GUEHMT, written
confirmation of terms from the EA before launch.
