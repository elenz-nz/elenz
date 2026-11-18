"""The plant pages' static data: one small JSON per plant, site/src/lib/plants/pages/<slug>.json.

Each plant page (/plants/<slug>) is prerendered from its file here; its live panel reads tracker.json and its history
/data/history/plants.json (plant_history.py) in the browser. The file holds what the page shows that isn't live:

  slug, name, plant      the page's address, its name (with macrons) and the plant's name in Elenz's data
  fuel, island, status   from plant_capacity.csv: status is "operating", "closed" when every row has ended, or
                         "pending" for a plant not generating yet
  mw                     installed MW now (or when it closed)
  steps                  the capacity timeline: [{from, to, mw, sources: [{label, url}]}], from plant_capacity.csv
  owner, scheme          Elenz's groupings (site/src/lib/tracker/plants.json), shown on the tracker too
  metered                what the metered history counts for this plant, where it differs from the dispatch data
  checking               true until the whole page has been reviewed (`reviewed` in its plant file)
  checked                the newest date a published fact was checked
  about                  {text, refs} once its about text is checked
  facts                  [{k, label, value, refs, note?}]: the checked facts, in page order
  location               {lat, lon, basis, refs} once the station's point is checked
  image                  the first row of plant_images.csv for the plant, or null
  sources                [{n, title, publisher, url, opened}]: the sources the published facts cite, numbered
  related                {owner: [...], scheme: [...], fuel: [...]}: other plant pages, each {slug, name}

and the index page (/plants) is built from site/src/lib/plants/index.json, one row per plant: slug, name, plant (its
name in Elenz's data), fuel, island, status, mw, owner (plants.json's, "Other generators" included), commissioned (its checked year, or null),
closed (the year its last capacity row ended), reviewed, and pt, its point on the map: {lat, lon, basis, checked}.
`checked` is true for the station's checked location; otherwise pt is a draft, the plant file's unchecked location
or, without one, its grid connection (the EA's network supply point), for the map while the pages are hidden (design
decision, 18 Nov 2026). The index page drops every draft point once PLANTS_PUBLIC is true, and a draft never cites a
research-only source (OpenStreetMap stays out).

Only published facts reach these files (plant_files.published(): checked, grade A or B, public sources, which
`plant_files.py --check` enforces), so nothing unchecked can reach the site. Research notes, grades, alternatives,
OpenStreetMap IDs and the to-check list stay in the plant files.

Run from the repo root after editing a plant file, its sources or images, plant_capacity.csv or plants.json, then
commit the JSON:
  python3 ingest/plant_pages.py           write the files
  python3 ingest/plant_pages.py --check   fail if any file is missing, stale or left over (in checks.yml)
"""
import csv
import json
import os
import sys
from urllib.parse import unquote, urlparse

import plant_files as pf
from common import ROOT

OUT = os.path.join(ROOT, 'site', 'src', 'lib', 'plants', 'pages')
INDEX = os.path.join(ROOT, 'site', 'src', 'lib', 'plants', 'index.json')
META = os.path.join(ROOT, 'site', 'src', 'lib', 'tracker', 'plants.json')
IMAGES_DIR = os.path.join(ROOT, 'site', 'static', 'plants')

# the facts a page shows, in its order, with their labels (FACT_KEYS in plant_files.py; `about` has its own block)
LABELS = [('other_names', 'Other names'), ('commissioned', 'Commissioned'), ('closed', 'Closed'), ('units', 'Units'),
          ('scheme', 'Scheme'), ('field', 'Geothermal field'), ('river', 'River or lake'), ('region', 'Region'),
          ('territorial_authority', 'District'), ('owner', 'Owner'), ('previous_owners', 'Previous owners')]
MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
          'November', 'December']
OTHER = 'Other generators'      # plants.json's owner for everyone outside the named groups: no owner list for them
OWNER_LIST = 12                 # at most this many of an owner's other plants, largest first
FUEL_LIST = 6                   # the largest other plants of the same fuel on the same island


def when(s):
    """'1969', '1969-09' or '1969-09-01' -> '1969', 'September 1969', '1 September 1969' (style guide dates)."""
    parts = str(s).split('-')
    if len(parts) == 3 and all(p.isdigit() for p in parts):
        return f'{int(parts[2])} {MONTHS[int(parts[1]) - 1]} {parts[0]}'
    if len(parts) == 2 and all(p.isdigit() for p in parts):
        return f'{MONTHS[int(parts[1]) - 1]} {parts[0]}'
    return str(s)


def text(v):
    if isinstance(v, list):
        return ', '.join(text(x) for x in v)
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


def source_links(s):
    """plant_capacity.csv's source cell ('EA plant register (...)', or addresses split by '; ') -> [{label, url}]."""
    out = []
    for part in [p.strip() for p in str(s or '').split(';') if p.strip()]:
        if part.startswith('http'):
            u = urlparse(part)
            if u.netloc.endswith('.wikipedia.org') and '/wiki/' in u.path:
                label = 'Wikipedia, ' + unquote(u.path.split('/wiki/', 1)[1]).replace('_', ' ')
            else:
                label = u.netloc.removeprefix('www.')
            out.append({'label': label, 'url': part})
        else:
            out.append({'label': part, 'url': ''})
    return out


