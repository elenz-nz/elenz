# Plant pages: the plant files and how to check a plant

Every plant the tracker shows gets a page at `/plants/<slug>` (wave 1: the 110 plants in `plant_capacity.csv`). Its
researched facts live here, one small file per page, and the site is built only from these files. They are public
like the rest of the repository, so they hold only what public sources say.

| File | What it holds |
| --- | --- |
| `plants/<slug>.toml` | One plant page: its facts, each with a source, a grade and the date it was checked |
| `plant_sources.csv` | One row per source: `id`, `title`, `publisher`, `url`, `kind` (`public` or `research`), `opened` (the date we last read it), `note` |
| `plant_images.csv` | One row per image we may use (a plant can have several: the first leads its page, readers step through the rest): `slug`, `file`, `title`, `author`, `source_url`, `licence`, `licence_url`, `checked`, `crop`, `focus` (optional, "50% 12%": where a tall photo is anchored in the cropped frame, across then down; blank centres it). The file is `site/static/plants/<slug>.webp` (a second photo `<slug>-2.webp`, and so on), at most 1,600 px wide (WebP, quality 70 to 80), made from the source's own copy; `source_url` is the file's page, where the licence was read |
| `plant_aerials.csv` | The LINZ aerial views each page shows (`analysis/plant_aerials.py`): `slug`, `view` (site, close, wide), `file`, the point it is centred on, `zoom`, `across_m`, the `imagery` collection, `fetched` |
| `plant_photo_leads.csv` | Photos worth checking; a lead stays listed after its photo is cleared and added to `plant_images.csv` |
| `station_leads.csv` | Stations without a page yet: embedded stations, stations not in Elenz's data, new-station leads |

The first drafts came from the research register workbook of 8 Nov 2026 (`analysis/plants_import.py`, run once on
18 Nov 2026). The workbook is retired: these files are now the record, edited directly.

