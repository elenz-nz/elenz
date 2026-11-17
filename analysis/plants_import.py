"""One-off import: the research register workbook -> first drafts of the plant files (plant pages, wave 1).

Run once (18 Nov 2026) on the register of 8 Nov 2026; after that the plant files are the record and are edited
directly, so this script is kept only to show where the drafts came from. Rerunning it overwrites every plant file.

  python3 analysis/plants_import.py <register.xlsx>

Writes:
  facilities/plants/<slug>.toml     one per "Plant page row = Yes" row (110), with the plant's other register rows as
                                    its stations
  facilities/plant_sources.csv      every source the files cite, plus the register's Sources and Station source leads
  facilities/plant_images.csv       the header only (no image is checked yet)
  facilities/plant_photo_leads.csv  the Photographs sheet
  facilities/station_leads.csv      the register's other stations (embedded, not in Elenz data, unverified leads) and
                                    its New station leads sheet

Nothing imported is marked checked: every fact starts with `checked = ""`, so nothing is published until a research
batch checks it (facilities/PLANTS.md). Grades are the plan's: A an owner or official document, B a good secondary
source (Wikipedia, Wikidata), C a lead only (our own register).

Left out on purpose: OpenStreetMap's coordinates, names, capacities, operators and dates (ODbL, research only: rows
located only by OSM get a "to check" item and keep their OSM feature IDs), and the register's columns that only
repeat Elenz's own data (installed MW, capacity history, dispatched units, metered codes: those come from the
pipeline).
"""
import csv
import json
import os
import re
import sys
import unicodedata
from collections import defaultdict
from urllib.parse import urlparse

import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FAC = os.path.join(ROOT, 'facilities')
WP_LIST = 'https://en.wikipedia.org/wiki/List_of_power_stations_in_New_Zealand'
EMI = 'https://www.emi.ea.govt.nz/Wholesale/Datasets/'


def slug(s):
    s = ''.join(c for c in unicodedata.normalize('NFD', str(s)) if not unicodedata.combining(c)).lower()
    return re.sub(r'^-+|-+$', '', re.sub(r'[^a-z0-9]+', '-', s))


def clean(v):
    if v is None:
        return ''
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v.strip() if isinstance(v, str) else v


def sheet(wb, name):
    rows = list(wb[name].iter_rows(values_only=True))
    head = [clean(h) for h in rows[0]]
    return [{h: clean(v) for h, v in zip(head, r)} for r in rows[1:] if any(v is not None for v in r)]


# ---------- sources ----------

