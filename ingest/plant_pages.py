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
  images                 [{file, title, author, source_url, licence, licence_url, focus?}]: the plant's rows of
                         plant_images.csv, in file order (the first leads; the page lets readers step through the rest)
  aerial                 [{k, file, across, imagery, name?, lat?, lon?}]: the plant's LINZ aerial view, shown as "Site" (k is
                         site; the view is the one in facilities/plant_aerial_choice.csv, else all three: site, close,
                         wide; analysis/plant_aerials.py), once its location is checked and while the views are centred on
                         it. A plant of several stations with their own checked points also lists a site view of each (k
                         s1, s2, the station's place in [[stations]]), and then every entry has the station's `name` and
                         point (`lat`, `lon`), in [[stations]] order, for the page's arrows and name label
  sources                [{n, title, publisher, url, opened}]: the sources the published facts cite, numbered
  related                {owner: [...], scheme: [...], fuel: [...]}: other plant pages, each {slug, name}

and the index page (/plants) is built from site/src/lib/plants/index.json, one row per plant: slug, name, plant (its
name in Elenz's data), fuel, island, status, mw, owner (plants.json's, "Other generators" included), commissioned (its checked year, or null),
closed (the year its last capacity row ended), reviewed, pt, its point on the map: {lat, lon, basis, checked}, thumb,
the picture the index's side panel shows (its first photo, else its aerial site view, else null: {kind, file, credit}),
and overview, one sentence built from its checked facts (overview() below).
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
import re
import sys
from urllib.parse import unquote, urlparse

import plant_files as pf
from common import ROOT

OUT = os.path.join(ROOT, 'site', 'src', 'lib', 'plants', 'pages')
INDEX = os.path.join(ROOT, 'site', 'src', 'lib', 'plants', 'index.json')
META = os.path.join(ROOT, 'site', 'src', 'lib', 'tracker', 'plants.json')
IMAGES_DIR = os.path.join(ROOT, 'site', 'static', 'plants')
AERIALS = os.path.join(ROOT, 'facilities', 'plant_aerials.csv')
AERIAL_CHOICE = os.path.join(ROOT, 'facilities', 'plant_aerial_choice.csv')   # slug,view: the one view each page shows

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


def page(s, p, cap, meta, srcs, images, aerials, chosen):
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
    imgs = [r for r in images if r['slug'] == s]
    views = [r for r in aerials if r['slug'] == s]
    aerial = aerial_views(s, p, loc, views, chosen) if location and views else None
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
        'images': [{**{k: r[k] for k in ('file', 'title', 'author', 'source_url', 'licence', 'licence_url')},
                    **({'focus': r['focus']} if r['focus'] else {})} for r in imgs],
        'aerial': aerial,
        'sources': [{'n': n, **{k: srcs[x][k] for k in ('title', 'publisher', 'url', 'opened')}} for x, n in numbers.items()],
    }


def aerial_on(row, loc):
    """True while an aerial view is centred on the given [lat, lon] entry's point."""
    return float(row['lat']) == loc['value'][0] and float(row['lon']) == loc['value'][1]


def station_views(rows):
    """The per-station rows (view s1, s2: the station's place in the plant file's [[stations]] list)."""
    return {int(r['view'][1:]): r for r in rows if re.fullmatch(r's\d+', r['view'])}


