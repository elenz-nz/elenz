# Elenz: notes for Claude

Public NZ electricity tracker at https://elenz.co.nz. The owner knows the power system well but is new
to web development and hosting, so give step-by-step instructions for anything they have to do themselves.
This repository is public: never commit keys, tokens or personal details.

## Getting changes live

`main` is protected (ruleset "protect main", 23 Oct 2026): no direct pushes; every change goes in through a pull request,
and it can only merge once the `ingest` and `site` checks (checks.yml) pass. That gates both things a merge sets live: the
site (Cloudflare redeploys `main`) and the ingest code (the data jobs run from `main` within 5 minutes). Work on a branch,
push it, open a PR and turn on auto-merge so it merges itself when the checks go green:
`gh pr create --fill --base main && gh pr merge --auto --squash`. From a Claude session, where `gh pr` commands fail
(GraphQL isn't available), use the REST API: `gh api repos/elenz-nz/elenz/pulls -X POST -f head=<branch> -f base=main
-f title=... -f body=...`, then `gh api -X PUT repos/elenz-nz/elenz/pulls/<n>/ccr/auto_merge -f merge_method=squash`.
If a check fails, fix it on the branch; nothing reaches the site meanwhile. Then report the merge, or the failure, to
the owner. Merged branches are deleted automatically.

Preview links (since 24 Oct 2026): Cloudflare Workers Builds builds every other branch with `npx wrangler preview`
(Worker Previews, open beta), so each pushed branch gets its own address, `https://<branch>-elenz.elenz.workers.dev`
(e.g. `preview-test-elenz`). The `previews` block in `wrangler.jsonc` points it at the live KV namespace, so it shows
live data; that's safe because only the Worker's scheduled handler writes to KV and previews run no crons. Its pages
keep elenz.co.nz as their canonical address, and every host but elenz.co.nz is sent `X-Robots-Tag: noindex`
(`site/static/_headers` for static files; `noindexOffSite` in `worker/index.js` for the Worker's own responses), so
Google doesn't index previews as copies. `preview_urls` is set explicitly because `workers_dev` is off. The build's check on the pull request says whether it built.
Each branch's preview copies the dashboard's "Previews Base" build settings the first time it builds and keeps that copy:
after changing the base (preview command `npx wrangler preview`), an existing branch keeps its old settings, so use a
fresh branch. A preview build's check links under `.../previews/<branch>/builds/`; one under `.../production/builds/`
on a branch went down the wrong path.
When a change is something the owner should see before it goes live, open the PR without auto-merge, send the preview
link, and turn on auto-merge once they've approved it.

## Beta note (remove when the site is announced)

Until the site is announced every page shows a thin "Beta" line above the masthead (`site/src/lib/site/Masthead.svelte`,
`.beta-note` in `site/src/lib/tracker/tracker.css`). It has no end date: the owner decides when to announce. Then
delete the markup, the styles (keeping `.mast-wrap` is harmless) and this section.

## Layout

- `site/`: SvelteKit 3 + Svelte 5, `adapter-static`, every page prerendered. Hosted on Cloudflare Workers as static
  assets (`wrangler.jsonc` at the repo root; build command `cd site && npm ci && npm run build`, deploy command
  `npx wrangler deploy`). Every merge to `main` redeploys (see Getting changes live). Pages: `/` the landing page (`src/routes/+page.svelte`: the
  logo (stacked on desktop, compact on phones), live total generation with one rotating second figure, a small live stamp,
  and the 24-hour horizon line along the bottom of the first screen, then a glimpse of each page; add a page to its
  `PAGES` list with a preview component in `src/lib/landing/`. As the page scrolls, `Handoff.svelte` shrinks the horizon
  into its dot, flies it through the Now preview's map (building its rings and HVDC link via `build.svelte.js`) and opens
  it out onto the Tracker preview (the line grows on its own clock, `GROW`, as the dot passes the line's end and flies
  on), then climbs the Records preview's staircase on its own clock (`CLIMB`, so it finishes even where the page can't
  scroll that far; stops are pulled in to the last scroll position) (`RecordsPeek.svelte`: the latest record's
  progression, path `data-handoff="rec"`, drawn up to the dot by a clip from `build.rec`); shared chart geometry in `geometry.js`, map positions in `src/lib/home/maplayout.js`); `/now` the live page
  (`src/routes/now/+page.svelte`: live figures, the island map with each island's mix ring, the generation mix now,
  from tracker.json's newest interval via `src/lib/home/now.js`; island outlines in `src/lib/home/nzmap.js`, made by
  `analysis/make_nz_map.py`; under the price tiles the price explainer, "Why is the price high?": rules and wording in
  `src/lib/now/explain.js`, drawn by `src/lib/now/PriceExplainer.svelte`, from tracker.json's `explain` block (see
  `ingest/explain.py`); quiet, highlighted or open by itself, rules tested in `analysis/price_triggers.py`; opened from a button in the
  wholesale price tile (`PriceButton.svelte`, lit when highlighted), the card drops down under the tiles; its explanation is always two paragraphs, the general one (how prices get like this) then what's going on now ("Currently, ..."); each reason is a
  pair of bars, now over its recent level; reasons include plants running well below the past week (`BELOW`, an outage
  stand-in from the live week's per-plant series), a held state after a short jump says so, and when nothing pushes the
  price up it says what it can't see; a record the live data beat today is a small link above Generation now
  (`RecordLine.svelte`), only on the day it was set; Keep screen on glows slowly while on); `/articles` records, quarterly reviews and analysis (`src/routes/articles/`; one
  Svelte file per article in `src/lib/articles/posts/<slug>.svelte` exporting `meta` {title, dek, date, kind, draft}
  from a module script, with `Record`, `Figure` and `Note` components and `articles.css` alongside; the registry is
  `src/lib/articles/registry.ts`). `ARTICLES_PUBLIC` there is true (published 15 Oct 2026 with the Winter 2026 review): Articles is in the
  navigation and on the landing page (`ArticlesPeek`); drafts (`draft: true`) stay off the index and are `noindex`, but
  their own address still works for review. `/records` the records (`src/routes/records/`; one page per record at
  `/records/<id>?region=NI|SI&period=day|week|month|year`, prerendered from `DEFS`): the highest and lowest half-hours,
  and for each half-hour record its highest/lowest day, week (Mon-Sun), month and year (`periods` in records.json: period
  averages, from per-day sums in each month's summary, records.py `PERIODS`, `day_sums`, `period_figures`; the old month
  records are `old` in `DEFS`, not listed but their pages kept), and runs since 1997
  for NZ and each island, from `/data/history/records.json` (`ingest/records.py`). Names, wording, formatting, the
  share image and the live check (the live week averaged to half-hours, generation and demand records only; also the
  provisional line on /now, `RecordLine.svelte`) are in `src/lib/records/`; `RecordsPeek` on the landing page.
  Period records are ranked and shown as the period's average MW (fair across 28-31 day months, leap years and
  23/25-hour clock-change days); their energy is shown beside it (`energy`, `periodHours` in records.js: average x the
  period's hours from its NZ local midnights) on the record page, the index table and the share image (owner's call,
  23 Oct 2026). Each record page has Share (phones: the share sheet with the record's image, a line about it and the
  link; computers: copies the link) and Download (the 1200 x 630 PNG from `shareImage.js`) beside the region picker,
  and again at its foot. Its two charts (`Progression`, `DayChart`) pin a point on click, tap or drag (it stays after
  the finger lifts; another click, a tap outside or Escape lets go), and on touch the tooltip sits above the chart.
  A mouse drag across either zooms into that span (owner's call, 25 Oct 2026; the y axis fits what is shown, the
  progression's x axis turns to months, `DayChart` labels with `periodAxis`'s `lab` past its usual ticks). Zoom and pin
  are bound to the page, which shows Reset zoom and Pinned · Release in the card's heading (`ChartControls.svelte`), never
  over the chart; Escape lets go of the pin first, then the zoom. The progression's explanation is the ⓘ beside "How the
  record grew" (`growNote`), not a line under the chart. "Has stood for" counts from the end of the record's period
  (`recEnd`: a year record from 1 January after it), not its start.
  Records added 23 Oct 2026 (records.py VERSION 4): most fossil generation, peak hydro, and, for days/weeks/months/years
  only (`periods: true` in DEFS), lowest hydro and lowest price: the half-hour list shows their day record (`Average over
  the day`), and their page opens on its day (owner's report, 25 Oct 2026: the note there looked like a gap). A record
  page's "Records" breadcrumb returns to the list's own period (`period`, the one asked for), not the page's `per`. A DEFS entry's `v` is the records.json version that first has it; an older file says it is being worked out.
  "Heading for a record" (owner's call, 23 Oct 2026): `pace()` in records.js lists a current day/week/month/year once
  half of it has gone (`PACE_SHARE`) and only while it is ahead of its record period at the same point (whole days, or
  half-hours for a day), from records.json `pace` (records.py `pace_sums`: the current periods' sums in the history,
  and `to`) plus the live week after it, against each record's `curve` (`period_curve`: the record period's running
  figure; on the provisional record when one is beyond); shown as cards on /records (8, then Show all) and a panel on
  the record's page. The Records index's rows open their record from anywhere on the row.
  `hist/records-detail.json` (records.py `build_detail`, published with records.json when it changes; served by the
  Worker; loaded only by record pages via `loadDetail`): `bg`, each record's best by month (by year for year records)
  against `months`/`years`, the faint line behind `Progression` (`bgOf`; its hover follows the pointer's date and gives
  the record in force and that month's best; the month or year still running (owner, 25 Oct 2026: a tracker-style wash
  barely showed on a single line, so a hatched band instead) is drawn across its whole span (the
  axis runs on to its end, `bgEnd`), its line dotted, in a hatched band (`band`; no label on the chart, owner's call: the
  tooltip says "so far"; the key above the chart names the hatch), and the tooltip there says how long is left
  (`hoursToGo`, counted from the start of today like "Heading for a record"); month and year records' files leave
  the running period out, so the page passes its figure so far as `now`, from `periodNow`/`figureSoFar`, the same sums as
  "Heading for a record"); `period`, each period record's own series (`period_series`: half-hours
  for a day, hours for a week, days for a month, weeks for a year), charted on its page by `DayChart` with
  `periodAxis`'s ticks and the record as a dashed average line.
  `udem` (records.py VERSION 5, 25 Oct 2026): for the demand records, the same as `bg` for demand with embedded solar
  added back (half-hours from each month summary's `info.udem`, i.e. metered + roof; days to years as the period's
  average demand plus its average embedded solar from the existing day sums), drawn dashed above the faint line
  (`udemOf`, Progression's `info`/`infoNow`, its running period from `figureSoFar` of demand plus `roof_max`) and named
  in a key over the chart: information only, never a record (embedded solar is modelled; zero before Aug 2013).
  Owner's call, 25 Oct 2026. Summaries made before VERSION 5 have no `info`, so the half-hour dashed line appears once
  the history job has remade them (it reads every month back from `hist/hh`, within `MONTH_LIMIT` a run).
  Until the history is complete the file isn't published and the page says the records are being worked out. `article-template` is a draft layout sample. Articles dated after today (NZ time, at build) are scheduled: hidden like drafts until a build on or after their date (`scheduled`/`hidden` in the registry; any push rebuilds). Series: an article with `series: '<key>'` and `part: n` in its meta (keys in `SERIES` in the registry) shows "Part n of N" under its title and `SeriesNav` (all parts, previous/next) at its end, and the index folds the series into one card. No series is defined now: the first, "Inside the wholesale market" (7 parts), was removed on 18 Oct 2026 while the owner rethinks its content; commit 21c8b47 is the last with it (its pages, `src/lib/articles/series/wholesale.ts`, data JSON and cover PNGs). `analysis/wholesale_prices.py` (after `analysis/price_fetch.py`) still makes its figures, and `PriceCover` its covers. Article charts are Svelte SVG components in `src/lib/articles/charts/` (Columns (with optional same-axis `marks`), HBars, DotRank, Lines (`xzero`, `xticks` for year and clock axes), TimeStack (`labelEvery`, fixed `ymax`/`pmax` to compare two charts), OfferStack (a supply curve from generator offers), Scatter, Ridgeline (one row per year, each on its own scale), TimeMoney (share of time against share of money by band), SplitBar (one whole in parts), MarketDiagram (the market as a flow); site colour tokens, hover readouts, a data table under each) plus `Stats` for headline figures; an article's chart data is a JSON file in `src/lib/articles/data/`, written by a script in `analysis/` (`winter_2026.py` for the Winter 2026 review, which also prints every figure quoted in the text). Quarterly reviews open with `ReviewCover`
  (the quarter's daily generation by fuel under the title, always dark): `analysis/review_cover.py 2026-06 2026-08 winter-2026`
  writes its data to `src/lib/articles/covers/`; `analysis/cover_png.py winter-2026` saves it as a 1200×630 PNG in
  `static/articles/` for link previews (set `image` in the article's meta; `SITE_URL` in the registry makes it absolute). The tracker has
  two tabs (`src/lib/site/TrackerTabs.svelte`, under the masthead): Generation at `/tracker` and Prices at `/tracker/prices`
  (`src/routes/tracker/prices/+page.svelte`: six node prices, the island spread and HVDC on one time axis for the live week and
  30 days; each period's price range, spread and half-hours over $500/$1,000 for 12 months and All; price captured by fuel;
  a time-of-day heat map. Data shaping in `src/lib/prices/data.js`, SVG charts in `src/lib/prices/`. Under the Generation tab's charts, `src/lib/generation/GenLower.svelte`: a share of generation over the range with the same dates a year earlier (365 days; not on All), dispatchable headroom (hydro, gas, coal/gas, diesel and battery capacity less output at three levels: installed (`capacity.json`), offered and offered under $1,000/MWh (`hist/off/*` from `ingest/offered.py`); Levels view (nested areas) or By fuel (one level stacked, hydro on top and optional); where a chart point spans more data, each level's lowest within it, which for installed capacity on daily history needs `peak.disp`/`peak.dispx`, each day's highest half-hour of dispatchable output with and without hydro, added at the next rebuild; method on /methods/capacity#headroom), the mix by fuel with capacity factors (from `capacity.json`; peaks only for half-hourly or finer data; batteries count discharge, daily history's `batt_d`), and the range by time of day; data shaping in `src/lib/generation/data.js`. Both tabs' heat maps follow the range
  (`src/lib/site/heat.js`): one row per day from half-hourly history up to 400 days (at least the last 7), scrolling
  past 40 rows (latest at the foot), and one row per month (or year) for All from `hist/tod.json` (`ingest/tod.py`);
  colours on a fixed scale (generation: set by today's installed capacity; the renewable share: fixed bands 80-98%;
  prices: fixed bands) or "Scale to this view" (the renewable share: `renBandsScaled`, the sixths of the shares shown). The tracker hands it its window through the `view` hook of `mountTracker` (model, live week, history store), and it loads the year-earlier and 30-day history only when scrolled near. Cards say what they cover with `src/lib/site/Context.svelte` (range chip, dates, region, resolution; `src/lib/site/context.js`), as do the Prices tab's lower cards. On both tabs the Live / History / Delayed pill and the About this data button sit on the tabs line (TrackerTabs' `children`), and the control bar sticks to the top of the window at every width (two rows on phones, control names hidden) (`.toolbar` in tracker.css; `src/lib/site/sticky.js` keeps `--tb-h`, its height; the summary panel scrolls with the page, owner's call Oct 2026) and has arrows beside the date that step by the range (Generation: `tb-prev`/`tb-next`, synced in tracker.js with the chart's own arrows). Every chart and lower card can be enlarged over the page to the window's width (`src/lib/site/PopButton.svelte`, always in the card's or chart's top right corner, so cards are `position: relative`; `.card.popped` in tracker.css; heat maps take `--rh`, their row height). From 1,600 px wide the lower cards on both tabs sit in two even columns split down the centre (Generation: `.row2` is `display: contents` there). Price captured by fuel (`src/lib/prices/FuelBars.svelte`) shows a row on hover and pins it on click (Pinned · Release); the Generation tab's mix table highlights the row under the pointer. The share chart and heat map offer Renewables, Wind, Solar, Inverter-based (wind and solar), Hydro, Gas and Coal/gas (`METRICS` in `src/lib/generation/data.js`). Every view is in the address, so any view can be linked (keys and parsing in `src/lib/site/viewurl.js`, pure and
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
  generation chart no longer drills on click). Touch keeps its point without pinning, so it can still scrub.
  The Prices tab zooms the same way on its 5-minute and half-hourly views (`zoom` state in its page, the same address
  key; `onzoom` on `TimeChart`; its 1D menu sits outside the sticky bar). Downloads on daily and longer intervals give
  generation as energy in the chart's unit, with an `hours` column (a partial period: energy so far).
  Zoom (Generation tab, tracker.js `state.zoom`, address key `zoom`): the arrow beside 1D offers the last 1, 3, 6 or 12
  hours (`zoom=3h`, anchored to the window's end, so it stays live), and a mouse drag across any chart zooms to that
  span (`zoom=YYYY-MM-DDTHH:MM~YYYY-MM-DDTHH:MM`, end exclusive); every chart, the summary and the lower cards follow
  (`buildView` narrows the window). While zoomed the ‹ › arrows step by the zoom's length (moving the window if need be),
  the Reset zoom chip in the bar (or Escape twice) goes back, and a range button clears it. Zoomed on a 5-minute or
  half-hourly view, the date box gains a time box (`#in-time`; Prices `#p-time`) and reads "3 hours ending": the date and
  time the stretch ends (NZ time); choosing either moves the stretch there (`zoomEndAt`, both tabs: snapped to 5 minutes,
  window = the day it ends in, widened to 3D if it starts the day before; at the newest data a menu-length stretch is
  live "last N hours" again). Without a zoom the date box picks a whole day, as before (`onTimeSettled`/`timeSettled` in
  datefield.js). The 1D menu
  (`#span-menu`) lives outside the sticky bar because the bar's clip-path clips anything hanging below it. Share's link
  to the dates shown turns a span into fixed times (`zoomAt`). On an island's chart, HVDC is signed like the batteries
  (23 Oct 2026): arriving is stacked on top of the island's generation, leaving is drawn below zero (`drawGen`). Both are
  drawn light so the generation behind reads through, and High/Low sit on the generation, never on HVDC. In the energy
  view a partial first or last period (week so far ...) is drawn at its rate so far for a whole period, faded; its note
  is in the tooltip (`partialNote`), not on the chart.
  Chart notes are ⓘ buttons (`src/lib/site/InfoTip.svelte`, fixed-position popover) right after each card's title (owner's
  rule, Oct 2026: a card is a title with its ⓘ beside it, holding a short description and a link to the method page;
  `.ttl-row` wraps a title and its ⓘ where the heading isn't a `.ch-head`) on both tracker tabs, Now, Records and
  article figures (`Figure`'s source). Region and month pickers are boxed dropdowns (`select.pick`), the same everywhere; the page-level "About this data" is a labelled
  pill, and both summaries have a labelled "Controls" panel listing every less obvious feature (keep it up to date).
  Tracker and Now use the full width of big screens (`.wrap.wide`; reading pages keep 1,260 px). The browser tab's title says what the view shows (`describe`), and the
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
  two-bus plants expand into their `units`; groups whose members are separate stations (`STATION_GROUPS`: Waikaremoana's
  Kaitawa, Tuai and Piripaua) are listed one row per station. A charging battery shows a negative % of its MW rating. Sort, filters and search live in /now's address (`fuel`, `island`, `owner`
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
  view's link at the foot, as wide as the widest chart (so phone-width on a phone; under 480 px the logo takes its own line and the link breaks after / ? & =), drawn at twice the screen's resolution in the current light/dark colours) or the view's data
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
  residual over Generation_MD; `R:<trader>`, that trader's injection at the point from the monthly reconciliation file, only where neither file has the plant: Mill Creek May 2014-Aug 2015) to a plant, fuel and island, with date ranges and shares; `metered_islands.csv` gives
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
  `tod.py`: `hist/tod.json`, each month's average for every half-hour of the day (fuel MW and prices by island,
  node prices), for the heat maps' monthly rows on All; the history job redoes rebuilt months and reads back up to
  `READS` missing ones a run from `hist/hh` (so it fills in over a few runs), one KV write when it changed; served by
  the Worker as `/data/history/tod.json`.
  `records.py`: the Records pages' data. Each month rebuilt is summarised (every half-hour that beat everything
  earlier in the month, the month's figures, the runs at its ends and the longest inside) into `hist/rec/months.json.gz`
  (missing months are read back from `hist/hh`; bump its `VERSION` to remake all); `hist/records.json` (each record by
  region, its progression, context for its half-hour, the best for each month of the year, provisional records from
  dispatch months and which ones were settled) is published while the history is complete, only when it changes. Official
  means metered generation (meta.source), final prices, metered HVDC. Clock-change days count like any other
  once BUILD 7 has run (before it, Generation_MD's clock-numbered days before 2009 were left out).
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
  so a full rebuild of all ~351 months takes about 3-4 days at `WRITE_BUDGET` (280 a day, on top of the live job's
  ~600/day); never start one while another is running. The Worker starts the Offers workflow (`offers.yml`) with it.
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
  and the site's `npm run check`, `npm test` (`site/tests/`: the tracker's address), `npm run build` and `npm run check:previews`. Its `ingest` and `site` jobs are required checks: a pull request can't
  merge into `main` (so nothing deploys) until both pass.
- `.github/workflows/watchdog.yml`: checks the live site every 15 minutes; opens an issue labelled `stale-data`
  (GitHub emails it to the owner) when live data is over 45 minutes old, history over 5 days behind, or the Worker
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
- The live feed sometimes stalls for ~30 minutes and then catches up (24 Oct 2026: 6:30-7:05 and 8:30-9:05 am NZDT):
  "latest" stays put, then the missed cases arrive late and sparse (19:40 UTC published ~20:05, with 19:35, 19:50 and
  19:55 never appearing). The alerts (`/data/health`, the watchdog) wait 45 minutes so these pass quietly; the site
  shows Delayed meanwhile. Issues must stay enabled on the repo: the watchdog reports through them (they were off
  after the move to elenz-nz, so the watchdog run itself failed on 24 Oct).
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
  island price (`rv_<fuel>`, plus `batt_d`, battery discharge, and `batt_c`/`rv_battc`, battery charging and its cost,
  for the Prices tab's Battery (charging) row: the price batteries paid, outside the average) and `nodes` daily means;
  the Prices page computes revenue for 5-minute and half-hourly data itself (fuel MW × island price). Daily history
  without `batt_c` (built before 23 Oct 2026) shows no charging row on 12 months and All.
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
  if it does. `/data/health` (Worker) covers that: 200 while live data is under 45 minutes old and history under 5
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
  39 months between Dec 1997 and Dec 2002 have only HVDC_BN and HVDC_HS (each end's sending side): the receiving side
  is estimated as sent less the old link's losses (`LOSS_NORTH`, `LOSS_SOUTH`; hvdc.VERSION 2, 23 Oct 2026). Stored
  months keep their HVDC columns, so history.py re-reads months before 2003 once when hvdc.VERSION goes up (state
  column `hv`, progress `hv`) and rebuilds them.
  Generation_MD gaps: Huntly's Rankines and unit 5 are missing for Sep 2020 (dispatch fills from 10 Sep), Matahina
  from Oct 2021 (dispatch fills).
- Clock-change days: Generation_MD numbers them by the clock until Sep 2008 and leaves out an hour (forward: TP5-6
  empty, data to TP46 only; back: 48 periods, the repeated hour once). From Apr 2009, and in every other metered file
  throughout, periods run straight through the change (46 or 50). `metered.straighten()` renumbers those days and
  fills the hour from its neighbour (BUILD 7).
- Rankine coal share before FY21 (emissions.js): MBIE quarterly generation from coal less Glenbrook's metered output
  (MBIE counts Glenbrook as coal), over the Rankines' metered output; reproduces Genesis's FY21-25 figures closely.

## Status and next steps

1. Site live at https://elenz.co.nz (Cloudflare Workers custom domain). The watchdog, UptimeRobot, article link
   previews and the analysis scripts use elenz.co.nz. The old https://elenz.elenz.workers.dev address is off
   (`workers_dev: false`, 26 Oct 2026) after Google indexed copies of pages there.
2. Live data via GitHub Actions + Workers KV (set up Oct 2026). A paid server running `update.py` in a loop is the
   upgrade path if GitHub's schedule delays become a problem.
3. History since Aug 1997 on the tracker page: 30 days, 1 year, All (BUILD 6, finished Oct 2026; was Sep 2020).
   Daily history keeps each day's peak demand and peak generation (total output including embedded solar).
   BUILD 7 (`facilities/NEXT_REBUILD.md` items 1-7) started 23 Oct 2026 (commit 9709b43); by 24 Oct it had rebuilt
   Aug 1997-Dec 2021 (293 of 351 months) and should finish on 25 Oct NZ time. Then check each item as NEXT_REBUILD.md
   says, run the Offers workflow with "resummarise", and do its cleanup (a scheduled follow-up does this ~28 Oct).
4. Pages: landing (`/`), live (`/now`, with the price explainer and Every generator right now), tracker (Generation and
   Prices tabs), Records (`/records`), Articles (`/articles`, published 15 Oct 2026 with the Winter 2026 review), About,
   Data and methods (`/methods`) and Privacy. Stale-data watchdog, uptime monitor, Cloudflare Web Analytics and a Buy
   Me a Coffee link are in place. The site isn't announced yet (Beta note).
5. Then the brief's build order: plant pages (`/plants/<slug>`), map, hydro panel, offer stacks and downloads.

Recurring upkeep: add Genesis's Rankine coal share to `emissions.js` each quarter (performance report ~3 weeks
after quarter end; FY27 Q1 due late Oct 2026); add each year's NZGA geothermal figures (NZ Geothermal Workshop,
November); renew the Worker's `GITHUB_TOKEN` before it expires (~Oct 2027).

Terms: the EA confirmed by email (21 Oct 2026) that the EMI datasets and the API are CC BY 4.0, covering republishing,
derived data and a possible paid API for commercial users; attribution is still required (the footer credit).

Coming change: the EA is decommissioning EMI (told us 21 Oct 2026). The real-time dispatch API is being rebuilt and will
need a new subscription; datasets move to the EA's Datasets pages (ea.govt.nz), and the way to fetch them
programmatically is likely to change, with plenty of warning. Everything that reads EMI: `emi_live.py` (API,
`EMI_KEY`), `common.py` `BLOB` (the emidatasets blob container: dispatch, final prices, metered files, offers, the
register) and `rooftop.py` (`GUEHMT` report). Watch for the EA's notice and plan the switch as one change.

Open questions: farm mounting is settled for most farms by the clear days of 18-19 Oct 2026 (analysis/README.md); Lauriston,
Pukenui and Omeheu stay uncertain; Kōwhai Park is single-axis tracking (east to west, from photos; owner, 22 Oct 2026),
not fitted (it tripped and has been off since 20 Oct). Battery discharge is left out of the renewable share and
emissions intensity (as em6, owner's call 22 Oct 2026): tracker.js `genR`, now.js, generation/data.js `shares`,
records.py (VERSION 3) and records.js. Small solar farms: the site's name for the ground-mounted embedded type
(`ground` in rooftop.py, with `GROUND_KW_AT` for NSPs the rule misses: Ashburton at 500 kW).