class Sources:
    def __init__(self):
        self.rows = {}
        self.by_url = {}
        self.add('elenz-register', 'Elenz research register (working draft of 8 Nov 2026)', 'Elenz', '', 'research',
                 'Our own discovery workbook, retired 18 Nov 2026. A lead only: never the source of a published fact.')
        self.add('osm', 'OpenStreetMap', 'OpenStreetMap contributors', 'https://www.openstreetmap.org', 'research',
                 'ODbL: research only. Its coordinates and other values are not copied into these files.')
        self.add('ea-register', 'Dispatched generation plant (DispatchedGenerationPlant.csv)', 'Electricity Authority',
                 EMI + 'Generation/GenerationFleet/Existing', 'public',
                 "Operator, nameplate MW and the date each unit's row starts. Its 1 January dates count as years.")
        self.add('ea-nsp', 'Network supply points table', 'Electricity Authority',
                 EMI + 'MappingsAndGeospatial/NetworkSupplyPointsTable', 'public',
                 'Coordinates of grid connection points.')
        self.add('wp-list', 'List of power stations in New Zealand', 'Wikipedia', WP_LIST, 'public',
                 "Read for the register (Nov 2026). Grade B: check each value against the station's own page or its "
                 'references.')

    def add(self, id_, title, publisher, url, kind, note=''):
        if id_ not in self.rows:
            self.rows[id_] = {'id': id_, 'title': title, 'publisher': publisher, 'url': url, 'kind': kind,
                              'opened': '', 'note': note}
            if url:
                self.by_url.setdefault(url.rstrip('/'), id_)
        return id_

    def url(self, url, title='', publisher='', note=''):
        """The source ID for an address, adding it if new."""
        url = url.strip()
        key = url.rstrip('/')
        if key in self.by_url:
            r = self.rows[self.by_url[key]]
            r['title'] = r['title'] or title
            r['publisher'] = r['publisher'] or publisher
            if note and note not in r['note']:
                r['note'] = '; '.join(x for x in (r['note'], note) if x)
            return self.by_url[key]
        m = re.match(r'https?://(?:www\.)?([^/]+)(/.*)?', url)
        host, path = (m.group(1), m.group(2) or '') if m else ('source', url)
        if host == 'en.wikipedia.org':
            base = 'wp-' + slug(path.rsplit('/', 1)[-1])
            title = title or path.rsplit('/', 1)[-1].replace('_', ' ')
            publisher = publisher or 'Wikipedia'
        elif host == 'query.wikidata.org':
            base = 'wd-query'
        elif host == 'wikidata.org':
            base = 'wd-' + path.rsplit('/', 1)[-1].lower()
            publisher = publisher or 'Wikidata'
        else:
            words = [w for w in slug(re.sub(r'\.(pdf|aspx?|html?|ashx)$', '', path)).split('-')
                     if w and not re.fullmatch(r'[0-9a-f]{12,}', w)]
            base = slug(host.split('.')[0] if host.count('.') else host) + ('-' + '-'.join(words[-4:]) if words else '')
        base = base[:48].rstrip('-')
        id_, n = base, 2
        while id_ in self.rows:
            id_, n = f'{base}-{n}', n + 1
        kind = 'research' if re.search(r'openstreetmap|openinframap', host) else 'public'   # OSM data (ODbL)
        return self.add(id_, title, publisher, url, kind, note)

    def write(self, path):
        cols = ['id', 'title', 'publisher', 'url', 'kind', 'opened', 'note']
        with open(path, 'w', newline='', encoding='utf-8') as f:
            w = csv.DictWriter(f, cols, lineterminator='\n')
            w.writeheader()
            for r in sorted(self.rows.values(), key=lambda r: r['id']):
                w.writerow(r)


def urls(text):
    return re.findall(r'https?://[^\s;,]+', str(text or ''))


# ---------- TOML ----------

def tv(v):
    """A TOML value: strings as basic strings (JSON's escapes are valid TOML), numbers, arrays."""
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, list):
        return '[' + ', '.join(tv(x) for x in v) + ']'
    return json.dumps(str(v), ensure_ascii=False)


def fact(value, source, grade, note='', **extra):
    f = {'value': value, **extra, 'source': source, 'grade': grade, 'checked': ''}
    if note:
        f['note'] = note
    return f


def table(lines, header, d):
    lines.append(header)
    for k, v in d.items():
        if k != 'alt':
            lines.append(f'{k} = {tv(v)}')
    lines.append('')
    for a in d.get('alt', []):
        table(lines, f'[[{header.strip("[]")}.alt]]', a)


def toml(p):
    lines = [f'# Plant page facts for {p["name"]}. How to check a plant: facilities/PLANTS.md.', '']
    for k in ('slug', 'plant', 'name', 'register', 'wikidata', 'osm', 'reviewed', 'to_check', 'notes', 'photo_leads'):
        if k in p and (p[k] or k in ('slug', 'name', 'reviewed')):
            v = p[k]
            if isinstance(v, list) and len(v) > 1 and k in ('to_check', 'notes', 'photo_leads'):
                lines.append(f'{k} = [')
                lines += [f'  {tv(x)},' for x in v]
                lines.append(']')
            else:
                lines.append(f'{k} = {tv(v)}')
    lines.append('')
    for k in ('location', 'grid_connection'):
        if k in p:
            table(lines, f'[{k}]', p[k])
    for k, f in p['facts'].items():
        table(lines, f'[facts.{k}]', f)
    for k in ('ratings', 'stations'):
        for e in p.get(k, []):
            table(lines, f'[[{k}]]', e)
    return '\n'.join(lines).rstrip() + '\n'


# ---------- plants ----------

def year_of(text):
    m = re.search(r'\b(1[89]\d\d|20\d\d)\b', str(text))
    return m.group(1) if m else ''