def aerial_views(s, p, loc, rows, chosen):
    """The plant's aerial views for its Location tab, in order: the plant's own view (the one chosen in
    plant_aerial_choice.csv, else all three) and, for a plant of several stations, one site view of each station with its
    own checked point (a station on the plant's point is the plant's view, named for it). Each carries `name` when there
    is more than one picture, so the page can say which site it shows; None when a view is out of date. The main site
    (the plant's point, or the station its file's main_station names) comes first."""
    main = [r for r in rows if r['view'] in ('site', 'close', 'wide')]
    if not main or not all(aerial_on(r, loc) for r in main):
        return None
    mine = [r for r in main if r['view'] == chosen.get(s, r['view'])]
    out = [{'k': 'site', 'file': r['file'], 'across': int(r['across_m']), 'imagery': r['imagery']} for r in mine]
    extra = station_views(rows)
    sts = [(i, st) for i, st in enumerate(p.get('stations', []), 1) if pf.published(st) and st.get('location')]
    if not sts or len(mine) != 1:
        return out
    here = [st.get('view_label', st['value']) for i, st in sts if list(st['location']) == list(loc['value'])]
    out[0].update(name=here[0] if here else p['name'], lat=loc['value'][0], lon=loc['value'][1])
    for i, st in sts:
        r = extra.get(i)
        if list(st['location']) == list(loc['value']):
            continue
        if not r or float(r['lat']) != st['location'][0] or float(r['lon']) != st['location'][1]:
            continue   # no image yet (or a stale one: --check says so)
        out.append({'k': f's{i}', 'file': r['file'], 'across': int(r['across_m']), 'imagery': r['imagery'], 'name': st.get('view_label', st['value']),
                    'lat': st['location'][0], 'lon': st['location'][1]})
    # The main site comes first, so it is the picture a visitor sees on opening: the plant's own point (its station, or
    # the whole site) unless the plant file's main_station names another station (design decision, 22 Nov 2026). The
    # rest follow in station order, the plant's own picture standing at its station's place.
    pos = {i: n for n, (i, st) in enumerate(sts)}
    at = [i for i, st in sts if list(st['location']) == list(loc['value'])]
    out[0]['order'] = pos[at[0]] if at else -1
    for v in out[1:]:
        v['order'] = pos[int(v['k'][1:])]
    want = p.get('main_station')
    if want:
        hit = [i for i, st in sts if st['value'] == want]
        if not hit:
            raise SystemExit(f"{s}: main_station {want!r} is not a station with a checked point")
        first = 'site' if hit[0] in at else f's{hit[0]}'
    else:
        first = 'site'
    out.sort(key=lambda v: (v['k'] != first, v['order']))
    for v in out:
        del v['order']
    return out if len(out) > 1 else [{k: v for k, v in out[0].items() if k not in ('name', 'lat', 'lon')}]


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


# how the overview names each fuel's plants (registry.js's KIND, lower case), and the regions that take "the"
KIND = {'hydro': 'hydro station', 'geo': 'geothermal station', 'wind': 'wind farm', 'solar': 'solar farm',
        'gas': 'gas-fired station', 'coal': 'coal and gas station', 'diesel': 'diesel station', 'batt': 'battery',
        'bio': 'bioenergy plant', 'waste': 'waste heat plant'}
REGION_IN = {'Bay of Plenty': 'in the Bay of Plenty', 'West Coast': 'on the West Coast'}


def overview(pg, closed_year=None):
    """One sentence for the index's side panel, from the page's checked facts only:
    'A 570 MW hydro station on the Waitaki River in Canterbury, generating since 1965.' The river or geothermal field
    is named only where the fact starts with one ('Waitaki River (Lake Benmore)' gives 'the Waitaki River'); the
    region falls back to the island; the years are the earliest year in Commissioned and, for a closed plant, the
    year in Closed (else the year its last capacity row ended)."""
    f = {x['k']: x['value'] for x in pg['facts']}
    mw = f"{text(round(pg['mw'], 1))} MW " if pg['mw'] else ''
    what = KIND.get(pg['fuel'], 'power station')
    on = ''
    head = re.split(r'[,(;]', f.get('river', ''))[0].strip()
    if pg['fuel'] == 'hydro' and re.fullmatch(r"[^ ].* River", head) and ' and ' not in head:
        on = f' on the {head}'
    field = f.get('field', '')
    if pg['fuel'] == 'geo' and field.endswith('geothermal field') and ';' not in field:
        on = f' on the {field}'
    region = f.get('region')
    where = REGION_IN.get(region, f'in {region}') if region else f"in the {'South' if pg['island'] == 'SI' else 'North'} Island"
    years = [int(y) for y in re.findall(r'\b(1[89]\d\d|20\d\d)\b', f.get('commissioned', ''))]
    first = min(years) if years else None
    run = 'in service' if pg['fuel'] == 'batt' else 'generating'
    if pg['status'] == 'pending':
        tail = 'not generating yet'
    elif pg['status'] == 'closed':
        end = (re.findall(r'\b(?:1[89]|20)\d\d\b', f.get('closed', '')) or [closed_year])[-1]
        tail = (f'{run} from {first} to {end}' if first and end and str(first) != str(end)
                else f'closed in {end}' if end else 'now closed')
    else:
        tail = f'{run} since {first}' if first else ''
    # "an" before a number said with a vowel sound: 8, 11, 18, 80s, 800s (eight, eleven, eighteen, eighty, ...)
    n = mw.split(' ')[0].split('.')[0] if mw else ''
    article = 'An' if n.startswith('8') or n in ('11', '18') else 'A'
    if pg['status'] == 'closed':
        tail = tail if tail.startswith('closed') or tail == 'now closed' else f'{tail}; now closed'
    return f"{article} {mw}{what}{on} {where}{', ' + tail if tail else ''}."


