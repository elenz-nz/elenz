"""The private plant research page's data: site/src/lib/plants/research.json.

The research page (/plants/research, for the Elenz team only; design decision, 17 Nov 2026) replaces the retired
research workbook. It is built from the same files as the plant pages, so what the team reviews is always what the
site will publish: every plant file with all its facts, checked or not, their sources, grades, dates and the other
sources' values, plus the leads files. The public plant pages never read this file (ingest/plant_pages.py writes
theirs, with checked facts only).

  plants         one row per plant file: slug, name, plant, fuel, island, status, mw, owner (Elenz's grouping),
                 scheme, wikidata, osm, register, reviewed, to_check, notes, photo_leads (IDs), images, loc
                 ("checked", "draft": an unchecked point, "grid": only the grid connection, "none"), disagree (the
                 facts where another source gives a different value), facts and checked (counts, as
                 `plant_files.py` counts them: alternatives left out) and entries (every fact, in page order:
                 {k, label, value, source, grade, checked, published, note?, alt: [{value, source, grade, note?}]})
  sources        {id: {title, publisher, url, kind, opened, note}}, from plant_sources.csv
  photo_leads    plant_photo_leads.csv's rows
  station_leads  station_leads.csv's rows (empty cells left out), each with `group`, where it stands for the
                 research round on stations without a page (design decision, 23 Nov 2026; lead_group below)

Everything in it is already public in this repository; the page is private so draft facts aren't read as Elenz's.
How it is served: docs/architecture.md, Plant pages (the research page). Run from the repo root after editing a plant
file, its sources or images, the leads files, plant_capacity.csv or plants.json, then commit the JSON:
  python3 ingest/plant_research.py           write the file
  python3 ingest/plant_research.py --check   fail if it is out of date (in checks.yml)
"""
import json
import os
import sys

import plant_files as pf
from common import FACILITIES, ROOT
from plant_pages import LABELS, META, OTHER, capacity_rows, status_of, text, when

OUT = os.path.join(ROOT, 'site', 'src', 'lib', 'plants', 'research.json')
PHOTO_LEADS = os.path.join(FACILITIES, 'plant_photo_leads.csv')
STATION_LEADS = os.path.join(FACILITIES, 'station_leads.csv')

# the entries that aren't [facts] tables, labelled as the page shows them
OTHER_LABELS = {'location': 'Location', 'grid_connection': 'Grid connection', 'ratings': 'Other rating',
                'stations': 'Station'}


def show(k, e):
    """An entry's value as text: a date as the pages write it, a point as 'lat, lon', a station with its MW."""
    v = e.get('value')
    if k in ('commissioned', 'closed'):
        return when(v)
    if k in ('location', 'grid_connection') and isinstance(v, list) and len(v) == 2:
        out = f'{v[0]:.4f}, {v[1]:.4f}'
        if k == 'grid_connection' and e.get('code'):
            out = f"{e['code']} ({out})"
        elif e.get('basis') and e['basis'] != 'station':
            out += f" ({e['basis']})"
        return out
    if k == 'ratings':
        return f"{text(v)} MW" + (f" ({e['basis']})" if e.get('basis') else '')
    if k == 'stations':
        return text(v) + (f" ({text(e['mw'])} MW)" if e.get('mw') not in (None, '') else '')
    return text(v)


def entry(k, label, e):
    out = {'k': k, 'label': label, 'value': show(k, e), 'source': pf.cited(e), 'grade': e.get('grade', ''),
           'checked': e.get('checked', ''), 'published': pf.published(e)}
    if e.get('note'):
        out['note'] = e['note']
    alts = []
    for a in e.get('alt', []) if isinstance(e, dict) else []:
        x = {'value': show(k, a), 'source': pf.cited(a), 'grade': a.get('grade', '')}
        if a.get('note'):
            x['note'] = a['note']
        alts.append(x)
    out['alt'] = alts
    return out


def entries(p):
    """Every entry in page order: the facts (about first), then the location, grid connection, ratings, stations."""
    facts = p.get('facts', {})
    out = []
    if 'about' in facts:
        out.append(entry('about', 'About', facts['about']))
    for k, label in LABELS:
        if k in facts:
            out.append(entry(k, label, facts[k]))
    for k in ('location', 'grid_connection'):
        if k in p:
            out.append(entry(k, OTHER_LABELS[k], p[k]))
    for k in ('ratings', 'stations'):
        for e in p.get(k, []):
            out.append(entry(k, OTHER_LABELS[k], e))
    return out


