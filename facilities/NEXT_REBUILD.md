# Waiting for the next full history rebuild

These changes touch files in the history's rebuild fingerprint (`mapping_hash()` in `ingest/history.py`:
`metered_plants.csv`, `embedded_points.csv`, `embedded_registry_split.csv`, `overrides.toml` except its site-only
tables, the register, the BUILD number), so pushing any of
them starts a rebuild of every month (under an hour, in the next history run). Bundle them and push them together, and never
while a rebuild is still running (check `/data/history/progress.json`: `rebuild_left` empty).

The last rebuild (BUILD 12, 9 Nov 2026: Southdown Battery from the metered history, MW series to one decimal below
10 MW) took 16 minutes in one run (352 months, 742 KV writes). Its items were checked on the published data and removed:
Southdown (gas) ends in December 2015 and Southdown Battery has its metered discharge from September 2018 to May 2022
(at most 0.4 MW a day), with no gas entry and no double count in the dispatch months; `day.json` grew 3.6% (8.8 to
9.1 MB); Offers was rerun with "resummarise". (BUILD 10, which downloaded 213 months' reconciliation files into the
states once, took 55 minutes; later rebuilds don't download them again.)

## Collecting a build

Gather fingerprinted changes on a branch named `next-rebuild` with `BUILD` bumped and a draft pull request, each change
with a numbered section in that branch's copy of this file saying what changed and what to check afterwards. Don't put
fingerprinted changes on `main` meanwhile. A Claude session can't take a pull request out of draft (GraphQL isn't
available): close the draft and open a new pull request from the same branch.

To start it (only when the Elenz team says go): bring the branch up to date with `main`, check
`/data/history/progress.json` has `rebuild_left` empty, let the checks pass and merge. Start the History workflow by
hand, or wait for the next run. Afterwards check each item, run the Offers workflow with "resummarise" if an item changes
generation, and clear the done items from this file.

## In this build (BUILD 13, on `next-rebuild`)

1. **Rangipō's name** (design decision, 21 Nov 2026): the tracker shows Rangipō, as Genesis spells it, in place of the
   register's Rangipo. `[plant_names]` maps the register's name; `metered_plants.csv` (RPO2201), `plant_capacity.csv`,
   `[hydro_schemes]` Tongariro, the plant file's `plant` and the groupings method page use the new name. Check
   afterwards: the Tracker's By plant view and the Tongariro scheme list Rangipō once (no second "Rangipo" row),
   its history runs from Aug 1997 unbroken, `/plants/rangipo` shows its history and live panel, and records name it
   Rangipō. Offered capacity by plant (`hist/offp/*`) written before this build names it Rangipo: rerun the Offers
   workflow with "resummarise", or map it through `[plant_names]` when the plant pages read those files (as for
   Ngā Awa Pūrua, below).

## Not fixable from EMI data

- Highbank before Oct 2001: no meter in `Generation_MD` or `Embedded_generation`, and reconciliation starts in 2005.
  Its capacity counts from its first metered month (`plant_capacity.csv`), and the history page lists the gap.

## Noted for the plant pages

- Offered capacity by plant (`hist/offp/*`, for the plant pages) was written month by month before BUILD 11, so older
  months name the plant `Nga Awa Pūrua`. Map it through `[plant_names]` when the plant pages read those files.
