# Elenz: notes for Claude

Public NZ electricity tracker modelled on openelectricity.org.au. The owner knows the power system well but is new
to web development and hosting, so give step-by-step instructions for anything they have to do themselves.
This repository is public: never commit keys, tokens or personal details.

## Layout

- `site/`: SvelteKit 3 + Svelte 5, `adapter-static`, every page prerendered. Hosted on Cloudflare Workers as static
  assets (`wrangler.jsonc` at the repo root; build command `cd site && npm ci && npm run build`, deploy command
  `npx wrangler deploy`). Every push to `main` redeploys. The home page (`/`: live figures, the island map and the
  generation mix now, from tracker.json's newest interval via `src/lib/home/now.js`; island outlines in
  `src/lib/home/nzmap.js`, made by `analysis/make_nz_map.py`) is `src/routes/+page.svelte`. The tracker page markup
  is in `src/routes/tracker/+page.svelte` (About page: `src/routes/about/+page.svelte`, with the data sources table; shared
  masthead and footer in `src/lib/site/`); the canvas chart code is `src/lib/tracker/tracker.js` (vanilla JS, driven by
  element ids in the page), styles in `src/lib/tracker/tracker.css` (colour tokens, light/dark). The fuel table
  (colours, emission factors, renewable flags) is `src/lib/tracker/fuels.js`, shared with the home page.
  `src/lib/tracker/series.js` loads the history files and merges them with the live week (24 h/3 d/7 d use the
  live 5-minute data; 30 days uses half-hourly history; 1 year and All use daily history).
- `ingest/`: Python. `update.py` (the scheduled job), `state.py` (compact 7-day state: one row per interval,
  columns `U|POC UNIT`, `C|...` charging, `L|NI`, `L|SI`, `T`, `P|NI`, `P|SI`, `src`), `build_tracker.py`
  (state → tracker.json; `assemble()` is shared with history), `emi_live.py` (API client), `store.py` (Workers KV
  via the Cloudflare REST API, or `data/store` locally), `sync.py` (EMI blob container + Open-Meteo), `common.py`
  (paths, overrides). `history.py`: history since 10 Sep 2020 from the daily dispatch files (see its docstring for
  the KV keys `hist/*`); bump its `BUILD` number to rebuild every month after changing how months are built.
  `rooftop.py` (embedded solar, shown on the site as "Embedded solar", data key `roof`: rooftops and ground-mounted
  arrays up to ~10 MW on local networks; registry capacity by Root NSP less dispatched farms, three types (small,
  large, ground), 35 irradiance points, Himawari
  satellite irradiance via Open-Meteo, PV model `pv.py`, calibration and uncertainty) and `hvdc.py` (metered HVDC
  parsing and the fitted estimate). `analysis/` holds the development scripts and `analysis/README.md` the evidence
  behind every constant in them.
- `.github/workflows/update-data.yml`: runs `update.py` on GitHub (free because the repo is public). Triggered every
  5 minutes by the Worker's Cloudflare cron through the workflow_dispatch API, because GitHub's own schedule never
  fired for this new repo (it stays as a 30-minute backup). Secrets: `EMI_KEY`, `CF_ACCOUNT_ID`, `CF_API_TOKEN`
  (Workers KV Storage: Edit). KV namespace id lives in `wrangler.jsonc`. A run with no new data saves nothing.
- `.github/workflows/history.yml`: runs `history.py`, triggered every 6 hours by the Worker's second cron. The first
  run backfills ~2,200 daily files (resumes next run if it hits its time budget). KV writes: ~3 per changed month,
  ~225 for a full backfill or rebuild, on top of the live job's ~600/day, so avoid more than one full rebuild a day.
- `worker/index.js`: serves static assets, `/data/tracker.json` from KV (binding `DATA`), falling back to the
  bundled snapshot, and `/data/history/{index,day,hh/YYYY-MM}.json` from KV keys `hist/*`; its `scheduled` handler
  dispatches the GitHub jobs (live every 5 minutes, history every 6 hours) (Worker secret `GITHUB_TOKEN`: fine-grained,
  elenz only, Actions read/write; it expires, so renew it yearly). KV free plan: 1,000 writes/day (the job uses ~600), 100,000 reads/day.