**The research page**, `/plants/research` (private: on elenz.co.nz it needs `?key=` with the screens page's key; on a
pull request's preview it opens without one), shows every plant's state and facts from these files, with filters for
what still needs work and a workbook download. It is how the Elenz team reviews a batch.

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
basis = "station"         # or "whole site" for one point covering several stations, or the station the point
                          # marks where a plant's stations are far apart ("Tuai station"); the page shows it after the point
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
location = [-38.53, 175.92]   # optional: the station's own point, read from the LINZ aerial
mw = 55
source = "elenz-register"
grade = "C"
checked = ""
```

Facts a file may hold, under `[facts]`: `other_names`, `commissioned`, `closed`, `units`, `scheme`, `field`, `river`,
`region`, `territorial_authority`, `owner`, `previous_owners`, `about`. The header (fuel, island, status, installed
MW), the live panel and the history come from Elenz's own data, not from these files.

**Which date `commissioned` gives** (design decisions, 21 Nov 2026):

- A plant metered from the start: the first metered date, the first half-hour of output in the EA's metered
  generation (Generation_MD, or the grid meter for a plant without its own row). In practice the first day the meter
  records at least 1 MWh: readings of a few kWh days or months before that are meter tests or station supply, not
  output (Huntly 5, Te Uku, Turitea, Tauhara). `analysis/first_metered.py` lists every code's and embedded meter's
  first output (sources `ea-generation-md`, `ea-embedded-generation`). A meter whose first month already shows the
  plant running (Kaiwera Downs, Tararua stage I), or one that read far less than dispatch at first (Pāmu Rā ki
  Whitianga, Rotohiko), started after the plant did: use the owner's date. A plant sharing a code with another
  (Kawerau (TOPP2) with Te Ahi O Māui) or with no reading of its own (Taiohi, Twin Rivers, the Glenbrook-Ohurua
  and Huntly batteries; Kōwhai Park, Clandeboye and Kaiwaikawe read zero in Generation_MD) uses the owner's date too,
  unless an embedded meter shows its own first output (Kōwhai Park).
- A plant commissioned before the metered history starts (Aug 1997), or one that ran for some time before it was
  metered, or one never metered: the owner's commissioning date.
- A meter covering several stations commissioned at different times (Kawerau (Onepu)): no commissioned date; the
  `units` fact names the stations.

Other dates (the register's start, Transpower's adjustment event dates in its Assumptions Book Appendix D, an owner's
opening or "fully commissioned" date) go in the fact's `note` or as `alt` values. This sets the page's fact only:
`plant_capacity.csv` rows keep their own dates.

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

A plant's `to_check` is the one list of its open questions (since 19 Nov 2026 every per-plant question from the plant
pages plan lives there; questions across plants stay in the plan). Items marked "for the Elenz team" (decisions, pages
to look over) are left for the team. The team's own notes on a plant are on the research page (Team notes, kept by the
Worker, never in these files); read them there before a batch, and put anything that should be public into the file.

1. Work through `to_check` and every fact's source. Open the source, confirm the value, and set `checked` to today.
   Fix the value if the source says otherwise; replace a grade C source with a public one.
2. Add any source you used to `plant_sources.csv` (a short ID such as `meridian-manapouri`, `kind = public`) and set
   its `opened` date.
3. Fill what's missing: owner and previous owners (with the year of each change), units, closing date, and the
   `about` text (2 to 4 plain sentences in our own words, written from the cited sources; short quotes only where the
   exact words matter).
   Region and district: test the station's point against Stats NZ's boundaries (`statsnz-regc-2025`,
   `statsnz-ta-2026`, ArcGIS feature services that answer a point query) and cross-check with the grid connection point;
   note in `notes` when another district is within a few hundred metres. Previous owners of the former state stations:
   the New Zealand Gazette's ECNZ notices (`gazette-1995-140` for 1 April 1987, `gazette-1999-170` for the 1 April 1999
   split to Mighty River Power, Genesis Energy and Meridian Energy).
4. Location: confirm the point sits on the station (not the switchyard or grid connection) against the LINZ aerial
   imagery or Wikidata, then mark it checked. A point read from the aerial cites `linz-aerial` (grade B), and a point
   confirmed on it cites `linz-aerial` too, naming where it came from in `note`. For a plant of several stations, give
   each `[[stations]]` entry its own `location` and put `[location]` on the largest station (its `basis` names it), or
   midway with basis "whole site" where they sit together. The grid connection point is the substation on the aerial;
   its code stays the EA's. If the point moved, test the district and region again (step 3).
   Then refresh the aerial views: `LINZ_BASEMAPS_KEY=... python3 analysis/plant_aerials.py` (only plants whose point
   moved are fetched), before step 6.
5. Empty `to_check` (bar items for the Elenz team), set `reviewed` to today, and run `python3 ingest/plant_files.py --check`.
6. Run `python3 ingest/plant_pages.py` and `python3 ingest/plant_research.py`, and commit the files they change
   (`site/src/lib/plants/pages/`, `site/src/lib/plants/research.json`): the page shows the checked facts on the batch's
   preview, and the research page its progress. Their `--check` (in checks.yml) fails while one is out of date.

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
  `analysis/plant_photo_candidates.py` lists Wikidata's image (P18) and Commons category (P373) for plants with no
  photo, with each file's licence; look at each picture before using it (Wikidata's image is sometimes another plant's:
  Ōtāhuhu A's is Ōtāhuhu B's). `analysis/plant_photos.py fetch` then `add` downloads the picks and writes the WebP and
  the CSV row. Several plants may share one file (the three Tararua stages): one row each, the same `file`.
  Te Ara, the National Library and DigitalNZ pages answer this workspace with a bot check, and owners' pages are
  copyright reserved: those leads need a person's browser or a written permission.
- "Owner" means the plant's owner.

## The checks (`ingest/plant_files.py --check`)

Every plant in `plant_capacity.csv` has a file, named by the tracker's slug; no unknown keys or facts; every fact has a
value, a grade and a known source; dates are real and not in the future; a published fact is grade A or B and cites
only public sources with a title, address and date opened; an alternative is never marked checked; locations are in
New Zealand; every image row has a plant, a usable licence and its credit fields.
