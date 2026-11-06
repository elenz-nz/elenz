# Waiting for the next full history rebuild

These changes touch files in the history's rebuild fingerprint (`mapping_hash()` in `ingest/history.py`:
`metered_plants.csv`, `overrides.toml` except its site-only tables, the register, the BUILD number), so pushing any of
them starts a rebuild of every month (under an hour, in the next history run). Bundle them and push them together, and never
while a rebuild is still running (check `/data/history/progress.json`: `rebuild_left` empty).

The last rebuild (BUILD 9, 5 Nov 2026: Kawerau (Onepu), geothermal from 2013) took 26 minutes in one run (352 months, 795
KV writes), reading 84 months' metered files again. Its items were checked on the published data and removed.

## Collecting a build

Gather fingerprinted changes on a branch named `next-rebuild` with `BUILD` bumped and a draft pull request, each change
with a numbered section in that branch's copy of this file saying what changed and what to check afterwards. Don't put
fingerprinted changes on `main` meanwhile. A Claude session can't take a pull request out of draft (GraphQL isn't
available): close the draft and open a new pull request from the same branch.

To start it (only when the Elenz team says go): bring the branch up to date with `main`, check
`/data/history/progress.json` has `rebuild_left` empty, let the checks pass and merge. Start the History workflow by
hand, or wait for the next run. Afterwards check each item, run the Offers workflow with "resummarise" if an item changes
generation, and clear the done items from this file.

## BUILD 10

### 1. Other embedded generation from January 2009 (`ingest/embedded.py`, 6 Nov 2026)

Each month from 2009 reads its reconciliation file (`Volumes/Reconciliation`, ~30 MB, the newest revision) into the
state as `O|<point> <trader>` columns (solar-shaped series and generators' own networks left out; `oq` = 1), and builds
an `oemb` block into `hist/hh` and `hist/dd` (and so `hist/day.json`): MW by island and fuel, Ngāwhā's and Teviot's
rest in months without their metered data (`named`), and each point's average (`pts`). It sits outside the island
series, so the site, records and heat maps don't see it until the site shows the layer. Months the reconciliation data
doesn't cover yet are estimated from `hist/oemb/profiles.json` (the newest 15 months' average days). The file names are
kept in `progress.json` (`oemb_files`); the last 16 months are checked each run for a revision. The fingerprint now
includes `embedded_points.csv` and `embedded_registry_split.csv`.

Expect: about an hour (every 2009+ month downloads its file once), ~1,000 KV writes (each 2009+ state is saved again).

Check afterwards:
- `hist/hh/2026-09.json`'s `oemb`: `src` "recon", about 118 MW in all (NI ~50, SI ~68), `named` empty; the local test
  on the same file gave NI hydro 16.9, bio 19.7, other 9.9; SI hydro 57.3, wind 8.8.
- the newest month: `src` "estimate", `from` the newest reconciliation month and the same month a year earlier;
  `named` has Ngāwhā (about 16-24 MW) and Teviot.
- `hist/day.json`'s `oemb`: zeros before 2009, about 93 MW over 2009 (2.0% of generation), 100-120 MW in 2026.
- `hist/oemb/profiles.json`: 15 months, each with `other`, `file`, and `plants` for metered months.
- Nothing on the site changes (generation totals, records, heat maps). Offers needs no resummarise.

## Not fixable from EMI data

- Highbank before Oct 2001: no meter in `Generation_MD` or `Embedded_generation`, and reconciliation starts in 2005.
  Its capacity counts from its first metered month (`plant_capacity.csv`), and the history page lists the gap.
