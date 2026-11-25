# Elenz architecture (reference)

How each part of the site, the data jobs and the Worker works, and the design decisions behind them. `CLAUDE.md` holds the rules and the workflow; read the section here for the part you're changing, and update it in the same pull request as the code. Facts about the data itself are in `docs/data-notes.md`, the evidence behind every constant in `analysis/README.md`.

## Contents

- [Site build and hosting](#site-build-and-hosting)
- [Landing page](#landing-page)
- [Now](#now)
- [Dashboards](#dashboards)
- [Articles](#articles)
- [Records](#records)
- [Plant pages](#plant-pages)
- [Tracker](#tracker)
- [About, Using Elenz and Data and methods](#about-using-elenz-and-data-and-methods)
- [Other embedded generation on the site](#other-embedded-generation-on-the-site)
- [Other site parts](#other-site-parts)
- [Ingest](#ingest)
- [Workflows and checks](#workflows-and-checks)
- [Worker](#worker)
- [Facilities](#facilities)

## Site build and hosting

`site/`: SvelteKit 3 + Svelte 5, `adapter-static`, every page prerendered. Hosted on Cloudflare Workers as static assets (`wrangler.jsonc` at the repo root; build command `cd site && npm ci && npm run build`, deploy command `npx wrangler deploy`). Every merge to `main` redeploys (see Getting changes live in `CLAUDE.md`).

## Landing page

`/` the landing page (`src/routes/+page.svelte`: the logo (stacked on desktop, compact on phones), live total generation with one rotating second figure, a small live stamp, and the 24-hour horizon line along the bottom of the first screen, then a glimpse of each page; add a page to its `PAGES` list with a preview component in `src/lib/landing/`. As the page scrolls, `Handoff.svelte` shrinks the horizon into its dot, flies it through the Now preview's map (building its rings and HVDC link via `build.svelte.js`) and opens it out onto the Tracker preview (the line grows on its own clock, `GROW`, as the dot passes the line's end and flies on), then climbs the Records preview's staircase on its own clock (`CLIMB`, so it finishes even where the page can't scroll that far; stops are pulled in to the last scroll position) (`RecordsPeek.svelte`: the latest record's progression, path `data-handoff="rec"`, drawn up to the dot by a clip from `build.rec`; the preview's picture opens the record it shows, `peekLink` in `build.svelte.js`, HOME-05); once the line has gone into its dot the hero chart takes no hover and its axis words fade (`html[data-ho]`, HOME-02); the Now preview's figures show in full while its rings draw (no count-up); the dot only touches the start of the Records staircase, which then draws itself on its own clock (`CLIMB`, a small dot at its tip, `pen`) while the dot flies on with the scroll to the Articles preview (`data-handoff="art"`), runs once round its outline drawing it, and the outline fades (`LAP`, `FADE`, on their own clock; HOME-02, 6 Nov 2026); the last stops (Records, Articles) are reached `END_SLACK` (120 px) above the foot of the page, since a tablet or phone browser often comes to rest a little short of it (test report HOME-07, 17 Nov 2026: on a portrait tablet the dot stopped just above the Articles card); a short landscape screen (≤ 520 px tall) gets the compact logo and a smaller figure (HOME-06); shared chart geometry in `geometry.js`, map positions in `src/lib/home/maplayout.js`).

## Now

`/now` the live page (`src/routes/now/+page.svelte`: live figures, the island map with each island's mix ring, the generation mix now, from tracker.json's newest interval via `src/lib/home/now.js`; island outlines in `src/lib/home/nzmap.js`, made by `analysis/make_nz_map.py`; under the price tiles the price explainer, "Why is the price high?": rules and wording in `src/lib/now/explain.js`, drawn by `src/lib/now/PriceExplainer.svelte`, from tracker.json's `explain` block (see `ingest/explain.py`); quiet, highlighted or open by itself, rules tested in `analysis/price_triggers.py`; opened from a button in the wholesale price tile (`PriceButton.svelte`, lit when highlighted), the card drops down under the tiles; its explanation is always two paragraphs, the general one (how prices get like this) then what's going on now ("Currently, ..."); each reason is a pair of bars, now over its recent level; reasons include plants running well below the past week (`BELOW`, an outage stand-in from the live week's per-plant series), a held state after a short jump says so, and when nothing pushes the price up it says what it can't see; a record the live data beat today is a small link above Generation now (`RecordLine.svelte`), only on the day it was set; Keep screen on glows slowly while on; on a preview link, `/now?sim=up|high|split|apart|jump|low` shows the explainer at a price that may not come along during testing (`src/lib/now/simulate.js`, loaded only away from elenz.co.nz, with a banner on the page; NOW-08)).

## Dashboards

Two live dashboards, on test from 16 Nov 2026 and published the same day: linked from a line under Now's heading ("On a
wall screen? ..."), each with a section in Using Elenz (`/guide#dashboard`, `/guide#landscape`, with a screenshot each
from `analysis/guide_shots.py --dashboards`) and an entry under About's Site pages; in the sitemap; each has its own
link-preview image, a picture of the real page on live data (`static/og/dashboard.png`, 2400 x 1260, the wall-screen view
on Lines at sunset; `static/og/landscape.png`, 1200 x 630, kept small because the painted scene is ~3 MB at twice that
and 256 colours shift the fuel colours), made by `analysis/dashboard_og_png.py`; the pages ask for them with `?v=<n>`,
bumped when one is redone. The top menu stays as it is (design decision, 16 Nov 2026). Both read tracker.json and poll it
as `/now` does (`#lib/site/poll.js`), and both, like `/now`, send the heartbeat (Worker section) while open. Umami events
(`#lib/site/track.js`): `wall-screen-open` and `wall-screen-copy` on both, `layout-change` on the dashboard (at most one
a minute), `landscape-mode` on the landscape.

Screen-burn drift (`#lib/site/drift.js`, design decision, 25 Nov 2026): either page may stay open on a screen for days,
and an OLED or plasma screen can keep a faint copy of what never changes. So what stays still drifts up to 5 px each way
along a slow Lissajous path (periods of 17 and 23 minutes), in whole pixels, at most one pixel every 20 seconds, which
nobody sees move. It is always on, on the page itself and in full screen and the wall-screen view, with no setting: the
screens that need it are the ones nobody would think to set. The action sets `--dx` and `--dy`; on the dashboard the
cards and the background move (the background drawn 6 px larger on every side, so no edge shows), on the landscape the
place names, the numbers and the wall-screen credit (the painted scene changes with the light through the day). A
moved box holds its absolutely placed children, so the landscape's `.labels` covers the picture. Tests: `tests/drift.test.js`.

`/dashboard`, the big-number dashboard (`src/routes/dashboard/+page.svelte`, `src/lib/dashboard/`): one or two large live
values and up to four small ones over a background, for a wall screen, a spare tablet or a phone. Every value is in
`values.js` (keys, groups for the picker's tabs, the regions and measures each can show, and how it is worked out, from
`summarise()` in `#lib/home/now.js`, the generator rows of `#lib/now/generators.js` and tracker.json's `explain` block);
plants are added from the generator rows, largest first, and the fun facts name the top plant of each kind by MW. The Groupings tab has the tracker's groupings (/methods/groupings), each under its own heading in the picker (`sec`): renewable vs fossil (waste heat with the fossil fuels, as on the tracker), inverter vs synchronous (shown as a share unless MW is picked), flexibility, thermal, the tracker's owners and its hydro schemes; battery discharge counts in its group, and owners and schemes add up the generator rows (each row carries its scheme from plants.json). `renmw` and `fossil` were under By fuel at first; their keys are kept, so saved layouts still work. A value
needing embedded solar says "No estimate" when there is none. Layouts (`layout.js`) are written `key:region:measure`
(`hydro:SI:cf`, `hvdc`, `p_benmore::cf`) in the address (`?bg=…&big=…&small=…`, plus `col=` for a plain colour and
`view=simple`, so a link opens that layout) and kept in localStorage `elenz-dashboard` (on `/privacy`); an address with a
layout wins. `kiosk=1` shows the screen alone (the "wall-screen link"). Simple shows the numbers and Live or Delayed;
Detailed (the default) adds the time and the line under each value.
`Stage.svelte` draws the screen. Its sizes are hundredths of its own measured width (`--u`), not container query units,
which need Safari 16. On wide screens the cards sit in the middle with a margin round them (test report, 16 Nov 2026:
at the foot they sat too low), in two large columns and four small ones whether or not each is filled, so fewer cards
keep their size (test report, 16 Nov 2026: on a PC and a TV they had stretched across the screen). Cards, buttons and
panels follow the site's own (4 px corners; the header buttons as Keep screen on, the copy buttons as the site's Copy). A value and unit too wide for their card shrink to fit (`fit`, down to 35%).
Screens 640 px wide or less stack the cards, with the credit at the foot of the screen. Full screen uses the browser's
full screen where it can, the page's own otherwise, with an X that fades after 3 seconds without the mouse or a touch.
Backgrounds: Horizon and Horizon light draw the last 24 hours of generation, Live mix the mix now, Plain colour a flat
colour (twelve ready-made, dark to light, or any picked; the ink is light or dark, whichever stands out more,
`plainPalette()`). Any colour is picked with the page's own picker (`ColourPick.svelte`: colour, strength and shade
sliders and a hex box), not the browser's, whose dialog differs on every system (design decision, 16 Nov 2026); the
screen follows a slider as it moves and the address and storage are written when it is let go. The drawn scenes are
SVG in `backgrounds.js`, loaded only when picked, and keep their main feature clear of the centred cards. Contours
(Ruapehu), Cook Strait's coastline, Lines at sunset (a 220 kV double-circuit lattice line) and the Alps' snow are made
by `analysis/dashboard_backgrounds.py` from LINZ's 8 m contour-interpolated DEM (CC BY 4.0; credited on the screen and
on /methods/sources): rerun it rather than editing the SVG (`--look <name>` draws one to /tmp without touching
`backgrounds.js`). Cook Strait's overland lines are routed over land only (the cheapest path on the DEM's grid, dearer
near the coast), from Benmore's direction to Fighting Bay and from Oteranga Bay to Haywards, where the line stops. Lines at sunset follows a photo of a New Zealand 220 kV double-circuit line (test report, 16 Nov 2026): each tower is
the same tower scaled towards one vanishing point at the sun, so every wire joins the same insulator on the next tower,
and the near ground is drawn over the towers' feet so none floats. The far end of the line runs on behind a hill rather than
stopping in the open (test report, 16 Nov 2026). Cook Strait's cable runs the way the HVDC is flowing and Aurora's turbines turn with the wind; all
still under reduced motion. Design from the big-number mockup (15 Nov 2026). Tests: `tests/dashboard.test.js`, and the
dashboards block in `tests/e2e/site.spec.js`.

`/landscape`, the power landscape, a kids' dashboard (`src/routes/landscape/+page.svelte`, `src/lib/landscape/`): an
animated storybook New Zealand on a canvas, ported from the prototype (13 Nov 2026) with its drawing unchanged. `feed.js`
turns tracker.json into New Zealand's last 24 hours (islands added; other embedded generation with its renewable part;
embedded solar with no estimate keeps the last estimate for the picture and is marked `roofNA`, so the numbers under it say
"No estimate"); `dials.js` turns the feed into 0–1 dials (bands in `BAND`, provisional, see its header), the sun and the
season; `scene.js` draws and runs the page's controls (Right now, Replay 24 h, Play with dials, full screen), finding its
elements by id inside the page. The controls (test report, 16 Nov 2026): the mode on the left; on the right Keep screen on
(`KeepAwake.svelte`, as on /now and /dashboard), Picture options, Full screen and Share. Picture options is a drop-down
of switches (names, numbers, cards, birds, low motion), each a button whose `aria-pressed` scene.js sets and CSS draws as
a ticked box; the page closes it on a click outside or Esc. The full-screen ☰ menu has the same switches. The installed capacities for the wind and battery dials come from the generator rows.
Fredoka (the kids' face) is bundled with `@fontsource/fredoka` and loaded on this page only; cards, buttons and panels
take the site's shapes (4 px corners, the site's buttons and segmented control), and sizes on the picture follow `--u`
(1% of its width, set by scene.js) rather than container query units, which need Safari 16. The view (mode, names,
numbers, birds, low motion, cards, replay speed) is in the address and kept in this browser (`prefs.js`, localStorage
`elenz-landscape`, on /privacy); Share copies a link to it or a wall-screen link (`kiosk=1`: the picture alone, a replay
starting again 6 s after it ends). The pop-up cards are off in the replay and on otherwise unless the viewer chooses;
the replay takes 1, 3 or 10 minutes for the day; the play-mode season slider stops at spring (December's look comes
only with the date). The dials carry no notes on the page (test report, 17 Nov 2026: it's for playing with and seeing
what happens): what each changes and its minimum and maximum are a table in Using Elenz (`/guide#landscape-dials`), kept
in step with `BAND` in dials.js. Play with dials (same report: nothing showed there were sliders below): the page takes
the class `play`, which puts the dials straight under the picture, three to a row (two under 900 px; name, value and
slider stacked on phones), and shrinks the picture so both fit on the screen (`--pw` in landscape.css); choosing the mode
scrolls the page there unless they're already in view (`showDials` in the page), and the pop-up says the sliders are under
the picture. Not on a wall screen or in full screen. Smoothness (test report, 16 Nov 2026): the canvas is capped
at about 2.4 million pixels (a 4K TV would otherwise draw up to 9 million a frame and drop frames), frame times are
smoothed, the clock and labels are only written when they change, and the clouds drift slowly. Still layers (test report,
17 Nov 2026: a steady low frame rate): the parts that don't move (the sky's colour with the sun's glow, the mountains, the
ridge, the front paddocks, the vignette and grain) are painted once into off-screen canvases (`still()` in scene.js) and
copied in each frame, painted again only when their key changes (canvas size, light, season, sky colours, the sun's
place). The grain is plain light and dark specks rather than an `overlay` blend, which made the browser read back every
pixel each frame. About twice the frame rate in testing (software drawing, 1280 px wide: 25 to 56 fps; at 2x pixels 15
to 38), with the picture unchanged but for the grain. Still to do from the production plan (post-launch ideas doc):
pop-ups beside their subject, the phone layout, the kids' wording and a fact check of each dial against the method pages. Tests: `tests/landscape.test.js` and the dashboards
block in `tests/e2e/site.spec.js`.

## Articles

`/articles` records, quarterly reviews and analysis (`src/routes/articles/`; one Svelte file per article in `src/lib/articles/posts/<slug>.svelte` exporting `meta` {title, dek, date, kind, draft} from a module script, with `Record`, `Figure` and `Note` components and `articles.css` alongside; the registry is `src/lib/articles/registry.ts`). `ARTICLES_PUBLIC` there is true (published 15 Oct 2026 with the Winter 2026 review): Articles is in the navigation and on the landing page (`ArticlesPeek`); drafts (`draft: true`) stay off the index and are `noindex`, but their own address still works for review.

`article-template` is a draft layout sample. "Welcome to Elenz" (`posts/welcome-to-elenz.svelte`) takes its figures from `analysis/welcome.py` and its pictures from `analysis/welcome_shots.py`. "Electricity generation in New Zealand" (`posts/electricity-generation-nz.svelte`, a guide to the latest 12 months of metered history) takes its figures from `analysis/generation_nz.py`; its cover is `ReviewCover` over the article's 12 months with its own `kicker`, `title` and `label` (`review_cover.py 2025-11 2026-10 electricity-generation-nz`; over 120 days the columns' gaps narrow to 0.6 px). A new cover's PNG can only be shot from a build without the article's `image` set, as the build checks that image exists: build without it, run `cover_png.py`, then add it. Articles dated after today (NZ time, at build) are scheduled: hidden like drafts until a build on or after their date (`scheduled`/`hidden` in the registry; any push rebuilds). Series: an article with `series: '<key>'` and `part: n` in its meta (keys in `SERIES` in the registry) shows "Part n of N" under its title and `SeriesNav` (all parts, previous/next) at its end, and the index folds the series into one card. No series is defined now: the first, "Inside the wholesale market" (7 parts), was removed on 18 Oct 2026 while the Elenz team rethinks its content; commit 21c8b47 is the last with it (its pages, `src/lib/articles/series/wholesale.ts`, data JSON and cover PNGs). `analysis/wholesale_prices.py` (after `analysis/price_fetch.py`) still makes its figures, and `PriceCover` its covers. Article charts are Svelte SVG components in `src/lib/articles/charts/` (Columns (with optional same-axis `marks`), HBars (`max` caps the axis, e.g. 100 for a capacity factor), DotRank, Lines (`xzero`, `xticks` for year and clock axes; `yzero={false}` to fit the y axis to the data, a series as a staircase `step` or as `dots`, a shaded `band` with one series drawn in the accent inside it, `marks`, and a `table`), TimeStack (`labelEvery`, fixed `ymax`/`pmax` to compare two charts), OfferStack (a supply curve from generator offers), Scatter, Ridgeline (one row per year, each on its own scale), TimeMoney (share of time against share of money by band), SplitBar (one whole in parts), MarketDiagram (the market as a flow); site colour tokens, hover readouts, a data table under each) plus `Stats` for headline figures; an article's chart data is a JSON file in `src/lib/articles/data/`, written by a script in `analysis/` (`winter_2026.py` for the Winter 2026 review, which also prints every figure quoted in the text). Quarterly reviews open with `ReviewCover` (the quarter's daily generation by fuel under the title, always dark): `analysis/review_cover.py 2026-06 2026-08 winter-2026` writes its data to `src/lib/articles/covers/`; `analysis/cover_png.py winter-2026` saves it as a 1200×630 PNG in `static/articles/` for link previews (set `image` in the article's meta; `SITE_URL` in the registry makes it absolute).

## Records

`/records` the records (`src/routes/records/`; one page per record at `/records/<id>?region=NI|SI&period=day|week|month|year`, prerendered from `DEFS`): the highest and lowest half-hours, and for each half-hour record its highest/lowest day, week (Mon-Sun), month and year (`periods` in records.json: period averages, from per-day sums in each month's summary, records.py `PERIODS`, `day_sums`, `period_figures`; the old month records are `old` in `DEFS`, not listed but their pages kept), and runs since 1997 for NZ and each island, from `/data/history/records.json` (`ingest/records.py`). Names, wording, formatting, the share image and the live check (the live week averaged to half-hours, generation and demand records only; also the provisional line on /now, `RecordLine.svelte`) are in `src/lib/records/`; `RecordsPeek` on the landing page.

Period records are ranked and shown as the period's average MW (fair across 28-31 day months, leap years and 23/25-hour clock-change days); their energy is shown beside it (`energy`, `periodHours` in records.js: average x the period's hours from its NZ local midnights) on the record page, the index table and the share image (design decision, 23 Oct 2026). Each record page has Share (phones: the share sheet with the record's image, a line about it and the link; computers: copies the link) and Download (the 1200 x 630 PNG from `shareImage.js`, in the page's light or dark colours, `pageIsDark`; REC-05/06) beside the region picker, and again at its foot. The image is drawn ahead (`prepared`), because phones refuse a share that waits on drawing; when a browser refuses to share or copy (Firefox on Android, SHR-03; a second share there is refused with InvalidStateError, a share it never settled, so the link is copied instead) the link is shown with its own Copy button (`src/lib/site/CopyLink.svelte`, also in the tracker tabs' Share panel). Its two charts (`Progression`, `DayChart`) pin a point on click, tap or drag (it stays after the finger lifts; another click, a tap outside or Escape lets go), and on touch the tooltip sits above the chart. With a mouse the pin keeps its own line and tooltip while the pointer reads another point, for comparing, and the hover tooltip slides clear of it (`held`, `keepClear` in keepclear.js; REC-05). A mouse drag across either zooms into that span (design decision, 25 Oct 2026; the y axis fits what is shown, the progression's x axis turns to months, `DayChart` labels with `periodAxis`'s `lab` past its usual ticks). Zoom and pin are bound to the page, which shows Reset zoom and Pinned · Release in the card's heading (`ChartControls.svelte`), never over the chart; Escape lets go of the pin first, then the zoom. The progression's explanation is the ⓘ beside "How the record grew" (`growNote`), not a line under the chart. "Has stood for" counts from the end of the record's period (`recEnd`: a year record from 1 January after it), not its start.

Record link previews (design decision, 16 Nov 2026): a pasted record link shows that record's own image. The image's layout is `recordImage.js` (`recordScene`: a list of shapes and text, with no text measuring: the value is IBM Plex Mono at 0.6 em a character and the tag's three widths were measured in Chromium), drawn onto a canvas in the browser (`paintScene`, via `shareImage.js`) and as SVG in the Worker (`sceneToSvg`), so Download and the preview match. The Worker (`worker/og.js`, routes in `run_worker_first`) rewrites `/records/<id>`'s og:image, og:title, og:url and image size for the page's `?region=` and `?period=` to `/og/records/<id>.png?region=&period=&v=`, where `v` (`imageVersion`) changes with the record, its provisional or new state and `IMAGE_V` (bump it when the drawing changes), so LinkedIn, which keeps one copy per image address, fetches a new one. It works the record out as the page does (`get`, `notShown`, `provisional` with `liveBeats` on `tracker.json` for half-hours, `headline`, `isNew`) and draws it in the dark colours, with resvg (WebAssembly, `worker/vendor/resvg`, compiled at deploy) and the site's fonts as TTF (`worker/fonts`, a `Data` rule in `wrangler.jsonc`); about 50-90 ms a drawing, then a year in Cloudflare's cache under the image's tidy address (record, region, period and the current `v`), whatever else the requested address carries, so each image is drawn once however the address is written (design decision, 25 Nov 2026); an old `v` gets the current image, sent `max-age=600`. With KV down, no records file or a record the page doesn't show, the page keeps the site card's tags and the image address answers with the site card. The record page's HTML is sent `max-age=300`.

Records added 23 Oct 2026 (records.py VERSION 4): most fossil generation, peak hydro, lowest hydro and lowest price. Every record the data holds is shown, half-hours included (team rule, 30 Oct 2026: nothing left out for being less interesting; lowest hydro and lowest price had been kept to days and longer). Under Heading for a record and New and provisional, three tabs (`TABS`, `?tab=milestones|months`; design decision REC-01, 31 Oct 2026): All-time records (with the region picker), Milestones and By month (each a card for New Zealand and each island side by side, three across from 900 px, full lists; design decision, 31 Oct 2026; pointing at a row lights the same milestone or record in every region's card, a click pins it and another lets go, `data-k`/`lit`/`pinned`). The month-of-year table lists every half-hour record, with TP and Day buttons (`moyPer`, address `by=day`; records.json `moy_day`, `best_day_by_month` in records.py, official days only; design decision REC-13, 2 Nov 2026; until a file has `moy_day` it shows trading periods alone) and Milestones all of them. "New" (`isNew` in records.js, `_since_ok` in records.py) is a record first seen in the last 30 days whose period ended within `NEW_LAG` (120) days of that (metered data runs 5-6 weeks behind each month), so a rebuild that moves an old record isn't new (REC-02, 31 Oct 2026); New and provisional (design decision, 1 Nov 2026; `recentAll`, `topCards` in records.js) holds every new, provisional and close record for every region and period, ranked: new official before provisional before close, a bigger jump against the record's usual step, NZ before an island, a half-hour, month or year before a week or day. The first 4 cards are the most notable (one per record, at most two per group) and give only the period; Show all lists every card for one region (the page's `region`, shared with the All-time list and its picker) under its period (Trading period, Day, Week, Month, Year, Runs), newest record first, with its date (REC-09). Both Show all buttons sit in their section titles. An island's list leaves out records that can't apply there (always 100% renewable, no fossil plant, never a net southward period; a period record that never moved shows as one step) and groups left empty (REC-03). A record page's "Records" breadcrumb returns to the list's own period (`period`, the one asked for), not the page's `per`. A DEFS entry's `v` is the records.json version that first has it; an older file says it is being worked out.

A provisional record leads (design decision, 12 Nov 2026; `headline(rec, prov)` in records.js): on a record's page and in the All-time list the provisional figure is the main one, tagged Provisional, with the official record beside it (the page's "Official record" stat, the list's Previous record column); "Has stood for" and "Broken" count from it, Recent records lists it first, and the share image and share line say "Provisional record" (dashed last step, hollow point). The chart of the period a record fell in is the provisional record's own when the data has it (design decision, 13 Nov 2026): `records.py` gives a provisional half-hour record its own `ctx` (the dispatch month with the plant corrections; the usual shift isn't in the chart) and the detail file a `period_prov` beside `period`. Without it (a record from the live week, or a month file not there yet) the chart stays the official record's and says so. In the 73-month test no provisional record went unconfirmed (`analysis/README.md`); close figures never lead. The page's three notes (On record pace, Provisional, Close) keep to the figures, when the metered data settles it and one link to the method (test report, 12 Nov 2026; `paceRest`). The method page's section is "Provisional and close records" (`#provisional`, the old `#official` kept): the plain account and a status table first, the plants and the three correction steps after (test report, 12 Nov 2026). A close or provisional figure that reads the same as the record on the page (99.2% against 99.2%) is left out (design decision, 12 Nov 2026; `_beyond` in `records.py`, with `sameShown` and `dropTies` on the site as a guard, and the live check). New and provisional's Show all headings read "Trading period records", "Day records" and so on (`cardGroupLabel`).

"Heading for a record" (design decision, 23 Oct 2026): `pace()` in records.js lists a current day/week/month/year once half of it has gone (`PACE_SHARE`) and only while it is ahead of its record period at the same point (whole days, or half-hours for a day), from records.json `pace` (records.py `pace_sums`: the current periods' sums in the history, and `to`) plus the live week after it, against each record's `curve` (`period_curve`: the record period's running figure; on the provisional record when one is beyond); and, design decision 7 Nov 2026, ahead of a close dispatch figure beyond the record too (`near`, its own `curve` from records.py, else its final figure with the shift taken off), so a period that can only match the close figure isn't listed; shown as cards on /records (whole rows only, `paceShown`: 8 made up to a whole row, or the whole rows there are, then Show all; REC-09) and a panel on the record's page. The Records index's rows open their record from anywhere on the row. The region picker, the period buttons (Trading period to Year, styled like the tracker's range buttons; their short names on phones) and the "Official to" pill sit in the main list's own title bar (`.list-bar`, a sticky `.toolbar` inside the list's section, so it sticks only while the list shows; two rows up to 900 px, region and periods kept to one row down to 360 px), not at the top of the page: Heading for a record and New and provisional cover every region (design decision, 30 Oct 2026). Every card on the page has an ⓘ in short bullet points.

`hist/records-detail.json` (records.py `build_detail`, published with records.json when it changes; served by the Worker; loaded only by record pages via `loadDetail`): `bg`, each record's best by month (by year for year records) against `months`/`years`, the faint line behind `Progression` (`bgOf`; its hover follows the pointer's date and gives the record in force and that month's best; the month or year still running (design decision, 25 Oct 2026: a tracker-style wash barely showed on a single line, so a hatched band instead) sits in a hatched band over its whole span (the axis runs on to its end, `bgEnd`), its line dotted only up to the latest data, while the record (or provisional record) runs on to the right edge (test report, 9 Nov 2026: the record stands until broken, the figure so far is unfinished, so the unfinished line stops at now) (`band`; no label on the chart, design decision: the tooltip says "so far"; the key above the chart names the hatch), and the tooltip there says how long is left (`hoursToGo`, counted from the start of today like "Heading for a record"); month and year records' files leave the running period out, so the page passes its figure so far as `now`, from `periodNow`/`figureSoFar`, the same sums as "Heading for a record"); `period`, each period record's own series (`period_series`: half-hours for a day, hours for a week, days for a month, weeks for a year), charted on its page by `DayChart` with `periodAxis`'s ticks and the record as a dashed average line.

`udem` (records.py VERSION 5, 25 Oct 2026): for the demand records, the same as `bg` for demand with embedded solar added back (half-hours from each month summary's `info.udem`, i.e. metered + roof; days to years as the period's average demand plus its average embedded solar from the existing day sums), drawn dashed above the faint line (`udemOf`, Progression's `info`/`infoNow`, its running period from `figureSoFar` of demand plus `roof_max`) and named in a key over the chart: information only, never a record (embedded solar is modelled; zero before Aug 2013). Design decision, 25 Oct 2026. Summaries made before VERSION 5 have no `info`, so the half-hour dashed line appears once the history job has remade them (it reads every month back from `hist/hh`, within `MONTH_LIMIT` a run). Until the history is complete the file isn't published and the page says the records are being worked out.

## Plant pages

`/plants/<slug>`, one page per plant file (wave 1: the 110 tracker plants), built from the design mock-up of 17 Nov 2026
(`src/routes/plants/[slug]/`, `src/lib/plants/`). Public since 23 Nov 2026 (design decision, the Elenz team having looked
over the pages): `PLANTS_PUBLIC` in `registry.js` is true. While it was false the pages were noindex, out of the sitemap,
with no menu item and no links in; the prerender finds them through `entries` in `+page.server.ts`. The index's "Pages checked so far" bar shows only while the flag is false. A page's breadcrumb links to the index and to
the index filtered to its fuel (`/plants?fuel=geo`), and a source's link opens in a new tab. Switching on was one
pull request: the flag; the sitemap (the index, `/plants/share` and every page, from `slugs.json`); Plants in the menu
between Records and Articles (six links and the theme button now share a phone's width, so `tracker.css` shrinks the
links at 420, 400, 380 and 340 px, and at 340 px and under the theme button drops under them); a "Plant pages" link
in the header of Now's generator card (to the index; a link beside every plant looked too busy, test report, 23 Nov 2026)
and a link in the Tracker's plant view (`plantHref` in `registry.js`); and LINZ
Basemaps on the privacy page (the index map and a page's Map view load its tiles from LINZ) and in the methods' source
register (`linz-basemaps`). `slugs.json` (every page's slug, written with the pages by `ingest/plant_pages.py`, checked by
its `--check`) is what lets Now and the Tracker link only plants that have a page without loading `index.json`. Setting
the flag false hides everything again: noindex, no menu item, no links, and the index's draft map points return.

Three sources, so nothing waits on a site build. The static part is `src/lib/plants/pages/<slug>.json`, written by
`ingest/plant_pages.py` from the plant files, `plant_capacity.csv` and `plants.json` and committed (`--check` in
checks.yml fails if one is stale). Only checked facts reach it (`plant_files.published()`), numbered by their sources in
page order, so nothing unchecked can reach the site; grades, alternatives, notes and OpenStreetMap IDs stay in the plant
files. A server load (`+page.server.ts`) puts only the page's own file in its HTML. The live panel reads tracker.json
(`live.js`: the newest interval, the live week as half-hours, Ngāwhā's and Teviot's fill as Now has it, marked est.) and
polls it as Now does (`#lib/site/poll.js`). The history reads `/data/history/plants.json` (`ingest/plant_history.py`: each
plant's MWh by month since 1997, about 140 KB, 65 KB gzipped) and works out years, the last 24 whole months and the latest
12 in `history.js`, with capacity factors against the page's capacity steps over the NZ clock's hours (743 or 745 at the
clock changes; the running month to the history's end). A month inside a plant's span with no figure is zero: a month
file leaves out a plant with no output. A part year (hatched) has fewer than 12 whole months of the plant's data.

The research page, `/plants/research` (`src/routes/plants/research/`, `src/lib/plants/research.js`, `xlsx.js`; design
decision, 17 Nov 2026: it replaces the retired research workbook): private, for the Elenz team, and built from the same
plant files, so what the team reviews is what the pages will publish. Its data is `src/lib/plants/research.json`, written
by `ingest/plant_research.py` (every plant file's facts, checked or not, with sources, grades, dates, notes, the to-check
list and the other sources' values, plus the photo and station leads) and committed (`--check` in checks.yml). A server
load puts it only in this page's HTML and `__data.json`; no public page bundles it. Progress cards (pages reviewed, facts
checked, locations checked, photos); filters for fuel, island, owner, status and what still needs work (something to
check, not reviewed, facts not all checked, sources that disagree, no photo, location not checked, location only at the
grid connection), kept in the address with its key; a sortable table, each plant opening to its links (page, plant file,
Wikidata, OpenStreetMap, tracker), to-check list, notes, every fact with its source, grade and date checked (a green edge
once published) and each other source's value beneath it (amber where it differs), and its photos and photo leads; the
station and photo leads below. Above the cards, the research rounds (`ROUNDS` in `research.js`: done, now, next; move
`now` along when a round finishes). The station leads (design decision, 23 Nov 2026: the round after the first pass)
have their own section: groups from `lead_group` in `ingest/plant_research.py` (To research first; OpenStreetMap leads,
under 1 MW, not generating yet, historic, on a page already, all), a technology filter and a search, kept on the page
only; each lead opens to its links, fields, to-check, notes, sources and its own Team notes box (notes key
`lead-<id>`, beside the plants'); a card counts the leads to research. The plants table, the station leads and the photo leads each fold (a `<details>`; the first two start open, the photo leads shut; design decision, 24 Nov 2026). The photo leads have their own filters (design decision, 24 Nov 2026): a status worked out in `research.js` (`photoStatuses`) from the plants' photos, never kept by hand (needs a photo; in use, when the lead's address is a photo's `source_url`; plant has a photo; no plant named), a collection filter and a search, kept on the page only. "Download
workbook" builds an .xlsx in the browser (`xlsx.js`, no library: sheets Plants, Facts, Sources, Photo leads, Station
leads (with its group and team notes); the first row bold, frozen and filtered). The Worker guards it (`research` in
`worker/index.js`, routed through it by `run_worker_first`): on elenz.co.nz it opens only with `?key=` set to the Worker
secret `SCREENS_KEY` (the screens page's key), else the not-found page, `__data.json` included; on a branch preview it opens
without one, so a research batch is reviewed on its pull request's preview (previews may not carry the Worker's secrets,
and they are noindex). It is never cached or indexed, sends no referrer, and the Worker takes out Cloudflare Web Analytics
and Umami, so the team's visits aren't counted and the key never reaches either. Each opened plant also has a Team
notes box (design decision, 19 Nov 2026): the team's own notes, saved through the Worker in KV and never in the
repository (`#lib/plants/notes.js`; Worker, `/data/plant-notes`). The page sends the key from its address; it saves on
leaving the box, with Ctrl+Enter or Save, warns before closing with a note unsaved, offers "Use that one" or "Save mine
over it" when another device saved first, and says in words when there is no key, a wrong key, or no key set on that
address (a branch preview needs `SCREENS_KEY` in its Previews settings). A ✎ marks plants with notes, the Needs filter has
"Has team notes", and the workbook's Plants sheet a Team notes column. Every link on the page, masthead and footer
included, opens in a new tab (`#lib/site/newtabs.js`, design decision 19 Nov 2026), so the page's filters and open plant
stay put. Tests: `tests/research.test.js`, `tests/e2e/research.spec.js` and the `/plants/research` and
`/data/plant-notes` blocks in the Worker tests.

The page: name, a line from Elenz's data (`subtitle()`), tags (fuel, island, owner, status, installed MW); "We're still
checking this page's facts" until the plant file's `reviewed` is set; then, beside the Now panel, the picture panel
(`Media.svelte`, design decision of the page review, 19 Nov 2026) with a Photos tab and a Location tab, shown only when
the plant has both. Photos: every row of `plant_images.csv` for the plant, in file order (the files go in
`static/plants/`, and `plant_pages.py --check` fails if one is missing), in a strip that swipes on a phone (CSS scroll
snap), with arrows and "1 of 3" when there is more than one; each credited under it, the credit's links opening in a new
tab. A click or tap on a photo (or the corner button) opens all the plant's photos uncropped in a native `<dialog>` (design
decision, 22 Nov 2026: the frame crops to 1000:640, which cuts tall photos hard): arrows, the arrow keys, a swipe, Esc, each photo
credited; closing leaves the strip on the photo last viewed. `plant_images.csv`'s optional `focus` ("50% 12%", across then down)
sets `object-position` for the cropped frame, so a tall photo's subject stays in view; blank centres it. Location: one LINZ aerial view, labelled Site (design decision, 22 Nov 2026: three views were too much on a page; the Elenz team chose the best of Site, Close and Wide, about 450 m, 1 km and 7.5 km across, for each plant, listed in `facilities/plant_aerial_choice.csv`, which `plant_pages.py` reads; a plant without a row shows all three, keyed `site`, `close` and `wide` (a repeated key stops the page hydrating; a test checks every page); all three images are still made and kept by `analysis/plant_aerials.py`; credited with the imagery collection, Toitū Te Whenua LINZ, CC BY 4.0) and, for a plant of several stations, a site view of each station that has its own checked point (design decision, 22 Nov 2026: `[[stations]]` entries with `location`; `analysis/plant_aerials.py` makes `<slug>-s<n>.webp`, n the station's place in the list, rows `s<n>` in `plant_aerials.csv`; a station standing on the plant's own point is the plant's view, so it gets no second image). The pictures step with the photos' ‹ › arrows, the arrow keys and a swipe (a second scroll-snap strip in `Media.svelte`), with "1 of 3" and the station's name on the picture (`name`, `lat`, `lon` on each `aerial` entry, in station order, from `plant_pages.aerial_views()`); the caption and coordinates follow the station shown, and Site and Map stay the two views. The main site comes first, so it is what a visitor sees on opening (design decision, 22 Nov 2026): the plant's own point (its station, or the whole site), unless the plant file's `main_station` names another station with a checked point; the rest follow in station order. A station without its image yet is left out of the arrows; one picture shows as before, with no name and, with the
LINZ key, a Map view (the index's MapLibre and `topolite-v2` style, loaded only when Map is chosen, centred on the point,
with cooperative gestures so it doesn't catch the page's scrolling), a Map / Satellite switch just under the Site / Map switch, only while Map is chosen (design decision, 22 Nov 2026: LINZ's aerial tiles as a raster layer over the basemap, `aerialSource()` in `map.js`, shown or hidden without reloading the map), a small locator of the plant's island in the corner
(`islandBox()` in `map.js` frames the one island's outline: the whole-country map was hard to read in light mode), and
the coordinates with their source under it. With no photo, the Location tab leads alone; every plant with a checked
point has aerial views (design decision, 19 Nov 2026). Without JavaScript the first tab's first view shows. The views are WebP files in `static/plants/aerial/`, made by
`analysis/plant_aerials.py` from LINZ Basemaps' aerial tiles (with the `LINZ_BASEMAPS_KEY` key, never committed) and
listed in `facilities/plant_aerials.csv` with the point each is centred on; a page gets them only while that point is
its plant file's checked location, and `plant_pages.py --check` fails when a location has moved without new views or a
file is missing. The Now panel takes the full width with neither; three figures (the latest 12 whole months and their capacity factor, the most in a calendar year
in our records; for a closed plant its total, best year and last month); generation by year (Energy or Capacity factor,
dashed lines where installed MW changed, the plant's metering note from `plants.json` under it); the last 24 whole months;
installed capacity over time with each step's source in its ⓘ; related pages (the scheme's other stations upstream
first, the owner's other plants, at most 12, the largest of its fuel on its island), under the charts on a wide screen
and straight under the facts on a phone (a grid with areas from 900 px; below it the side column's cards join the
page's grid with `display: contents` and `order`); in the side column the facts (installed MW and owner from Elenz's data, then the checked facts, each fact's note in its own ⓘ so the
column stays short) and a call to share what you know, linking to `/plants/share?plant=<slug>`; and the sources, numbered, ending with Elenz's own data. Charts are drawn to
their card's width (`Bars.svelte`, `CapSteps.svelte`, `Spark.svelte`; each wrapper `min-width: 0`, or a chart holds
its card at 720 px on a phone), and pointing at or tapping a bar puts its figures in the line above. A closed plant has
no Now panel; a plant not generating yet (a pending capacity row) says so and shows no MW.

`/plants/share` (`src/routes/plants/share/`) asks for first-hand knowledge and photos from people who have worked on or
with a station: an email to hello@elenz.co.nz, not a form, so nothing is stored on the site, started with `?plant=`'s
name in the subject and a template body (what you know, how you know it, how to be credited, and the photo licence
line: the sender owns the copyright and lets Elenz publish under CC BY 4.0). The page says the Elenz team checks
everything first and may publish it with the sender's name or anonymously. Hidden with the plant pages. Tests: `tests/plants.test.js`
and the plant pages block in `tests/e2e/site.spec.js` (a small history file handed to the page, and the phone width).

The method page, `/methods/plants` (`src/lib/methods/pages/plants.svelte`, design decision, 24 Nov 2026: the last part of
the plant pages' first wave), is the public account of how a page is put together: facts, grades and checking, dates,
capacity and other ratings, locations, photos and aerial views, output and capacity factor. Its image credits (every
photo, and the LINZ imagery collections with how many pages use each) and its counts (pages, pages reviewed, pages with a
photo) come from `src/lib/plants/credits.json`, written by `ingest/plant_pages.py` with the pages and checked by its
`--check`, so the page never needs editing when a photo or a review is added. A plant page's checking note and its
Sources list link to it, and so do the index's lede and its table's ⓘ. When a rule in `facilities/PLANTS.md` changes,
change the method page in the same pull request.

The index, `/plants` (`src/routes/plants/`, `src/lib/plants/list.js`, `PlantMap.svelte`), from the same mock-up: a map
above a table of every plant, filtered by fuel, island, owner, status (Operating, Operating and closed, or Closed only)
and a name search, sorted by any column, with the settings and the selected plant in the address (`list.js`, as Now's
generator table). Each fuel button is two (review of 19 Nov 2026): its square turns that fuel on or off, as the
tracker's legend squares, so the map can show any mix (`fuel=wind,solar`; `fuel=none` for none), and its name shows
that fuel alone, or every fuel again if it already was. The key's switch sizes the dots by installed MW or by output
now (`size=now`; batteries by the size of their charge or discharge; closed plants smallest). The side panel shows the
picked plant's name (a link to its page), its first photo or else its aerial Site view, credited, and a one-sentence
overview (`overview()` in `plant_pages.py`, from the checked facts only: MW, kind, river or geothermal field where the
fact names one, region, and the years).
On a phone (320 px up) the filter card never widens the page (test report, 24 Nov 2026, a real phone at 320 px): the card is one `minmax(0, 1fr)` column, because a grid item's minimum width is its content's and the island tabs (`.seg.isl`) had stretched the card, the Find box and the page sideways. The tabs share the card's width and their names wrap if they must; the fuel chips keep their own sideways scroll, with a fade over the card's right edge (`.fuelwrap`, class `fade` set by the `edge` action while chips lie past it) that goes at the end. `/plants/research` has the same controls and the same fix. `tests/e2e/site.spec.js` ("plant index") checks `/plants` at 320, 360 and 390 px in every desktop browser: the page's `scrollWidth` fits, the tabs and Find box lie inside the card, and the fade comes and goes.
Its rows are `src/lib/plants/index.json`, written by `ingest/plant_pages.py` with the pages (and checked by its
`--check`): name, fuel, island, status, installed MW, owner, the checked commissioning year (the earliest year in the
fact), the year it closed, whether the page is reviewed, the map point, the side panel's picture and the overview. The point is the checked location; while the pages are hidden it may also be a
draft (design decision, 18 Nov 2026): the plant file's unchecked location from a public source, or else its grid
connection, drawn faded and named "not checked yet". OpenStreetMap points are never used, and `+page.server.ts` drops
every draft once `PLANTS_PUBLIC` is true. The Now column reads tracker.json's newest interval, polled as on Now. The
map is MapLibre GL JS (a dependency loaded only on this page, with its worker file, about 450 KB gzipped together) on
the LINZ Basemaps `topolite-v2` style (Toitū Te Whenua LINZ, CC BY 4.0, credited in the map's corner). It needs the
build variable `LINZ_BASEMAPS_KEY` (declared in `src/env.ts`, set in Cloudflare's build settings, never committed;
LINZ restricts a developer key to our sites, so it isn't a secret). Without the key, without WebGL 2, or if the style
fails to load, the page keeps the outline map it is prerendered with (the Now map's outlines with `map.js` placing the
dots), which is also what the browser tests see. MapLibre's own credit button is off (design decision, 22 Nov 2026: it opened by itself and was fiddly on a phone); the caption under the map carries the LINZ credit. Once the map is up, a Map / Satellite switch in its top left shows LINZ's aerial tiles (the same raster layer as the plant pages' Map view, under the dots) and the caption says which is shown. An island filter frames that island; the corner button the whole
country. Tests: the index tests in `tests/plants.test.js` and the plant index block in `tests/e2e/site.spec.js`.

## Tracker

### Tabs and the Prices tab

The tracker has two tabs (`src/lib/site/TrackerTabs.svelte`, under the masthead): Generation at `/tracker` and Prices at `/tracker/prices` (`src/routes/tracker/prices/+page.svelte`: six node prices, the island spread and HVDC on one time axis for the live week and 30 days; each period's price range, spread and half-hours over $500/$1,000 for 12 months and All; price captured by fuel; a time-of-day heat map. Data shaping in `src/lib/prices/data.js`, SVG charts in `src/lib/prices/`.

### Lower cards and heat maps

Under the Generation tab's charts, `src/lib/generation/GenLower.svelte`: a share of generation over the range with the same dates a year earlier (365 days; not on All), dispatchable headroom (hydro, gas, coal/gas, diesel and battery capacity less output at two levels: installed (`capacity.json`) and offered (`hist/off/*` from `ingest/offered.py`; the files also hold the MW offered under $1,000/MWh, not shown since 23 Nov 2026, design decision); Levels view (nested areas) or By fuel (one level stacked, hydro on top and optional); where a chart point spans more data, each level's lowest within it, which for installed capacity on daily history needs `peak.disp`/`peak.dispx`, each day's highest half-hour of dispatchable output with and without hydro (since BUILD 7); method on /methods/capacity#headroom), the mix by fuel with capacity factors (from `capacity.json`; peaks only for half-hourly or finer data; batteries count discharge, daily history's `batt_d`), and the range by time of day; data shaping in `src/lib/generation/data.js`. Both tabs' heat maps follow the range (`src/lib/site/heat.js`): one row per day from half-hourly history up to 400 days (at least the last 7; a year starts at its first whole day, like the cards above it), scrolling past 40 rows (latest at the foot), and one row per month (or year) for All from `hist/tod.json` (`ingest/tod.py`); colours on a fixed scale (generation: set by today's installed capacity; the renewable share: fixed bands 80-98%; prices: fixed bands) or "Scale to this view" (the renewable share: `renBandsScaled`, the sixths of the shares shown). The tracker hands it its window through the `view` hook of `mountTracker` (model, live week, history store), and it loads the year-earlier and 30-day history only when scrolled near. Cards say what they cover with `src/lib/site/Context.svelte` (the dates as the chip, then region and resolution; `span` in `src/lib/site/context.js`: the clock at both ends of a short live window, none for whole days), as do the Prices tab's lower cards (design decision, 30 Oct 2026: dates, never "3 days to ...", on every card of both tabs). On both tabs the Live / History / Delayed pill and the About this data button sit on the tabs line (TrackerTabs' `children`), and the control bar sticks to the top of the window at every width (two rows on phones, control names hidden) (`.toolbar` in tracker.css; `src/lib/site/sticky.js` keeps `--tb-h`, its height; the summary panel scrolls with the page, design decision Oct 2026) and has arrows beside the date that step by the range (Generation: `tb-prev`/`tb-next`, synced in tracker.js with the chart's own arrows). Every chart and lower card can be enlarged over the page to the window's width (`src/lib/site/PopButton.svelte`, always in the card's or chart's top right corner, so cards are `position: relative`; `.card.popped` in tracker.css; heat maps take `--rh`, their row height). From 1,600 px wide the lower cards on both tabs sit in two even columns split down the centre (Generation: `.row2` is `display: contents` there). Price captured by fuel (`src/lib/prices/FuelBars.svelte`) shows a row on hover and pins it on click (Pinned · Release); the Generation tab's mix table highlights the row under the pointer, and a click opens that fuel's plants in the list and chart above (`openFuel`, passed down in the `view` hook; LOW-03). "Scale to this view" flashes the heat map's key (`.scale-flash`; PRC-06). The share chart and heat map offer Renewables, Wind, Solar, Inverter-based (wind and solar), Hydro, Gas and Coal/gas (`METRICS` in `src/lib/generation/data.js`).

### Addresses, sharing and pinning

Every view is in the address, so any view can be linked (keys and parsing in `src/lib/site/viewurl.js`, pure and shared with the Worker and the tests in `site/tests/` (`npm test`); the browser side in `src/lib/site/view.js`): `region`, `range`, `int`, `end=YYYY-MM-DD` shared by both tabs; the Generation tab's `by` (grouping), `unit=pct`, `chart=lines`, `price=on`, `fold`, `off` (layers switched off in the list, by `slug()` of their name, so a shared link hides the same; `offNow`, applied by the rebuild that has them; SHR-07) and drill-down `group`, `fuel`, `plant` (plants and plant sets by `slug()`: "manapouri", "branch-river-arnold"; old slugs can be mapped in `PLANT_ALIASES`); the Prices tab's `scale`, `hide` (nodes, and `spread` for the price chart's priced-apart shading off: PRC-01, where the list has All/None and the Generation list's colour squares, `#lib/site/swatch.js`: double-click, Shift or a long press shows one alone; HVDC's net average is in the stats card) and `band` (an island's region uses its own node, PRC-04); and in links only, `t`, the point the summary opens on. An address with a query is a link and opens exactly that; a plain visit opens on this browser's last region, range and interval (localStorage `elenz-view`, plus the grouping and MW/%) and `elenz-prices`, never the date or drill-down. Settings replace the address; each drill-down step pushes one, so Back steps out of it (`onPop` in tracker.js). The tab links carry the shared settings plus the other tab's own from its last visit in this browser tab (sessionStorage, `tabHref`). The Share button (`src/lib/site/ShareLink.svelte`, on the tabs line) copies a link to the live view or to the dates shown (`shareLinks`), optionally marking the pinned point; on phones it opens the share sheet. A row of the list drills in from the list itself; when the charts are off the top of the screen (a long By site list) or the list sits under them (phones), the page goes back up to them, as a mix table row does (`drillFromList`, GRP-03). A click on any chart pins the time line there (accent line, and a "Pinned <time> ×" chip in the sticky bar, `#pin-chip`/`syncPinChip`, the one place the pin is named; another click on it, the chip or Escape lets go); drilling down is from the summary list only (the generation chart no longer drills on click). Touch keeps its point without pinning, so it can still scrub; a tap on the line a touch left (within `TAP_PX`, without sliding) lets it go (test report CHT-02, 30 Oct 2026). A pin, or a touch's point, survives a rebuild whose view still shows that moment (`pinT`/`keepBy` in `rebuild()`: grouping, region, drill-down, a range with the same points; GRP-01). Charts allow pinch-zoom of the page (`touch-action: pan-y pinch-zoom`, PHN-03). Every chart under generation has its time labels (ZM-01, 31 Oct 2026), and the summary's sub-line keeps room for two lines at every width so a note (interpolated, partial) doesn't make it jump (CHT-08). On Prices a tap on the line (pinned, even from a link, or left by a touch) lets it go (`onunpin` on `TimeChart`, SHR-07).

### Prices tab zoom and downloads

The Prices tab zooms the same way on its 5-minute and half-hourly views (`zoom` state in its page, the same address key; `onzoom` on `TimeChart`; its 1D menu sits outside the sticky bar). Downloads on daily and longer intervals give generation as energy in the chart's unit, with an `hours` column (a partial period: energy so far).

### Time slider

Time slider (design decision, 5 Nov 2026, test reports TRK-12; `src/lib/site/slider.js`, tested in `tests/slider.test.js`): under the generation chart and the Prices tab's price chart, lined up with the time axis (`inset`), a window of fixed length, set by the range buttons (or a zoom, shown at its length), on a fixed track of time. It has no ends to drag (design decision, 5 Nov 2026). The track is eight windows long (`trackLength`, design decision, 5 Nov 2026: one rule for every range, menu zoom and dragged zoom, so 1D is 8 days, 30D 8 months, 1Y 8 years, 3 hours a day; a clock change or leap year inside the window leaves it alone; All, or anything longer than the history, is the whole history; short tracks are labelled in hours, `ticksFor`), and it stays put while it's used and stops at its ends (a window dragged to an end can land on the grid just past it: `slack` in `trackFor`): picking a date puts the window in its middle (`centre`), and at the newest data the track ends there (`trackFor`). Drag the window and the charts glide with it, on a 5- or 30-minute grid, whole days only for daily data (`snapSpan`); press the track to go there. `spanView` turns the stretch into a range, end and zoom, keeping the range the drag began on (`slideRange`) unless the stretch outgrows it. A stretch needn't sit on whole days: a `{ from, to }` zoom sets its own ends, past the range's window (`buildView`, `kindFor`, `spanFor`, and `build` on Prices). At the range's own length it's a moved window, not a zoom: no Reset zoom chip, and a date or Latest goes back to a plain window (`movedWindow`). Everything on the track is fetched ahead, 0.8 s after it's set (`prepare`: its half-hourly months, up to 9 files, about 1.2 MB on 30D; 1Y and All have the daily history already), so the charts follow a drag all along it; before that arrives they catch up after a 220 ms pause or on letting go (`ready`). The address and lower cards wait for it to let go (`sliding`). Once it's let go nothing replaces that last step (`drag.done`, `wanted.final`: the mouse can still be moving as it lets go; test report TRK-12). A tap, or a finger scrolling the page (`touch-action: pan-y`), moves nothing. The small picture draws from data in memory really holding 90% of the track (`overview`, `held`: a series joined from months can span the track with months missing; test report TRK-12, 6 Nov 2026). The Prices tab joins only the window it shows (`merged` with a range), since a track's months can all be here.

### Zoom, dates and the pin

Zoom (Generation tab, tracker.js `state.zoom`, address key `zoom`): the arrow beside 1D offers the last 3, 6 or 12 hours (`SPANS`, the menu headed Zoom, its note about dragging only for a mouse; `zoom=3h`, anchored to the window's end, so it stays live), and a mouse drag across any chart zooms to that span (`zoom=YYYY-MM-DDTHH:MM~YYYY-MM-DDTHH:MM`, end exclusive); every chart, the summary and the lower cards follow (`buildView` narrows the window). While zoomed the ‹ › arrows step by the zoom's length (moving the window if need be; forward to the newest data, a menu-length stretch is live "last N hours" again, ZM-04), the Reset zoom chip in the bar (just those words: the hover tooltip gives the times; design decision, 5 Nov 2026), or Escape twice, goes back, and a range button clears it. Zoomed on a 5-minute or half-hourly view, the calendar also shows the time the stretch ends (`time` on `<date-pick>`, its foot, "Ends at"; on the box itself only in the hover tooltip; design decision, 5 Nov 2026, TRK-12: the time box beside the date came and went at every day's end during a slide, and the sticky bar's rows with it). The date box reads the date it ends, its name "3 hours ending". Choosing a day or time moves the stretch there (`zoomEndAt`, both tabs: snapped to 5 minutes, window = the day it ends in; at the newest data a menu-length stretch is live "last N hours" again; the window stays on the range's button, the zoom reaching past it). Without a zoom the date box picks a whole day, as before (`onDateSettled` in datefield.js). The time is the site's own too (`datepick.js`; ZM-03, 2 Nov 2026: the browsers' pickers redrew the chart at every step): an hour only marks itself, and picking the minutes applies it, by `timechange`. The bar doesn't change while the slider moves: the date has a fixed width, `.datebox` keeps room for Latest (just its arrow up to 1,240 px), under 388 px region shares a row with interval rather than range, whichever range is shown, and a window the slider moved keeps its range's name (TRK-12; `tests/e2e/site.spec.js` checks). Latest while zoomed moves the stretch to the newest data at the same length (`zoomEndAt`), and shows when a dragged stretch sits behind the newest data. The date box is the site's own calendar on both tabs (`<date-pick>`, `src/lib/site/datepick.js`, a custom element with `value`/`min`/`max`/`disabled` and a `change` event, hung from `<body>`, outside the sticky bar; test report TRK-07: Firefox's picker redrew the chart while scrolling its month and year lists): moving between months or years changes nothing until a day is picked, which closes it; the month name opens a year list, then months. On 1D a past day is labelled "Day" (it shows that whole day). A past window counts whole local days back (`addDays` in `buildView` and `spanFor`), so a clock change inside it no longer adds an hour of the day before (CHT-10). A past 1Y window is a calendar year (`addYears` in viewurl.js, `moveBy` on both tabs: 366 days in a leap year, and the arrows keep the date; CHT-11). The pin is the anchor (design decision ZM-02, 31 Oct 2026): a range button opens the new range around the pinned point's middle (`endAround`; a pinned year on All opens that year on 1Y), still pinned (`pinAfter` in `rebuild()`), unless the new view is finer than the pin and the pin is longer than an hour (a pinned day opened on 1D shows that whole day and lets go; 7:30 pm on 30 days stays 7:30 pm on 1D); without a pin, a dragged zoom carries over the same way. The ‹ › arrows step freely and let go of a pin once it leaves the window. The Prices tab does the same (`pickRange`, `setView` keeps a pin by its time, not its place in the list). The 1D menu (`#span-menu`) lives outside the sticky bar and is placed under its button. Share's link to the dates shown turns a span into fixed times (`zoomAt`).

### HVDC, partial periods, chart type and the price overlay

On an island's chart, HVDC is signed like the batteries (23 Oct 2026): arriving is stacked on top of the island's generation, leaving is drawn below zero (`drawGen`). Both are drawn light so the generation behind reads through, and High/Low sit on the generation, never on HVDC.

In the energy view a partial first or last period (week so far ...) is drawn as the energy it holds, so it steps down, washed out behind a dashed edge (design decision TRK-04, 31 Oct 2026: honest rather than scaled to a whole period); its note ("Part month: 1 Oct to 16 Oct (16 of 31 days) · energy so far") is in the tooltip (`partialNote`), and the summary's sub-line says where the data stops (for touch). The last period is partial when it runs up to the newest data or when a past window ends part way through it (`partialCut`, e.g. 1 year by weeks ending on a Thursday; TRK-04, 30 Oct 2026).

Chart type (design decision, 29 Oct 2026): Stacked (default) or Lines (`#seg-chart`, `state.chart`, address `chart=lines`), each visible layer as its own line from zero in the same unit (MW, energy, %), no High/Low; fuels and groups keep their colours, and when 2-8 lines are shown and some are shades of one fuel (plants, sites, connections) or grey "Other" rows, each takes a colour from the line palette `--l1`..`--l8` (tracker.css, validated for colour-blind separation on both surfaces) by first come (`SLOT`), so hiding one never repaints the rest; the list's squares follow (`syncSwatches`); the tooltip lists the lines at that time, nearest first.

Price over the generation chart (`#btn-price`, `state.price`, address `price=on`; off by default, design decision): both island prices for NZ, the island's own on an island's chart, on a right axis with the Prices tab's spike-proof scale (`priceScale` from `#lib/prices/data.js`), thin and dashed (Haywards long dashes, Benmore short) so they don't read as generation lines. While it's on every chart's right margin widens (`padR()`) so the time axes stay lined up. Both are kept with the grouping in localStorage `elenz-view`.

### Embedded solar with no estimate

Design decision, 13 Nov 2026 (built 16 Nov): where a live-week interval is in daylight and has no irradiance from the
satellite, its carried-forward index or the forecast (after bridging gaps of up to 30 minutes), the live file carries
no value rather than zero. `rooftop.live` adds each island's daylight (`NIlit`, `SIlit`: clear-sky irradiance above
20 W/m² at any of its points, `rooftop.daylight`); `assemble()` then writes `roof`, `roofU` and `underlying` as null
there (`enc_mw` writes NaN as null). At night a missing value is still zero. History has no daylight key, so it is
unchanged. `explain.py` counts a null as zero.

On the site, `series.js` `fromLayout` turns the nulls into `roofNA` (1 where missing; averages give the share of a
period without an estimate; zero in history) and `underlying` NaN; `roof` and `roofU` count as zero, so stacks and
energy totals leave it out. The tracker sets the renewable share and emissions intensity NaN at any point with
`roofNA` above 0 (both would be of too little generation); lines, bands and areas break at NaN (`runsOf`), readouts
say "No estimate" (in the summary's table across the figure and share columns, out of the flow, `tr.na`, so no row
grows and the page doesn't jump as the cursor crosses a gap: test report, 16 Nov 2026), the point's heading and tooltip
say "no embedded solar estimate", a range's heading says for how long ("embedded solar missing for 5.5 h"), and range averages of those three figures leave the missing time out. The CSV leaves those cells empty. The lower
cards' shares are NaN there (`shares().na`, left out of `shareOver`). `now.js` `summarise` gives null `roof`, `roofU`,
`underlying`, `ren` and `co2` for an island whose newest interval has none (New Zealand's if either has none); Now says
"No estimate" and the landing page drops the renewable share from its rotating figure. The records' live check
(`halfHours`, `liveSums`) leaves such intervals out of the renewable share and embedded solar, so they can't set a
provisional record. Tests: `ingest/tests/smoke.py` (live), `site/tests/roofgap.test.js`, and the two "no embedded
solar estimate" browser tests.

### Folded charts

Folded charts (design decision, 29 Oct 2026): each chart under generation (price, renewable share, demand, HVDC, emissions: the two folded by default sit together at the top, design decision) folds to one line from its title (`foldTitle` in the page, a button with aria-expanded; `state.fold`, `syncFold` in tracker.js; `.chart.folded` in tracker.css): the heading, ⓘ and legend values stay (they follow the time line), the canvas and enlarge button go, and a folded chart isn't drawn (`unfolded` in drawAll/paintAll; its ResizeObserver redraws when it opens). All five start folded (`FOLD_DEFAULT` in viewurl.js; design decision, cleaner, above all on portrait phones; price and renewable share are also on $ Price and the share card); the prerendered page has them folded so the load doesn't jump. A folded line shows its figures at the time line with their unit (there's no axis), or the range's average (net for HVDC) when nothing is hovered, "avg"/"net" in `.pre`; under 560 px it stays on one line, the series names hidden (`font-size: 0` on `.lg`). Address key `fold` (the folded ones, e.g. `fold=price,ren`, `fold=none` for all open; absent: the default, all), kept in `elenz-view`. "All charts shown" in Downloads leaves folded charts out; the CSV keeps every column.

### Chart notes, units, headers and controls

Chart notes are ⓘ buttons (`src/lib/site/InfoTip.svelte`, fixed-position popover) right after each card's title (team rule, Oct 2026: a card is a title with its ⓘ beside it, written to the rules in `docs/style-guide.md`; `.ttl-row` wraps a title and its ⓘ where the heading isn't a `.ch-head`). On the Generation tab each chart's unit (MW/GWh/TWh, %, $/MWh, g/kWh) is drawn in small type under its top axis label (`axisUnit` in tracker.js; the price overlay's under the right axis's), not beside the title (design decision, 29 Oct 2026, tidier on phones); the full description is in the canvas's aria-label. The grouping menu is sized to the choice it shows (`fitSelect`), and under 560 px the generation chart's header is two rows (title, ⓘ and grouping; then MW/%, chart type, $ Price and the total: `.chart.gen .legends { display: contents }` with `order`); the ⓘ notes on this tab are short bullet points (design decision, 29 Oct 2026). The Prices tab follows suit: the scale is a fitted dropdown (`fitSelect` action, `#lib/site/fitselect.js`, shared with tracker.js), `TimeChart`'s `unit` puts each chart's unit under its top label, the ⓘ notes are bullets, and under 560 px the price chart's header is two rows (title, ⓘ, scale; then Haywards/Benmore on long ranges) with its key (`priceKey`) moved under the chart on both tracker tabs, Now, Records and article figures (`Figure`'s source). Region and month pickers are boxed dropdowns (`select.pick`), the same everywhere; the page-level status is `src/lib/site/StatusPill.svelte` (Live / History / Delayed on Now and both tracker tabs: always last on its line, one fixed width so the buttons beside it don't move, and a button that opens the panel saying where the data comes from; TRK-01, 5 Nov 2026), and both summaries have a labelled "How to" panel: an opening line, then one bullet per thing you can do across the tab, in the ⓘ style (each chart's own ⓘ says what it shows), linking to the full descriptions on /guide (`#generation`, `#prices`; test reports GRP-06, CHT-13), keep the panels and /guide up to date. On /now the status sits at the right even when the heading wraps, so its panel opens on screen (TRK-11). The Reset all charts popup flashes an accent edge as it opens (`rs-flash` in ResetButton.svelte; TRK-12), and the generation chart's unit a ring when it changes (`pop-flash` in tracker.css, `flashUnit`; TRK-01). While the slider is dragged the summary's sub-line keeps its tallest height on both tabs (`holdSub`; TRK-12), and the Prices summary names a moved window by its range, not "Zoomed in" (PRC-01). Drilled into one plant, the list's last column is "Of capacity" (capacity factor over a range, output against capacity at a time; `cfCaps`, GRP-03) where every row has a capacity. The plant note (`#plant-note`) shows a plant's `[plant_metering]` notes under "Plant notes" (also where the site shows a plant differently from the register), and drilled into embedded solar or other embedded generation, what it is and its method page (`EST_NOTE`; TRK-01, 6 Nov 2026). Reset sits on the tabs line of both tabs, beside Download and Share, and asks "Reset all charts?" first (`src/lib/site/ResetButton.svelte`; `resetView` in view.js: forgets `elenz-view`, `elenz-prices`, `elenz-gen-lower` and the tab links, then opens the plain address; CHT-16, TRK-01).

### Shapes, no JavaScript, older Safari and layout stability

Shapes (design decision, 5 Nov 2026, test report TRK-01): buttons, pills, cards, popovers and tags all have a 4 px corner, and the buttons on one line share one height (30 px, 28 on phones); only ⓘ buttons, dots and small icon tiles are round, and swatches smaller than a button keep 2-3 px. No 999px pills.

With JavaScript off, the tracker tabs, Now, Records, a record's page and the landing page show one plain line instead of empty charts or "Loading" (RES-04): mark what should go with the class `js-only`; the one rule is a `<noscript><style>` in `src/app.html`. Never put that style in a page (`{@html}` in `<svelte:head>` included; `tests/noscript.test.js` checks): on a click between pages Svelte builds the page's markup itself and Chrome treats the style as real, which hid the charts on Now and the tracker for everyone on Chrome (fixed 2 Nov 2026, the day it went in; a refresh or a direct visit looked fine).

Older Safari (found on BrowserStack, 2 Nov 2026): Vite 8 rewrites `max-width` rules as `width<=`, which Safari reads only from 16.4, so older iPhones lost every width rule and got the desktop layout; `build.cssTarget` in `vite.config.ts` stops that and `scripts/check-css.js` (in `npm run check:previews`) fails if it returns. Don't hang a sticky element's background on a huge box-shadow held in by clip-path: older iPhones lost the clip while scrolling and the shadow blanked the page, leaving only the bar (`.toolbar::before` is a plain strip to the window's edges). `color-mix()` needs Safari 16.2; older ones skip those declarations, which only loses a few tints. BrowserStack's free trial gives only about a minute a device. iOS 14 isn't supported (design decision, 2 Nov 2026: on an iPhone 12 at iOS 14.7 the data never loaded, and it isn't worth chasing); Safari 15 is the floor.

All offers no Day interval on either tracker tab (design decision, 3 Nov 2026: 10,000+ daily points can't be read at a chart's width and were slow to draw); 1Y keeps it.

Space is held for what data fills in, so a page doesn't move as it loads (the analytics' CLS, 3 Nov 2026; under 0.1 is good): on both tracker tabs `.waiting` on `.layout` (and on the Prices tab's cards) gives each part its height in the default view until the data arrives (`buildSummary` takes it off on Generation; update these heights when a part's height changes much), the grouping menu starts at its default choice's width so the header doesn't wrap, a record page's Share and Download are there from the start, disabled, and the Records pages hold a screenful (`.hold`) and wait briefly (2.5 s at most) for the live check, which can add cards above the list. `tests/e2e/site.spec.js` checks both tracker tabs.

### Page width, masthead and tab titles

Tracker and Now use the full width of big screens (`.wrap.wide`; reading pages keep 1,260 px); the masthead spans the window on every page (`.wrap:not(.wide) > .mast-wrap`, with `--gutter` and `--sbw`, the scrollbar's width set by the root layout), so its logo and links don't move between them (design decision HOME-01, 31 Oct 2026); from 1,340 px a reading page draws a faint funnel under it, narrowing from the window's width to the column's (`::after`, `--inset`). The browser tab's title says what the view shows (`describe`, set through `setTitle` in `#lib/site/view.js`, which sets it again when the page comes back into view or from the back/forward cache: Firefox on Android blanks a tab's title whenever the address changes and fills it in only when the page reports a new one, so `retitle()` nudges the title 0.3 s and 1.5 s after every address change; a page that changes its own address calls it; SITE-06), and the Worker puts the same title into the page title, og:title and og:url of `/tracker` and `/tracker/prices` for a linked view.

### Chart code

The tracker page markup is in `src/routes/tracker/+page.svelte`.

The canvas chart code is `src/lib/tracker/tracker.js` (vanilla JS, driven by element ids in the page; each chart is drawn once per view into an off-screen base, and moving the time line only copies the base back and draws the line, dots and time chip over it (`paint`), so scrubbing stays smooth on phones: call `render()` when anything other than the hover point changes, `hover()` when only the point moves; groupings (design decisions, 30 Oct 2026): By site gives every plant its own layer (no "Other ..."; batteries by site, embedded solar by island), and Flexibility (Fast flexible), Inverter vs synchronous (Inverter-based) and By owner count batteries' discharge in their group with charging as one layer below zero (`chargingLayer`); Detailed, Simplified and Renewable vs fossil keep batteries separate; plant lists (a fuel's or group's plants, By site's rows) go largest first by installed MW (`bySize`: the most a plant has had in capacity.json), so their order and shades don't change with the range (design decision, 26 Oct 2026); a rebuild keeps the viewer's picks in the summary (`picks`/`keepPicks`: each plant's own last state, so "Only this" survives a range change that adds plants or moves a site into or out of "Other ..."); a click on the ‹ › arrows or a range, interval, region or grouping control answers at once (date box, pressed button) and the view is built just after that paint (`soon()`, quick steps add up through `stepEnd`; on the Prices tab `afterPaint`, which every change of range, interval or date goes through), and the lower cards are told a frame later (`share()`), so clicks stay under ~50 ms at phone speed: keep heavy work out of click handlers; `history.merged(kind, live, from, to)` joins only the window a card needs), styles in `src/lib/tracker/tracker.css` (colour tokens, light/dark).

The fuel table (colours, renewable flags, fallback emission factors) is `src/lib/tracker/fuels.js`, shared with the home pages; every emissions calculation goes through `src/lib/tracker/emissions.js` (the Rankines' quarterly factor, each geothermal station's own factor by year; evidence in `analysis/emission_factors.py` and `analysis/README.md`). `src/lib/tracker/series.js` loads the history files and merges them with the live week (24 h/3 d/7 d use the live 5-minute data; 30 days uses half-hourly history; 1 year and All use daily history).

## About, Using Elenz and Data and methods

About and Data and methods share one layout with a contents sidebar (sticky; a "Contents" dropdown naming the page under 860 px, DOC-04, sticky too), the route group `src/routes/(docs)/`; About page: `src/routes/(docs)/about/+page.svelte`, short: why Elenz exists, what each page shows, where the data comes from in brief, support, contact; links to its old `#m-*` sections and `#controls` forward; the guide, `/guide` (`src/routes/(docs)/guide/+page.svelte`, team review DOC-01, 2 Nov 2026): how to use each page, with screenshots in light and dark (`src/lib/methods/Shot.svelte`; `site/static/guide`, made by `analysis/guide_shots.py`, which also writes their sizes, and how wide each is on the site so a small card isn't blown up, to `src/lib/methods/shots.json`; redo them when a layout they show changes). Method pages use the same pictures, only where they talk about that part of the site (DOC-03, 5 Nov 2026). Data and methods: `/methods` overview (with the status labels, conventions and glossary, `#glossary`), `/methods/sources` the source register (its groups list every dataset in `SOURCES` once; `scripts/check-methods.js` fails the build when the count in its lede and the entries listed differ, as `linz-dem` and `linz-basemaps` did until 24 Nov 2026), `/methods/<slug>` one page per figure (generation, embedded-solar, other-embedded, demand, hvdc, prices, price-explainer, emissions, groupings, capacity, history, plants, records); topics, datasets and references in `src/lib/methods/registry.ts`, what each dataset does on each page in `src/lib/methods/roles.ts` (`ROLES`; the page's Data sources section and the register's table read it, and a label starting "Live week" or "Recent weeks", or "Mapping", "Check" or "Fill-in", sets the register's column), so a dataset is described once; reports, papers and announcements are `REFERENCES`, linked from the claim with `ref('<id>')` and listed in the page's References section and on /methods/sources#references; bodies in `src/lib/methods/pages/<slug>.svelte`, styles in `methods.css`. The live, recent and history account is one component, `Handover.svelte`, on the overview and History; other pages use its short form and link to `/methods/history#layers`. Standard structure (design decision, 6 Nov 2026; the rules are in `docs/style-guide.md`): Introduction, Data sources, How it works, How to interpret it, Accuracy and limitations, Historical coverage, References, with anchors `#introduction #data-sources #how-it-works #interpretation #limitations #coverage #references`. The header says what the figure is and nothing about its data, the body opens with `.mt-caveats` (up to three key caveats) and places `DataSources` (the only place a page says which data it uses) and `References` (which also lists the topic's `code`). `reviewed` on a topic, and `REVIEWED` for the overview and register, says every formula, constant, date and claim on the page was compared with the code and data that day; review every page each May and November; `scripts/check-reviewed.js` warns (never fails) when a file in a topic's `code` has changed since its review, cleared by a review or `[method unchanged]` in the commit message, and `ingest/tests/method_constants.py` fails if a figure typed into a page no longer matches the Python that holds it. Formulas, their terms and worked examples go inside `Calculations` (a Show calculations button, a native `<details>`), with the method in words before it. Keep older anchors when rewriting a page: other pages and chart notes link to them (a heading can carry one as `<span id="limits"></span>`).  The emissions and price explainer pages import their factors and rules from `emissions.js` and `explain.js`, so they stay in step; the other pages are prose: when a method changes, update its page and its `reviewed` date.

## Other embedded generation on the site

Other embedded generation on the site (design decisions, 6 Nov 2026): `src/lib/tracker/oemb.js` `withOemb()` folds a layout's `oemb` block into island series (`oemb` the layer, `oembR` its renewable part, `oembE` its emissions in t/h; zero before 2009; the live block's typical days laid over the week by NZ local half-hour), adds it to `underlying` (demand "with embedded generation") and adds the named plants' fill to their fuel and plant series (Teviot becomes a plant in dispatch months), never to grid demand. It runs in `fromLayout`, `now.js`, `generators.js` and the records' live check (idempotent: `oembDone`). In `fuels.js` the layer is the fuel `oemb` ("Other embedded", `--f-oemb`, hatched, `est.`, `mixed`: its renewable share and emissions come from `oembR`/`oembE`, in tracker.js's totals, now.js and generation/data.js); groupings: its own group in Simplified and Renewable vs fossil, Inflexible in Flexibility, Synchronous in Inverter vs synchronous; by island like embedded solar in By site and By owner and when drilled into (`ESTIMATED`, `estIslands`); left out of price captured (`CAP_FUELS`) and capacity factors (no capacity); the Now page's generator list has a row per island (`est`). tod.py folds it in too and re-reads months from 2009 made before it (`stale`).

## Other site parts

- Shared masthead, footer (© line, data credits, link icons: fill in a `href` in its `LINKS` to show a social account; LinkedIn shown since 17 Nov 2026), logo mark and the "Support Elenz" link to Buy Me a Coffee in `src/lib/site/`; site copy speaks as "we", never "I" or "me")
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
  does (Cloudflare Web Analytics and Umami, the browser storage keys, fonts, the email setup): update it and its date if any of
  that changes. Method pages also have their own report line (`reportHref` in the methods registry).
- Analytics (design decision, 16 Nov 2026): two cookieless counters in `src/app.html`. Cloudflare Web Analytics gives
  visits and load speed; Umami (Umami Cloud, free Hobby plan, 100k events a month) adds time on page, referrers and,
  later, a few custom events. Umami's `data-domains="elenz.co.nz"` keeps previews and local builds out of the counts,
  and `data-do-not-track` honours the browser's setting. Neither shows whether a screen is left open (Umami reports time
  on page when a tab is hidden or closed), so Now and the dashboards also send a heartbeat to the Worker (Worker
  section). A few Umami events count how the dashboards are used (`#lib/site/track.js`, which lists them; keep them few,
  since each counts against the plan; Support Elenz and Report a problem clicks are two of them). The browser tests block
  both scripts.
  One view per page (design decision, 24 Nov 2026): Umami's script counts a page view whenever the address changes
  (it wraps `history.pushState` and `replaceState`), and Tracker, Now, the dashboards, Records and Plants keep the
  reader's view in the address, so every click counted as a view (test report, 24 Nov: one visitor's 7 minutes on
  Tracker made 128 views of `/tracker`). `data-before-send="elenzBeforeSend"` hands each view to an inline script in
  `src/app.html` (`#umami-views`), which drops a view whose path matches the last one sent. A new path, or coming back
  to one, still counts, and the first view keeps its full address, so UTM tags still reach Umami's UTM report.
  `data-exclude-search` was not used: it would strip the tags too. Events pass untouched. `tests/umami-views.test.js`.
  What was dropped becomes a `view-change` event (design decision, 25 Nov 2026), so time spent working a page still
  shows in a visitor's timeline: `{ page, changes, keys }`, the number of address changes and the names (never the
  values) of the settings that changed (`#` for the hash); the same settings rewritten in another order (Tracker's fixed
  order, on arriving from a link) count as no change. The first change of a run goes at once, then at most one a
  minute per page with the changes since, as `throttled()` does; a new page or `pagehide` sends what's waiting. So a
  page's `view-change` count is roughly its minutes of active use. `/dashboard` sends none: `layout-change` covers it.
  It is on `/privacy`.
  The dashboard's `layout-change` is throttled to one a minute (`throttled()` in `track.js`), so a run of changes shows
  in Umami as events exactly 60 seconds apart; that is the throttle, not a timer.
  Opting out (design decision, 16 Nov 2026): an inline script at the top of `src/app.html` turns any address with
  `?exclude-me` into `umami.disabled` in the browser's storage, before Umami's script loads; `?include-me` removes it.
  It takes the word out of the address and shows a short note (`#optout-note`). Umami's script and the heartbeat
  (`counting()` in `heartbeat.js`) both skip a browser with it, so it also keeps the Elenz team's own devices out of the
  counts. Cloudflare Web Analytics can't be told. Described on `/privacy#opt-out`; browser test in `tests/e2e/site.spec.js`.
- Icons (design decision, 9 Nov 2026): the logo mark `src/lib/assets/favicon.svg` is the tab icon where SVG icons
  work; `static/favicon.ico` (16, 32, 48 px) is the fallback for older Safari and for tools that ask for `/favicon.ico`
  directly (link unfurlers, feed readers, raw `/data/*` views), and `static/apple-touch-icon.png` (180 px, on white
  because iOS fills transparency with black) is the iOS home-screen and Favourites icon. All three are linked in
  `src/routes/+layout.svelte`. After changing the SVG, remake the other two with `analysis/site_icons.py`;
  `tests/icons.test.js` checks the files and the links. No web manifest yet.
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
  og:url, og:image, the large-image card). Articles use their cover PNG, and the two dashboards their own (Dashboards); every other page the site's card,
  `static/og/elenz.png` (2400 x 1260; each page asks for it as `?p=<page>`, since LinkedIn served some pages a thumbnail of one shared address): `src/lib/site/SiteCard.svelte` (the mark and name over a week of generation, cover style)
  drawn at `/og/card` (noindex, disallowed in robots.txt) and saved by `analysis/site_card_png.py` (redo it now and
  then; it isn't dated). `npm run check:previews` (`scripts/check-previews.js`, after the build, in checks.yml) fails
  if a public page (not noindex) lacks any tag or its image. A new page needs a `<Preview>`.
- Press kit (design decision, 17 Nov 2026, for the public push): `static/press/elenz-press-kit.zip`, served at
  `/press/elenz-press-kit.zip` with no page of its own (journalist emails link it): `README.txt` (descriptions, credit
  line, key facts), the mark as SVG and 1024 px PNG for light and dark backgrounds, the site card and eight screenshots
  from the guide's pictures. Built by `analysis/press_kit/build.sh` from `analysis/press_kit/README.txt`; rerun it when
  the guide's screenshots, the card or the README change (the README's figures are typed in by hand).
- Descriptions and caching (site audit, 11 Nov 2026): each public page's `<meta name="description">` is 110 to 160
  characters, the length search results show whole, and its og:description is the same text (`check-previews.js` fails
  otherwise). A method page's is its summary plus a closing sentence where the summary is short (`describe` in
  `src/lib/methods/registry.ts`); an article's is its dek, or `description` in its meta where the dek is too short or
  long. The visible summary and dek don't change for this. Built scripts and styles (`/_app/immutable/*`, named by a
  hash of their contents) are sent `Cache-Control: public, max-age=31536000, immutable` (`site/static/_headers`), so
  a returning visitor doesn't ask for them again; pages and every other file keep Cloudflare's default
  (`max-age=0, must-revalidate`), so a new build shows at once.

## Ingest

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
- `plant_history.py`: `hist/plants.json`, each plant's MWh by month for the plant pages (plant-major: a first-month
  index and one value a month per plant, a battery's charging beside its discharge; one letter a month for metered or
  dispatch). The history job redoes the months it rebuilt and reads back up to `READS` (200) missing ones a run from
  `hist/hh`, like tod.py; one KV write when it changed; served by the Worker as `/data/history/plants.json`.
- `ingest/plant_pages.py` writes `site/src/lib/plants/pages/<slug>.json` (Plant pages, above) from the plant files; rerun
  it and commit after editing a plant file, its sources or images, `plant_capacity.csv` or `plants.json`.
- `ingest/plant_meta.py` writes `site/src/lib/tracker/plants.json` (plant → owner, hydro scheme, `aka`, `metered`) from the register and
  those tables. Rerun it and commit the JSON after refreshing the register or editing the tables.

## Workflows and checks

- `.github/workflows/update-data.yml`: runs `update.py` on GitHub (free because the repo is public). Triggered every
  5 minutes by the Worker's Cloudflare cron through the workflow_dispatch API, because GitHub's own schedule never
  fired for this new repo (it stays as a 30-minute backup). Secrets (environment `production`): `EMI_KEY`, `CF_ACCOUNT_ID`, `CF_API_TOKEN`
  (Workers KV Storage: Edit). KV namespace id lives in `wrangler.jsonc`. A run with no new data saves nothing.
- `.github/workflows/history.yml`: runs `history.py`, triggered every 6 hours by the Worker's second cron. The first
  run backfills ~2,200 daily files (resumes next run if it hits its time budget). KV writes: ~3 per changed month,
  so a full rebuild of every month needs ~750 writes and takes one run (BUILD 8: 352 months in 13 minutes; BUILD 10,
  which downloaded every month's reconciliation file into the states once, 55 minutes and 925 writes);
  it starts with the next history run (or by hand, Actions → History); never start one while another is running. The Worker starts the Offers workflow (`offers.yml`) with it.
- `.github/workflows/checks.yml`: on every pull request and every push to `main` (once per change, design decision, 19 Nov 2026: a branch's push no longer runs it beside its pull request; a newer push cancels a pull request's run still going), ruff (syntax errors and undefined names only), `ingest/tests/smoke.py`
  (the live and history paths on a committed one-hour sample of real dispatch data and matching final prices, no network), `ingest/tests/method_constants.py`, `ingest/capacity.py --check`, `ingest/plant_files.py --check` (the plant files: `facilities/PLANTS.md`)
  and the site's `npm run check`, `npm test` (`site/tests/`: the tracker's address), `npm run build`, `npm run check:previews` (which also runs `scripts/check-css.js`, `scripts/check-methods.js` and `scripts/check-reviewed.js`), the Worker tests and `npm run test:browsers`. Its `ingest` and `site` jobs are required checks: a pull request can't
  merge into `main` (so nothing deploys) until both pass.
  Browser tests (design decision, 2 Nov 2026; `site/playwright.config.js`, `site/tests/e2e/site.spec.js`): Playwright opens the built site in Chromium, Firefox and WebKit (Safari's engine) and at two phone sizes, through the site's own links as well as direct visits and refreshes, and with JavaScript off. They use the snapshot bundled at `static/data/tracker.json` (no history files), not the live site, so a fix can still merge while the live site is down; check only what the snapshot can show. WebKit here is new, so old Safari is covered by `check-css.js` alone. A new page or card with its own fault worth guarding gets a test; put the bug back once to see the test fail. An uncaught page error fails a test, except those in `tests/e2e/errors.js`: WebKit reports a load cut off by the next navigation (a data file, or a route's CSS or script SvelteKit was preloading) as a page error, so those pass on WebKit only (test report, 19 Nov 2026). A test that changes a control straight after `goto` must allow for a page still hydrating: a choice made before is lost (the research page's Needs filter on phone Safari, 19 Nov 2026), so retry it with `expect(...).toPass()` until the address or view shows it. To run them in a Claude session: `npx playwright test --project=chromium --project=phone-chrome` after a build (only Chromium is installed there; `@playwright/test` is pinned to that browser's version, so bump them together).
  Worker tests (`worker/tests/worker.test.js`; `cd worker && npm ci && npm test`): the Worker in Cloudflare's own runtime (Miniflare, with a local KV store and a small stand-in for the static site): ETags, history names, `/data/health`, link previews, noindex, security headers, KV refusing reads and the crons. `worker/package.json` holds only these test tools, so the site's install stays small. Its `overrides` pin undici and sharp (pulled in by Miniflare) to patched versions until a Miniflare release carries them (9 Nov 2026); drop them then. `_headers` itself isn't read there: check static files' headers on a preview. A change to what the Worker does gets a test.
- `.github/dependabot.yml`: monthly version updates for GitHub Actions and the site's and Worker's npm packages, one
  grouped pull request each (minor and patch only; `@playwright/test` left out, as it is pinned to the browser a Claude
  session has). Python isn't included: `ingest/requirements.txt` is refreshed by hand. Security updates arrive
  separately whenever an alert appears; like any pull request they merge only once the checks pass.
  Each version update waits 7 days after a release (`cooldown`), so a hijacked release is usually pulled before it
  reaches a pull request; security updates don't wait. The `ignore` rules apply to security updates too, so an alert
  whose fix is only in a new major version (or in `@playwright/test`) gets no pull request: do those by hand.
- CI and outside code (design decisions, 25 Nov 2026):
  - The secrets `EMI_KEY`, `CF_ACCOUNT_ID` and `CF_API_TOKEN` live in the GitHub environment `production`, whose
    deployment branches are limited to `main`. Only the three data jobs (update-data, history, offers) name it, with
    `deployment: false` so no deployment record is made each run. A workflow on any other branch can't read them, so a
    change has to pass the checks and merge before it can use them. A new job that needs them names the environment.
  - Every checkout sets `persist-credentials: false`: no job pushes, so none keeps the workflow token on disk where the
    code it runs could read it.
  - The checks install only pinned versions (ruff too); `ingest/requirements.txt` is locked to hashes, so the shared
    pip cache can't hand the data jobs anything else.
  - `site/.npmrc` sets `ignore-scripts=true`: packages' install scripts don't run in CI or in Cloudflare's build (where
    the deploy credentials are). None of the site's packages needs one. The Worker's test tools (esbuild, workerd)
    do, and they run only in the checks, which hold no secrets.
  - Actions are pinned by major tag, not commit SHA: every action used is GitHub's own (`actions/*`), and Dependabot
    keeps them current. An action from anyone else would be pinned by SHA.
  - Pull requests from forks run the checks with no secrets and a read-only token (`pull_request`, never
    `pull_request_target`), and Cloudflare doesn't build forks, so they get no preview.
  - `worker/vendor/resvg` is outside every audit tool's view (no `package.json`): it was checked byte for byte against
    the npm package's 2.6.2 on 25 Nov 2026; check a newer version the same way before copying it in.
- `.github/workflows/watchdog.yml`: checks the live site every 15 minutes; opens an issue labelled `stale-data`
  (GitHub emails it to the Elenz team) when live data is over 60 minutes old, history over 5 days behind, the Worker
  can't start a job, or embedded solar's irradiance is failing (the reserve forecast not refreshed for 6 hours, the
  satellite 6 hours behind, or daylight with no irradiance at all: `docs/data-notes.md`), and closes it when the data recovers.
  Its `records` job is the record alert (design decision, 17 Nov 2026, for the public push: the team hears of a record
  first). It reads records.json and tracker.json from the live site and lists every provisional record the site shows
  (`provisionalNow` in `site/src/lib/records/alert.js`: the live week through `liveBeats`, as /now and the record pages
  check it, and the history's `prov` for half-hours, periods and runs). Any not told before go into one issue labelled
  `record` (GitHub emails it), with each record's line, its page, a UTM-tagged link for a post and its key as
  `<!-- record: id|region|period|NZ date -->`; keys already in any `record` issue, open or closed, aren't told again,
  so a figure that keeps climbing through the afternoon, or the history's version of a live-week record days later, is
  one email. Its first run, with no `record` issues yet, lists what was already provisional in one issue rather than
  announcing it. Close each issue once dealt with. Tests: `site/tests/alert.test.js`.

## Worker

- `worker/index.js`: serves static assets, `/data/tracker.json` from KV (binding `DATA`), falling back to the
  bundled snapshot, and `/data/history/{index,day,hh/YYYY-MM}.json` from KV keys `hist/*`; rewrites the title,
  og:title and og:url of the tracker's two pages for a linked view (from its address), which `run_worker_first` in
  `wrangler.jsonc` routes through it (`withPreview`, HTMLRewriter). When KV refuses a read (a daily limit or an outage;
  `kv()`), tracker.json falls back to the bundled snapshot, history answers 503 and `/data/health` says so, rather than
  the visitor getting Cloudflare's error page. Security headers: `site/static/_headers` for static files and
  `SECURITY_HEADERS` for the Worker's own responses, the same list (the Worker tests compare them; `frame-ancestors` is
  the only CSP rule, `'self'` everywhere but `/dashboard` and `/landscape`, which other pages may frame (a Home Assistant Webpage card, a wall-screen app; design decision, 17 Nov 2026: `_headers` takes the site-wide rule off them and puts on `frame-ancestors *`), so scripts and styles aren't restricted; Permissions-Policy must leave `screen-wake-lock` and
  `web-share` alone for Keep screen on and Share). Its `scheduled` handler
  dispatches the GitHub jobs (live every 5 minutes, history every 6 hours, watchdog every 15 minutes) (Worker secret `GITHUB_TOKEN`: fine-grained,
  elenz only, Actions read/write; it expires, so renew it yearly). A start GitHub refuses with a server error (or can't be reached) is tried once more 3 s later (`RETRY_MS`), and `/data/health` and the watchdog report failed starts only once they have gone on for 15 minutes (`since` in `cron-status`, `triggerMinutes`, `TRIGGER_MINUTES`): GitHub dropped a single call with HTTP 500 about once a day in early Nov 2026, the next one 5 minutes later working, and each set off a 5-minute alert. Workers Paid since 3 Nov 2026 (US$5 a month: 10 million requests, 10 million KV reads and 1 million KV writes a month included; static files free). Back on the free plan (100,000 requests and KV reads a day, 1,000 KV writes a day; the live job uses ~600), `WRITE_BUDGET` must return to 280 in `history.py` and 100 in `offered.py`.

- Heartbeats (design decision, 16 Nov 2026): while `/now`, `/dashboard` or `/landscape` is open, it posts a beat to
  `/data/beat` when it opens and every 5 minutes after, on screen or hidden (`src/lib/site/heartbeat.js`; the message,
  read by both sides, in `src/lib/site/beat.js`: page, a random ID per page load never stored, minutes open, on screen
  or hidden, wall-screen link or not). It is sent only on elenz.co.nz, not under Do Not Track and not from a browser that has opted out (`umami.disabled`), as Umami. The Worker
  checks it and writes one row to Workers Analytics Engine (binding `BEATS`, dataset `elenz_beats` in wrangler.jsonc,
  made by the first write; included in Workers Paid, 10 million rows a month, a screen open all month ~8,600): index1 the
  ID, blob1 the page, blob2 `visible` or `hidden`, blob3 `kiosk` or `page`, blob4 the country, double1 minutes open. It
  writes nothing on other hosts (previews) and answers 204 whatever is posted (405 to anything but POST). The body is
  read no further than 200 bytes, even when sent without a length (`readUpTo`, `worker/body.js`; `tests/body.test.js`). Described on
  `/privacy#screens`. Worker tests: the heartbeat block; site: `tests/heartbeat.test.js`.
  **Reading them:** Cloudflare's dashboard has no view of an Analytics Engine dataset (it is read through the SQL API),
  so the Worker draws a private page, `/data/screens?key=<SCREENS_KEY>` (`worker/screens.js`, design decision 16 Nov
  2026): for the last 24 hours, 7, 30 or 90 days, a card per page (screens, one opening of a page; how many came from
  a wall-screen link; median and longest time open; countries), then two stacked bar charts side by side, drawn as SVG on
  the server: the average screens open in each NZ hour of the day, and screens open over time (by hour up to 7 days,
  by day beyond). Each bar has a hover note; a short glossary and the tables (by time of day; hour by hour, open, on
  screen and from a wall-screen link) fold away below. Colours are the first three slots of the data-viz reference
  palette, light and dark (redesign 17 Nov 2026). Pages are named by address (/now, /dashboard, /landscape), since
  "Now" read as "at the moment". At the top, Open now: a second query (`liveSql`, asked alongside the range's) counts
  the screens with a beat in the last 11 minutes (one late beat allowed), with how many are on screen by their latest
  beat and how many came from a wall link. An estimate: a screen just closed counts for a few minutes more, and one on
  a sleeping device stops counting. If that query fails, the card says so and the rest of the page still shows. It needs three Worker settings, added in the
  Cloudflare dashboard (Workers & Pages → elenz → Settings → Variables and Secrets; `keep_vars` keeps them through
  deploys): `SCREENS_KEY` (secret, a long random string of letters and digits; without it, or with the wrong one, the
  address answers 404), `CF_ANALYTICS_TOKEN` (secret: a Cloudflare API token with Account → Account Analytics → Read
  and nothing else, made under My Profile → API Tokens → Create Token → Custom token) and `CF_ACCOUNT_ID` (text: the
  long ID after `dash.cloudflare.com/` in the address bar). The page is `no-store` and `noindex`; a missing setting, a
  refused token or no beats yet each get a sentence saying so. `analysis/open_screens.py` runs the same query from a
  computer (`CF_ACCOUNT_ID=... CF_ANALYTICS_TOKEN=... python3 analysis/open_screens.py 7`). Rows are kept three months.
  Worker tests: the `/data/screens` block, with a stand-in for the SQL API.
- The plant research page, `/plants/research`: only with `?key=<SCREENS_KEY>`, except on a branch preview's own address
  (`<branch>-elenz.elenz.workers.dev`, `isPreview`), where it opens without one (`research` in `worker/index.js`; Plant
  pages, the research page). Any other host the Worker is reached by, the site's name written another way included,
  needs the key (design decision, 25 Nov 2026: open only where we know it's a preview, rather than anywhere that isn't
  exactly `elenz.co.nz`).
- The team's plant notes, `/data/plant-notes` (`worker/notes.js`; design decision, 19 Nov 2026): what the research
  page's Team notes boxes save. One KV key per plant, `plant-notes/<slug>` (`{ text, at }`), in the site's own namespace,
  never in the repository. Every request needs `SCREENS_KEY` in the `x-elenz-key` header, on every host, else 404; a
  preview with no key set answers 503 "no key is set" so its page can say so. `GET /data/plant-notes` lists the prefix and
  reads each note; `PUT /data/plant-notes/<slug>` with `{ text, base }` saves one (empty text deletes it; at most 20,000
  characters) unless the stored note's `at` isn't `base` (another device saved since), which answers 409 with the stored
  note and writes nothing; `base: "any"` writes over it. KV is eventually consistent, so another device may take up to
  a minute to see a save. Worker tests: the `/data/plant-notes` block.

## Facilities

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
- Plant pages (design decision, 18 Nov 2026): `facilities/plants/<slug>.toml`,
  one file per page with the researched facts, each with a source ID, a grade (A, B, C) and the date a person checked
  it; `facilities/plant_sources.csv`, `plant_images.csv`, `plant_photo_leads.csv` and `station_leads.csv` beside them.
  The folder stays `facilities/` (it already holds the plant tables, and the word covers substations or load centres
  later). The site will be built only from these files, and a fact is published only once checked, grade A or B, with
  public sources. OpenStreetMap's values stay out (ODbL): only its feature IDs, as pointers. First drafts came from the
  research register workbook (`analysis/plants_import.py`, run once); the files are the record from then on.
  `ingest/plant_files.py` reads them (`load()`), prints progress, and with `--check` (in checks.yml) fails if a tracker
  plant has no file or a file breaks the rules in `facilities/PLANTS.md`, which also says how to check a plant. Not in
  the rebuild fingerprint. `ingest/plant_pages.py` turns them into the pages' data (Plant pages, above).
- `facilities/NEXT_REBUILD.md`: changes waiting for the next full history rebuild (they touch fingerprinted files).
  Bundle them into one rebuild; never start one while another is running. While a build is being collected, its items
  go on the branch `next-rebuild` (a draft PR), not on `main`.
- `data/`: raw downloads, git-ignored.
