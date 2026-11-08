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

## Waiting: BUILD 12

### 1. Southdown Battery from the metered history

Generation_MD kept the closed Southdown station's code (`SWN2201 southdown`, fuel Gas) for the 1 MW battery at the
same point: no rows from 2016 to early 2018, zeros from Mar 2018, then the battery's discharge from Sep 2018 to May 2022 (up to 477 kWh a
half-hour; 12.5 MWh in Sep 2018, 118.6 MWh in Jun 2019, 33.4 MWh in May 2022). `metered_plants.csv` mapped it to
Southdown (gas) throughout, so:

- before 10 Sep 2020 the battery's output was shown as Southdown gas (and given Southdown's emission factor), and
  Southdown Battery was zero;
- from 10 Sep 2020 to May 2022 the dispatch data gave the battery its own output (`SWN1`), and the same output was
  counted again as Southdown gas.

Now the row is Southdown (gas) to Dec 2015 and Southdown Battery (batt) from Jan 2016, with a plant note
(`[plant_metering]`, site-only). In dispatch months the battery's dispatch series replaces the metered one, as for
every battery, so nothing is counted twice.

Check afterwards: `hist/hh/2019-06.json` has Southdown Battery with output and no Southdown (gas) entry;
`hist/hh/2021-06.json` has Southdown Battery once and no Southdown (gas) entry; North Island gas in 2018-22 is up to
about 0.2 MW lower (a month's average). Offers needs no resummarise (gas and battery headroom shift by under 1 MW; run it if in doubt).

### 2. MW series to one decimal below 10 MW

Design decision, 9 Nov 2026: plant, unit and island MW series are stored to one decimal below 10 MW and in whole MW
from 10 MW (`enc_mw` in build_tracker.py; the hh, dd and day files and tracker.json), so a small plant doesn't round to
0 on daily data (Southdown Battery averaged about 0.17 MW a day at most). Prices, revenue, peaks and counts are
unchanged. The tracker shows generation figures the same way (`mwTxt` in tracker.js). The live tracker.json picks it up
as soon as this merges.

Check afterwards: `hist/day.json`'s Southdown Battery has daily values like 0.1-0.2 in 2019; the file has grown by no
more than about 5% (it was 8.8 MB served on 9 Nov 2026); the Generation tab on 1Y and All loads as before on a phone.

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
