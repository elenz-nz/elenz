# Plant pages: the plant files and how to check a plant

Every plant the tracker shows gets a page at `/plants/<slug>` (wave 1: the 110 plants in `plant_capacity.csv`). Its
researched facts live here, one small file per page, and the site is built only from these files. They are public
like the rest of the repository, so they hold only what public sources say.

| File | What it holds |
| --- | --- |
| `plants/<slug>.toml` | One plant page: its facts, each with a source, a grade and the date it was checked |
| `plant_sources.csv` | One row per source: `id`, `title`, `publisher`, `url`, `kind` (`public` or `research`), `opened` (the date we last read it), `note` |
| `plant_images.csv` | One row per image we may use: `slug`, `file`, `title`, `author`, `source_url`, `licence`, `licence_url`, `checked`, `crop` |
| `plant_photo_leads.csv` | Photos worth checking, not yet cleared for use |
| `station_leads.csv` | Stations without a page yet: embedded stations, stations not in Elenz's data, new-station leads |

The first drafts came from the research register workbook of 8 Nov 2026 (`analysis/plants_import.py`, run once on
18 Nov 2026). The workbook is retired: these files are now the record, edited directly.

`python3 ingest/plant_files.py` prints progress; `python3 ingest/plant_files.py --check` runs the checks below (also
run on every push, in `checks.yml`).

## A plant file

```toml
slug = "arapuni"          # the tracker's slug for the plant (the file name)
plant = "Arapuni"         # the plant's name in Elenz's data; left out for a station with no Elenz data
name = "Arapuni"          # the page's name, with macrons
register = ["H002"]       # the workbook's station IDs, for reference
wikidata = "Q4784238"
osm = ["relation/11009688"]   # OpenStreetMap feature IDs: a pointer only (see Locations)
reviewed = ""             # the date the whole page was last checked
photo_leads = ["P002"]    # IDs in plant_photo_leads.csv
to_check = ["..."]        # what still needs a look; empty once checked
notes = ["..."]           # research notes, never shown on the site

[location]                # the station's own point
value = [-38.0714, 175.6433]
basis = "station"         # or "whole site" for one point covering several stations
source = "wd-q4784238"
grade = "B"
checked = ""

[grid_connection]         # where it connects, from the EA's network supply points
value = [-38.0720, 175.6429]
code = "ARI1101 ARAPUNI"
source = "ea-nsp"
grade = "A"
checked = ""

[facts.commissioned]
value = "1929"
source = "wp-list"        # one ID, or a list of IDs, from plant_sources.csv
grade = "B"
checked = ""              # the date a person confirmed it against the source
note = ""                 # optional

[[facts.commissioned.alt]]   # what other sources say, kept for comparison, never shown
value = "1929"
source = "ea-register"
grade = "A"

[[ratings]]               # other capacity figures, each with its basis (Elenz's installed MW stays the headline)
value = 3.8
basis = "Wikipedia (basis not stated)"
source = "wp-list"
grade = "B"
checked = ""

[[stations]]              # for plants made of several stations
value = "Mōkai A"
id = "G010"
mw = 55
source = "elenz-register"
grade = "C"
checked = ""
```

Facts a file may hold, under `[facts]`: `other_names`, `commissioned`, `closed`, `units`, `scheme`, `field`, `river`,
`region`, `territorial_authority`, `owner`, `previous_owners`, `about`. The header (fuel, island, status, installed
MW), the live panel and the history come from Elenz's own data, not from these files.

## Grades and what gets published

- **A:** the owner or an official document (the EA's registers, an owner's report, the Gazette).
- **B:** a good secondary source (Wikipedia with a reference, Wikidata, Engineering New Zealand's heritage records).
- **C:** a lead only, including anything only our own workbook says (`elenz-register`).

A fact is published only when it is **checked**: `checked` holds a date, the grade is A or B, and every source it
cites is a `public` source with a title, address and date opened. The main `value` is what the page shows; where
sources disagree, put the best-graded one there and keep the others as `alt`. A row with no checked value is left off
the page rather than shown blank. Dates: a year unless a source gives the day; the EA register's 1 January dates count
as years.

## Checking a plant

1. Work through `to_check` and every fact's source. Open the source, confirm the value, and set `checked` to today.
   Fix the value if the source says otherwise; replace a grade C source with a public one.
2. Add any source you used to `plant_sources.csv` (a short ID such as `meridian-manapouri`, `kind = public`) and set
   its `opened` date.
3. Fill what's missing: owner and previous owners (with the year of each change), units, closing date, and the
   `about` text (2 to 4 plain sentences in our own words, written from the cited sources; short quotes only where the
   exact words matter).
4. Location: confirm the point sits on the station (not the switchyard or grid connection) against the LINZ aerial
   imagery or Wikidata, then mark it checked.
5. Empty `to_check`, set `reviewed` to today, and run `python3 ingest/plant_files.py --check`.
6. Run `python3 ingest/plant_pages.py` and commit the page files it changes (`site/src/lib/plants/pages/`): the page
   shows the checked facts on the batch's preview. Its `--check` (in checks.yml) fails while one is out of date.

Research goes in batches by fuel, one pull request per batch, for the Elenz team to review on the preview.

## Rules

- Work knowledge is never a source. Every published fact rests on a public document or the EA's data.
- Kawerau: say only what the EA's meters and published documents say. Never name trader codes
  (`docs/style-guide.md`).
- **Locations:** a published point comes from Wikidata (CC0), the EA, or our own check against the LINZ aerial.
  OpenStreetMap is ODbL, so its coordinates and values stay out of these files: keep only its feature IDs as a pointer,
  and treat `osm` and the Open Infrastructure Map sources as research only.
- **Images:** a row in `plant_images.csv` only once the licence has been read on the file's own page. CC BY, CC BY-SA,
  CC0, public domain, "no known copyright restrictions", or an owner's written permission. Never NonCommercial or
  NoDerivatives. Never an AI-made picture presented as a photo. Credit as "Photo: Author, Collection, Licence".
- "Owner" means the plant's owner.

## The checks (`ingest/plant_files.py --check`)

Every plant in `plant_capacity.csv` has a file, named by the tracker's slug; no unknown keys or facts; every fact has a
value, a grade and a known source; dates are real and not in the future; a published fact is grade A or B and cites
only public sources with a title, address and date opened; an alternative is never marked checked; locations are in
New Zealand; every image row has a plant, a usable licence and its credit fields.
