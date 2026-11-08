# Elenz: notes for Claude

Public NZ electricity tracker at https://elenz.co.nz. Give step-by-step instructions for anything that has to be done
by hand (dashboards, accounts, settings). This repository is public: never commit keys, tokens or personal details.

Wording (everything public here: these notes, code comments, commit messages, pull requests, issues): the people behind
Elenz are "the Elenz team" or "we". A decision is a "design decision", a problem found in testing a "test report". Say
nothing about anyone's background or experience. "Owner" means a plant's owner, nothing else.

## Getting changes live

`main` is protected (ruleset "protect main", 23 Oct 2026): no direct pushes; every change goes in through a pull request,
and it can only merge once the `ingest` and `site` checks (checks.yml) pass. That gates both things a merge sets live: the
site (Cloudflare redeploys `main`) and the ingest code (the data jobs run from `main` within 5 minutes). Work on a branch,
push it, open a PR and turn on auto-merge so it merges itself when the checks go green:
`gh pr create --fill --base main && gh pr merge --auto --squash`. From a Claude session, where `gh pr` commands fail
(GraphQL isn't available), use the REST API: `gh api repos/elenz-nz/elenz/pulls -X POST -f head=<branch> -f base=main
-f title=... -f body=...`, then `gh api -X PUT repos/elenz-nz/elenz/pulls/<n>/ccr/auto_merge -f merge_method=squash`.
If a check fails, fix it on the branch; nothing reaches the site meanwhile. Then report the merge, or the failure, to
the Elenz team. Merged branches are deleted automatically.
Auto-merge only works while something is still to wait for: on a PR whose checks have all passed GitHub refuses it
(HTTP 422 "Pull request is in clean status"). Then merge it directly:
`gh api -X PUT repos/elenz-nz/elenz/pulls/<n>/merge -f merge_method=squash` (the checks still gate it: GitHub refuses a
merge while a required check is failing or pending). It also refuses (HTTP 405 "Protected branch update failed", the PR's `mergeable_state`
"unstable") while any check is still running, the preview's `Workers Builds` included, and auto-merge is refused
then too: wait until the PR reads "clean" and merge directly (31 Oct 2026, PR #49). After a squash merge, `git checkout main && git pull` before the
next branch; the old local branch has no remote any more, which is expected.
A merge doesn't always deploy: Cloudflare's production build for #46 (30 Oct 2026) never ran, and the site stayed on the
previous build. To check what is live, `https://elenz.co.nz/_app/version.json` holds the build time (ms since 1970,
UTC); it should be just after the merge. If it isn't, retry the build in the Cloudflare dashboard (Workers & Pages →
elenz → Deployments) or merge the next change. The `Workers Builds` check isn't reported on every main commit, so its
absence alone proves nothing.
A Claude session can't push until the repository is attached with push access (`add_repo`, owner `elenz-nz`, repo
`elenz`, access `push`); a push refused with "not in this session's authorized repository set" (HTTP 403) means that
step was skipped, not that anything is wrong with the repository or its token.

