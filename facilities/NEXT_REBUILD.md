# Waiting for the next full history rebuild

These changes touch files in the history's rebuild fingerprint (`mapping_hash()` in `ingest/history.py`:
`metered_plants.csv`, `overrides.toml` except its site-only tables, the register, the BUILD number), so pushing any of
them starts a rebuild of every month (~4 days at the KV write budget). Bundle them and push them together, and never
while a rebuild is still running (check `/data/history/progress.json`: `rebuild_left` empty).

Items 1-6 were prepared on the branch `next-rebuild` (17-21 Oct 2026; `BUILD` 7).
Merged into `main` on 23 Oct 2026 (testing round 2, batch G, with item 7), which started the rebuild (BUILD 7); by
24 Oct it had reached Dec 2021 (58 months left) and should finish on 25 Oct NZ time at the KV write budget. When it has finished, check items 1-7 as each describes, run the Offers
workflow with "resummarise" ticked (item 6), then delete this file's done items, the old-name entries at the end of
`[plant_owners]` in `overrides.toml`, and `GAS_ALIAS` in `site/src/lib/tracker/emissions.js`.

## 1. Mill Creek, May 2014 to Aug 2015 (added 17 Oct 2026)

Mill Creek (Meridian, 60 MW wind at Wilton, WIL0331) is missing from the history for its first 17 months: it isn't in
`Generation_MD` (which has it from Jan 2020) or `Embedded_generation` (from Sep 2015). The EA's reconciliation data has
it: `Volumes/Reconciliation/YYYY/ReconciledInjectionAndOfftake_YYYYMM_*.csv.gz` (from 2005, ~20 MB a month) shows
Meridian's injection at WIL0331 on network CKHK: commissioning output from May 2014 (peaks 4.5, 9, 30, 40 MW in
May-Aug), full output from Sep 2014; in Sep 2015 it matches the embedded meter to 0.1% (23.36 vs 23.35 GWh). Done on
the branch:
- `metered.py`: a third kind of `metered_plants.csv` row, code `R:<trader>`, read from the month's latest
  reconciliation file into `Q|POC TRADER` columns, only for months such a row is active; `complete()` refetches a
  month that should have them and doesn't (marker `mq`). Tested on Aug 2014 (10.11 GWh) and Sep 2015 (no double count).
- `metered_plants.csv`: `WIL0331,R:MERI,Mill Creek,wind,NI,2014-05,2015-08`.
- `plant_capacity.csv`: Mill Creek from May 2014, 10 then 40 MW while commissioning, 60 MW from Sep 2014.
- After the rebuild: check May 2014 - Aug 2015 on the 1-year view, and that demand at Wilton didn't step.

## 2. Kawerau TG1/TG2 (added 17 Oct 2026)

`metered_plants.csv` labels KAW0111 `kawerau_geo` (1999-2008, ~6 MW) as "Kawerau (TOPP1)". TOPP1 is a 26 MW plant
from 2012; this one fits Kawerau TG1 and TG2 (6 MW, 1989 and 1993). Rename the plant to "Kawerau TG1/TG2" in both
`metered_plants.csv` rows and in `plant_capacity.csv` (owner decision, 17 Oct 2026).

## 3. West Wind as one plant (added 17 Oct 2026)

West Wind (142.6 MW) is two plants, "West Wind 1" and "West Wind 2", one per connection (WWD1102, WWD1103), and each
connection sometimes carries most of the farm, so per-plant figures (capacity factor, plant pages) mean little.
Show it as one plant with two connections (owner decision, 17 Oct 2026): rename both `metered_plants.csv` rows to
"West Wind", add `"West Wind 1" = "West Wind"` and `"West Wind 2" = "West Wind"` to `[plant_names]` in
`overrides.toml`, and replace the two `plant_capacity.csv` rows with one of 142.6 MW. Check `plants.json` (owner) and
the By site view.

## 4. Ōtāhuhu names (added 17 Oct 2026)