def capacity_rows():
    rows = {}
    with open(pf.CAPACITY, newline='', encoding='utf-8') as f:
        for r in csv.DictReader(f):
            rows.setdefault(r['plant'], []).append(r)
    for rs in rows.values():
        rs.sort(key=lambda r: r['start'] or '0000')
    return rows


def status_of(rs):
    """'closed' once every row has an end date, 'pending' for a plant not generating yet (a pending row with no
    dates), otherwise 'operating'."""
    if rs and all(r['basis'] == 'pending' for r in rs):
        return 'pending'
    return 'closed' if rs and all(r['end'] for r in rs) else 'operating'


def page(s, p, cap, meta, srcs, images):
    rs = cap.get(p.get('plant'), [])
    m = meta.get(p.get('plant'), {})
    last = rs[-1] if rs else {}
    numbers = {}

    def refs(e):
        out = []
        for x in pf.cited(e):
            if x not in numbers:
                numbers[x] = len(numbers) + 1
            out.append(numbers[x])
        return out

    facts_in = p.get('facts', {})
    about = facts_in.get('about')
    about = {'text': about['value'], 'refs': refs(about)} if about and pf.published(about) and about['value'] else None
    facts = []
    for k, label in LABELS:
        e = facts_in.get(k)
        if e and pf.published(e):
            v = when(e['value']) if k in ('commissioned', 'closed') else text(e['value'])
            facts.append({'k': k, 'label': label, 'value': v, 'refs': refs(e), **({'note': e['note']} if e.get('note') else {})})
    stations = [x for x in p.get('stations', []) if pf.published(x)]
    if stations:
        facts.append({'k': 'stations', 'label': 'Stations', 'refs': sorted({n for x in stations for n in refs(x)}),
                      'value': ', '.join(f"{x['value']} ({text(x['mw'])} MW)" if x.get('mw') else x['value'] for x in stations)})
    ratings = [x for x in p.get('ratings', []) if pf.published(x)]
    if ratings:
        facts.append({'k': 'ratings', 'label': 'Other ratings', 'refs': sorted({n for x in ratings for n in refs(x)}),
                      'value': '; '.join(f"{text(x['value'])} MW ({x['basis']})" for x in ratings)})
    g = p.get('grid_connection')
    if g and pf.published(g) and g.get('code'):
        code, _, nsp = g['code'].partition(' ')
        name = p['name'] if pf.slug(nsp) == s else nsp.title()
        facts.append({'k': 'grid_connection', 'label': 'Connection point', 'value': f'{name} ({code})', 'refs': refs(g)})
    loc = p.get('location')
    location = ({'lat': loc['value'][0], 'lon': loc['value'][1], 'basis': loc.get('basis', 'station'), 'refs': refs(loc)}
                if loc and pf.published(loc) else None)
    dates = [e.get('checked') for _, e, alt in pf.entries(p) if not alt and pf.published(e)]
    img = next((r for r in images if r['slug'] == s), None)
    return {
        'slug': s, 'name': p['name'], 'plant': p.get('plant', ''),
        'fuel': last.get('fuel', ''), 'island': last.get('island', ''), 'status': status_of(rs),
        'mw': float(last['mw']) if last.get('mw') else None,
        'steps': [{'from': r['start'] or None, 'to': r['end'] or None, 'mw': float(r['mw']), 'sources': source_links(r['source'])}
                  for r in rs if r['mw'] and r['basis'] != 'pending'],
        'owner': m.get('owner') if m.get('owner') != OTHER else None,
        'scheme': m.get('scheme'),
        'metered': m.get('metered'),
        'checking': not p.get('reviewed'),
        'checked': max(dates) if dates else None,
        'about': about,
        'facts': facts,
        'location': location,
        'image': ({k: img[k] for k in ('file', 'title', 'author', 'source_url', 'licence', 'licence_url')} if img else None),
        'sources': [{'n': n, **{k: srcs[x][k] for k in ('title', 'publisher', 'url', 'opened')}} for x, n in numbers.items()],
    }


