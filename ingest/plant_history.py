"""Each plant's output by month, for the plant pages (/plants/<slug>): hist/plants.json, served as
/data/history/plants.json.

A plant page charts its plant's generation by year and by month since 1997, and its capacity factor. Reading every
half-hourly month for one plant would mean ~350 files (~500 MB), so the history job keeps this one small file instead:

  {"v": VERSION,
   "months": ["1997-08", ...],      every month in the history, oldest first
   "src": "mmm...d",                each month's source, one letter a month: m metered history, d recent dispatch data
   "end": <ms>,                     the end of the newest month's data (its meta.end), so a page knows how far the
                                    running month goes
   "left": n,                       months not read yet (the file fills in over a few runs; 0 once complete)
   "plants": {"Manapōuri": {"i": 0, "g": [MWh, ...]},
              "Huntly Battery": {"i": 327, "g": [...], "c": [...]}}}

For each plant, `g` is its energy in each month (MWh: the month's half-hourly MW × 0.5 h; net of the little a station
draws while stopped; discharge only for a battery) from month index `i` on, ending at its last month with output; `c`
is a battery's charging (MWh, positive).
A month inside that span where the plant has no series is null. Values are whole MWh, one decimal below 100 MWh.
Plants are named as in the history files and tracker.json (plant_capacity.csv's names); the page finds its plant by
name.

Kept up to date by the history job (update(), after the months), like tod.py: a month rebuilt this run is redone from
its new JSON; a month the file lacks is read back from hist/hh (at most READS a run, newest first). One KV write when
anything changed. Not part of the history's rebuild fingerprint.

Try it on downloaded months:  python3 ingest/plant_history.py <folder of YYYY-MM.json> [out.json]
"""
import json
import os
import sys

VERSION = 1
READS = 200          # months read back from hist/hh per run while the file is being filled in
KEY = 'hist/plants.json'


def _mwh(v):
    if v is None:
        return None
    return round(v, 1) if abs(v) < 99.95 else int(round(v))


def summarise(js):
    """One month's half-hourly JSON (tracker layout) -> {'src': 'm'|'d', 'end': ms, 'p': {plant: [MWh, charged MWh]}}."""
    hours = js['step'] / 3_600_000
    out = {}
    for p in js.get('plants', []):
        gen = chg = 0.0
        for v in p.get('s') or []:
            if v is None:
                continue
            if v > 0:
                gen += v
            else:
                chg -= v
        if p.get('fuel') != 'batt':   # a station's own use while stopped is netted off (a few MWh a year at most)
            gen, chg = max(gen - chg, 0.0), 0.0
        out[p['name']] = [gen * hours, chg * hours]
    meta = js.get('meta', {})
    return {'src': 'm' if meta.get('source') == 'metered' else 'd', 'end': meta.get('end'), 'p': out}


def build(by_month, months):
    """{month: summarise() result}, every month stored -> the published file's layout."""
    have = [m for m in months if m in by_month]
    names = sorted({n for m in have for n in by_month[m]['p']})
    plants = {}
    for n in names:
        g = [by_month[m]['p'][n][0] if n in by_month[m]['p'] else None for m in have]
        c = [by_month[m]['p'][n][1] if n in by_month[m]['p'] else None for m in have]
        live = [k for k, (a, b) in enumerate(zip(g, c)) if (a or 0) > 0 or (b or 0) > 0]
        if not live:
            continue   # a plant with no output in any month (a unit listed before it ran)
        i, j = live[0], live[-1] + 1
        row = {'i': i, 'g': [_mwh(x) for x in g[i:j]]}
        if any((x or 0) > 0 for x in c[i:j]):
            row['c'] = [_mwh(x) for x in c[i:j]]
        plants[n] = row
    return {'v': VERSION, 'months': have, 'src': ''.join(by_month[m]['src'] for m in have),
            'end': by_month[have[-1]]['end'] if have else None, 'left': len(months) - len(have), 'plants': plants}


def unpack(f):
    """The published file -> {month: summarise()-like result}, so a run only redoes what changed."""
    if not f or f.get('v') != VERSION:
        return {}
    out = {m: {'src': f['src'][k], 'end': None, 'p': {}} for k, m in enumerate(f['months'])}
    if f['months']:
        out[f['months'][-1]]['end'] = f.get('end')
    for n, row in f['plants'].items():
        c = row.get('c') or []
        for k, x in enumerate(row['g']):
            m = f['months'][row['i'] + k]
            if x is not None or (k < len(c) and c[k] is not None):
                out[m]['p'][n] = [x or 0, (c[k] if k < len(c) else 0) or 0]
    return out


def update(store, fresh, months, room=lambda n: True, log=print):
    """fresh: {month: hh JSON} rebuilt this run; months: every month stored. Saves hist/plants.json if it changed."""
    try:
        old = json.loads(store.get(KEY) or b'{}')
    except ValueError:
        old = {}
    by = {m: v for m, v in unpack(old).items() if m in months}
    for m, js in fresh.items():
        by[m] = summarise(js)
    for m in [m for m in reversed(months) if m not in by][:READS]:
        raw = store.get(f'hist/hh/{m}.json')
        if raw:
            by[m] = summarise(json.loads(raw))
    new = build(by, sorted(months))
    if new == old:
        return
    if not room(1):
        log('plant history: no KV writes left today; saved next run')
        return
    body = json.dumps(new, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode()
    store.put(KEY, body, 'application/json')
    log(f'plant history: {len(new["plants"])} plants, {len(new["months"])} months ({len(body) // 1024} KB)'
        + (f', {new["left"]} still to read' if new['left'] else ''))


if __name__ == '__main__':
    folder = sys.argv[1]
    by = {}
    for f in sorted(os.listdir(folder)):
        if f.endswith('.json') and len(f) == 12:
            with open(os.path.join(folder, f)) as fh:
                by[f[:7]] = summarise(json.load(fh))
    res = build(by, sorted(by))
    body = json.dumps(res, separators=(',', ':'), ensure_ascii=False)
    if len(sys.argv) > 2:
        with open(sys.argv[2], 'w', encoding='utf-8') as fh:
            fh.write(body)
    print(f'{len(res["plants"])} plants, {len(res["months"])} months, {len(body) // 1024} KB')
