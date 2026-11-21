"""Plant page facts: facilities/plants/<slug>.toml, facilities/plant_sources.csv and facilities/plant_images.csv.

One TOML file per plant page holds the researched facts, each with a source ID, a grade and the date a person checked
it. The site will be built only from these files (plant pages, wave 1 of the plan); the research register workbook was
the discovery tool and is no longer the record. How to check a plant and the file layout are in
facilities/PLANTS.md; the schema is FACT_KEYS and the checks below.

A fact is published only when it has been checked: `checked` holds a date, its grade is A or B, and every source it
cites is a public source with a title, address and date opened. Everything else stays in the file for research.

  python3 ingest/plant_files.py           summary: plants, facts checked, what's left to check
  python3 ingest/plant_files.py --check   fail if a tracker plant has no file, a file is malformed, a fact cites an
                                          unknown source, a published fact isn't fit to publish, or an image has no
                                          usable licence (run in .github/workflows/checks.yml)

Not part of the history's rebuild fingerprint: nothing here changes a history month.
"""
import csv
import os
import re
import sys
import tomllib
import unicodedata
from datetime import date, datetime

from common import FACILITIES, NZ

PLANTS = os.path.join(FACILITIES, 'plants')
SOURCES = os.path.join(FACILITIES, 'plant_sources.csv')
IMAGES = os.path.join(FACILITIES, 'plant_images.csv')
CAPACITY = os.path.join(FACILITIES, 'plant_capacity.csv')

# The facts a plant file may hold, as tables under [facts]. Each is {value, source, grade, checked, note?, alt?}.
FACT_KEYS = {'other_names', 'commissioned', 'closed', 'units', 'scheme', 'field', 'river', 'region',
             'territorial_authority', 'owner', 'previous_owners', 'about'}
# The other fact-shaped entries: [location] and [grid_connection] (value = [lat, lon]), [[ratings]] (value = MW),
# [[stations]] (value = the station's name; location = [lat, lon], the station's own point read from the LINZ aerial).
TOP_KEYS = {'slug', 'plant', 'name', 'register', 'reviewed', 'to_check', 'notes', 'osm', 'wikidata', 'photo_leads',
            'facts', 'location', 'grid_connection', 'ratings', 'stations'}
GRADES = {'A', 'B', 'C'}
SOURCE_KINDS = {'public', 'research'}   # research: never cited by a published fact (our own register, OpenStreetMap)
# Licences an image may carry (plan: CC BY, BY-SA, CC0, public domain, or an owner's written permission).
LICENCE = re.compile(r'^(CC BY(-SA)? \d\.\d( [A-Z]{2})?|CC0 1\.0|Public domain|No known copyright restrictions|'
                     r'Used with permission)$')
IMAGE_FIELDS = ['slug', 'file', 'title', 'author', 'source_url', 'licence', 'licence_url', 'checked', 'crop', 'focus']


def slug(s):
    """As slug() in site/src/lib/site/viewurl.js: the tracker's plant slugs."""
    s = ''.join(c for c in unicodedata.normalize('NFD', str(s)) if not unicodedata.combining(c)).lower()
    return re.sub(r'^-+|-+$', '', re.sub(r'[^a-z0-9]+', '-', s))


def read_csv(path):
    with open(path, newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))


def load():
    """{slug: plant file as a dict}, read from facilities/plants/."""
    out = {}
    for name in sorted(os.listdir(PLANTS)):
        if name.endswith('.toml'):
            with open(os.path.join(PLANTS, name), 'rb') as f:
                out[name[:-5]] = tomllib.load(f)
    return out


def sources():
    return {r['id']: r for r in read_csv(SOURCES)}


def entries(p):
    """Every fact-shaped entry in a plant file: (label, entry, alternative?)."""
    for k, v in p.get('facts', {}).items():
        yield f'facts.{k}', v, False
        for i, a in enumerate(v.get('alt', []) if isinstance(v, dict) else []):
            yield f'facts.{k}.alt[{i}]', a, True
    for k in ('location', 'grid_connection'):
        if k in p:
            yield k, p[k], False
    for k in ('ratings', 'stations'):
        for i, v in enumerate(p.get(k, [])):
            yield f'{k}[{i}]', v, False


def cited(e):
    s = e.get('source', '')
    return [x for x in (s if isinstance(s, list) else [s]) if x]


def published(e):
    """A fact the site may show: checked by a person (the check makes sure it is also fit to show)."""
    return bool(e.get('checked'))


def is_date(s):
    try:
        return date.fromisoformat(s) <= datetime.now(NZ).date()
    except (TypeError, ValueError):
        return False