def first_year(v):
    """The earliest year in a Commissioned value: '1952' for 'Maraetai I 1952; Maraetai II 1970'."""
    ys = re.findall(r'\b(?:1[89]|20)\d\d\b', str(v))
    return min(ys) if ys else None


def thumb(pg):
    """The index side panel's picture: the first photo, else the aerial site view."""
    if pg['images']:
        im = pg['images'][0]
        return {'kind': 'photo', 'file': im['file'], 'credit': f"Photo: {im['author']}, {im['licence']}"}
    site = next((v for v in pg['aerial'] or [] if v['k'] == 'site'), None)
    if site:
        return {'kind': 'aerial', 'file': site['file'], 'credit': 'Aerial: Toitū Te Whenua LINZ, CC BY 4.0'}
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
                     'commissioned': first_year(com['value']) if com and pf.published(com) else None,
                     'closed': max(ends)[:4] if pg['status'] == 'closed' and ends else None,
                     'reviewed': bool(p.get('reviewed')), 'pt': point(p, srcs), 'thumb': thumb(pg)})
        rows[-1]['overview'] = overview(pg, rows[-1]['closed'])
    rows.sort(key=lambda r: pf.slug(r['name']))
    return {'plants': rows}


def build():
    plants = pf.load()
    srcs = pf.sources()
    images = pf.read_csv(pf.IMAGES)
    aerials = pf.read_csv(AERIALS) if os.path.exists(AERIALS) else []
    chosen = {r['slug']: r['view'] for r in pf.read_csv(AERIAL_CHOICE)} if os.path.exists(AERIAL_CHOICE) else {}
    cap = capacity_rows()
    with open(META, encoding='utf-8') as f:
        meta = json.load(f)
    pages = {s: page(s, p, cap, meta, srcs, images, aerials, chosen) for s, p in plants.items() if p.get('plant')}
    related(pages, meta)
    return pages, index(plants, pages, meta, srcs), aerial_problems(plants, aerials)


def aerial_problems(plants, aerials):
    """Aerial views that no longer match their plant's checked location, or whose file is missing."""
    out = []
    for r in aerials:
        p = plants.get(r['slug'], {})
        loc = p.get('location')
        if not (loc and pf.published(loc)):
            out.append(f"{r['slug']}: aerial view {r['view']} but no checked location (run analysis/plant_aerials.py)")
        elif re.fullmatch(r's\d+', r['view']):
            sts = p.get('stations', [])
            i = int(r['view'][1:])
            st = sts[i - 1] if i <= len(sts) else None
            if not (st and pf.published(st) and st.get('location') and aerial_on(r, {'value': st['location']})):
                out.append(f"{r['slug']}: aerial view {r['view']} is centred on an old station point (run analysis/plant_aerials.py)")
        elif not aerial_on(r, loc):
            out.append(f"{r['slug']}: aerial view {r['view']} is centred on an old point (run analysis/plant_aerials.py)")
        if not os.path.exists(os.path.join(IMAGES_DIR, r['file'])):
            out.append(f"{r['slug']}: its aerial view site/static/plants/{r['file']} is missing")
    return out


def dump(p):
    return json.dumps(p, ensure_ascii=False, indent=1) + '\n'


def main(check=False):
    pages, idx, problems = build()
    have = {f[:-5] for f in os.listdir(OUT) if f.endswith('.json')} if os.path.isdir(OUT) else set()
    for s, p in pages.items():
        for im in p['images']:
            if not os.path.exists(os.path.join(IMAGES_DIR, im['file'])):
                problems.append(f'{s}: its image site/static/plants/{im["file"]} is missing')
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