def loc_state(p):
    loc = p.get('location')
    if loc and pf.published(loc):
        return 'checked'
    if loc:
        return 'draft'
    return 'grid' if p.get('grid_connection') else 'none'


# The station leads' groups, in the order lead_group tests them. `on_page` names the plant page a lead is already a
# station on (or the units behind it, as Kawerau (Onepu)'s); retired and historic leads wait for the history round.
LEAD_GROUPS = ('page', 'historic', 'new', 'small', 'osm', 'todo')


def lead_group(r):
    """Where a station lead stands: page (already on a plant page), historic (retired or historic: the history
    round), new (not generating yet), small (under 1 MW or below the threshold), osm (an unverified OpenStreetMap
    lead) or todo (to research now: a station without a page)."""
    status = r.get('status', '').lower()
    if r.get('on_page'):
        return 'page'
    if status.startswith('retired') or 'historic' in status:
        return 'historic'
    if status == 'commissioning' or r.get('shown_in_elenz') == 'Not yet':
        return 'new'
    try:
        small = float(r.get('mw') or 'nan') < 1
    except ValueError:
        small = False
    if small or 'below threshold' in status:
        return 'small'
    if status.startswith('lead (osm'):
        return 'osm'
    return 'todo'


def station_leads(plants):
    rows = [{k: v for k, v in r.items() if v} for r in pf.read_csv(STATION_LEADS)]
    for r in rows:
        if r.get('on_page') and r['on_page'] not in plants:
            raise SystemExit(f"station_leads.csv {r['id']}: on_page {r['on_page']!r} is not a plant file")
        r['group'] = lead_group(r)
    return rows


def same(a, b):
    return ' '.join(str(a).lower().split()) == ' '.join(str(b).lower().split())


def row(s, p, cap, meta, images):
    rs = cap.get(p.get('plant'), [])
    m = meta.get(p.get('plant'), {})
    last = rs[-1] if rs else {}
    es = entries(p)
    return {
        'slug': s, 'name': p['name'], 'plant': p.get('plant', ''),
        'fuel': last.get('fuel', ''), 'island': last.get('island', ''), 'status': status_of(rs) if rs else 'none',
        'mw': float(last['mw']) if last.get('mw') else None,
        'owner': m.get('owner') or OTHER, 'scheme': m.get('scheme') or '',
        'wikidata': p.get('wikidata', ''), 'osm': p.get('osm', []), 'register': p.get('register', []),
        'reviewed': p.get('reviewed', ''), 'to_check': p.get('to_check', []), 'notes': p.get('notes', []),
        'photo_leads': p.get('photo_leads', []),
        'images': [{k: r[k] for k in ('file', 'title', 'author', 'source_url', 'licence', 'checked')}
                   for r in images if r['slug'] == s],
        'loc': loc_state(p),
        'disagree': [e['label'] for e in es if any(not same(a['value'], e['value']) for a in e['alt'])],
        'facts': len(es),
        'checked': sum(1 for e in es if e['published']),
        'entries': es,
    }


def build():
    plants = pf.load()
    cap = capacity_rows()
    with open(META, encoding='utf-8') as f:
        meta = json.load(f)
    images = pf.read_csv(pf.IMAGES)
    return {
        'plants': [row(s, p, cap, meta, images) for s, p in plants.items()],
        'sources': {r['id']: {k: r[k] for k in ('title', 'publisher', 'url', 'kind', 'opened', 'note')}
                    for r in pf.read_csv(pf.SOURCES)},
        'photo_leads': pf.read_csv(PHOTO_LEADS),
        'station_leads': station_leads(plants),
    }


def dump(d):
    return json.dumps(d, ensure_ascii=False, separators=(',', ':')) + '\n'


def main(check=False):
    text_ = dump(build())
    if check:
        try:
            with open(OUT, encoding='utf-8') as f:
                ok = f.read() == text_
        except FileNotFoundError:
            ok = False
        print('plant research: ok' if ok else
              'PROBLEM site/src/lib/plants/research.json is out of date (run python3 ingest/plant_research.py)')
        return ok
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(text_)
    d = json.loads(text_)
    print(f"wrote site/src/lib/plants/research.json: {len(d['plants'])} plants, "
          f"{sum(p['checked'] for p in d['plants'])} of {sum(p['facts'] for p in d['plants'])} facts checked, "
          f"{len(d['photo_leads'])} photo leads, {len(d['station_leads'])} station leads "
          f"({sum(r['group'] == 'todo' for r in d['station_leads'])} to research) ({len(text_) // 1024} KB)")
    return True


if __name__ == '__main__':
    sys.exit(0 if main('--check' in sys.argv) else 1)