def check():
    problems = []
    srcs = {}
    for i, r in enumerate(read_csv(SOURCES), start=2):
        where = f'plant_sources.csv line {i} ({r["id"]})'
        if not re.fullmatch(r'[a-z0-9][a-z0-9-]*', r['id']):
            problems.append(f'{where}: an ID is lowercase letters, digits and hyphens')
        if r['id'] in srcs:
            problems.append(f'{where}: duplicate ID')
        if r['kind'] not in SOURCE_KINDS:
            problems.append(f'{where}: kind must be public or research')
        if r['opened'] and not is_date(r['opened']):
            problems.append(f'{where}: opened must be a date (YYYY-MM-DD), not in the future')
        srcs[r['id']] = r
    plants = load()
    tracker = {r['plant'] for r in read_csv(CAPACITY)}
    have = {p.get('plant') for p in plants.values()}
    for name in sorted(tracker - have):
        problems.append(f'no plant file for {name!r} (expected facilities/plants/{slug(name)}.toml)')
    for s, p in plants.items():
        where = f'plants/{s}.toml'
        for k in sorted(set(p) - TOP_KEYS):
            problems.append(f'{where}: unknown key {k!r}')
        for k in sorted(set(p.get('facts', {})) - FACT_KEYS):
            problems.append(f'{where}: unknown fact {k!r}')
        if p.get('slug') != s:
            problems.append(f'{where}: slug must match the file name')
        if not p.get('name'):
            problems.append(f'{where}: no name')
        if p.get('plant') and slug(p['plant']) != s:
            problems.append(f'{where}: the slug must be the tracker\'s slug for {p["plant"]!r} ({slug(p["plant"])})')
        if not p.get('plant') and slug(p.get('name', '')) != s:
            problems.append(f'{where}: a station with no Elenz data takes its slug from its name')
        if p.get('reviewed') and not is_date(p['reviewed']):
            problems.append(f'{where}: reviewed must be a date (YYYY-MM-DD), not in the future')
        for label, e, alt in entries(p):
            at = f'{where} {label}'
            if not isinstance(e, dict) or 'value' not in e:
                problems.append(f'{at}: needs a value')
                continue
            if e.get('grade') not in GRADES:
                problems.append(f'{at}: grade must be A, B or C')
            if not cited(e):
                problems.append(f'{at}: needs a source')
            for x in cited(e):
                if x not in srcs:
                    problems.append(f'{at}: unknown source {x!r} (add it to plant_sources.csv)')
            if e.get('checked') and not is_date(e['checked']):
                problems.append(f'{at}: checked must be a date (YYYY-MM-DD), not in the future')
            if alt and e.get('checked'):
                problems.append(f'{at}: an alternative is never published; move it to the main value to publish it')
            if label in ('location', 'grid_connection') and not (
                    isinstance(e['value'], list) and len(e['value']) == 2
                    and -48 <= e['value'][0] <= -34 and 166 <= e['value'][1] <= 179):
                problems.append(f'{at}: value must be [latitude, longitude] in New Zealand')
            if label.startswith('stations[') and 'location' in e and not (
                    isinstance(e['location'], list) and len(e['location']) == 2
                    and -48 <= e['location'][0] <= -34 and 166 <= e['location'][1] <= 179):
                problems.append(f'{at}: location must be [latitude, longitude] in New Zealand')
            if published(e) and not alt:
                if e.get('grade') not in ('A', 'B'):
                    problems.append(f'{at}: only grade A and B facts are published')
                for x in cited(e):
                    r = srcs.get(x)
                    if r and r['kind'] != 'public':
                        problems.append(f'{at}: cites {x!r}, a research-only source; a published fact needs a public one')
                    if r and not (r['title'] and r['url'] and r['opened']):
                        problems.append(f'{at}: its source {x!r} needs a title, address and date opened')
                if e['value'] in ('', []):
                    problems.append(f'{at}: a published fact needs a value')
    for i, r in enumerate(read_csv(IMAGES), start=2):
        where = f'plant_images.csv line {i} ({r.get("file")})'
        if list(r) != IMAGE_FIELDS:
            problems.append(f'plant_images.csv: columns must be {",".join(IMAGE_FIELDS)}')
            break
        if r['slug'] not in plants:
            problems.append(f'{where}: no plant file {r["slug"]!r}')
        if not LICENCE.match(r['licence']):
            problems.append(f'{where}: licence {r["licence"]!r} isn\'t one we can use (CC BY, CC BY-SA, CC0, public '
                            'domain, no known copyright restrictions, or used with permission)')
        if r['focus'] and not re.fullmatch(r'\d{1,3}% \d{1,3}%', r['focus']):
            problems.append(f'{where}: focus {r["focus"]!r} must look like "50% 30%" (where the crop is anchored: across, down)')
        for k in ('file', 'title', 'author', 'source_url', 'checked'):
            if not r[k]:
                problems.append(f'{where}: {k} is required')
        if r['checked'] and not is_date(r['checked']):
            problems.append(f'{where}: checked must be a date (YYYY-MM-DD)')
    for p in problems:
        print('PROBLEM', p)
    return not problems


def summary():
    plants = load()
    facts = [(s, label, e) for s, p in plants.items() for label, e, alt in entries(p) if not alt]
    done = sum(1 for _, _, e in facts if published(e))
    reviewed = sum(1 for p in plants.values() if p.get('reviewed'))
    left = sum(1 for p in plants.values() if p.get('to_check'))
    images = len(read_csv(IMAGES))
    print(f'{len(plants)} plant files; {done} of {len(facts)} facts checked; {reviewed} plants reviewed; '
          f'{left} with something to check; {images} images')


if __name__ == '__main__':
    if '--check' in sys.argv:
        ok = check()
        print('plant files: ok' if ok else 'plant files: problems found')
        sys.exit(0 if ok else 1)
    summary()