def wikidata_year(text):
    """'in service 1958; inception 1953' -> '1958' (in service first)."""
    m = re.search(r'in service (\d{4})', str(text)) or re.search(r'(\d{4})', str(text))
    return m.group(1) if m else ''


def split(text):
    return [x.strip() for x in re.split(r';|\n', str(text or '')) if x.strip()]


def plant(rows, S):
    """The plant file for one slug: rows[0] is its "Plant page row", the rest its other stations."""
    r = rows[0]
    wds = re.findall(r'Q\d+', str(r['Wikidata']))
    wd_srcs = [S.url(f'https://www.wikidata.org/wiki/{q}', title=f'Wikidata item {q}') for q in wds]
    wd_src = wd_srcs[0] if wd_srcs else ''
    station_pages = [S.url(u) for u in urls(r['Sources'])]
    wp = next((x for x in station_pages if x.startswith('wp-')), 'wp-list')
    # the name with macrons: the plant's own name, or a station's name that slugs the same (Mōkai A -> Mōkai)
    names = [r['Elenz plant']] + [re.sub(r' [A-Z]$', '', x['Station / facility']) for x in rows]
    name = max((n for n in names if slug(n) == r['Slug']), key=lambda n: sum(not c.isascii() for c in n))
    p = {'slug': r['Slug'], 'plant': r['Elenz plant'], 'name': name,
         'register': [x['Station ID'] for x in rows], 'reviewed': '', 'facts': {}}
    if wds:
        p['wikidata'] = wds if len(wds) > 1 else wds[0]
    if r['OSM feature(s)']:
        p['osm'] = split(r['OSM feature(s)'])
    to_check = []
    for x in rows:
        for k in ('To check', 'Owner check', 'Location check'):
            to_check += [t for t in re.split(r'(?<=\.)\s+', str(x[k])) if t] if x[k] else []
    basis = r['Capacity basis / qualification']
    if basis and not basis.startswith('Elenz installed MW'):
        to_check.append(f'Capacity: {basis}')
    notes = []
    for x in rows:
        for k in ('Research notes', 'Matching notes'):
            if x[k] and x[k] not in notes:
                notes.append(x[k] if len(rows) == 1 else f'{x["Station ID"]}: {x[k]}')
    if r['Images']:
        notes.append(f'Images: {r["Images"]}')
    leads = [u for x in rows for u in urls(x['Sources']) if urlparse(u).hostname != 'en.wikipedia.org']
    if leads:
        notes.append('Source leads: ' + ' '.join(dict.fromkeys(leads)))

    # location: the station's own point where Wikidata or Wikipedia gives one; never OpenStreetMap's
    src = r['Location source']
    if r['Latitude'] != '' and src.startswith('Wikidata') and wd_src:
        p['location'] = fact([r['Latitude'], r['Longitude']], wd_src, 'B',
                             basis='whole site' if 'whole site' in src else 'station')
    elif r['Latitude'] != '' and src.startswith('Wikipedia'):
        p['location'] = fact([r['Latitude'], r['Longitude']], wp, 'B', basis='station')
    else:
        to_check.append('Location: no station point yet (OpenStreetMap is research only); check one against the '
                        'LINZ aerial or Wikidata.' if src.startswith('OpenStreetMap')
                        else 'Location: only the grid connection so far; find the station itself.')
    if r['Grid connection latitude'] != '':
        p['grid_connection'] = fact([r['Grid connection latitude'], r['Grid connection longitude']], 'ea-nsp', 'A',
                                    code=r['Grid connection(s)'] or r['Grid exit point'])
    elif src.startswith('EA supply points') and r['Latitude'] != '':
        p['grid_connection'] = fact([r['Latitude'], r['Longitude']], 'ea-nsp', 'A', code=r['Grid connection(s)'])

    F = p['facts']
    if r['Other names']:
        F['other_names'] = fact(split(r['Other names']), 'elenz-register', 'C',
                                'Names the EA register, Wikipedia and Elenz use for this plant; check each.')
    # commissioned: the operator's date, then Wikipedia's (register read-me); Wikidata and the EA register as checks
    alts = []
    if r['Commissioned (Wikidata)'] and wd_src:
        alts.append(fact(wikidata_year(r['Commissioned (Wikidata)']), wd_src, 'B', r['Commissioned (Wikidata)']))
    if r['Commissioned (EA register)']:
        alts.append(fact(year_of(r['Commissioned (EA register)']), 'ea-register', 'A',
                         f"the register's start date, {r['Commissioned (EA register)']}: often a year, not the day"))
    if r['Commissioned (Wikipedia)']:
        F['commissioned'] = fact(str(r['Commissioned (Wikipedia)']), wp, 'B')
    elif alts:
        F['commissioned'] = alts.pop(0)
    if 'commissioned' in F and alts:
        F['commissioned']['alt'] = [a for a in alts if a['value'] and a['value'] != F['commissioned']['value']]
        if not F['commissioned']['alt']:
            del F['commissioned']['alt']
    if r['Closed (Wikipedia)']:
        F['closed'] = fact(str(r['Closed (Wikipedia)']), wp, 'B')
    elif r['Status in Elenz data'] == 'Closed' and r['In Elenz data to']:
        to_check.append(f"Closed: Elenz's data ends {r['In Elenz data to']}; find the closing date.")
    if r['Turbines (Wikipedia)']:
        F['units'] = fact(f"{r['Turbines (Wikipedia)']} turbines", wp, 'B')
    scheme = r['Scheme / complex']
    if scheme and slug(scheme) != slug(p['name']):
        key = {'Geothermal': 'field'}.get(r['Fuel (Elenz)'], 'scheme')
        F[key] = fact(scheme, 'elenz-register', 'C')
    if r['Region']:
        F['region'] = fact(r['Region'], 'elenz-register', 'C')
    if r['Territorial authority (Wikipedia)']:
        F['territorial_authority'] = fact(r['Territorial authority (Wikipedia)'], wp, 'B')
    owner = r['Owner (as Elenz shows it)']
    if owner and owner != 'Other generators':
        F['owner'] = fact(owner, 'ea-register', 'B', "the register's operator, as Elenz groups owners; check the owner")
    elif r['Register operator(s)']:
        F['owner'] = fact('', 'ea-register', 'C', f"the register's operator(s): {r['Register operator(s)']}")
        to_check.append('Owner: not one of the main owners; find the current owner.')
    if r['Previous Owners / operators']:
        F['previous_owners'] = fact(split(r['Previous Owners / operators']), 'elenz-register', 'C')
    F['about'] = fact('', 'elenz-register', 'C', 'To write: 2-4 plain sentences in our own words, from cited sources.')

    if r['Wikipedia MW'] not in ('', None) and str(r['Wikipedia MW']) != str(r['Installed MW now (Elenz)']):
        p['ratings'] = [fact(r['Wikipedia MW'], wp, 'B', basis='Wikipedia (basis not stated)')]
    # stations: the plant's register rows, or the stations Wikipedia lists under it
    named = split(r['Stations in this plant (Wikipedia)'])
    if len(rows) > 1:
        p['stations'] = []
        for x in rows:
            e = fact(x['Station / facility'], 'elenz-register', 'C', id=x['Station ID'])
            if x['Indicative capacity (MW)'] not in ('', None):
                e['mw'] = x['Indicative capacity (MW)']
            if x['Commissioned (Wikipedia)']:
                e['commissioned'] = str(x['Commissioned (Wikipedia)'])
            p['stations'].append(e)
    elif len(named) > 1:
        p['stations'] = [fact(n, wp, 'B') for n in named]
    p['to_check'] = list(dict.fromkeys(to_check))
    p['notes'] = notes
    return p


