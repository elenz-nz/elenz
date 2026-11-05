# Waiting for the next full history rebuild

These changes touch files in the history's rebuild fingerprint (`mapping_hash()` in `ingest/history.py`:
`metered_plants.csv`, `overrides.toml` except its site-only tables, the register, the BUILD number), so pushing any of
them starts a rebuild of every month (under an hour, in the next history run). Bundle them and push them together, and never
while a rebuild is still running (check `/data/history/progress.json`: `rebuild_left` empty).

The last rebuild (BUILD 8, 3 Nov 2026: Tekapo A and B's names, Huntly in September 2020) took 13 minutes in one run (352
months, 734 KV writes). Its items were checked on the published data and removed.

## Collecting a build

Gather fingerprinted changes on a branch named `next-rebuild` with `BUILD` bumped and a draft pull request, each change
with a numbered section in that branch's copy of this file saying what changed and what to check afterwards. Don't put
fingerprinted changes on `main` meanwhile. A Claude session can't take a pull request out of draft (GraphQL isn't
available): close the draft and open a new pull request from the same branch.

To start it (only when the Elenz team says go): bring the branch up to date with `main`, check
`/data/history/progress.json` has `rebuild_left` empty, let the checks pass and merge. Start the History workflow by
hand, or wait for the next run. Afterwards check each item, run the Offers workflow with "resummarise" if an item changes
generation, and clear the done items from this file.

## BUILD 9, being collected on this branch

1. **Kawerau (Onepu), KAW0112 ONU0.** The plant was Kawerau Mill CoGen, bioenergy, and started in January 2020. It's now
   Kawerau (Onepu), geothermal, from January 2013, with Grid_import standing in until Generation_MD's row starts
   (`IMPORT_STAND_IN` in metered.py, evidence in `analysis/kawerau_onepu.py`). The 84 months' metered columns are read
   again, once. Afterwards check on the published files:
   - `hh/2019-06.json` has `Kawerau (Onepu)`, `geo`, averaging 24.1 MW; `hh/2012-12.json` doesn't have it.
   - `hh/2020-01.json` still reads 21.7 MW on average, and no file has Kawerau Mill CoGen or fuel `bio` for this plant.
   - North Island demand in June 2019 is 24 MW higher than before; months from 2020 are unchanged.
   - Geothermal capacity on /tracker rises 53 MW from 2013; bioenergy falls to Kinleith alone.
   - Run the Offers workflow with "resummarise", as generation changes. Records may move slightly in 2013-19 and
     geothermal emissions rise about 13 kt a year: note any record that changes.

## Not fixable from EMI data

- Highbank before Oct 2001: no meter in `Generation_MD` or `Embedded_generation`, and reconciliation starts in 2005.
  Its capacity counts from its first metered month (`plant_capacity.csv`), and the history page lists the gap.
