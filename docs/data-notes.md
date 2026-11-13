# Elenz data notes (reference)

What we've learned about the EA's data and the services the site uses: feed timings, file layouts, gaps and quirks. Read it before changing the ingest. The evidence behind each estimate and constant is in `analysis/README.md`.

## Facts learned from the data

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
- Open-Meteo outages (test report, 13 Nov 2026): the satellite feed fell about five hours behind from 18:35 UTC on
  12 Nov and the forecast service answered 503 or timed out, so live embedded solar read zero around midday. The live
  job now keeps the stored forecast when a forecast fetch fails, tries a failed fetch again after
  `IRRADIANCE_RETRY` (10 minutes) and asks for two forecast days (one ends at midnight UTC, about 1 pm NZDT). With
  neither feed for more than two hours and no stored forecast, embedded solar still shows as zero; the week's values
  are worked out again from the satellite once it returns. Since then (design decision, 13 Nov 2026) the live job
  also fetches the forecast every three hours while the satellite is up to date (`FORECAST_MAX_AGE`) and keeps it
  in `irradiance.json`, so the fallback is already in the store when it is needed: it reaches to the end of the next
  UTC day, 24 to 48 hours past its fetch. The live file's meta carries `sat_end`, `fc_at` (when the forecast was
  fetched), `fc_end` (how far it reaches) and `roof_gap` (daylight with no irradiance at all), and the watchdog
  raises its `stale-data` issue when the forecast hasn't refreshed for 6 hours, the satellite is 6 hours behind, or
  `roof_gap` is set. `/data/health` doesn't count these: the site is up and only one estimate is affected.
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
- A month's first `ReconciledInjectionAndOfftake` file can arrive with offtake rows only: October 2026's
  (`..._202610_20261107_155428`, 27 MB against the usual 30–33 MB, first seen 10 Nov 2026) held 5.2 million offtake
  rows and no injection. `embedded.fetch` and `metered.fetch_recon` treat such a file as not published yet (test
  report, 12 Nov 2026: the history job failed on it for seven runs): the month keeps its estimate and the file is read
  again each run until a version with injection arrives.

## History builds

History since Aug 1997 on the tracker page: 30 days, 1 year, All (BUILD 6, finished Oct 2026; was Sep 2020).
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

## Open questions

Which plant is behind KAW0112 ONU0 (shown as geothermal from the public meters; a public document would let the site name them; analysis/README.md); farm mounting is settled for most farms by the clear days of 18-19 Oct 2026 (analysis/README.md); Lauriston,
Pukenui and Omeheu stay uncertain; Kōwhai Park is single-axis tracking (east to west, from photos; team note, 22 Oct 2026),
not fitted (it tripped and has been off since 20 Oct). Battery discharge is left out of the renewable share and
emissions intensity (as em6, design decision 22 Oct 2026): tracker.js `genR`, now.js, generation/data.js `shares`,
records.py (VERSION 3) and records.js. Small solar farms: the site's name for the ground-mounted embedded type
(`ground` in rooftop.py, with `GROUND_KW_AT` for NSPs the rule misses: Ashburton at 500 kW).