Preview links (since 24 Oct 2026): Cloudflare Workers Builds builds every other branch with `npx wrangler preview`
(Worker Previews, open beta), so each pushed branch gets its own address, `https://<branch>-elenz.elenz.workers.dev`
(e.g. `preview-test-elenz`). The `previews` block in `wrangler.jsonc` points it at the live KV namespace, so it shows
live data; that's safe because only the Worker's scheduled handler writes to KV and previews run no crons. Its pages
keep elenz.co.nz as their canonical address, and every host but elenz.co.nz is sent `X-Robots-Tag: noindex`
(`site/static/_headers` for static files; `finish` in `worker/index.js` for the Worker's own responses), so
Google doesn't index previews as copies. `preview_urls` is set explicitly because `workers_dev` is off. The build's check on the pull request says whether it built. A new branch's first push doesn't always start one (2 Nov 2026, PR #59: no Workers check after 10 minutes and the preview answered 404); an empty commit started it.
Each branch's preview copies the dashboard's "Previews Base" build settings the first time it builds and keeps that copy:
after changing the base (preview command `npx wrangler preview`), an existing branch keeps its old settings, so use a
fresh branch. A preview build's check links under `.../previews/<branch>/builds/`; one under `.../production/builds/`
on a branch went down the wrong path.
When a change is something the Elenz team should see before it goes live, open the PR without auto-merge, send the preview
link, and once they've approved it merge it directly (by then its checks have passed, so auto-merge would be refused,
see above); turn on auto-merge instead only if a check is still running.

## Beta note (remove when the site is announced)

Until the site is announced every page shows a thin "Beta" line above the masthead (`site/src/lib/site/Masthead.svelte`,
`.beta-note` in `site/src/lib/tracker/tracker.css`). It has no end date: the Elenz team decides when to announce. Then
delete the markup, the styles (keeping `.mast-wrap` is harmless) and this section.

## Writing for the site

`docs/style-guide.md` is the style guide for everything public on the site: voice, terms, dates and numbers, status
labels, tables, method pages, the source register, ⓘ notes (team rules, 1 Nov 2026), Using Elenz and articles. Follow it
when writing or changing any page, chart note or label, and keep it up to date when a rule changes.

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
  progression, path `data-handoff="rec"`, drawn up to the dot by a clip from `build.rec`; the preview's picture opens the record it shows, `peekLink` in `build.svelte.js`, HOME-05); once the line has gone into its dot the hero chart takes no hover and its axis words fade (`html[data-ho]`, HOME-02); the Now preview's figures show in full while its rings draw (no count-up); the dot only touches the start of the Records staircase, which then draws itself on its own clock (`CLIMB`, a small dot at its tip, `pen`) while the dot flies on with the scroll to the Articles preview (`data-handoff="art"`), runs once round its outline drawing it, and the outline fades (`LAP`, `FADE`, on their own clock; HOME-02, 6 Nov 2026); a short landscape screen (≤ 520 px tall) gets the compact logo and a smaller figure (HOME-06); shared chart geometry in `geometry.js`, map positions in `src/lib/home/maplayout.js`); `/now` the live page
  (`src/routes/now/+page.svelte`: live figures, the island map with each island's mix ring, the generation mix now,
  from tracker.json's newest interval via `src/lib/home/now.js`; island outlines in `src/lib/home/nzmap.js`, made by
  `analysis/make_nz_map.py`; under the price tiles the price explainer, "Why is the price high?": rules and wording in
  `src/lib/now/explain.js`, drawn by `src/lib/now/PriceExplainer.svelte`, from tracker.json's `explain` block (see
  `ingest/explain.py`); quiet, highlighted or open by itself, rules tested in `analysis/price_triggers.py`; opened from a button in the
  wholesale price tile (`PriceButton.svelte`, lit when highlighted), the card drops down under the tiles; its explanation is always two paragraphs, the general one (how prices get like this) then what's going on now ("Currently, ..."); each reason is a
  pair of bars, now over its recent level; reasons include plants running well below the past week (`BELOW`, an outage
  stand-in from the live week's per-plant series), a held state after a short jump says so, and when nothing pushes the
  price up it says what it can't see; a record the live data beat today is a small link above Generation now
  (`RecordLine.svelte`), only on the day it was set; Keep screen on glows slowly while on; on a preview link, `/now?sim=up|high|split|apart|jump|low` shows the explainer at a price that may not come along during testing (`src/lib/now/simulate.js`, loaded only away from elenz.co.nz, with a banner on the page; NOW-08)); `/articles` records, quarterly reviews and analysis (`src/routes/articles/`; one
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
  period's hours from its NZ local midnights) on the record page, the index table and the share image (design decision,
  23 Oct 2026). Each record page has Share (phones: the share sheet with the record's image, a line about it and the
  link; computers: copies the link) and Download (the 1200 x 630 PNG from `shareImage.js`, in the page's light or dark
  colours, `pageIsDark`; REC-05/06) beside the region picker, and again at its foot. The image is drawn ahead
  (`prepared`), because phones refuse a share that waits on drawing; when a browser refuses to share or copy (Firefox on
  Android, SHR-03; a second share there is refused with InvalidStateError, a share it never settled, so the link
  is copied instead) the link is shown with its own Copy button (`src/lib/site/CopyLink.svelte`, also in the tracker
  tabs' Share panel). Its two charts (`Progression`, `DayChart`) pin a point on click, tap or drag (it stays after
  the finger lifts; another click, a tap outside or Escape lets go), and on touch the tooltip sits above the chart. With a mouse the pin keeps its own line and tooltip while the pointer reads another point, for comparing, and the hover tooltip slides clear of it (`held`, `keepClear` in keepclear.js; REC-05).
  A mouse drag across either zooms into that span (design decision, 25 Oct 2026; the y axis fits what is shown, the
  progression's x axis turns to months, `DayChart` labels with `periodAxis`'s `lab` past its usual ticks). Zoom and pin
  are bound to the page, which shows Reset zoom and Pinned · Release in the card's heading (`ChartControls.svelte`), never
  over the chart; Escape lets go of the pin first, then the zoom. The progression's explanation is the ⓘ beside "How the
  record grew" (`growNote`), not a line under the chart. "Has stood for" counts from the end of the record's period
  (`recEnd`: a year record from 1 January after it), not its start.
  Records added 23 Oct 2026 (records.py VERSION 4): most fossil generation, peak hydro, lowest hydro and lowest price.
  Every record the data holds is shown, half-hours included (team rule, 30 Oct 2026: nothing left out for being
  less interesting; lowest hydro and lowest price had been kept to days and longer). Under Heading for a record and New and provisional, three tabs (`TABS`, `?tab=milestones|months`;
  design decision REC-01, 31 Oct 2026): All-time records (with the region picker), Milestones and By month (each a card for New Zealand and each island side by side,
  three across from 900 px, full lists; design decision, 31 Oct 2026; pointing at a row lights the same milestone or record in every region's card, a click pins it and another lets go, `data-k`/`lit`/`pinned`). The month-of-year table lists every
  half-hour record, with TP and Day buttons (`moyPer`, address `by=day`; records.json `moy_day`, `best_day_by_month` in records.py, official days only; design decision REC-13, 2 Nov 2026; until a file has `moy_day` it shows trading periods alone) and Milestones all of them. "New" (`isNew` in
  records.js, `_since_ok` in records.py) is a record first seen in the last 30 days whose period ended within `NEW_LAG`
  (120) days of that (metered data runs 5-6 weeks behind each month), so a rebuild that moves an old record isn't new (REC-02, 31 Oct 2026); New and provisional (design
  decision, 1 Nov 2026; `recentAll`, `topCards` in records.js) holds every new, provisional and close record for every region
  and period, ranked: new official before provisional before close, a bigger jump against the record's usual step, NZ
  before an island, a half-hour, month or year before a week or day. The first 4 cards are the most notable (one per
  record, at most two per group) and give only the period; Show all lists every card for one region (the page's
  `region`, shared with the All-time list and its picker) under its period (Trading period, Day, Week, Month, Year,
  Runs), newest record first, with its date (REC-09). Both Show all buttons sit in their section titles. An island's list leaves out records that can't apply there (always 100% renewable, no
  fossil plant, never a net southward period; a period record that never moved shows as one step) and groups left empty (REC-03). A record
  page's "Records" breadcrumb returns to the list's own period (`period`, the one asked for), not the page's `per`. A DEFS entry's `v` is the records.json version that first has it; an older file says it is being worked out.
  "Heading for a record" (design decision, 23 Oct 2026): `pace()` in records.js lists a current day/week/month/year once
  half of it has gone (`PACE_SHARE`) and only while it is ahead of its record period at the same point (whole days, or
  half-hours for a day), from records.json `pace` (records.py `pace_sums`: the current periods' sums in the history,
  and `to`) plus the live week after it, against each record's `curve` (`period_curve`: the record period's running
  figure; on the provisional record when one is beyond); and, design decision 7 Nov 2026, ahead of a close dispatch figure beyond the record too (`near`, its own `curve` from records.py, else its final figure with the shift taken off), so a period that can only match the close figure isn't listed; shown as cards on /records (whole rows only, `paceShown`: 8 made up to a whole row, or the whole rows there are, then Show all; REC-09) and a panel on
  the record's page. The Records index's rows open their record from anywhere on the row. The region picker, the period buttons (Trading period to Year, styled like the tracker's range buttons; their short names on phones) and the "Official to" pill sit in the main list's own title bar (`.list-bar`, a sticky `.toolbar` inside the list's section, so it sticks only while the list shows; two rows up to 900 px, region and periods kept to one row down to 360 px), not at the top of the page: Heading for a record and New and provisional cover every region (design decision, 30 Oct 2026). Every card on the page has an ⓘ in short bullet points.
  `hist/records-detail.json` (records.py `build_detail`, published with records.json when it changes; served by the
  Worker; loaded only by record pages via `loadDetail`): `bg`, each record's best by month (by year for year records)
  against `months`/`years`, the faint line behind `Progression` (`bgOf`; its hover follows the pointer's date and gives
  the record in force and that month's best; the month or year still running (design decision, 25 Oct 2026: a tracker-style wash
  barely showed on a single line, so a hatched band instead) is drawn across its whole span (the
  axis runs on to its end, `bgEnd`), its line dotted, in a hatched band (`band`; no label on the chart, design decision: the
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
  Design decision, 25 Oct 2026. Summaries made before VERSION 5 have no `info`, so the half-hour dashed line appears once
  the history job has remade them (it reads every month back from `hist/hh`, within `MONTH_LIMIT` a run).
  Until the history is complete the file isn't published and the page says the records are being worked out. `article-template` is a draft layout sample. "Welcome to Elenz" (`posts/welcome-to-elenz.svelte`) takes its figures from `analysis/welcome.py` and its pictures from `analysis/welcome_shots.py`. Articles dated after today (NZ time, at build) are scheduled: hidden like drafts until a build on or after their date (`scheduled`/`hidden` in the registry; any push rebuilds). Series: an article with `series: '<key>'` and `part: n` in its meta (keys in `SERIES` in the registry) shows "Part n of N" under its title and `SeriesNav` (all parts, previous/next) at its end, and the index folds the series into one card. No series is defined now: the first, "Inside the wholesale market" (7 parts), was removed on 18 Oct 2026 while the Elenz team rethinks its content; commit 21c8b47 is the last with it (its pages, `src/lib/articles/series/wholesale.ts`, data JSON and cover PNGs). `analysis/wholesale_prices.py` (after `analysis/price_fetch.py`) still makes its figures, and `PriceCover` its covers. Article charts are Svelte SVG components in `src/lib/articles/charts/` (Columns (with optional same-axis `marks`), HBars, DotRank, Lines (`xzero`, `xticks` for year and clock axes; `yzero={false}` to fit the y axis to the data, a series as a staircase `step` or as `dots`, a shaded `band` with one series drawn in the accent inside it, `marks`, and a `table`), TimeStack (`labelEvery`, fixed `ymax`/`pmax` to compare two charts), OfferStack (a supply curve from generator offers), Scatter, Ridgeline (one row per year, each on its own scale), TimeMoney (share of time against share of money by band), SplitBar (one whole in parts), MarketDiagram (the market as a flow); site colour tokens, hover readouts, a data table under each) plus `Stats` for headline figures; an article's chart data is a JSON file in `src/lib/articles/data/`, written by a script in `analysis/` (`winter_2026.py` for the Winter 2026 review, which also prints every figure quoted in the text). Quarterly reviews open with `ReviewCover`
  (the quarter's daily generation by fuel under the title, always dark): `analysis/review_cover.py 2026-06 2026-08 winter-2026`
  writes its data to `src/lib/articles/covers/`; `analysis/cover_png.py winter-2026` saves it as a 1200×630 PNG in
  `static/articles/` for link previews (set `image` in the article's meta; `SITE_URL` in the registry makes it absolute). The tracker has
  two tabs (`src/lib/site/TrackerTabs.svelte`, under the masthead): Generation at `/tracker` and Prices at `/tracker/prices`
  (`src/routes/tracker/prices/+page.svelte`: six node prices, the island spread and HVDC on one time axis for the live week and
  30 days; each period's price range, spread and half-hours over $500/$1,000 for 12 months and All; price captured by fuel;
  a time-of-day heat map. Data shaping in `src/lib/prices/data.js`, SVG charts in `src/lib/prices/`. Under the Generation tab's charts, `src/lib/generation/GenLower.svelte`: a share of generation over the range with the same dates a year earlier (365 days; not on All), dispatchable headroom (hydro, gas, coal/gas, diesel and battery capacity less output at three levels: installed (`capacity.json`), offered and offered under $1,000/MWh (`hist/off/*` from `ingest/offered.py`); Levels view (nested areas) or By fuel (one level stacked, hydro on top and optional); where a chart point spans more data, each level's lowest within it, which for installed capacity on daily history needs `peak.disp`/`peak.dispx`, each day's highest half-hour of dispatchable output with and without hydro (since BUILD 7); method on /methods/capacity#headroom), the mix by fuel with capacity factors (from `capacity.json`; peaks only for half-hourly or finer data; batteries count discharge, daily history's `batt_d`), and the range by time of day; data shaping in `src/lib/generation/data.js`. Both tabs' heat maps follow the range
  (`src/lib/site/heat.js`): one row per day from half-hourly history up to 400 days (at least the last 7; a year starts at its first whole day, like the cards above it), scrolling
  past 40 rows (latest at the foot), and one row per month (or year) for All from `hist/tod.json` (`ingest/tod.py`);
  colours on a fixed scale (generation: set by today's installed capacity; the renewable share: fixed bands 80-98%;
  prices: fixed bands) or "Scale to this view" (the renewable share: `renBandsScaled`, the sixths of the shares shown). The tracker hands it its window through the `view` hook of `mountTracker` (model, live week, history store), and it loads the year-earlier and 30-day history only when scrolled near. Cards say what they cover with `src/lib/site/Context.svelte` (the dates as the chip, then region and resolution; `span` in `src/lib/site/context.js`: the clock at both ends of a short live window, none for whole days), as do the Prices tab's lower cards (design decision, 30 Oct 2026: dates, never "3 days to ...", on every card of both tabs). On both tabs the Live / History / Delayed pill and the About this data button sit on the tabs line (TrackerTabs' `children`), and the control bar sticks to the top of the window at every width (two rows on phones, control names hidden) (`.toolbar` in tracker.css; `src/lib/site/sticky.js` keeps `--tb-h`, its height; the summary panel scrolls with the page, design decision Oct 2026) and has arrows beside the date that step by the range (Generation: `tb-prev`/`tb-next`, synced in tracker.js with the chart's own arrows). Every chart and lower card can be enlarged over the page to the window's width (`src/lib/site/PopButton.svelte`, always in the card's or chart's top right corner, so cards are `position: relative`; `.card.popped` in tracker.css; heat maps take `--rh`, their row height). From 1,600 px wide the lower cards on both tabs sit in two even columns split down the centre (Generation: `.row2` is `display: contents` there). Price captured by fuel (`src/lib/prices/FuelBars.svelte`) shows a row on hover and pins it on click (Pinned · Release); the Generation tab's mix table highlights the row under the pointer, and a click opens that fuel's plants in the list and chart above (`openFuel`, passed down in the `view` hook; LOW-03). "Scale to this view" flashes the heat map's key (`.scale-flash`; PRC-06). The share chart and heat map offer Renewables, Wind, Solar, Inverter-based (wind and solar), Hydro, Gas and Coal/gas (`METRICS` in `src/lib/generation/data.js`). Every view is in the address, so any view can be linked (keys and parsing in `src/lib/site/viewurl.js`, pure and
  shared with the Worker and the tests in `site/tests/` (`npm test`); the browser side in `src/lib/site/view.js`):
  `region`, `range`, `int`, `end=YYYY-MM-DD` shared by both tabs; the Generation tab's `by` (grouping), `unit=pct`, `chart=lines`, `price=on`, `fold`, `off` (layers switched off in the list, by `slug()` of their name, so a shared link hides the same; `offNow`, applied by the rebuild that has them; SHR-07) and
  drill-down `group`, `fuel`, `plant` (plants and plant sets by `slug()`: "manapouri", "branch-river-arnold"; old slugs
  can be mapped in `PLANT_ALIASES`); the Prices tab's `scale`, `hide` (nodes, and `spread` for the price chart's priced-apart shading off: PRC-01, where the list
  has All/None and the Generation list's colour squares, `#lib/site/swatch.js`: double-click, Shift or a long press shows one alone; HVDC's net average is in the stats card) and `band` (an island's region uses its own node, PRC-04); and in links only, `t`, the
  point the summary opens on. An address with a query is a link and opens exactly that; a plain visit opens on this
  browser's last region, range and interval (localStorage `elenz-view`, plus the grouping and MW/%) and `elenz-prices`,
  never the date or drill-down. Settings replace the address; each drill-down step pushes one, so Back steps out of it
  (`onPop` in tracker.js). The tab links carry the shared settings plus the other tab's own from its last visit in this
  browser tab (sessionStorage, `tabHref`). The Share button (`src/lib/site/ShareLink.svelte`, on the tabs line)
  copies a link to the live view or to the dates shown (`shareLinks`), optionally marking the pinned point; on phones
  it opens the share sheet. A row of the list drills in from the list itself; when the charts are off the top of the screen (a long By site list) or the list sits under them (phones), the page goes back up to them, as a mix table row does (`drillFromList`, GRP-03). A click on any chart pins the time line there (accent line, and a "Pinned <time> ×" chip in the sticky
  bar, `#pin-chip`/`syncPinChip`, the one place the pin is named; another click on it, the chip or Escape lets go); drilling down is from the summary list only (the
  generation chart no longer drills on click). Touch keeps its point without pinning, so it can still scrub; a tap on
  the line a touch left (within `TAP_PX`, without sliding) lets it go (test report CHT-02, 30 Oct 2026). A pin, or
  a touch's point, survives a rebuild whose view still shows that moment (`pinT`/`keepBy` in `rebuild()`: grouping, region, drill-down, a range
  with the same points; GRP-01). Charts allow pinch-zoom of the page (`touch-action: pan-y pinch-zoom`, PHN-03). Every chart under generation has
  its time labels (ZM-01, 31 Oct 2026), and the summary's sub-line keeps room for two lines at every width so a note
  (interpolated, partial) doesn't make it jump (CHT-08). On Prices a tap on the line (pinned, even from a link, or left by a
  touch) lets it go (`onunpin` on `TimeChart`, SHR-07).
  The Prices tab zooms the same way on its 5-minute and half-hourly views (`zoom` state in its page, the same address
  key; `onzoom` on `TimeChart`; its 1D menu sits outside the sticky bar). Downloads on daily and longer intervals give
  generation as energy in the chart's unit, with an `hours` column (a partial period: energy so far).
  Time slider (design decision, 5 Nov 2026, test reports TRK-12; `src/lib/site/slider.js`, tested in `tests/slider.test.js`): under the generation chart and the Prices tab's price chart, lined up with the time axis (`inset`), a window of fixed length, set by the range buttons (or a zoom, shown at its length), on a fixed track of time. It has no ends to drag (design decision, 5 Nov 2026). The track is eight windows long (`trackLength`, design decision, 5 Nov 2026: one rule for every range, menu zoom and dragged zoom, so 1D is 8 days, 30D 8 months, 1Y 8 years, 3 hours a day; a clock change or leap year inside the window leaves it alone; All, or anything longer than the history, is the whole history; short tracks are labelled in hours, `ticksFor`), and it stays put while it's used and stops at its ends (a window dragged to an end can land on the grid just past it: `slack` in `trackFor`): picking a date puts the window in its middle (`centre`), and at the newest data the track ends there (`trackFor`). Drag the window and the charts glide with it, on a 5- or 30-minute grid, whole days only for daily data (`snapSpan`); press the track to go there. `spanView` turns the stretch into a range, end and zoom, keeping the range the drag began on (`slideRange`) unless the stretch outgrows it. A stretch needn't sit on whole days: a `{ from, to }` zoom sets its own ends, past the range's window (`buildView`, `kindFor`, `spanFor`, and `build` on Prices). At the range's own length it's a moved window, not a zoom: no Reset zoom chip, and a date or Latest goes back to a plain window (`movedWindow`). Everything on the track is fetched ahead, 0.8 s after it's set (`prepare`: its half-hourly months, up to 9 files, about 1.2 MB on 30D; 1Y and All have the daily history already), so the charts follow a drag all along it; before that arrives they catch up after a 220 ms pause or on letting go (`ready`). The address and lower cards wait for it to let go (`sliding`). Once it's let go nothing replaces that last step (`drag.done`, `wanted.final`: the mouse can still be moving as it lets go; test report TRK-12). A tap, or a finger scrolling the page (`touch-action: pan-y`), moves nothing. The small picture draws from data in memory really holding 90% of the track (`overview`, `held`: a series joined from months can span the track with months missing; test report TRK-12, 6 Nov 2026). The Prices tab joins only the window it shows (`merged` with a range), since a track's months can all be here.
  Zoom (Generation tab, tracker.js `state.zoom`, address key `zoom`): the arrow beside 1D offers the last 3, 6 or 12
  hours (`SPANS`, the menu headed Zoom, its note about dragging only for a mouse; `zoom=3h`, anchored to the window's end, so it stays live), and a mouse drag across any chart zooms to that
  span (`zoom=YYYY-MM-DDTHH:MM~YYYY-MM-DDTHH:MM`, end exclusive); every chart, the summary and the lower cards follow
  (`buildView` narrows the window). While zoomed the ‹ › arrows step by the zoom's length (moving the window if need be; forward to the newest data, a menu-length stretch is live "last N hours" again, ZM-04),
  the Reset zoom chip in the bar (just those words: the hover tooltip gives the times; design decision, 5 Nov 2026), or Escape twice, goes back, and a range button clears it. Zoomed on a 5-minute or
  half-hourly view, the calendar also shows the time the stretch ends (`time` on `<date-pick>`, its foot, "Ends at"; on the box itself only in the hover tooltip; design decision, 5 Nov 2026, TRK-12: the time box beside the date came and went at every day's end during a slide, and the sticky bar's rows with it). The date box reads the date it ends, its name "3 hours ending". Choosing a day or time moves the stretch there (`zoomEndAt`, both tabs: snapped to 5 minutes,
  window = the day it ends in; at the newest data a menu-length stretch is
  live "last N hours" again; the window stays on the range's button, the zoom reaching past it). Without a zoom the date box picks a whole day, as before (`onDateSettled` in
  datefield.js). The time is the site's own too (`datepick.js`; ZM-03, 2 Nov 2026: the browsers' pickers redrew the chart at every step): an hour only marks itself, and picking the minutes applies it, by `timechange`. The bar doesn't change while the slider moves: the date has a fixed width, `.datebox` keeps room for Latest (just its arrow up to 1,240 px), under 388 px region shares a row with interval rather than range, whichever range is shown, and a window the slider moved keeps its range's name (TRK-12; `tests/e2e/site.spec.js` checks). Latest while zoomed moves the stretch to the newest data at the same length (`zoomEndAt`), and shows when a dragged stretch sits behind the newest data. The date box is the site's own calendar on both tabs (`<date-pick>`, `src/lib/site/datepick.js`, a
  custom element with `value`/`min`/`max`/`disabled` and a `change` event, hung from `<body>`, outside the sticky bar; test report TRK-07: Firefox's picker redrew the chart while scrolling its month and year lists):
  moving between months or years changes nothing until a day is picked, which closes it; the month name opens a year
  list, then months. On 1D a past day is labelled "Day" (it shows that whole day). A past window counts whole local
  days back (`addDays` in `buildView` and `spanFor`), so a clock change inside it no longer adds an hour of the day
  before (CHT-10). A past 1Y window is a calendar year (`addYears` in viewurl.js, `moveBy` on both tabs: 366 days in a leap year, and the arrows keep the date; CHT-11). The pin is the anchor (design decision ZM-02, 31 Oct 2026): a range button opens the new range around
  the pinned point's middle (`endAround`; a pinned year on All opens that year on 1Y), still pinned (`pinAfter` in
  `rebuild()`), unless the new view is finer than the pin and the pin is longer than an hour (a pinned day opened on 1D
  shows that whole day and lets go; 7:30 pm on 30 days stays 7:30 pm on 1D); without a pin, a dragged zoom carries over
  the same way. The ‹ › arrows step freely and let go of a pin once it leaves the window. The Prices tab does the same
  (`pickRange`, `setView` keeps a pin by its time, not its place in the list). The 1D menu
  (`#span-menu`) lives outside the sticky bar and is placed under its button. Share's link
  to the dates shown turns a span into fixed times (`zoomAt`). On an island's chart, HVDC is signed like the batteries
  (23 Oct 2026): arriving is stacked on top of the island's generation, leaving is drawn below zero (`drawGen`). Both are
  drawn light so the generation behind reads through, and High/Low sit on the generation, never on HVDC. In the energy
  view a partial first or last period (week so far ...) is drawn as the energy it holds, so it steps down, washed out
  behind a dashed edge (design decision TRK-04, 31 Oct 2026: honest rather than scaled to a whole period); its note
  ("Part month: 1 Oct to 16 Oct (16 of 31 days) · energy so far") is in the tooltip (`partialNote`), and the summary's sub-line says where the data stops (for
  touch). The last period is partial when it runs up to the newest data or when a past window ends part way through
  it (`partialCut`, e.g. 1 year by weeks ending on a Thursday; TRK-04, 30 Oct 2026). Chart type (design decision, 29 Oct 2026): Stacked (default) or Lines (`#seg-chart`,
  `state.chart`, address `chart=lines`), each visible layer as its own line from zero in the same unit (MW, energy, %),
  no High/Low; fuels and groups keep their colours, and when 2-8 lines are shown and some are shades of one fuel (plants,
  sites, connections) or grey "Other" rows, each takes a colour from the line palette `--l1`..`--l8` (tracker.css,
  validated for colour-blind separation on both surfaces) by first come (`SLOT`), so hiding one never repaints the rest;
  the list's squares follow (`syncSwatches`); the tooltip lists the lines at that time, nearest first. Price over the
  generation chart (`#btn-price`, `state.price`, address `price=on`; off by default, design decision): both island prices
  for NZ, the island's own on an island's chart, on a right axis with the Prices tab's spike-proof scale (`priceScale`
  from `#lib/prices/data.js`), thin and dashed (Haywards long dashes, Benmore short) so they don't read as generation lines. While it's on every chart's right margin
  widens (`padR()`) so the time axes stay lined up. Both are kept with the grouping in localStorage `elenz-view`.
  Folded charts (design decision, 29 Oct 2026): each chart under generation (price, renewable share, demand, HVDC,
  emissions: the two folded by default sit together at the top, design decision) folds to one line from its title (`foldTitle` in the page, a button with aria-expanded; `state.fold`,
  `syncFold` in tracker.js; `.chart.folded` in tracker.css): the heading, ⓘ and legend values stay (they follow the
  time line), the canvas and enlarge button go, and a folded chart isn't drawn (`unfolded` in drawAll/paintAll; its
  ResizeObserver redraws when it opens). All five start folded (`FOLD_DEFAULT` in viewurl.js; design decision, cleaner,
  above all on portrait phones; price and renewable share are also on $ Price and the share card); the prerendered
  page has them folded so the load doesn't jump. A folded line shows its figures at the time line with their unit
  (there's no axis), or the range's average (net for HVDC) when nothing is hovered, "avg"/"net" in `.pre`; under
  560 px it stays on one line, the series names hidden (`font-size: 0` on `.lg`). Address key `fold` (the folded
  ones, e.g. `fold=price,ren`, `fold=none` for all open; absent: the default, all), kept in `elenz-view`. "All charts shown" in
  Downloads leaves folded charts out; the CSV keeps every column.
  Chart notes are ⓘ buttons (`src/lib/site/InfoTip.svelte`, fixed-position popover) right after each card's title (team
  rule, Oct 2026: a card is a title with its ⓘ beside it, written to the rules in `docs/style-guide.md`;
  `.ttl-row` wraps a title and its ⓘ where the heading isn't a `.ch-head`). On the Generation tab each chart's unit (MW/GWh/TWh, %, $/MWh, g/kWh) is drawn in small type under its top axis label (`axisUnit` in tracker.js; the price overlay's under the right axis's), not beside the title (design decision, 29 Oct 2026, tidier on phones); the full description is in the canvas's aria-label. The grouping menu is sized to the choice it shows (`fitSelect`), and under 560 px the generation chart's header is two rows (title, ⓘ and grouping; then MW/%, chart type, $ Price and the total: `.chart.gen .legends { display: contents }` with `order`); the ⓘ notes on this tab are short bullet points (design decision, 29 Oct 2026). The Prices tab follows suit: the scale is a fitted dropdown (`fitSelect` action, `#lib/site/fitselect.js`, shared with tracker.js), `TimeChart`'s `unit` puts each chart's unit under its top label, the ⓘ notes are bullets, and under 560 px the price chart's header is two rows (title, ⓘ, scale; then Haywards/Benmore on long ranges) with its key (`priceKey`) moved under the chart on both tracker tabs, Now, Records and
  article figures (`Figure`'s source). Region and month pickers are boxed dropdowns (`select.pick`), the same everywhere; the page-level status is `src/lib/site/StatusPill.svelte` (Live / History / Delayed on Now and both tracker tabs: always last on its line, one fixed width so the buttons beside it don't move, and a button that opens the panel saying where the data comes from; TRK-01, 5 Nov 2026), and both summaries have a labelled "How to" panel: an opening line, then one bullet per thing you can do across the tab, in the ⓘ style (each chart's own ⓘ says what it shows), linking to the full descriptions on /guide (`#generation`, `#prices`; test reports GRP-06, CHT-13), keep the panels and /guide up to date. On /now the status sits at the right even when the heading wraps, so its panel opens on screen (TRK-11). The Reset all charts popup flashes an accent edge as it opens (`rs-flash` in ResetButton.svelte; TRK-12), and the generation chart's unit a ring when it changes (`pop-flash` in tracker.css, `flashUnit`; TRK-01). While the slider is dragged the summary's sub-line keeps its tallest height on both tabs (`holdSub`; TRK-12), and the Prices summary names a moved window by its range, not "Zoomed in" (PRC-01). Drilled into one plant, the list's last column is "Of capacity" (capacity factor over a range, output against capacity at a time; `cfCaps`, GRP-03) where every row has a capacity. The plant note (`#plant-note`) shows a plant's `[plant_metering]` notes under "Plant notes" (also where the site shows a plant differently from the register), and drilled into embedded solar or other embedded generation, what it is and its method page (`EST_NOTE`; TRK-01, 6 Nov 2026). Reset sits on the tabs line of both tabs, beside Download and Share, and asks "Reset all charts?" first (`src/lib/site/ResetButton.svelte`; `resetView` in view.js: forgets `elenz-view`, `elenz-prices`, `elenz-gen-lower` and the tab links, then opens the plain address; CHT-16, TRK-01).
  Shapes (design decision, 5 Nov 2026, test report TRK-01): buttons, pills, cards, popovers and tags all have a 4 px corner, and the buttons on one line share one height (30 px, 28 on phones); only ⓘ buttons, dots and small icon tiles are round, and swatches smaller than a button keep 2-3 px. No 999px pills.
  With JavaScript off, the tracker tabs, Now, Records, a record's page and the landing page show one plain line instead of empty charts or "Loading" (RES-04): mark what should go with the class `js-only`; the one rule is a `<noscript><style>` in `src/app.html`. Never put that style in a page (`{@html}` in `<svelte:head>` included; `tests/noscript.test.js` checks): on a click between pages Svelte builds the page's markup itself and Chrome treats the style as real, which hid the charts on Now and the tracker for everyone on Chrome (fixed 2 Nov 2026, the day it went in; a refresh or a direct visit looked fine).
  Older Safari (found on BrowserStack, 2 Nov 2026): Vite 8 rewrites `max-width` rules as `width<=`, which Safari reads only from 16.4, so older iPhones lost every width rule and got the desktop layout; `build.cssTarget` in `vite.config.ts` stops that and `scripts/check-css.js` (in `npm run check:previews`) fails if it returns. Don't hang a sticky element's background on a huge box-shadow held in by clip-path: older iPhones lost the clip while scrolling and the shadow blanked the page, leaving only the bar (`.toolbar::before` is a plain strip to the window's edges). `color-mix()` needs Safari 16.2; older ones skip those declarations, which only loses a few tints. BrowserStack's free trial gives only about a minute a device. iOS 14 isn't supported (design decision, 2 Nov 2026: on an iPhone 12 at iOS 14.7 the data never loaded, and it isn't worth chasing); Safari 15 is the floor.
  All offers no Day interval on either tracker tab (design decision, 3 Nov 2026: 10,000+ daily points can't be read at a chart's width and were slow to draw); 1Y keeps it.
  Space is held for what data fills in, so a page doesn't move as it loads (the analytics' CLS, 3 Nov 2026; under 0.1 is good): on both tracker tabs `.waiting` on `.layout` (and on the Prices tab's cards) gives each part its height in the default view until the data arrives (`buildSummary` takes it off on Generation; update these heights when a part's height changes much), the grouping menu starts at its default choice's width so the header doesn't wrap, a record page's Share and Download are there from the start, disabled, and the Records pages hold a screenful (`.hold`) and wait briefly (2.5 s at most) for the live check, which can add cards above the list. `tests/e2e/site.spec.js` checks both tracker tabs.
  Tracker and Now use the full width of big screens (`.wrap.wide`; reading pages keep 1,260 px); the masthead spans
  the window on every page (`.wrap:not(.wide) > .mast-wrap`, with `--gutter` and `--sbw`, the scrollbar's width set by
  the root layout), so its logo and links don't move between them (design decision HOME-01, 31 Oct 2026); from 1,340 px a reading page draws a faint
  funnel under it, narrowing from the window's width to the column's (`::after`, `--inset`). The browser tab's title says what the view shows (`describe`, set through `setTitle` in `#lib/site/view.js`, which sets it again when the page comes back into view or from the back/forward cache: Firefox on Android blanks a tab's title whenever the address changes and fills it in only when the page reports a new one, so `retitle()` nudges the title 0.3 s and 1.5 s after every address change; a page that changes its own address calls it; SITE-06), and the
  Worker puts the same title into the page title, og:title and og:url of `/tracker` and `/tracker/prices` for a linked view. The tracker page markup
  is in `src/routes/tracker/+page.svelte` (About and Data and methods share one layout with a contents sidebar (sticky; a "Contents" dropdown naming the page under
  860 px, DOC-04, sticky too), the route group `src/routes/(docs)/`; About page: `src/routes/(docs)/about/+page.svelte`, short: why Elenz exists, what each page shows, where the data comes from in brief, support, contact; links to its old `#m-*` sections and `#controls` forward; the guide, `/guide` (`src/routes/(docs)/guide/+page.svelte`, team review DOC-01, 2 Nov 2026): how to use each page, with screenshots in light and dark (`src/lib/methods/Shot.svelte`; `site/static/guide`, made by `analysis/guide_shots.py`, which also writes their sizes, and how wide each is on the site so a small card isn't blown up, to `src/lib/methods/shots.json`; redo them when a layout they show changes). Method pages use the same pictures, only where they talk about that part of the site (DOC-03, 5 Nov 2026). Data and methods: `/methods` overview (with the status labels, conventions and glossary, `#glossary`), `/methods/sources` the source register, `/methods/<slug>` one page per figure (generation, embedded-solar, other-embedded, demand, hvdc, prices, price-explainer, emissions, groupings, capacity, history, records); topics, datasets and references in `src/lib/methods/registry.ts`, what each dataset does on each page in `src/lib/methods/roles.ts` (`ROLES`; the page's Data sources section and the register's table read it, and a label starting "Live week" or "Recent weeks", or "Mapping", "Check" or "Fill-in", sets the register's column), so a dataset is described once; reports, papers and announcements are `REFERENCES`, linked from the claim with `ref('<id>')` and listed in the page's References section and on /methods/sources#references; bodies in `src/lib/methods/pages/<slug>.svelte`, styles in `methods.css`. The live, recent and history account is one component, `Handover.svelte`, on the overview and History; other pages use its short form and link to `/methods/history#layers`. Standard structure (design decision, 6 Nov 2026; the rules are in `docs/style-guide.md`): Introduction, Data sources, How it works, How to interpret it, Accuracy and limitations, Historical coverage, References, with anchors `#introduction #data-sources #how-it-works #interpretation #limitations #coverage #references`. The header says what the figure is and nothing about its data, the body opens with `.mt-caveats` (up to three key caveats) and places `DataSources` (the only place a page says which data it uses) and `References` (which also lists the topic's `code`). `reviewed` on a topic, and `REVIEWED` for the overview and register, says every formula, constant, date and claim on the page was compared with the code and data that day; review every page each May and November; `scripts/check-reviewed.js` warns (never fails) when a file in a topic's `code` has changed since its review, cleared by a review or `[method unchanged]` in the commit message, and `ingest/tests/method_constants.py` fails if a figure typed into a page no longer matches the Python that holds it. Formulas, their terms and worked examples go inside `Calculations` (a Show calculations button, a native `<details>`), with the method in words before it. Keep older anchors when rewriting a page: other pages and chart notes link to them (a heading can carry one as `<span id="limits"></span>`).  The emissions and price explainer pages import their factors and rules from `emissions.js` and `explain.js`, so they stay in step; the other pages are prose: when a method changes, update its page and its `reviewed` date; shared
  masthead, footer (© line, data credits, link icons: fill in a `href` in its `LINKS` to show a social account), logo mark and the "Support Elenz" link to Buy Me a Coffee in `src/lib/site/`; site copy speaks as "we", never "I" or "me"); the canvas chart code is `src/lib/tracker/tracker.js` (vanilla JS, driven by
  element ids in the page; each chart is drawn once per view into an off-screen base, and moving the time line only
  copies the base back and draws the line, dots and time chip over it (`paint`), so scrubbing stays smooth on phones:
  call `render()` when anything other than the hover point changes, `hover()` when only the point moves; groupings (design decisions, 30 Oct 2026): By site gives every plant its own layer (no "Other ..."; batteries by site, embedded solar by island), and Flexibility (Fast flexible), Inverter vs synchronous (Inverter-based) and By owner count batteries' discharge in their group with charging as one layer below zero (`chargingLayer`); Detailed, Simplified and Renewable vs fossil keep batteries separate; plant lists (a fuel's or group's plants, By site's rows) go largest first by installed MW (`bySize`: the most a plant has had in capacity.json), so their order and shades don't change with the range (design decision, 26 Oct 2026); a rebuild keeps the viewer's picks in the summary (`picks`/`keepPicks`: each plant's own last state, so "Only this" survives a range change that adds plants or moves a site into or out of "Other ..."); a click on the ‹ › arrows or a range, interval, region or grouping control answers at once (date box, pressed button) and the view is built just after that paint (`soon()`, quick steps add up through `stepEnd`; on the Prices tab `afterPaint`, which every change of range, interval or date goes through), and the lower cards are told a frame later (`share()`), so clicks stay under ~50 ms at phone speed: keep heavy work out of click handlers; `history.merged(kind, live, from, to)` joins only the window a card needs), styles in `src/lib/tracker/tracker.css` (colour tokens, light/dark). The fuel table
  (colours, renewable flags, fallback emission factors) is `src/lib/tracker/fuels.js`, shared with the home pages;
  every emissions calculation goes through `src/lib/tracker/emissions.js` (the Rankines' quarterly factor, each
  geothermal station's own factor by year; evidence in `analysis/emission_factors.py` and `analysis/README.md`).
  `src/lib/tracker/series.js` loads the history files and merges them with the live week (24 h/3 d/7 d use the
  live 5-minute data; 30 days uses half-hourly history; 1 year and All use daily history).
  Other embedded generation on the site (design decisions, 6 Nov 2026): `src/lib/tracker/oemb.js` `withOemb()` folds a
  layout's `oemb` block into island series (`oemb` the layer, `oembR` its renewable part, `oembE` its emissions in t/h;
  zero before 2009; the live block's typical days laid over the week by NZ local half-hour), adds it to `underlying`
  (demand "with embedded generation") and adds the named plants' fill to their fuel and plant series (Teviot becomes a
  plant in dispatch months), never to grid demand. It runs in `fromLayout`, `now.js`, `generators.js` and the records'
  live check (idempotent: `oembDone`). In `fuels.js` the layer is the fuel `oemb` ("Other embedded", `--f-oemb`,
  hatched, `est.`, `mixed`: its renewable share and emissions come from `oembR`/`oembE`, in tracker.js's totals,
  now.js and generation/data.js); groupings: its own group in Simplified and Renewable vs fossil, Inflexible in
  Flexibility, Synchronous in Inverter vs synchronous; by island like embedded solar in By site and By owner and when
  drilled into (`ESTIMATED`, `estIslands`); left out of price captured (`CAP_FUELS`) and capacity factors (no
  capacity); the Now page's generator list has a row per island (`est`). tod.py folds it in too and re-reads months
  from 2009 made before it (`stale`).
- "Every generator right now" on /now (`src/lib/now/Generators.svelte`, rows and settings in `src/lib/now/generators.js`):
  each plant in tracker.json's `plants` at the newest interval, MW against the installed capacity that applies today
  (`capacity.json`, else the register nameplate), fuel, island and owner (`plants.json`); stations shown whole and
  two-bus plants expand into their `units`; groups whose members are separate stations (`STATION_GROUPS`: Waikaremoana's
  Kaitawa, Tuai and Piripaua) are listed one row per station. A charging battery shows a negative % of its MW rating. Sort, filters and search live in /now's address (`fuel`, `island`, `owner`
  as a slug, `sort` = mw | pct | name | fuel | island | owner with `-asc`/`-desc`, comma-separated for Shift-click's
  further keys (`sort=island,mw`, NOW-10); the word sorts group the list, largest MW first within each, and phones get Sort and Then menus since those columns are hidden there and there's no Shift (NOW-10); `q`, `on=1` generating only); 20 rows until "Show all".
  Each plant links to `/tracker?fuel=<fuel>&plant=<slug>`. Later the index of plant pages (/plants).
- Not found (SITE-07, 30 Oct 2026): `src/routes/404/+page.svelte` prerenders `build/404.html` (noindex, not in the
  sitemap), which Cloudflare serves with status 404 for any address with no file (`assets.not_found_handling:
  "404-page"` in wrangler.jsonc; before it, a missing page was an empty reply, blank on phones); `src/routes/+error.svelte`
  shows the same page (`src/lib/site/NotFound.svelte`: masthead, the address asked for, a way back to the nearest
  section, the main pages, Report) when a link inside the site leads nowhere. Asset addresses are from the site root
  (`paths.relative: false` in vite.config.ts), since 404.html is served at any depth.
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
  means metered generation (meta.source), final prices, metered HVDC. Dispatch months are corrected before they are
  compared (`facilities/dispatch_adjust.json`, published in records.json as `adj` for the live check in records.js):
  Glenbrook and Kawerau (Onepu) scaled to their meters (Ngāwhā's rest is filled in instead, the `oemb` block's
  `named`), each record's usual shift taken off; `prov` only beyond the
  record by more than the margin `m`, `near` within it ("close to the record"). Prices set no provisional records.
  Other embedded generation (records.py VERSION 7, 6 Nov 2026): the layer counts in generation and the renewable share
  (its unclassified output not renewable), not in fuel records; Ngāwhā's and Teviot's fill joins their fuels, not demand
  (dispatch demand already matches metered on average); the South Island has no lowest renewable share records (design
  decision: its ~1 MW of unclassified output isn't fossil plant). No new records. Clock-change days count like any other
  (since BUILD 7; before it, Generation_MD's clock-numbered days before 2009 were left out).
  Try it on downloaded months: `python3 ingest/records.py <folder of YYYY-MM.json> [out.json]`.
  `offered.py` (its own workflow, `offers.yml`, started by the Worker with the history job every 6 hours): final
  generator energy offers from the EA's daily offers files (from 1 Jan 2013, published the day after; ~230 GB in all,
  most of it 2025-26) reduced to offered MW by plant per half-hour, and the part under `CHEAP` ($1,000/MWh):
  `hist/off/YYYY-MM.json` (each island's offered MW by dispatchable fuel on the hist/hh grid, plus `sum`, each day's
  lowest offered headroom and mean offered MW), `hist/offp/YYYY-MM.json.gz` (every plant, for plant pages' capacity
  not offered), `hist/off/days.json` (the summaries joined), `hist/off/progress.json`. Newest months first; its own
  `WRITE_BUDGET` (1,000 KV writes a day). Months in the last 100 days are summarised again as output changes; after a
  history rebuild run it with `--resummarise` (the workflow's tick box). Units the register lacks are logged and skipped.
  `rooftop.py` (embedded solar, shown on the site as "Embedded solar", data key `roof`: rooftops and ground-mounted
  arrays up to ~10 MW on local networks; registry capacity by Root NSP less dispatched farms, three types (small,
  large, ground), 35 irradiance points, Himawari
  satellite irradiance via Open-Meteo, PV model `pv.py`, calibration and uncertainty) and `hvdc.py` (metered HVDC
  parsing and the fitted estimate). `embedded.py` (other embedded generation: non-solar plant on local networks that
  isn't dispatched, from January 2009, design decision 6 Nov 2026): each month's EA reconciliation file (newest
  revision; the last `REVISION_MONTHS` checked each run, names in progress.json `oemb_files`) kept in the state as
  `O|<point> <trader>`, less what the month's layout already counts at each grid exit point (`facilities/embedded_points.csv`:
  meters, exclusions, named plants, fuels and names from public documents; `embedded_registry_split.csv` for the rest,
  else unclassified); written as an `oemb` block in hh/dd/day.json (by island and fuel; `named`: Ngāwhā's and Teviot's
  output months without their metered data lack), kept outside the island series (the site folds it in with
  `withOemb`, see "Other embedded generation on the site" above); months not yet covered are estimated from `hist/oemb/profiles.json`
  (the blend of average days; evidence in analysis/README.md). The live week: the history job writes `hist/oemb/live.json`
  (`live_days`: last month to next, the layer's typical day by island and fuel and each named plant's), and the live job
  adds `oemb` to tracker.json (`live_block`: those typical days by month, which the site lays over the week, and `named`,
  each named plant's typical day less what the live data has, per interval). `analysis/` holds the development scripts and `analysis/README.md` the evidence
  behind every constant in them.
- `.github/workflows/update-data.yml`: runs `update.py` on GitHub (free because the repo is public). Triggered every
  5 minutes by the Worker's Cloudflare cron through the workflow_dispatch API, because GitHub's own schedule never
  fired for this new repo (it stays as a 30-minute backup). Secrets: `EMI_KEY`, `CF_ACCOUNT_ID`, `CF_API_TOKEN`
  (Workers KV Storage: Edit). KV namespace id lives in `wrangler.jsonc`. A run with no new data saves nothing.
- `.github/workflows/history.yml`: runs `history.py`, triggered every 6 hours by the Worker's second cron. The first
  run backfills ~2,200 daily files (resumes next run if it hits its time budget). KV writes: ~3 per changed month,
  so a full rebuild of every month needs ~750 writes and takes one run (BUILD 8: 352 months in 13 minutes; BUILD 10,
  which downloaded every month's reconciliation file into the states once, 55 minutes and 925 writes);
  it starts with the next history run (or by hand, Actions → History); never start one while another is running. The Worker starts the Offers workflow (`offers.yml`) with it.
- `worker/index.js`: serves static assets, `/data/tracker.json` from KV (binding `DATA`), falling back to the
  bundled snapshot, and `/data/history/{index,day,hh/YYYY-MM}.json` from KV keys `hist/*`; rewrites the title,
  og:title and og:url of the tracker's two pages for a linked view (from its address), which `run_worker_first` in
  `wrangler.jsonc` routes through it (`withPreview`, HTMLRewriter). When KV refuses a read (a daily limit or an outage;
  `kv()`), tracker.json falls back to the bundled snapshot, history answers 503 and `/data/health` says so, rather than
  the visitor getting Cloudflare's error page. Security headers: `site/static/_headers` for static files and
  `SECURITY_HEADERS` for the Worker's own responses, the same list (the Worker tests compare them; `frame-ancestors` is
  the only CSP rule, so scripts and styles aren't restricted; Permissions-Policy must leave `screen-wake-lock` and
  `web-share` alone for Keep screen on and Share). Its `scheduled` handler
  dispatches the GitHub jobs (live every 5 minutes, history every 6 hours, watchdog every 15 minutes) (Worker secret `GITHUB_TOKEN`: fine-grained,
  elenz only, Actions read/write; it expires, so renew it yearly). A start GitHub refuses with a server error (or can't be reached) is tried once more 3 s later (`RETRY_MS`), and `/data/health` and the watchdog report failed starts only once they have gone on for 15 minutes (`since` in `cron-status`, `triggerMinutes`, `TRIGGER_MINUTES`): GitHub dropped a single call with HTTP 500 about once a day in early Nov 2026, the next one 5 minutes later working, and each set off a 5-minute alert. Workers Paid since 3 Nov 2026 (US$5 a month: 10 million requests, 10 million KV reads and 1 million KV writes a month included; static files free). Back on the free plan (100,000 requests and KV reads a day, 1,000 KV writes a day; the live job uses ~600), `WRITE_BUDGET` must return to 280 in `history.py` and 100 in `offered.py`.
- `facilities/rooftop_points.csv`, `rooftop_nsp.csv` (irradiance points and NSP → point; regenerate with
  `analysis/make_points.py`), `rooftop_capacity.json` (capacity snapshot the live job uses until the history job
  has stored `hist/roof_cap.json`).
- `facilities/overrides.toml`: curated corrections (any change rebuilds history, except the site-only `[owners]`,
  `[plant_owners]`, `[hydro_schemes]`, `[plant_aka]` and `[plant_metering]` (`SITE_ONLY` in history.py; design decision,
  31 Oct 2026: `[plant_aka]` other names a plant has had or goes by, matched by the tracker's list filter (the matched
  name shown beside the row) and /now's search; `[plant_metering]` what the metered history counts where it differs
  from the dispatch data (stations shown whole, Ngāwhā and Teviot, the split meters at WPG0331 and KAW2201,
  Glenbrook); both shown under the summary's heading when the tracker drills into the plant, `#plant-note`; the
  members of `[plant_groups]` and the register names in `[plant_names]` are added to `aka` automatically, numbered
  parts of the plant's own name left out); the scheme is "Tekapo" (design decision, 30 Oct 2026), its stations keep the
  register's "Takapō A/B"), `[plant_groups]` (stations the metered history only sees whole: Huntly
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
  Bundle them into one rebuild; never start one while another is running. While a build is being collected, its items
  go on the branch `next-rebuild` (a draft PR), not on `main`.
- `ingest/plant_meta.py` writes `site/src/lib/tracker/plants.json` (plant → owner, hydro scheme, `aka`, `metered`) from the register and
  those tables. Rerun it and commit the JSON after refreshing the register or editing the tables.
- `.github/workflows/checks.yml`: on every push, ruff (syntax errors and undefined names only), `ingest/tests/smoke.py`
  (the live and history paths on a committed one-hour sample of real dispatch data and matching final prices, no network), `ingest/tests/method_constants.py`
  and the site's `npm run check`, `npm test` (`site/tests/`: the tracker's address), `npm run build`, `npm run check:previews` (which also runs `scripts/check-css.js`, `scripts/check-methods.js` and `scripts/check-reviewed.js`), the Worker tests and `npm run test:browsers`. Its `ingest` and `site` jobs are required checks: a pull request can't
  merge into `main` (so nothing deploys) until both pass.
  Browser tests (design decision, 2 Nov 2026; `site/playwright.config.js`, `site/tests/e2e/site.spec.js`): Playwright opens the built site in Chromium, Firefox and WebKit (Safari's engine) and at two phone sizes, through the site's own links as well as direct visits and refreshes, and with JavaScript off. They use the snapshot bundled at `static/data/tracker.json` (no history files), not the live site, so a fix can still merge while the live site is down; check only what the snapshot can show. WebKit here is new, so old Safari is covered by `check-css.js` alone. A new page or card with its own fault worth guarding gets a test; put the bug back once to see the test fail. To run them in a Claude session: `npx playwright test --project=chromium --project=phone-chrome` after a build (only Chromium is installed there; `@playwright/test` is pinned to that browser's version, so bump them together).
  Worker tests (`worker/tests/worker.test.js`; `cd worker && npm ci && npm test`): the Worker in Cloudflare's own runtime (Miniflare, with a local KV store and a small stand-in for the static site): ETags, history names, `/data/health`, link previews, noindex, security headers, KV refusing reads and the crons. `worker/package.json` holds only these test tools, so the site's install stays small. `_headers` itself isn't read there: check static files' headers on a preview. A change to what the Worker does gets a test.
- `.github/workflows/watchdog.yml`: checks the live site every 15 minutes; opens an issue labelled `stale-data`
  (GitHub emails it to the Elenz team) when live data is over 60 minutes old, history over 5 days behind, or the Worker
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
  19:55 never appearing). The alerts (`/data/health`, the watchdog) wait 60 minutes so these pass quietly; the site
  shows Delayed meanwhile. The wait was 45 minutes until 7 Nov 2026 (design decision): stalls of about 50 minutes from
  11:05-11:15 am NZDT on both 4 and 5 Nov 2026, with the live job running every 5 minutes and finding nothing new, set
  it off (issues #71, #73). Issues must stay enabled on the repo: the watchdog reports through them (they were off
  after the move to elenz-nz, so the watchdog run itself failed on 24 Oct).
- Tiwai is shown as ordinary demand (design decision, 21 Oct 2026): no separate summary row or record. The data still
  carries `tiwai` (T, MT), unused by the site, in case it's wanted again.
- Daily files arrive 1–4 days late. Island reference prices: HAY2201 and BEN2201 rows exist in the API; the
  daily files lack them, but nodal price ÷ location factor gives the identical figure.
- Battery charging is load on separate units (RUK99, GLB99, RHO99, HLY91); net it against the battery unit.
- Huntly Rankine units 1, 2, 4 are "Coal/Gas" in the register and can switch fuel invisibly to the market, so they
  are labelled coal/gas. Huntly 5 and 6 are gas.
- Arapuni (ARI1101, ARI1102) and Roxburgh (ROX2201, ROX1101) generate onto two buses each, so they appear as two
  rows. The site splits a plant by grid connection only where it feeds more than one bus (`unitsOf` in tracker.js:
  `MULTI_BUS` (Arapuni, Roxburgh, West Wind) or split in the live week); the metered history's extra points for other
  plants (Glenbrook GLN0111, Whareroa HWA1101, Pātea's move ...) are meters, so those plants are shown whole (test
  report, 29 Oct 2026). When ranges join, a month or the live week where a split plant wasn't split still counts in its
  units (series.js `concat`, history.py `combine_days`), so units always add up to the plant; a station shown whole
  keeps its metered months as "Whole station (metered)" beside its members. Daily history has no unit labels before
  29 Oct 2026, so tracker.js works them out (`unitLabel`).
- The plant register lags reality: Kaiwaikawe (MPE1101 KWK0), Kōwhai Park (ISL0661 KPS0) and Ruakākā solar
  (BRB0331 RUS0) were missing; Pātea moved from HWA1101 to OHG1101 in June 2026 and OHG1101 has no island in
  the feed. These are fixed in `facilities/overrides.toml`.
- HVDC flow isn't in the dispatch feed. History uses metered `HVDC_Flows` (Benmore and Haywards ends, ~2 weeks
  after each month); the live week and newer history use `hvdc.estimate`, fitted to the metered flows (~10 MW
  mean error). The NI series is what arrives at Haywards, the SI series what leaves Benmore, `hvdcN` mid-link.
- Daily dispatch files start on 10 Sep 2020 (`Pre1November2022Archive` holds solver case files, not volumes), about
  11 MB a day. Earlier history comes from `Generation_MD` (metered, from 1997) and final prices.
- The register's dated rows matter for history: `register()` keeps retired units (Taranaki Combined Cycle) and
  old connections (Pātea on HWA1101), latest row winning. A unit idle all window is left out of its plant.
- Installed distributed solar (EMI report GUEHMT) was 1,270 MW in Sep 2026, but ~410 MW of it is dispatched solar
  farms on local networks (Kōwhai Park is the Jul 2026 jump), so rooftop solar is ~860 MW. See analysis/README.md.
- Renewable dispatch MW reflect actual output unless constrained (matches metered injection within ~1–2%).
- Emissions: Huntly Rankines follow Genesis's quarterly "Rankines fuelled by coal %" (performance reports) at
  11.2 GJ/MWh; coal 91.8, gas 54.1 kg CO₂e/GJ; gas plant 0.46 t/MWh; geothermal per station by year (NZGA). These
  reproduce Genesis's reported Huntly emissions within ±5% in most quarters. The dispatch data's Rankine output
  matches Genesis's reported Rankine output within 1–2% a quarter.
- Fuel labels corrected in `[units]` (BUILD 5, Oct 2026): Kinleith (KIN0112, wood-waste cogeneration) is `bio` (Bioenergy,
  renewable, zero emissions); Glenbrook (GLN0332 GLN0, waste gas from NZ Steel's ironmaking) is `waste` (Waste heat, zero
  emissions, grouped with fossils).
- Kawerau (Onepu), KAW0112 ONU0 (BUILD 9; the register's "Carter Holt Harvey Energy Ltd CoGen", on the site as Kawerau
  Mill CoGen, bioenergy, from BUILD 5 to 8): the meter is a whole site's grid connection. Generation_MD is exactly its
  Grid_import, with Grid_export at the same point usually flowing in the same half-hour; before 2013 it was a load. Shown
  as geothermal, with TOPP1's and GDL's factors, because they have no meter of their own in the EA's files and what
  goes in is mostly under their 33 MW. That's a reading of public meters: no public document places them there, so
  site copy says so (`analysis/kawerau_onepu.py`, analysis/README.md, /methods/generation#onepu).
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
- `history.py` keeps to `WRITE_BUDGET` (3,000) KV writes per UTC day, counted in `hist/progress.json` (saved by every
  run that writes anything, including runs that rebuild no month); a rebuild that hits it resumes next run
  (`rebuild_left`), and `hist/index.json`/`day.json` are only republished when complete.
- `ingest/requirements.txt` locks every Python package to an exact version and hash, because the live job installs them
  on every run alongside its Cloudflare token: a new release reaches it only through a pull request. It's generated from
  `ingest/requirements.in` (the allowed major versions); the command to refresh it is at the top of that file. Nothing
  else may be installed on the same `pip install -r` line: pip then requires a hash for that too.
- `npm run check` type-checks the Svelte/TypeScript files only (`checkJs` is off in `site/tsconfig.json`: the chart
  code in `src/lib/tracker/*.js` and `src/lib/home/now.js` is untyped JavaScript and gave ~800 false alarms).
- GitHub's own schedules (the backups in the three workflows) fire only now and then (9 scheduled runs in two days,
  checked 15 Oct 2026), so they don't protect against the Worker's cron stopping: nothing outside Cloudflare alerts
  if it does. `/data/health` (Worker) covers that: 200 while live data is under 60 minutes old and history under 5
  days behind, 503 with the reasons otherwise; an outside uptime monitor checks it every 5 minutes and emails the Elenz team.
  During a full rebuild the index is republished only at the end, so both checks allow up to
  12 days while `hist/progress.json` shows months left and was saved in the last two days.
- Metered history (BUILD 6, Oct 2026; analysis/metered_check.py, analysis/README.md): `Generation_MD` from Aug 1997
  covers grid stations, and embedded stations only from Jan 2009; before that they are in `Embedded_generation`
  (Oct 1998 on) under old codes (RKA0111 Rotokawa, NGA0331 Ngāwhā, KMI0331 Kaimai, TRC0331 Te Rapa, TWF0331/2
  Tararua ...). Only embedded stations the tracker shows later are included, so totals don't jump in 2009.
  Generation_MD is net of local load at some embedded points (Mangahao ~10% of gross, Cobb ~35%); the embedded meter
  there has the gross figure. Over Sep 2020-Sep 2026, on the site's own series, dispatch and metered agree within 0.2% for
  national wind and hydro (half-hourly national correlation 0.999); the plants that differ are Ngāwhā (dispatch has only Ngāwhā B; the rest is filled in), Teviot (never dispatched; filled in),
  Glenbrook (metered about 1.47 times dispatch), Kawerau (Onepu) (about 0.68 times) and block-dispatched river chains, and dispatch extremes run a little
  further (wind's monthly peak ~10 MW high). Records correct for this (records.py, facilities/dispatch_adjust.json,
  analysis/dispatch_vs_metered.py and dispatch_metered_fit.py; refresh the corrections about once a year). Plant-level differences: river chains can be block dispatched (the owner only has
  to meet the chain's total), so per-station dispatch there isn't what each station did. No public list names the groups, so site copy stays general and names no chain or station until a public document does (team rule, 2 Nov 2026).
  `Grid_import` starts Oct 2000 and until ~2003 covered only local networks' injections, so Generation_MD stands in
  for connection points it lacks (J| columns). HVDC_Flows changed layout three times (HVDC_BN/BS/HN/HS to ~1999,
  DCP1/DCP2 poles, then BEN/HAY connection points; the 3501 rows repeat totals); `hvdc.parse_metered` reads all.
  38 months between Dec 1997 and Dec 2002 have only HVDC_BN and HVDC_HS (each end's sending side): the receiving side
  is estimated as sent less the old link's losses (`LOSS_NORTH`, `LOSS_SOUTH`; hvdc.VERSION 2, 23 Oct 2026). Stored
  months keep their HVDC columns, so history.py re-reads months before 2003 once when hvdc.VERSION goes up (state
  column `hv`, progress `hv`) and rebuilds them.
  Generation_MD gaps: Huntly (HLY2201) is missing for Sep 2020, filled from Grid_import split by the units' offers
  (`facilities/metered_fill_202009.csv`, `analysis/huntly_sep2020.py`, `fill_of` in metered.py; BUILD 8), Matahina
  from Oct 2021 (dispatch fills), KAW0112 before Jan 2020 (Grid_import stands in from 2013, `IMPORT_STAND_IN` in
  metered.py; BUILD 9; without it North Island generation and demand ran about 20-25 MW low in 2014-19).
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
   BUILD 7 (Mill Creek 2014-15, Kawerau TG1/TG2, West Wind as one plant, Ōtāhuhu names, clock-change days before
   2009, daily peak dispatchable output, Ashburton's small solar farms) ran 23-27 Oct 2026 (commit 9709b43); every
   item checked out on the published files on 27 Oct, the Offers workflow was rerun with "resummarise", and the old
   plant names were cleaned up. BUILD 8 (Tekapo A and B's names, Huntly in September 2020) ran on 3 Nov 2026 in one 13-minute
   run, and its items checked out on the published data. BUILD 9 (Kawerau (Onepu), geothermal from 2013) ran on 5 Nov 2026
   in one 26-minute run; its items checked out and Offers was resummarised. BUILD 10 (other embedded generation from 2009,
   in its own `oemb` block) ran on 6 Nov 2026 in one 55-minute run; its items checked out (no resummarise needed). BUILD 11 (Ngā Awa Pūrua's name, Opuha's
   source) ran on 7 Nov 2026 in one 10-minute run, and its items checked out. BUILD 12 (Southdown Battery from the
   metered history, MW series to one decimal below 10 MW) ran on 9 Nov 2026 in one 16-minute run, and its items checked
   out. See
   `facilities/NEXT_REBUILD.md` for how a next build is collected.
4. Pages: landing (`/`), live (`/now`, with the price explainer and Every generator right now), tracker (Generation and
   Prices tabs), Records (`/records`), Articles (`/articles`, published 15 Oct 2026 with the Winter 2026 review; "Welcome
   to Elenz" published 7 Nov 2026), About, Using Elenz (`/guide`), Data and methods (`/methods`) and Privacy. Stale-data
   watchdog, uptime monitor, Cloudflare Web Analytics and a Buy Me a Coffee link are in place. User acceptance testing
   finished on 7 Nov 2026. The site isn't announced yet (Beta note).
5. Then the brief's build order: plant pages (`/plants/<slug>`), map, hydro panel, offer stacks and downloads.

Recurring upkeep: add Genesis's Rankine coal share to `emissions.js` each quarter (performance report ~3 weeks
after quarter end; FY27 Q1 (23%) added 24 Oct 2026, FY27 Q2 due late Jan 2027); add each year's NZGA geothermal figures (NZ Geothermal Workshop,
November) and Contact's station figures (`GEO_CONTACT`, green borrowing update report, about September); renew the Worker's `GITHUB_TOKEN` before it expires (~Oct 2027).

Terms: the EA confirmed by email (21 Oct 2026) that the EMI datasets and the API are CC BY 4.0, covering republishing,
derived data and a possible paid API for commercial users; attribution is still required (the footer credit).

Coming change: the EA is decommissioning EMI (told us 21 Oct 2026). The real-time dispatch API is being rebuilt and will
need a new subscription; datasets move to the EA's Datasets pages (ea.govt.nz), and the way to fetch them
programmatically is likely to change, with plenty of warning. Everything that reads EMI: `emi_live.py` (API,
`EMI_KEY`), `common.py` `BLOB` (the emidatasets blob container: dispatch, final prices, metered files, offers, the
register) and `rooftop.py` (`GUEHMT` report). Watch for the EA's notice and plan the switch as one change.

Open questions: which plant is behind KAW0112 ONU0 (shown as geothermal from the public meters; a public document would let the site name them; analysis/README.md); farm mounting is settled for most farms by the clear days of 18-19 Oct 2026 (analysis/README.md); Lauriston,
Pukenui and Omeheu stay uncertain; Kōwhai Park is single-axis tracking (east to west, from photos; team note, 22 Oct 2026),
not fitted (it tripped and has been off since 20 Oct). Battery discharge is left out of the renewable share and
emissions intensity (as em6, design decision 22 Oct 2026): tracker.js `genR`, now.js, generation/data.js `shares`,
records.py (VERSION 3) and records.js. Small solar farms: the site's name for the ground-mounted embedded type
(`ground` in rooftop.py, with `GROUND_KW_AT` for NSPs the rule misses: Ashburton at 500 kW).