def main(xlsx):
    wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
    S = Sources()
    for x in sheet(wb, 'Sources'):
        if x['URL']:
            S.url(x['URL'], title=x['Source / organisation'], note=x['Use / notes'])
    for x in sheet(wb, 'Station source leads'):
        for u in urls(x['URL']):
            S.url(u, title=x['Source'], note=f"{x['Station / subject']}: {x['Useful information']} {x['How to use / caveat']}")
    rows = [x for x in sheet(wb, 'Stations') if x['Station ID']]
    by_slug = defaultdict(list)
    for x in rows:
        if x['Slug']:
            by_slug[x['Slug']].append(x)
    os.makedirs(os.path.join(FAC, 'plants'), exist_ok=True)
    names = {}
    for s, group in sorted(by_slug.items()):
        group.sort(key=lambda x: x['Plant page row'] != 'Yes')
        assert group[0]['Plant page row'] == 'Yes', s
        p = plant(group, S)
        for x in group:
            names[slug(x['Station / facility'])] = s
        names[slug(p['name'])] = s
        with open(os.path.join(FAC, 'plants', f'{s}.toml'), 'w', encoding='utf-8') as f:
            f.write(toml(p))
    # photo leads, matched to plants by station name where one matches
    photos = sheet(wb, 'Photographs')
    with open(os.path.join(FAC, 'plant_photo_leads.csv'), 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f, lineterminator='\n')
        w.writerow(['id', 'slugs', 'subject', 'collection', 'url', 'rights_lead', 'description'])
        for x in photos:
            slugs = sorted({names[slug(n)] for n in split(x['Associated station(s)']) if slug(n) in names})
            w.writerow([x['Photo ID'], ' '.join(slugs), x['Associated station(s)'], x['Source / collection'],
                        x['Image or record URL'], x['Rights lead'], x['Description / relevance']])
    # the photo IDs on each plant file
    for s in by_slug:
        ids = [x['Photo ID'] for x in photos
               if s in {names.get(slug(n)) for n in split(x['Associated station(s)'])}]
        if ids:
            path = os.path.join(FAC, 'plants', f'{s}.toml')
            with open(path, encoding='utf-8') as f:
                text = f.read()
            with open(path, 'w', encoding='utf-8') as f:
                f.write(text.replace('reviewed = ""\n', f'reviewed = ""\nphoto_leads = {tv(ids)}\n', 1))
    with open(os.path.join(FAC, 'plant_images.csv'), 'w', newline='', encoding='utf-8') as f:
        f.write('slug,file,title,author,source_url,licence,licence_url,checked,crop\n')
    # every other station row, and the new-station leads: research only, no OSM values
    cols = ['id', 'name', 'technology', 'scheme', 'region', 'status', 'mw', 'mw_basis', 'owner', 'shown_in_elenz',
            'grid_exit_point', 'wikidata', 'lat', 'lon', 'location_source', 'osm', 'sources', 'notes', 'to_check']
    with open(os.path.join(FAC, 'station_leads.csv'), 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, cols, lineterminator='\n')
        w.writeheader()
        for x in rows:
            if x['Slug']:
                continue
            osm_only = x['Location source'].startswith('OpenStreetMap')
            w.writerow({'id': x['Station ID'], 'name': x['Station / facility'], 'technology': x['Technology'],
                        'scheme': x['Scheme / complex'], 'region': x['Region'], 'status': x['Preliminary status'],
                        'mw': x['Indicative capacity (MW)'], 'mw_basis': x['Capacity basis / qualification'],
                        'owner': x['Owner / operator'], 'shown_in_elenz': x['Shown in Elenz as'],
                        'grid_exit_point': x['Grid exit point'], 'wikidata': x['Wikidata'],
                        'lat': '' if osm_only else x['Latitude'], 'lon': '' if osm_only else x['Longitude'],
                        'location_source': '' if osm_only or x['Latitude'] == '' else x['Location source'],
                        'osm': x['OSM feature(s)'], 'sources': ' '.join(urls(x['Sources'])),
                        'notes': ' '.join(str(x[k]) for k in ('Research notes', 'Matching notes') if x[k]),
                        'to_check': x['To check']})
        for i, x in enumerate(sheet(wb, 'New station leads'), start=1):
            w.writerow({'id': f'L{i:03d}', 'name': x['Lead / station'], 'technology': x['Technology'],
                        'region': x['Region / location'], 'status': f"Lead: {x['Lead type']}",
                        'mw': x['Indicative capacity (MW)'], 'shown_in_elenz': 'Not in Elenz data',
                        'sources': x['Evidence / source'],
                        'notes': f"{x['What the source says']} {x['Relationship to existing register']} "
                                 f"Confidence: {x['Confidence']}.",
                        'to_check': x['Recommended action']})
    S.write(os.path.join(FAC, 'plant_sources.csv'))
    print(f'{len(by_slug)} plant files, {len(S.rows)} sources, {len(photos)} photo leads')


if __name__ == '__main__':
    main(sys.argv[1])