The register calls them "Ōtāhuhu A" and "Ōtāhuhu B"; `metered_plants.csv` has "Otahuhu A" and "Otahuhu B". Use the
register's names in `metered_plants.csv` and `plant_capacity.csv`, so plant pages find one plant.

## 5. Clock-change days in the older metered files (added 17 Oct 2026)

`metered.read_emi` maps trading period k to (k-1) half-hours after local midnight, counting straight through a clock
change (46 periods on the day the clocks go forward, 50 when they go back). Generation_MD did that only from 2009: every
change day from Oct 1997 to Sep 2008 is numbered by the clock, and those files also leave out an hour (checked for every
change day 1997-2026; Embedded_generation, Grid_export, Grid_import and Tiwai count straight throughout):
- clocks forward: TP1-4, TP5-6 empty, TP7-46 = 03:00-23:00, nothing for 23:00-24:00;
- clocks back: 48 periods, the repeated 02:00-03:00 only once (TP5-6, which fit its second occurrence).
Matching each day against Grid_export confirms the two-period shift after the change (1997, 1998, 2005, 2008). So on
those days two half-hours had no generation (demand there went negative) and the rest of the day was an hour out.
Done on the branch:
- `metered.straighten()` (called by `read_emi`) renumbers such a day straight and fills the missing hour from its
  neighbour (forward: the day's last hour repeats TP46; back: the first 02:00-03:00 repeats TP5-6). Only days that are
  clock-numbered are touched (TP5-6 empty going forward, nothing past TP48 going back).
- `complete()` is false for the 23 months with such a day (`clock_month()`) until they're read again (marker `mc`), so
  the rebuild refetches their metered data (~23 extra KV writes). `BUILD` 7.
- `records.py` no longer leaves clock-change days out (`VERSION` 2); the records and history method pages say how the
  hour is filled. Smoke tests for both directions.
- Checked on real months (Oct 1997, Mar 2005, Sep 2007, Apr 2008): every change day has 46 or 50 half-hours and demand
  stays in its normal range.
- After the rebuild: on the 30-day view, look at a change day (e.g. 20 Mar 2005, 30 Sep 2007): no gap at night and the
  evening peak at the usual time.

## 6. Each day's peak dispatchable output (added 17 Oct 2026)

The Generation tab's headroom chart draws a line for the lowest headroom in each day, week or month. For the 1-year and
All ranges that needs each day's highest half-hour of dispatchable output (hydro, gas, coal/gas, diesel, battery
discharge), which `daily()` in `ingest/history.py` now writes as `peak.disp`, and the same without hydro as
`peak.dispx` (on the branch). It isn't in the fingerprint,
so it rides on this rebuild. After it:
- Check `/data/history/day.json` has `peak.NZ.disp` and `peak.NZ.dispx`, and the 1Y headroom chart's installed level is each day's
  lowest (the "Daily averages where history doesn't yet keep each day's lowest" note goes).
- Run the Offers workflow by hand with "resummarise" ticked, so each month's lowest offered headroom uses the rebuilt output.
- On `/methods/capacity#headroom`, replace the sentences about the next rebuild with: daily history keeps each day's
  highest half-hour of dispatchable output, so installed headroom's lowest reaches back to 1997.

## 7. Small solar farms at Ashburton (added 23 Oct 2026)

`rooftop.py` `GROUND_KW_AT`: Ashburton (ASB0661) counts growth in systems over 10 kW as small solar farms (ground
type) at 500 kW average new size rather than 1 MW, adding ~11 MW there (owner decision, 22 Oct 2026). Piako and
Huirangi stay as the rule has them. Every month's embedded solar changes, so it rides on this rebuild.

## Not fixable from EMI data

- Highbank before Oct 2001: no meter in `Generation_MD` or `Embedded_generation`, and reconciliation starts in 2005.
  Its capacity counts from its first metered month (`plant_capacity.csv`), and the history page lists the gap.
