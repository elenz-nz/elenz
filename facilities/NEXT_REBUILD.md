# Waiting for the next full history rebuild

These changes touch files in the history's rebuild fingerprint (`mapping_hash()` in `ingest/history.py`:
`metered_plants.csv`, `overrides.toml` except its site-only tables, the register, the BUILD number), so pushing any of
them starts a rebuild of every month (~4 days at the KV write budget). Bundle them and push them together, and never
while a rebuild is still running (check `/data/history/progress.json`: `rebuild_left` empty).

They are prepared on the branch `next-rebuild`; merge it when the current rebuild has finished, then tick them off here.

## 1. Mill Creek, Apr 2014 to Aug 2015 (added 17 Oct 2026)

Mill Creek (Meridian, 60 MW wind at Wilton, WIL0331) is missing from the history for its first 17 months: it isn't in
`Generation_MD` (which has it from Jan 2020) or `Embedded_generation` (from Sep 2015). The EA's reconciliation data has
it: `Volumes/Reconciliation/YYYY/ReconciledInjectionAndOfftake_YYYYMM_*.csv.gz` (from 2005, ~20 MB a month) shows
Meridian's injection at WIL0331 on network CKHK (Aug 2014: 10.1 GWh, peak 40 MW half-hour). Plan, on the branch:
- `metered.py`: a third kind of `metered_plants.csv` row, code `R:<participant>`, read from the reconciliation file
  (injection at that POC by that participant, latest revision of the month) into `Q|POC PARTICIPANT` columns, only
  for months a row is active; `complete()` refetches a month that should have them and doesn't.
- `metered_plants.csv`: `WIL0331,R:MERI,Mill Creek,wind,NI,2014-03,2015-08,...`
- Then `plant_capacity.csv`: Mill Creek's start back to its first output, and its note.
- Check: the months' totals against Meridian's reported Mill Creek output, and no double count in Sep 2015.

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
change (46 periods on the day the clocks go forward, 50 when they go back). The current Generation_MD files do that,
but the older ones number those days by the clock with 48 periods: `200503_Generation_MD.csv` has nothing in TP49-50 on
20 Mar 2005 (Grid_export has all 50), and 5 Oct 1997 has generation missing at 3:00-3:30 am. `202604` and `201504` are
fine. So on each clock-change day in those years two half-hours have no generation (demand there goes negative) and the
rest of the day after the change is an hour out. Found by the records (17 Oct 2026); `records.py` leaves those days out.
Plan, on the branch:
- Find the last year with 48-period clock-change days (check one Generation_MD file a year, and Embedded_generation).
- `read_emi`: for a file whose clock-change day has 48 periods, map period k by the clock (period 5-6 don't exist going
  forward; going back, the repeated hour is one pair of periods, so split or drop it and note which).
- The stored states hold the parsed times, so the affected months must refetch their metered data (drop their metered
  columns, or make `complete()` false for them), then rebuild. Check: generation on those days' nights, and demand never
  negative.

## Not fixable from EMI data

- Highbank before Oct 2001: no meter in `Generation_MD` or `Embedded_generation`, and reconciliation starts in 2005.
  Its capacity counts from its first metered month (`plant_capacity.csv`), and the history page lists the gap.
