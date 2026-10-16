# Elenz: notes for Claude

Public NZ electricity tracker modelled on openelectricity.org.au. The owner knows the power system well but is new
to web development and hosting, so give step-by-step instructions for anything they have to do themselves.
This repository is public: never commit keys, tokens or personal details.

## Layout

- `site/`: SvelteKit 3 + Svelte 5, `adapter-static`, every page prerendered. Hosted on Cloudflare Workers as static
  assets (`wrangler.jsonc` at the repo root; build command `cd site && npm ci && npm run build`, deploy command
  `npx wrangler deploy`). Every push to `main` redeploys. Pages: `/` the landing page (`src/routes/+page.svelte`: the
  mark, live total generation, a rotating second figure, the mix bar and a 24-hour line, then a glimpse of each page;
  add a page to its `PAGES` list with a preview component in `src/lib/landing/`); `/now` the live page
  (`src/routes/now/+page.svelte`: live figures, the island map with each island's mix ring, the generation mix now,
  from tracker.json's newest interval via `src/lib/home/now.js`; island outlines in `src/lib/home/nzmap.js`, made by
  `analysis/make_nz_map.py`); `/articles` records, quarterly reviews and analysis (`src/routes/articles/`; one
  Svelte file per article in `src/lib/articles/posts/<slug>.svelte` exporting `meta` {title, dek, date, kind, draft}
  from a module script, with `Record`, `Figure` and `Note` components and `articles.css` alongside; the registry is
  `src/lib/articles/registry.ts`). `ARTICLES_PUBLIC` there is true (published 15 Oct 2026 with the Winter 2026 review): Articles is in the
  navigation and on the landing page (`ArticlesPeek`); drafts (`draft: true`) stay off the index and are `noindex`, but
  their own address still works for review. `article-template` is a draft layout sample. Articles dated after today (NZ time, at build) are scheduled: hidden like drafts until a build on or after their date (`scheduled`/`hidden` in the registry; any push rebuilds). Series: an article with `series: '<key>'` and `part: n` in its meta (keys in `SERIES` in the registry) shows "Part n of N" under its title and `SeriesNav` (all parts, previous/next) at its end, and the index folds the series into one card. The first series, "Inside the wholesale market" (`wholesale-market`, 7 parts, drafts from 16 Oct 2026), shares its data and helpers in `src/lib/articles/series/wholesale.ts`; its figures come from `analysis/wholesale_prices.py` (run `analysis/price_fetch.py` first for 30 years of final prices), which writes `data/wholesale-prices.json` and `data/wholesale-months.json` and prints every figure quoted. Every part's cover is `PriceCover` (each month's Haywards price since 1996), saved as its PNG with `analysis/cover_png.py <slug>`. Article charts are Svelte SVG components in `src/lib/articles/charts/` (Columns (with optional same-axis `marks`), HBars, DotRank, Lines (`xzero`, `xticks` for year and clock axes), TimeStack (`labelEvery`, fixed `ymax`/`pmax` to compare two charts), OfferStack (a supply curve from generator offers), Scatter, Ridgeline (one row per year, each on its own scale), TimeMoney (share of time against share of money by band), SplitBar (one whole in parts), MarketDiagram (the market as a flow); site colour tokens, hover readouts, a data table under each) plus `Stats` for headline figures; an article's chart data is a JSON file in `src/lib/articles/data/`, written by a script in `analysis/` (`winter_2026.py` for the Winter 2026 review, which also prints every figure quoted in the text). Quarterly reviews open with `ReviewCover`
  (the quarter's daily generation by fuel under the title, always dark): `analysis/review_cover.py 2026-06 2026-08 winter-2026`
  writes its data to `src/lib/articles/covers/`; `analysis/cover_png.py winter-2026` saves it as a 1200×630 PNG in
  `static/articles/` for link previews (set `image` in the article's meta; `SITE_URL` in the registry makes it absolute). The tracker has
  two tabs (`src/lib/site/TrackerTabs.svelte`, under the masthead): Generation at `/tracker` and Prices at `/tracker/prices`
  (`src/routes/tracker/prices/+page.svelte`: six node prices, the island spread and HVDC on one time axis for the live week and
  30 days; each period's price range, spread and half-hours over $500/$1,000 for 12 months and All; price captured by fuel;
  a 30-day time-of-day heat map. Data shaping in `src/lib/prices/data.js`, SVG charts in `src/lib/prices/`. Region, range,
  interval and date are shared with the Generation tab through the address (`?region=&range=&int=&end=YYYY-MM-DD`,
  `src/lib/site/view.js`; the tab links carry it, so any view can be linked), and region, range and a chosen interval
  are also remembered in localStorage `elenz-view` (never the date); the rest is kept in `elenz-prices`). The tracker page markup
  is in `src/routes/tracker/+page.svelte` (About page: `src/routes/about/+page.svelte`, a card per chart on how it's built; shared
  masthead, footer, logo mark and Buy Me a Coffee link in `src/lib/site/`); the canvas chart code is `src/lib/tracker/tracker.js` (vanilla JS, driven by
  element ids in the page), styles in `src/lib/tracker/tracker.css` (colour tokens, light/dark). The fuel table
  (colours, renewable flags, fallback emission factors) is `src/lib/tracker/fuels.js`, shared with the home pages;
  every emissions calculation goes through `src/lib/tracker/emissions.js` (the Rankines' quarterly factor, each
  geothermal station's own factor by year; evidence in `analysis/emission_factors.py` and `analysis/README.md`).
  `src/lib/tracker/series.js` loads the history files and merges them with the live week (24 h/3 d/7 d use the
  live 5-minute data; 30 days uses half-hourly history; 1 year and All use daily history).
- `ingest/`: Python. `update.py` (the scheduled job), `state.py` (compact 7-day state: one row per interval,
  columns `U|POC UNIT`, `C|...` charging, `L|NI`, `L|SI`, `T`, `P|NI`, `P|SI`, `P|<node>` for `[price_nodes]`, `src`), `build_tracker.py`
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
  dispatches the GitHub jobs (live every 5 minutes, history every 6 hours, watchdog every 15 minutes) (Worker secret `GITHUB_TOKEN`: fine-grained,
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
- `.github/workflows/checks.yml`: on every push, ruff (syntax errors and undefined names only), `ingest/tests/smoke.py`
  (the live and history paths on a committed one-hour sample of real dispatch data and matching final prices, no network)
  and the site's `npm run check` and `npm run build`. Cloudflare deploys `main` regardless, so a red cross means look now.
- `.github/workflows/watchdog.yml`: checks the live site every 15 minutes; opens an issue labelled `stale-data`
  (GitHub emails it to the owner) when live data is over 30 minutes old, history over 5 days behind, or the Worker
  can't start a job, and closes it when the data recovers.
- `data/`: raw downloads, git-ignored.

## Facts learned from the data (Oct 2026)

- The real-time dispatch API (`https://emi.azure-api.net/real-time-dispatch/`, header `Ocp-Apim-Subscription-Key`)
  returns the same RTD case as the daily `NodalPricesAndVolumes` files: identical MW, prices within a cent.
  Rows are keyed `"POC UNIT"` for generators, so fuel mapping is per unit. About 568 rows per interval; ~300 are
  bus nodes with no load or generation.
- `FiveMinuteIntervalDatetime` is NZ local time without an offset; `RunDateTime` is UTC without a marker.
  The case for interval T runs at about T−1 min.
- Each interval appears in the API about 1:10–2:00 after its start (measured 15 Oct 2026), while the cron's run
  starts ~10–50 s after the mark, so it used to save the interval before and run 6–11 minutes behind. `update.py` now
  waits (up to `WAIT`, polling every 15 s) for the interval that has just begun, so data lands within seconds of
  publication (1–7 minutes old) when the API keeps up. It doesn't always: on the evening of 15 Oct 2026 it ran
  10–13 minutes behind with RunDateTime missing on every row, and each run waited out `WAIT` for nothing (harmless).
  Pages tick every minute but fetch only once the next interval is due (`site/src/lib/site/poll.js`: 6½ minutes after
  the newest interval's start, then every minute until it lands). The live job stores a version tag with tracker.json
  as KV metadata in the same write (`store.put(..., metadata=)`, multipart; saved plainly if KV refuses it); the Worker
  sends it as a weak ETag and answers a matching If-None-Match with 304, so repeat checks carry no body. The Worker
  caches tracker.json (and its metadata) for 30 s. (Changing the cron in
  wrangler.jsonc didn't take effect: the automatic deploy updates code, not cron triggers.)
- The API's "latest" reply can come back broken: on 15 Oct 2026 (~09:01–09:11 UTC) every row lacked fields, which
  crashed the job. `update.py` now logs the missing fields and asks for each interval after the newest stored one by time.
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
- Emissions: Huntly Rankines follow Genesis's quarterly "Rankines fuelled by coal %" (performance reports) at
  11.2 GJ/MWh; coal 91.8, gas 54.1 kg CO₂e/GJ; gas plant 0.46 t/MWh; geothermal per station by year (NZGA). These
  reproduce Genesis's reported Huntly emissions within ±5% in most quarters. The dispatch data's Rankine output
  matches Genesis's reported Rankine output within 1–2% a quarter.
- Fuel labels corrected in `[units]` (BUILD 5, Oct 2026): Kinleith (KIN0112, wood-waste cogeneration) and the Kawerau
  pulp mill (KAW0112 ONU0, listed as geothermal) are `bio` (Bioenergy, renewable, zero emissions); Glenbrook (GLN0332 GLN0,
  waste gas from NZ Steel's ironmaking) is `waste` (Waste heat, zero emissions, grouped with fossils).
- Price nodes: the daily dispatch files carry only connection points with load or generation (~263 rows an interval),
  so bus nodes (HAY2201, BEN2201, OTA2201, ISL2201, INV2201) are missing; WKM2201 is a generating node and is there.
  The real-time API's ~568 rows include the bus nodes. Final prices (`FinalEnergyPrices`) have every node (~246).
  History's `daily()` adds each day's price spread (p10, p90, pmin, pmax, n500, n1000), revenue by fuel at the
  island price (`rv_<fuel>`, plus `batt_d`, battery discharge) and `nodes` daily means; the Prices page computes
  revenue for 5-minute and half-hourly data itself (fuel MW × island price).
- The live API now and then returns rows with fields missing (RunDateTime null, ~3 a day); `emi_live.to_frame`
  skips or patches them instead of failing.
- Open-Meteo rate-limits some shared addresses (HTTP 429). The history job stores missing irradiance as blank and
  retries it on later runs (up to `IRR_MONTHS_PER_RUN` months a run).
- Final prices (`FinalEnergyPrices`): `ByMonth/YYYYMM_FinalEnergyPrices.csv` for past months (~10 MB, every node),
  `YYYYMMDD_FinalEnergyPrices.csv` daily for the last year, `_I` suffix while interim (the last day or two, and
  occasionally days under review, e.g. 31 Aug and 1 Sep 2026). Trading period k starts (k−1) half-hours after local
  midnight. History uses final prices; dispatch prices can be wildly different under scarcity pricing (9 Aug 2021:
  dispatch peak $356,621/MWh, final peak $2,698).
- `history.py` keeps to `WRITE_BUDGET` (280) KV writes per UTC day, counted in `hist/progress.json` (saved by every
  run that writes anything, including runs that rebuild no month); a rebuild that hits it resumes next run
  (`rebuild_left`), and `hist/index.json`/`day.json` are only republished when complete.
- `ingest/requirements.txt` pins major versions (pandas 3, numpy 2): the live job installs them on every run, so
  check a new major version locally before widening the pin.
- `npm run check` type-checks the Svelte/TypeScript files only (`checkJs` is off in `site/tsconfig.json`: the chart
  code in `src/lib/tracker/*.js` and `src/lib/home/now.js` is untyped JavaScript and gave ~800 false alarms).
- GitHub's own schedules (the backups in the three workflows) fire only now and then (9 scheduled runs in two days,
  checked 15 Oct 2026), so they don't protect against the Worker's cron stopping: nothing outside Cloudflare alerts
  if it does. `/data/health` (Worker) covers that: 200 while live data is under 30 minutes old and history under 5
  days behind, 503 with the reasons otherwise; an outside uptime monitor checks it every 5 minutes and emails the owner.

## Status and next steps

1. Site live at https://elenz.elenz.workers.dev (Cloudflare Workers; domain elenz.nz to be bought later).
2. Live data via GitHub Actions + Workers KV (set up Oct 2026). A paid server running `update.py` in a loop is the
   upgrade path if GitHub's schedule delays become a problem.
3. History since Sep 2020 on the tracker page: 30 days, 1 year, All (Oct 2026).
   Daily history keeps each day's peak demand and peak generation (total output including embedded solar). BUILD 4
   (embedded solar model, metered HVDC) finished 16 Oct 2026. BUILD 5 (Prices page fields, bioenergy and waste heat)
   pushed 16 Oct 2026: every month's state gains the other nodes' final prices (one monthly final-prices file each),
   then the month is rebuilt; expect a couple of runs before `hist/index.json` and `day.json` are republished.
4. Pages: landing (`/`), live (`/now`), tracker (Generation and Prices tabs), About, and Articles (`/articles`, published 15 Oct 2026 with the Winter 2026 review). Stale-data watchdog, Cloudflare Web Analytics and a Buy Me a
   Coffee link are in place.
5. Then the brief's build order: plant pages, map, hydro panel and records (planned as short record articles),
   offer stacks and downloads.

Recurring upkeep: add Genesis's Rankine coal share to `emissions.js` each quarter (performance report ~3 weeks
after quarter end; FY27 Q1 due late Oct 2026); add each year's NZGA geothermal figures (NZ Geothermal Workshop,
November); renew the Worker's `GITHUB_TOKEN` before it expires (~Oct 2027).

Open questions: written confirmation of terms from the EA before launch; farm mounting (tracking or fixed) to confirm.