def related(pages, meta):
    """Each page's links to other plant pages: the owner's other plants, the scheme's other stations (upstream first)
    and the largest other plants of its fuel on its island (operating plants only, except within a scheme)."""
    by_plant = {p['plant']: p for p in pages.values() if p['plant']}
    live = [p for p in pages.values() if p['status'] == 'operating']
    link = lambda p: {'slug': p['slug'], 'name': p['name']}   # noqa: E731
    big = lambda p: -(p['mw'] or 0)                           # noqa: E731
    for p in pages.values():
        owner = sorted((q for q in live if q['owner'] and q['owner'] == p['owner'] and q is not p), key=big)
        scheme = sorted((q for q in by_plant.values() if p['scheme'] and q['scheme'] == p['scheme'] and q is not p),
                        key=lambda q: meta.get(q['plant'], {}).get('river', 99))
        fuel = sorted((q for q in live if q['fuel'] == p['fuel'] and q['island'] == p['island'] and q is not p), key=big)
        p['related'] = {'owner': [link(q) for q in sorted(owner[:OWNER_LIST], key=lambda q: q['slug'])],
                        'owner_all': len(owner) <= OWNER_LIST,
                        'scheme': [link(q) for q in scheme],
                        'fuel': [link(q) for q in fuel[:FUEL_LIST]]}


def point(p, srcs):
    """The plant's point for the index map: its checked location, else a draft (see the docstring), else None."""
    loc = p.get('location')
    if loc and pf.published(loc):
        return {'lat': loc['value'][0], 'lon': loc['value'][1], 'basis': loc.get('basis', 'station'), 'checked': True}
    public = lambda e: e and e.get('value') and all(srcs.get(x, {}).get('kind') == 'public' for x in pf.cited(e))  # noqa: E731
    if public(loc):
        return {'lat': loc['value'][0], 'lon': loc['value'][1], 'basis': loc.get('basis', 'station'), 'checked': False}
    g = p.get('grid_connection')
    if public(g):
        return {'lat': g['value'][0], 'lon': g['value'][1], 'basis': 'grid connection', 'checked': False}
    return None


def index(plants, pages, meta, srcs):
    """The index page's rows, by name (site/src/lib/plants/index.json)."""
    rows = []
    for s, pg in pages.items():
        p = plants[s]
        com = p.get('facts', {}).get('commissioned')
        ends = [st['to'] for st in pg['steps'] if st['to']]
        rows.append({'slug': s, 'name': pg['name'], 'plant': pg['plant'], 'fuel': pg['fuel'], 'island': pg['island'], 'status': pg['status'],
                     'mw': pg['mw'], 'owner': meta.get(pg['plant'], {}).get('owner') or OTHER,
                     'commissioned': str(com['value'])[:4] if com and pf.published(com) else None,
                     'closed': max(ends)[:4] if pg['status'] == 'closed' and ends else None,
                     'reviewed': bool(p.get('reviewed')), 'pt': point(p, srcs)})
    rows.sort(key=lambda r: pf.slug(r['name']))
    return {'plants': rows}


def build():
    plants = pf.load()
    srcs = pf.sources()
    images = pf.read_csv(pf.IMAGES)
    cap = capacity_rows()
    with open(META, encoding='utf-8') as f:
        meta = json.load(f)
    pages = {s: page(s, p, cap, meta, srcs, images) for s, p in plants.items() if p.get('plant')}
    related(pages, meta)
    return pages, index(plants, pages, meta, srcs)


def dump(p):
    return json.dumps(p, ensure_ascii=False, indent=1) + '\n'


def main(check=False):
    pages, idx = build()
    problems = []
    have = {f[:-5] for f in os.listdir(OUT) if f.endswith('.json')} if os.path.isdir(OUT) else set()
    for s, p in pages.items():
        if p['image'] and not os.path.exists(os.path.join(IMAGES_DIR, p['image']['file'])):
            problems.append(f'{s}: its image site/static/plants/{p["image"]["file"]} is missing')
        path = os.path.join(OUT, f'{s}.json')
        if check:
            try:
                with open(path, encoding='utf-8') as f:
                    if f.read() != dump(p):
                        problems.append(f'{s}: site/src/lib/plants/pages/{s}.json is out of date')
            except FileNotFoundError:
                problems.append(f'{s}: site/src/lib/plants/pages/{s}.json is missing')
        else:
            os.makedirs(OUT, exist_ok=True)
            with open(path, 'w', encoding='utf-8') as f:
                f.write(dump(p))
    if check:
        try:
            with open(INDEX, encoding='utf-8') as f:
                if f.read() != dump(idx):
                    problems.append('site/src/lib/plants/index.json is out of date')
        except FileNotFoundError:
            problems.append('site/src/lib/plants/index.json is missing')
    else:
        with open(INDEX, 'w', encoding='utf-8') as f:
            f.write(dump(idx))
    for s in sorted(have - set(pages)):
        if check:
            problems.append(f'site/src/lib/plants/pages/{s}.json has no plant file')
        else:
            os.remove(os.path.join(OUT, f'{s}.json'))
    for x in problems:
        print('PROBLEM', x)
    if check:
        print('plant pages: ok' if not problems else 'plant pages: problems found (run python3 ingest/plant_pages.py)')
    else:
        print(f'wrote {len(pages)} plant pages to site/src/lib/plants/pages/; '
              f'{sum(1 for p in pages.values() if p["facts"] or p["about"])} with checked facts')
    return not problems


if __name__ == '__main__':
    sys.exit(0 if main('--check' in sys.argv) else 1)
