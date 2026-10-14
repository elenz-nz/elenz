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
- `ingest/`: Python. `update.py` (the scheduled job), `state.py` (compact 7-day state: one row per interval,
  columns `U|POC UNIT`, `C|...` charging, `L|NI`, `L|SI`, `T`, `P|NI`, `P|SI`, `src`), `build_tracker.py`
  (state → tracker.json), `emi_live.py` (API client), `store.py` (Workers KV via the Cloudflare REST API, or
  `data/store` locally), `sync.py` (EMI blob container + Open-Meteo), `common.py` (paths, overrides).
- `.github/workflows/update-data.yml`: runs `update.py` on GitHub (free because the repo is public). Triggered every
  5 minutes by the Worker's Cloudflare cron through the workflow_dispatch API, because GitHub's own schedule never
  fired for this new repo (it stays as a 30-minute backup). Secrets: `EMI_KEY`, `CF_ACCOUNT_ID`, `CF_API_TOKEN`
  (Workers KV Storage: Edit). KV namespace id lives in `wrangler.jsonc`. A run with no new data saves nothing.
- `worker/index.js`: serves static assets, and `/data/tracker.json` from KV (binding `DATA`), falling back to the
  bundled snapshot; its `scheduled` handler dispatches the GitHub job (Worker secret `GITHUB_TOKEN`: fine-grained,
  elenz only, Actions read/write; it expires, so renew it yearly). KV free plan: 1,000 writes/day (the job uses ~600), 100,000 reads/day.
- `facilities/overrides.toml`: curated corrections; `facilities/connection_points.csv`: POC → island;
  `facilities/plant_register.csv`: the EA register (refresh with `sync.py plants`, review the diff).
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

1. Site live at https://elenz.elenz.workers.dev (Cloudflare Workers; domain elenz.nz to be bought later).
2. Live data via GitHub Actions + Workers KV (set up Oct 2026). A paid server running `update.py` in a loop is the
   upgrade path if GitHub's schedule delays become a problem.
3. Then the brief's build order: history and plant pages, map, hydro panel and records, offer stacks and downloads.

Open questions: emission factors (and how to treat the Rankines), rooftop solar capacity from GUEHMT, written
confirmation of terms from the EA before launch.
