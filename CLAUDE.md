# Elenz: notes for Claude

Public NZ electricity tracker at https://elenz.co.nz. The owner knows the power system well but is new
to web development and hosting, so give step-by-step instructions for anything they have to do themselves.
This repository is public: never commit keys, tokens or personal details.

## Beta note (remove when the site is announced)

Until the site is announced every page shows a thin "Beta" line above the masthead (`site/src/lib/site/Masthead.svelte`,
`.beta-note` in `site/src/lib/tracker/tracker.css`). It has no end date: the owner decides when to announce. Then
delete the markup, the styles (keeping `.mast-wrap` is harmless) and this section.

## Layout

- `site/`: SvelteKit 3 + Svelte 5, `adapter-static`, every page prerendered. Hosted on Cloudflare Workers as static
  assets (`wrangler.jsonc` at the repo root; build command `cd site && npm ci && npm run build`, deploy command
  `npx wrangler deploy`). Every push to `main` redeploys. Pages: `/` the landing page (`src/routes/+page.svelte`: the
  logo (stacked on desktop, compact on phones), live total generation with one rotating second figure, a small live stamp,
  and the 24-hour horizon line along the bottom of the first screen, then a glimpse of each page; add a page to its
  `PAGES` list with a preview component in `src/lib/landing/`. As the page scrolls, `Handoff.svelte` shrinks the horizon
  into its dot, flies it through the Now preview's map (building its rings and HVDC link via `build.svelte.js`) and opens
  it out onto the Tracker preview; shared chart geometry in `geometry.js`, map positions in `src/lib/home/maplayout.js`); `/now` the live page
  (`src/routes/now/+page.svelte`: live figures, the island map with each island's mix ring, the generation mix now,
  from tracker.json's newest interval via `src/lib/home/now.js`; island outlines in `src/lib/home/nzmap.js`, made by
  `analysis/make_nz_map.py`; under the price tiles the price explainer, "Why is the price high?": rules and wording in
  `src/lib/now/explain.js`, drawn by `src/lib/now/PriceExplainer.svelte`, from tracker.json's `explain` block (see
  `ingest/explain.py`); quiet, highlighted or open by itself, rules tested in `analysis/price_triggers.py`); `/articles` records, quarterly reviews and analysis (`src/routes/articles/`; one
  Svelte file per article in `src/lib/articles/posts/<slug>.svelte` exporting `meta` {title, dek, date, kind, draft}
  from a module script, with `Record`, `Figure` and `Note` components and `articles.css` alongside; the registry is
  `src/lib/articles/registry.ts`). `ARTICLES_PUBLIC` there is true (published 15 Oct 2026 with the Winter 2026 review): Articles is in the
  navigation and on the landing page (`ArticlesPeek`); drafts (`draft: true`) stay off the index and are `noindex`, but
  their own address still works for review. `/records` the records (`src/routes/records/`; one page per record at
  `/records/<id>?region=NI|SI`, prerendered from `DEFS`): the highest and lowest half-hours, months and runs since 1997
  for NZ and each island, from `/data/history/records.json` (`ingest/records.py`). Names, wording, formatting, the
  share image and the live check (the live week averaged to half-hours, generation and demand records only; also the
  provisional line on /now, `RecordLine.svelte`) are in `src/lib/records/`; `RecordsPeek` on the landing page.
  Until the history is complete the file isn't published and the page says the records are being worked out. `article-template` is a draft layout sample. Articles dated after today (NZ time, at build) are scheduled: hidden like drafts until a build on or after their date (`scheduled`/`hidden` in the registry; any push rebuilds). Series: an article with `series: '<key>'` and `part: n` in its meta (keys in `SERIES` in the registry) shows "Part n of N" under its title and `SeriesNav` (all parts, previous/next) at its end, and the index folds the series into one card. No series is defined now: the first, "Inside the wholesale market" (7 parts), was removed on 18 Oct 2026 while the owner rethinks its content; commit 21c8b47 is the last with it (its pages, `src/lib/articles/series/wholesale.ts`, data JSON and cover PNGs). `analysis/wholesale_prices.py` (after `analysis/price_fetch.py`) still makes its figures, and `PriceCover` its covers. Article charts are Svelte SVG components in `src/lib/articles/charts/` (Columns (with optional same-axis `marks`), HBars, DotRank, Lines (`xzero`, `xticks` for year and clock axes), TimeStack (`labelEvery`, fixed `ymax`/`pmax` to compare two charts), OfferStack (a supply curve from generator offers), Scatter, Ridgeline (one row per year, each on its own scale), TimeMoney (share of time against share of money by band), SplitBar (one whole in parts), MarketDiagram (the market as a flow); site colour tokens, hover readouts, a data table under each) plus `Stats` for headline figures; an article's chart data is a JSON file in `src/lib/articles/data/`, written by a script in `analysis/` (`winter_2026.py` for the Winter 2026 review, which also prints every figure quoted in the text). Quarterly reviews open with `ReviewCover`
  (the quarter's daily generation by fuel under the title, always dark): `analysis/review_cover.py 2026-06 2026-08 winter-2026`
  writes its data to `src/lib/articles/covers/`; `analysis/cover_png.py winter-2026` saves it as a 1200×630 PNG in
  `static/articles/` for link previews (set `image` in the article's meta; `SITE_URL` in the registry makes it absolute). The tracker has
  two tabs (`src/lib/site/TrackerTabs.svelte`, under the masthead): Generation at `/tracker` and Prices at `/tracker/prices`
  (`src/routes/tracker/prices/+page.svelte`: six node prices, the island spread and HVDC on one time axis for the live week and
  30 days; each period's price range, spread and half-hours over $500/$1,000 for 12 months and All; price captured by fuel;
  a 30-day time-of-day heat map. Data shaping in `src/lib/prices/data.js`, SVG charts in `src/lib/prices/`. Under the Generation tab's charts, `src/lib/generation/GenLower.svelte`: a share of generation over the range with the same dates a year earlier (365 days; not on All), dispatchable headroom (hydro, gas, coal/gas, diesel and battery capacity less output at three levels: installed (`capacity.json`), offered and offered under $1,000/MWh (`hist/off/*` from `ingest/offered.py`); Levels view (nested areas) or By fuel (one level stacked, hydro on top and optional); where a chart point spans more data, each level's lowest within it, which for installed capacity on daily history needs `peak.disp`/`peak.dispx`, each day's highest half-hour of dispatchable output with and without hydro, added at the next rebuild; method on /methods/capacity#headroom), the mix by fuel with capacity factors (from `capacity.json`; peaks only for half-hourly or finer data; batteries count discharge, daily history's `batt_d`), and the 30 days to the range's end by time of day; data shaping in `src/lib/generation/data.js`. The tracker hands it its window through the `view` hook of `mountTracker` (model, live week, history store), and it loads the year-earlier and 30-day history only when scrolled near. Cards say what they cover with `src/lib/site/Context.svelte` (range chip, dates, region, resolution; `src/lib/site/context.js`), as do the Prices tab's lower cards. On both tabs the Live / History / Delayed pill and the About this data button sit on the tabs line (TrackerTabs' `children`), and the control bar sticks to the top of the window at every width (two rows on phones, control names hidden) (`.toolbar` in tracker.css; `src/lib/site/sticky.js` keeps `--tb-h`, its height, so the summary panel sticks below it) and has arrows beside the date that step by the range (Generation: `tb-prev`/`tb-next`, synced in tracker.js with the chart's own arrows). Every chart and lower card can be enlarged over the page (`src/lib/site/PopButton.svelte`; `.card.popped` in tracker.css; heat maps take `--rh`, their row height). The 30-day heat maps don't follow the range, so their range chip has a padlock (`Context`'s `locked`). The share chart and heat map offer Renewables, Wind, Solar, Inverter-based (wind and solar), Hydro, Gas and Coal/gas (`METRICS` in `src/lib/generation/data.js`). Every view is in the address, so any view can be linked (keys and parsing in `src/lib/site/viewurl.js`, pure and
  shared with the Worker and the tests in `site/tests/` (`npm test`); the browser side in `src/lib/site/view.js`):
  `region`, `range`, `int`, `end=YYYY-MM-DD` shared by both tabs; the Generation tab's `by` (grouping), `unit=pct` and
  drill-down `group`, `fuel`, `plant` (plants and plant sets by `slug()`: "manapouri", "branch-river-arnold"; old slugs
  can be mapped in `PLANT_ALIASES`); the Prices tab's `scale`, `hide` (nodes) and `band`; and in links only, `t`, the
  point the summary opens on. An address with a query is a link and opens exactly that; a plain visit opens on this
  browser's last region, range and interval (localStorage `elenz-view`, plus the grouping and MW/%) and `elenz-prices`,
  never the date or drill-down. Settings replace the address; each drill-down step pushes one, so Back steps out of it
  (`onPop` in tracker.js). The tab links carry the shared settings plus the other tab's own from its last visit in this
  browser tab (sessionStorage, `tabHref`). The Share button (`src/lib/site/ShareLink.svelte`, beside About this data)
  copies a link to the live view or to the dates shown (`shareLinks`), optionally marking the pinned point; on phones
  it opens the share sheet. A click on any chart pins the time line there (accent line, "Pinned · Release" under the
  summary's heading; another click on it, Release or Escape lets go); drilling down is from the summary list only (the
  generation chart no longer drills on click). Touch keeps its point without pinning, so it can still scrub. The browser tab's title says what the view shows (`describe`), and the
  Worker puts the same title into the page title, og:title and og:url of `/tracker` and `/tracker/prices` for a linked view. The tracker page markup
  is in `src/routes/tracker/+page.svelte` (About and Data and methods share one layout with a contents sidebar, the route group `src/routes/(docs)/`; About page: `src/routes/(docs)/about/+page.svelte`, short: what each page shows, where the data comes from in brief, support, contact; links to its old `#m-*` sections forward to the method pages. Data and methods: `/methods` overview, `/methods/sources` every dataset, `/methods/<slug>` one page per series (generation, embedded-solar, demand, hvdc, prices, price-explainer, emissions, groupings, history); topics and datasets in `src/lib/methods/registry.ts` (each page's header and "Data used" box come from it, so a dataset is described once), bodies in `src/lib/methods/pages/<slug>.svelte`, styles in `methods.css`. The emissions and price explainer pages import their factors and rules from `emissions.js` and `explain.js`, so they stay in step; the other pages are prose: when a method changes, update its page and its `updated` date; shared
  masthead, footer (© line, data credits, link icons: fill in a `href` in its `LINKS` to show a social account), logo mark and Buy Me a Coffee link in `src/lib/site/`); the canvas chart code is `src/lib/tracker/tracker.js` (vanilla JS, driven by
  element ids in the page; each chart is drawn once per view into an off-screen base, and moving the time line only
  copies the base back and draws the line, dots and time chip over it (`paint`), so scrubbing stays smooth on phones:
  call `render()` when anything other than the hover point changes, `hover()` when only the point moves), styles in `src/lib/tracker/tracker.css` (colour tokens, light/dark). The fuel table
  (colours, renewable flags, fallback emission factors) is `src/lib/tracker/fuels.js`, shared with the home pages;
  every emissions calculation goes through `src/lib/tracker/emissions.js` (the Rankines' quarterly factor, each
  geothermal station's own factor by year; evidence in `analysis/emission_factors.py` and `analysis/README.md`).
  `src/lib/tracker/series.js` loads the history files and merges them with the live week (24 h/3 d/7 d use the
  live 5-minute data; 30 days uses half-hourly history; 1 year and All use daily history).
- "Every generator right now" on /now (`src/lib/now/Generators.svelte`, rows and settings in `src/lib/now/generators.js`):
  each plant in tracker.json's `plants` at the newest interval, MW against the installed capacity that applies today
  (`capacity.json`, else the register nameplate), fuel, island and owner (`plants.json`); stations shown whole and
  two-bus plants expand into their `units`. Sort, filters and search live in /now's address (`fuel`, `island`, `owner`
  as a slug, `sort` = mw | pct | name with `-asc`/`-desc`, `q`, `on=1` generating only); 20 rows until "Show all".
  Each plant links to `/tracker?fuel=<fuel>&plant=<slug>`. Later the index of plant pages (/plants).
- Footer extras (`src/lib/site/SiteFooter.svelte`): "Report a problem" (`ReportLink.svelte`: an email to hello@elenz.co.nz
  with the page title and full address, so the view, filled in when clicked) and a link to `/privacy`
  (`src/routes/(docs)/privacy/+page.svelte`, in the About/methods sidebar). The privacy page describes what the code
  does (Cloudflare Web Analytics, the browser storage keys, fonts, the email setup): update it and its date if any of
  that changes. Method pages also have their own report line (`reportHref` in the methods registry).
- Fonts: Schibsted Grotesk (text) and IBM Plex Mono (figures) are bundled from the `@fontsource/*` packages, imported in
  `src/routes/+layout.svelte`; the site makes no requests to Google.
- `/sitemap.xml` (`src/routes/sitemap.xml/+server.ts`, prerendered from the same registries as the pages; listed in
  `static/robots.txt`, submitted in Google Search Console) and a canonical address on every page (root layout).
  A new kind of public page needs adding to the sitemap's list.
- Downloads: the Download button on both tracker tabs (`src/lib/site/DownloadMenu.svelte`, beside Share) gives the
  chart as a PNG (the view's title and dates over the charts, each with its heading and legend, the credit line and the
  view's link at the foot, drawn at twice the screen's resolution in the current light/dark colours) or the view's data
  as a CSV ('#' header lines: what it is, dates, source, licence CC BY 4.0, the view's link; then one row per point,
  NZ and UTC times). Shared pieces in `src/lib/site/download.js` (`composeImage`, `svgImage` for the Prices tab's SVG
  charts, `legendOf`, `csvText`); the Generation tab's files are made in tracker.js (`image('gen' | 'all')`, `csv()`),
  the Prices tab's in its page. The link is the live view while live, otherwise its dates and any pinned point.
- Link previews: every public page puts `src/lib/site/Preview.svelte` in its `<svelte:head>` (og:title, og:description,
  og:url, og:image, the large-image card). Articles use their cover PNG; every other page the site's card,
  `static/og/elenz.png` (2400 x 1260; each page asks for it as `?p=<page>`, since LinkedIn served some pages a thumbnail of one shared address): `src/lib/site/SiteCard.svelte` (the mark and name over a week of generation, cover style)
  drawn at `/og/card` (noindex, disallowed in robots.txt) and saved by `analysis/site_card_png.py` (redo it now and
  then; it isn't dated). `npm run check:previews` (`scripts/check-previews.js`, after the build, in checks.yml) fails
  if a public page (not noindex) lacks any tag or its image. A new page needs a `<Preview>`.
- `ingest/`: Python. `update.py` (the scheduled job), `state.py` (compact 7-day state: one row per interval,
  columns `U|POC UNIT`, `C|...` charging, `L|NI`, `L|SI`, `T`, `P|NI`, `P|SI`, `P|<node>` for `[price_nodes]`, `R` rows received, `src`: api, file, empty (no case) or partial (a case that arrived
  incomplete, `state.mark_partial`: an island's load less Tiwai or national generation under 75% of its neighbours', or
  under 85% of the usual rows; left out and interpolated, fetched again for 6 hours; first seen 19 Oct 2026, 13:00 NZDT).
  tracker.json's `meta.filled` lists the interpolated intervals as [first, length] runs; the summary heading says
  "interpolated"), `build_tracker.py`
  (state → tracker.json; `assemble()` is shared with history), `emi_live.py` (API client), `store.py` (Workers KV
  via the Cloudflare REST API, or `data/store` locally), `sync.py` (EMI blob container + Open-Meteo), `common.py`
  (paths, overrides). `history.py`: history since 1 Aug 1997 (see its docstring for the KV keys `hist/*`): metered data
  (`metered.py`: Generation_MD, Embedded_generation, Grid_export/import, Tiwai) for every month the EA has published it
  (~5-6 weeks behind), the daily dispatch files (from 10 Sep 2020) for the weeks since and to fill what the metering
  lacks; bump its `BUILD` number to rebuild every month after changing how months are built.
  `facilities/metered_plants.csv` maps each Generation_MD generator code (and, `*`, each listed embedded meter's
  residual over Generation_MD) to a plant, fuel and island, with date ranges and shares; `metered_islands.csv` gives
  islands for the many retired or local connection points in the metered files (from EMI's NetworkSupplyPointsTable).
  The build warns about any Generation_MD code not in the table.
  `explain.py`: the /now price explainer's data. The history job (`update()`, after the months) writes
  `hist/explain.json` (each factor's usual value for each half-hour of the week over the last 28 days of `hist/hh`, the
  price's pooled over the same kind of day within an hour (`POOL`), and the past year's median price) when history has moved on, and `hist/offers.json` (gzipped: the newest
  day of EMI `BidsAndOffers/Offers`, ~290 MB, reduced to each plant's offer stack per trading period, final offers only;
  ~2 minutes) when a newer day is published, both within `WRITE_BUDGET`. The live job reads both (two KV reads) and adds
  `explain` to tracker.json (usual values for the last 26 hours and this half-hour, factor values now, running peakers in
  `PEAKERS`, wind against its four-week median and how long since it was this low or high, and a possible price setter: a plant part way up a tranche priced within 25% of its island's price). If
  either file is missing the block is left out and /now shows no explainer.
  `records.py`: the Records pages' data. Each month rebuilt is summarised (every half-hour that beat everything
  earlier in the month, the month's figures, the runs at its ends and the longest inside) into `hist/rec/months.json.gz`
  (missing months are read back from `hist/hh`; bump its `VERSION` to remake all); `hist/records.json` (each record by
  region, its progression, context for its half-hour, the best for each month of the year, provisional records from
  dispatch months and which ones were settled) is published while the history is complete, only when it changes. Official
  means metered generation (meta.source), final prices, metered HVDC. Clock-change days are left out of generation and
  demand records (older Generation_MD files number those days by the clock; see NEXT_REBUILD.md).
  Try it on downloaded months: `python3 ingest/records.py <folder of YYYY-MM.json> [out.json]`.
  `offered.py` (its own workflow, `offers.yml`, started by the Worker with the history job every 6 hours): final
  generator energy offers from the EA's daily offers files (from 1 Jan 2013, published the day after; ~230 GB in all,
  most of it 2025-26) reduced to offered MW by plant per half-hour, and the part under `CHEAP` ($1,000/MWh):
  `hist/off/YYYY-MM.json` (each island's offered MW by dispatchable fuel on the hist/hh grid, plus `sum`, each day's
  lowest offered headroom and mean offered MW), `hist/offp/YYYY-MM.json.gz` (every plant, for plant pages' capacity
  not offered), `hist/off/days.json` (the summaries joined), `hist/off/progress.json`. Newest months first; its own
  `WRITE_BUDGET` (100 KV writes a day). Months in the last 100 days are summarised again as output changes; after a
  history rebuild run it with `--resummarise` (the workflow's tick box). Units the register lacks are logged and skipped.
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
  bundled snapshot, and `/data/history/{index,day,hh/YYYY-MM}.json` from KV keys `hist/*`; rewrites the title,
  og:title and og:url of the tracker's two pages for a linked view (from its address), which `run_worker_first` in
  `wrangler.jsonc` routes through it (`withPreview`, HTMLRewriter); its `scheduled` handler
  dispatches the GitHub jobs (live every 5 minutes, history every 6 hours, watchdog every 15 minutes) (Worker secret `GITHUB_TOKEN`: fine-grained,
  elenz only, Actions read/write; it expires, so renew it yearly). KV free plan: 1,000 writes/day (the job uses ~600), 100,000 reads/day.
- `facilities/rooftop_points.csv`, `rooftop_nsp.csv` (irradiance points and NSP → point; regenerate with
  `analysis/make_points.py`), `rooftop_capacity.json` (capacity snapshot the live job uses until the history job
  has stored `hist/roof_cap.json`).
- `facilities/overrides.toml`: curated corrections (any change rebuilds history, except the site-only `[owners]`,
  `[plant_owners]` and `[hydro_schemes]`), `[plant_groups]` (stations the metered history only sees whole: Huntly
  Rankines, Stratford, Waikaremoana, Te Mihi, Southdown, shown as one plant everywhere with their register plants as
  units), `[solar_farms_in_registry]` (dispatched farms the
  distributed-generation registry also counts), plus `[owners]`, `[plant_owners]` and `[hydro_schemes]` for the
  site's By owner / By hydro scheme views; `facilities/connection_points.csv`: POC → island;
  `facilities/plant_register.csv`: the EA register (refresh with `sync.py plants`, review the diff).
- `facilities/plant_capacity.csv`: installed MW of every plant the tracker shows, with the dates each figure applies
  (start/end inclusive, blank = open; `basis` register / override / pending; source and note per row; evidence in
  `analysis/capacity_check.py` and the "Installed capacity" section of `analysis/README.md`). Capacity counts from the
  first month the history has a plant's output. Not in the rebuild fingerprint. `ingest/capacity.py` writes
  `site/src/lib/tracker/capacity.json` (each fuel's MW by island as steps, embedded solar by month from
  `rooftop_capacity.json`, rows per plant) and, with `--check` (run in checks.yml), fails if a plant has no row, rows
  overlap, or the JSON is stale: after editing the CSV, run `python3 ingest/capacity.py` and commit both. A new plant
  that isn't generating yet gets a `pending` row with no dates.
- `facilities/NEXT_REBUILD.md`: changes waiting for the next full history rebuild (they touch fingerprinted files).
  Bundle them into one rebuild; never start one while another is running.
- `ingest/plant_meta.py` writes `site/src/lib/tracker/plants.json` (plant → owner, hydro scheme) from the register and
  those tables. Rerun it and commit the JSON after refreshing the register or editing the tables.
- `.github/workflows/checks.yml`: on every push, ruff (syntax errors and undefined names only), `ingest/tests/smoke.py`
  (the live and history paths on a committed one-hour sample of real dispatch data and matching final prices, no network)
  and the site's `npm run check`, `npm test` (`site/tests/`: the tracker's address), `npm run build` and `npm run check:previews`. Cloudflare deploys `main` regardless, so a red cross means look now.
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
- Tiwai is shown as ordinary demand (owner's call, 21 Oct 2026): no separate summary row or record. The data still
  carries `tiwai` (T, MT), unused by the site, in case it's wanted again.
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
  During a full rebuild the index is republished only at the end (a few days for BUILD 6), so both checks allow up to
  12 days while `hist/progress.json` shows months left and was saved in the last two days.
- Metered history (BUILD 6, Oct 2026; analysis/metered_check.py, analysis/README.md): `Generation_MD` from Aug 1997
  covers grid stations, and embedded stations only from Jan 2009; before that they are in `Embedded_generation`
  (Oct 1998 on) under old codes (RKA0111 Rotokawa, NGA0331 Ngāwhā, KMI0331 Kaimai, TRC0331 Te Rapa, TWF0331/2
  Tararua ...). Only embedded stations the tracker shows later are included, so totals don't jump in 2009.
  Generation_MD is net of local load at some embedded points (Mangahao ~10% of gross, Cobb ~35%); the embedded meter
  there has the gross figure. Over Sep 2020-Sep 2026 dispatch MW ran 1-2% above metered (wind ~3.5%, hydro 1-2%), with
  half-hourly national correlation 0.999. Plant-level differences: river chains are block dispatched (Waikato above
  all: Mercury only has to meet the chain's total), so per-station dispatch there isn't what each station did.
  `Grid_import` starts Oct 2000 and until ~2003 covered only local networks' injections, so Generation_MD stands in
  for connection points it lacks (J| columns). HVDC_Flows changed layout three times (HVDC_BN/BS/HN/HS to ~1999,
  DCP1/DCP2 poles, then BEN/HAY connection points; the 3501 rows repeat totals); `hvdc.parse_metered` reads all.
  Generation_MD gaps: Huntly's Rankines and unit 5 are missing for Sep 2020 (dispatch fills from 10 Sep), Matahina
  from Oct 2021 (dispatch fills).
- Rankine coal share before FY21 (emissions.js): MBIE quarterly generation from coal less Glenbrook's metered output
  (MBIE counts Glenbrook as coal), over the Rankines' metered output; reproduces Genesis's FY21-25 figures closely.

## Status and next steps

1. Site live at https://elenz.co.nz (Cloudflare Workers custom domain). The watchdog, UptimeRobot, article link
   previews and the analysis scripts use elenz.co.nz; nothing depends on https://elenz.elenz.workers.dev any more.
2. Live data via GitHub Actions + Workers KV (set up Oct 2026). A paid server running `update.py` in a loop is the
   upgrade path if GitHub's schedule delays become a problem.
3. History since Aug 1997 on the tracker page: 30 days, 1 year, All (BUILD 6, Oct 2026; was Sep 2020).
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
