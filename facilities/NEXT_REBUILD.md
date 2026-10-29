# Waiting for the next full history rebuild

These changes touch files in the history's rebuild fingerprint (`mapping_hash()` in `ingest/history.py`:
`metered_plants.csv`, `overrides.toml` except its site-only tables, the register, the BUILD number), so pushing any of
them starts a rebuild of every month (~4 days at the KV write budget). Bundle them and push them together, and never
while a rebuild is still running (check `/data/history/progress.json`: `rebuild_left` empty).

The last rebuild (BUILD 7, 23-27 Oct 2026: Mill Creek 2014-15, Kawerau TG1/TG2, West Wind as one plant, Ōtāhuhu
names, clock-change days before 2009, daily peak dispatchable output, small solar farms at Ashburton) finished on
27 Oct 2026 and its items were checked and removed.

## BUILD 8: collecting, held until the owner says go (opened 28 Oct 2026)

This is the branch `next-rebuild` (draft pull request "BUILD 8 (held)"). `BUILD` is already 8 here, so merging it
starts a full rebuild of every month (~4 days). Add each fingerprinted change to this branch with a numbered section
below saying what changed and what to check once the rebuild has run.

To start it (only when the owner says go): bring the branch up to date with `main`, check
`/data/history/progress.json` has `rebuild_left` empty, mark the pull request ready for review, let the checks pass and
merge. Afterwards check each item, run the Offers workflow with "resummarise" if an item changes generation, and clear
the done items from this file.

### 1. Tekapo A and B (owner's call, 30 Oct 2026)

The site spells the stations Tekapo A and Tekapo B, like their scheme ("Tekapo" in `[hydro_schemes]`), not the
register's "Takapō A/B". Changed: `[plant_names]` in `overrides.toml` (the dispatch data's names), the two rows in
`metered_plants.csv` (the metered history's names), `[hydro_schemes]`, the rows in `plant_capacity.csv` and
`capacity.json`, `plants.json`, the groupings method page, and `PLANT_ALIASES` (old `plant=takapo-a`/`takapo-b`
links forward). Until the rebuild has remade every month, the history still says "Takapō A/B", and those two plants
show no capacity factor on 30 days, 1 year and All.

Check afterwards: By hydro scheme > Tekapo lists Tekapo A and Tekapo B on 24 hours, 30 days and All; no "Takapō"
anywhere in the tracker (search the plant list for "takapo"); `/tracker?fuel=hydro&plant=takapo-a` opens Tekapo A;
their capacity factors are back in the mix table.

## Not fixable from EMI data

- Highbank before Oct 2001: no meter in `Generation_MD` or `Embedded_generation`, and reconciliation starts in 2005.
  Its capacity counts from its first metered month (`plant_capacity.csv`), and the history page lists the gap.
