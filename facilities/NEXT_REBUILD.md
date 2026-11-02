# Waiting for the next full history rebuild

These changes touch files in the history's rebuild fingerprint (`mapping_hash()` in `ingest/history.py`:
`metered_plants.csv`, `overrides.toml` except its site-only tables, the register, the BUILD number), so pushing any of
them starts a rebuild of every month (under an hour, in the next history run). Bundle them and push them together, and never
while a rebuild is still running (check `/data/history/progress.json`: `rebuild_left` empty).

The last rebuild (BUILD 7, 23-27 Oct 2026: Mill Creek 2014-15, Kawerau TG1/TG2, West Wind as one plant, Ōtāhuhu
names, clock-change days before 2009, daily peak dispatchable output, small solar farms at Ashburton) finished on
27 Oct 2026 and its items were checked and removed.

## BUILD 8: collecting, held until the Elenz team says go (opened 28 Oct 2026)

This is the branch `next-rebuild` (draft pull request "BUILD 8 (held)"). `BUILD` is already 8 here, so merging it
starts a full rebuild of every month (under an hour, in the next history run). Add each fingerprinted change to this branch with a numbered section
below saying what changed and what to check once the rebuild has run.

To start it (only when the Elenz team says go): bring the branch up to date with `main`, check
`/data/history/progress.json` has `rebuild_left` empty, let the checks pass and merge. Afterwards check each item, run the Offers workflow with "resummarise" if an item changes generation, and clear
the done items from this file.

### 1. Tekapo A and B (design decision, 30 Oct 2026)

The site spells the stations Tekapo A and Tekapo B, like their scheme ("Tekapo" in `[hydro_schemes]`), not the
register's "Takapō A/B". Changed: `[plant_names]` in `overrides.toml` (the dispatch data's names), the two rows in
`metered_plants.csv` (the metered history's names), `[hydro_schemes]`, the rows in `plant_capacity.csv` and
`capacity.json`, `plants.json`, the groupings method page, and `PLANT_ALIASES` (old `plant=takapo-a`/`takapo-b`
links forward). Until the rebuild has remade every month, the history still says "Takapō A/B", and those two plants
show no capacity factor on 30 days, 1 year and All.

Check afterwards: By hydro scheme > Tekapo lists Tekapo A and Tekapo B on 24 hours, 30 days and All; no "Takapō"
anywhere in the tracker (search the plant list for "takapo"); `/tracker?fuel=hydro&plant=takapo-a` opens Tekapo A;
their capacity factors are back in the mix table.

### 2. Huntly in September 2020 (design decision, 2 Nov 2026)

`Generation_MD` has no HLY2201 rows for September 2020 and the dispatch files start on 10 September, so 1-9 September
had no Huntly at all: the Rankines and unit 5 at zero, North Island demand about 600 MW low (demand adds generation
back) and the renewable share about 10 points high. No record falls in those days. Grid_import has HLY2201 for every
half-hour of the month (469.9 GWh), tracking Generation_MD in August and October 2020 at a correlation of 0.9997, 4-13 MW
lower (it is net of station load). `analysis/huntly_sep2020.py` splits it between the Rankines, unit 5 and unit 6 by
clearing it through their offers; tested on 25-31 August against Generation_MD the mean errors were 12.8, 5.2 and 0.2 MW,
correlation 0.997 or better. The result is `facilities/metered_fill_202009.csv`, added to the month's Generation_MD by
`fetch_month`; `complete()` makes the stored month read again, and the fill is in the rebuild fingerprint. The whole
month becomes metered, so the Rankines show as one there, like the months either side. Plant notes and the history
page's known gaps are updated on this branch.

Check afterwards: on 1-12 Sep 2020 at 30m, Huntly has no break at 10 September; the Rankines show whole in the drill-down
with no units; NI demand is about 3,000 MW on 1-9 September, not 2,500; the renewable share there is about 75%, not
86%; no record moves into or out of those days (DAT-10, GRP-07).

## Not fixable from EMI data

- Highbank before Oct 2001: no meter in `Generation_MD` or `Embedded_generation`, and reconciliation starts in 2005.
  Its capacity counts from its first metered month (`plant_capacity.csv`), and the history page lists the gap.
