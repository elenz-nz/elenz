# Waiting for the next full history rebuild

These changes touch files in the history's rebuild fingerprint (`mapping_hash()` in `ingest/history.py`:
`metered_plants.csv`, `embedded_points.csv`, `embedded_registry_split.csv`, `overrides.toml` except its site-only
tables, the register, the BUILD number), so pushing any of
them starts a rebuild of every month (under an hour, in the next history run). Bundle them and push them together, and never
while a rebuild is still running (check `/data/history/progress.json`: `rebuild_left` empty).

The last rebuild (BUILD 11, 7 Nov 2026: Ngā Awa Pūrua's name, Opuha's source) took 10 minutes in one run (352 months,
711 KV writes). Its items were checked on the published data and removed: the plant has one name in the live week and
every history file, with its capacity (144 MW) and emissions factor. (BUILD 10, which downloaded 213 months'
reconciliation files into the states once, took 55 minutes; later rebuilds don't download them again.)

## Collecting a build

Gather fingerprinted changes on a branch named `next-rebuild` with `BUILD` bumped and a draft pull request, each change
with a numbered section in that branch's copy of this file saying what changed and what to check afterwards. Don't put
fingerprinted changes on `main` meanwhile. A Claude session can't take a pull request out of draft (GraphQL isn't
available): close the draft and open a new pull request from the same branch.

To start it (only when the Elenz team says go): bring the branch up to date with `main`, check
`/data/history/progress.json` has `rebuild_left` empty, let the checks pass and merge. Start the History workflow by
hand, or wait for the next run. Afterwards check each item, run the Offers workflow with "resummarise" if an item changes
generation, and clear the done items from this file.

## Not fixable from EMI data

- Highbank before Oct 2001: no meter in `Generation_MD` or `Embedded_generation`, and reconciliation starts in 2005.
  Its capacity counts from its first metered month (`plant_capacity.csv`), and the history page lists the gap.

## Noted for the plant pages

- Offered capacity by plant (`hist/offp/*`, for the plant pages) was written month by month before BUILD 11, so older
  months name the plant `Nga Awa Pūrua`. Map it through `[plant_names]` when the plant pages read those files.
