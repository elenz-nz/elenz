# Waiting for the next full history rebuild

These changes touch files in the history's rebuild fingerprint (`mapping_hash()` in `ingest/history.py`:
`metered_plants.csv`, `overrides.toml` except its site-only tables, the register, the BUILD number), so pushing any of
them starts a rebuild of every month (~4 days at the KV write budget). Bundle them and push them together, and never
while a rebuild is still running (check `/data/history/progress.json`: `rebuild_left` empty).

All four are ready on the branch `next-rebuild` (17 Oct 2026). To run them: once the current rebuild has finished,
merge the branch into `main` (on GitHub: open a pull request from `next-rebuild` and merge it), which starts the
rebuild by itself. When it has finished, delete this file's done items, the old-name entries at the end of
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

## 6. Each day's peak dispatchable output (added 17 Oct 2026)

The Generation tab's headroom chart draws a line for the lowest headroom in each day, week or month. For the 1-year and
All ranges that needs each day's highest half-hour of dispatchable output (hydro, gas, coal/gas, diesel, battery
discharge), which `daily()` in `ingest/history.py` now writes as `peak.disp` (on the branch). It isn't in the fingerprint,
so it rides on this rebuild. After it:
- Check `/data/history/day.json` has `peak.NZ.disp`, and the 1Y headroom chart shows "Lowest in each day".
- On `/methods/capacity#headroom`, replace the sentence about the next rebuild with: daily history keeps each day's
  highest half-hour of dispatchable output, so the lowest line reaches back to 1997.

## Not fixable from EMI data

- Highbank before Oct 2001: no meter in `Generation_MD` or `Embedded_generation`, and reconciliation starts in 2005.
  Its capacity counts from its first metered month (`plant_capacity.csv`), and the history page lists the gap.