- `facilities/rooftop_points.csv`, `rooftop_nsp.csv` (irradiance points and NSP → point; regenerate with
  `analysis/make_points.py`), `rooftop_capacity.json` (capacity snapshot the live job uses until the history job
  has stored `hist/roof_cap.json`).
- `facilities/overrides.toml`: curated corrections (any change rebuilds history, except the site-only `[owners]`,
  `[plant_owners]` and `[hydro_schemes]`), `[solar_farms_in_registry]` (dispatched farms the
  distributed-generation registry also counts), plus `[owners]`, `[plant_owners]` and `[hydro_schemes]` for the
  site's By owner / By hydro scheme views; `facilities/connection_points.csv`: POC → island;
  `facilities/plant_register.csv`: the EA register (refresh with `sync.py plants`, review the diff).
- `ingest/plant_meta.py` writes `site/src/lib/tracker/plants.json` (plant → owner, hydro scheme) from the register and
  those tables. Rerun it and commit the JSON after refreshing the register or editing the tables.
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
- HVDC flow isn't in the dispatch feed. History uses metered `HVDC_Flows` (Benmore and Haywards ends, ~2 weeks
  after each month); the live week and newer history use `hvdc.estimate`, fitted to the metered flows (~10 MW
  mean error). The NI series is what arrives at Haywards, the SI series what leaves Benmore, `hvdcN` mid-link.
- Daily dispatch files start on 10 Sep 2020 (`Pre1November2022Archive` holds solver case files, not volumes), about
  11 MB a day. Earlier history would need `Generation_MD` (metered, from 1997) and final prices.
- The register's dated rows matter for history: `register()` keeps retired units (Taranaki Combined Cycle) and
  old connections (Pātea on HWA1101), latest row winning. A unit idle all window is left out of its plant.
- Installed distributed solar (EMI report GUEHMT) was 1,270 MW in Sep 2026, but ~410 MW of it is dispatched solar
  farms on local networks (Kōwhai Park is the Jul 2026 jump), so rooftop solar is ~860 MW. See analysis/README.md.
- Renewable dispatch MW reflect actual output unless constrained (matches metered injection within ~1–2%).
- Open-Meteo rate-limits some shared addresses (HTTP 429). The history job stores missing irradiance as blank and
  retries it on later runs (up to `IRR_MONTHS_PER_RUN` months a run).
- Final prices (`FinalEnergyPrices`): `ByMonth/YYYYMM_FinalEnergyPrices.csv` for past months (~10 MB, every node),
  `YYYYMMDD_FinalEnergyPrices.csv` daily for the last year, `_I` suffix while interim (the last day or two, and
  occasionally days under review, e.g. 31 Aug and 1 Sep 2026). Trading period k starts (k−1) half-hours after local
  midnight. History uses final prices; dispatch prices can be wildly different under scarcity pricing (9 Aug 2021:
  dispatch peak $356,621/MWh, final peak $2,698).
- `history.py` keeps to `WRITE_BUDGET` (280) KV writes per UTC day, counted in `hist/progress.json`; a rebuild that
  hits it resumes next run (`rebuild_left`), and `hist/index.json`/`day.json` are only republished when complete.

## Status and next steps

1. Site live at https://elenz.elenz.workers.dev (Cloudflare Workers; domain elenz.nz to be bought later).
2. Live data via GitHub Actions + Workers KV (set up Oct 2026). A paid server running `update.py` in a loop is the
   upgrade path if GitHub's schedule delays become a problem.
3. History since Sep 2020 on the tracker page: 30 days, 1 year, All (Oct 2026).
   Daily history keeps each day's peak demand and peak generation (total output including rooftop solar), BUILD 3.
4. Then the brief's build order: plant pages, map, hydro panel and records, offer stacks and downloads.

Open questions: emission factors (and how to treat the Rankines), written confirmation of terms from the EA
before launch, farm mounting (tracking or fixed) to confirm, Taiohi's metered output above its dispatch.
