"""The plant pages' aerial views: three LINZ aerial images per plant, centred on its checked station point.

  site   zoom 18, about 450 m across: the station itself
  close  zoom 17, about 1 km across: the station and what's around it (dam, switchyard, field)
  wide   zoom 14, about 7.5 km across: the lake, river, canal or wind farm it belongs to

Each view is 1000 x 640 px, WebP, stitched from LINZ Basemaps' aerial tiles (Toitū Te Whenua LINZ, CC BY 4.0) and saved
as site/static/plants/aerial/<slug>-<view>.webp. The close and wide views mark the station's point, and each station's
own point for plants made of several stations, with a small ring; the site view has no marks (the station is at its
centre). facilities/plant_aerials.csv records, for each image, the point it is centred on and the imagery collection it
shows (from Basemaps' attribution file: the highest-priority aerial collection covering the point at that zoom), which
the page credits. ingest/plant_pages.py gives a plant page its views only while the CSV's point matches the plant
file's checked location, and its --check fails when they differ.

A plant made of several stations also gets one site view (zoom 18, about 450 m, no marks) centred on each station that has
its own checked point apart from the plant's own (a station on the plant's point is that view), saved as <slug>-s1.webp, <slug>-s2.webp and so on (the station's place in the plant file's
[[stations]] list) and listed in the CSV as view s1, s2. The plant page shows them after the plant's own view, with arrows
and the station's name (design decision, 22 Nov 2026).

Plants without a checked location get no views. Run it after a plant's location changes (only the plants whose point
moved, or that have no views yet, are fetched; --all refetches every plant), then run ingest/plant_pages.py:

  LINZ_BASEMAPS_KEY=... python3 analysis/plant_aerials.py [--all] [slug ...]

The key is the same LINZ Basemaps key as the Cloudflare build variable (accounts: basemaps.linz.govt.nz). It is never
committed. About 100 tile requests per plant.
"""
import csv
import io
import math
import os
import sys
import time
import tomllib
import urllib.request
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from zoneinfo import ZoneInfo

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLANTS = os.path.join(ROOT, 'facilities', 'plants')
CSV = os.path.join(ROOT, 'facilities', 'plant_aerials.csv')
OUT = os.path.join(ROOT, 'site', 'static', 'plants', 'aerial')
FIELDS = ['slug', 'view', 'file', 'lat', 'lon', 'zoom', 'across_m', 'imagery', 'fetched']
VIEWS = {'site': 18, 'close': 17, 'wide': 14}
W, H = 1000, 640
QUALITY = 62
BASE = 'https://basemaps.linz.govt.nz/v1/tiles/aerial/WebMercatorQuad'


def published(e):
    return bool(e and e.get('checked'))


def px(lat, lon, z):
    """Web Mercator pixel coordinates of a point at zoom z (256 px tiles)."""
    n = 256 * 2 ** z
    s = math.sin(math.radians(lat))
    return (lon + 180) / 360 * n, (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * n


def across_m(lat, z):
    return round(W * 156543.03392 * math.cos(math.radians(lat)) / 2 ** z, -1)


class Tiles:
    def __init__(self, key):
        self.key = key
        self.cache = {}

    def get(self, z, x, y):
        k = (z, x, y)
        if k not in self.cache:
            url = f'{BASE}/{z}/{x}/{y}.webp?api={self.key}'
            for attempt in range(4):
                try:
                    with urllib.request.urlopen(url, timeout=30) as r:
                        self.cache[k] = Image.open(io.BytesIO(r.read())).convert('RGB')
                    break
                except Exception:
                    if attempt == 3:
                        raise
                    time.sleep(1 + attempt)
        return self.cache[k]

    def attribution(self):
        with urllib.request.urlopen(f'{BASE}/attribution.json?api={self.key}', timeout=60) as r:
            return json.load(r)


def inside(lon, lat, ring):
    c = False
    for i in range(len(ring)):
        (x1, y1), (x2, y2) = ring[i], ring[i - 1]
        if (y1 > lat) != (y2 > lat) and lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
            c = not c
    return c


def imagery(attr, lat, lon, z):
    """Title of the highest-priority aerial collection covering the point at zoom z."""
    cols = {c['id']: c for c in attr['collections']}
    best = None
    for f in attr['features']:
        s = cols[f['collection']]['summaries']
        if not any(w in s.get('linz:category', '') for w in ('Imagery', 'Aerial')):
            continue
        zz = s.get('linz:zoom', {})
        b = f['bbox']
        if not (zz.get('min', 0) <= z <= zz.get('max', 32) and b[0] <= lon <= b[2] and b[1] <= lat <= b[3]):
            continue
        if any(inside(lon, lat, poly[0]) for poly in f['geometry']['coordinates']):
            p = s.get('linz:priority', [0])[0]
            if best is None or p > best[0]:
                best = (p, cols[f['collection']]['title'])
    return best[1] if best else ''


def render(tiles, centre, z, marks):
    cx, cy = px(*centre, z)
    x0, y0 = cx - W / 2, cy - H / 2
    keys = [(z, tx, ty) for tx in range(int(x0 // 256), int((x0 + W) // 256) + 1)
            for ty in range(int(y0 // 256), int((y0 + H) // 256) + 1)]
    with ThreadPoolExecutor(6) as ex:
        got = list(ex.map(lambda k: tiles.get(*k), keys))
    img = Image.new('RGB', (W, H))
    for (_, tx, ty), t in zip(keys, got):
        img.paste(t, (round(tx * 256 - x0), round(ty * 256 - y0)))
    d = ImageDraw.Draw(img)
    for p in marks:
        mx, my = px(*p, z)
        mx, my = mx - x0, my - y0
        if 0 <= mx < W and 0 <= my < H:
            r = 8
            d.ellipse((mx - r, my - r, mx + r, my + r), outline='white', width=5)
            d.ellipse((mx - r, my - r, mx + r, my + r), outline='#e0312b', width=3)
    out = io.BytesIO()
    img.save(out, 'WEBP', quality=QUALITY, method=6)
    return out.getvalue()


def read_rows():
    if not os.path.exists(CSV):
        return []
    with open(CSV, newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))


def main(args):
    everything = '--all' in args
    only = {a for a in args if not a.startswith('--')}
    key = os.environ.get('LINZ_BASEMAPS_KEY')
    if not key:
        sys.exit('Set LINZ_BASEMAPS_KEY (the LINZ Basemaps key; never commit it).')
    tiles = Tiles(key)
    attr = tiles.attribution()
    rows = {(r['slug'], r['view']): r for r in read_rows()}
    today = datetime.now(ZoneInfo('Pacific/Auckland')).date().isoformat()
    keep = set()
    os.makedirs(OUT, exist_ok=True)
    for name in sorted(os.listdir(PLANTS)):
        if not name.endswith('.toml'):
            continue
        with open(os.path.join(PLANTS, name), 'rb') as f:
            p = tomllib.load(f)
        s, loc = p['slug'], p.get('location')
        if not published(loc):
            continue
        lat, lon = loc['value']
        marks = [loc['value']] + [st['location'] for st in p.get('stations', []) if st.get('location')]
        jobs = [(view, z, (lat, lon), [] if view == 'site' else marks) for view, z in VIEWS.items()]
        # a station standing on the plant's own point is that view already; only the others need an image
        jobs += [(f's{i}', VIEWS['site'], tuple(st['location']), []) for i, st in enumerate(p.get('stations', []), 1)
                 if published(st) and st.get('location') and list(st['location']) != list(loc['value'])]
        for view, z, (lat, lon), mk in jobs:
            keep.add((s, view))
            file = f'aerial/{s}-{view}.webp'
            old = rows.get((s, view))
            fresh = (old and float(old['lat']) == lat and float(old['lon']) == lon
                     and os.path.exists(os.path.join(OUT, f'{s}-{view}.webp')))
            if (only and s not in only) or (fresh and not everything and s not in only):
                continue
            data = render(tiles, (lat, lon), z, mk)
            with open(os.path.join(OUT, f'{s}-{view}.webp'), 'wb') as f:
                f.write(data)
            rows[(s, view)] = {'slug': s, 'view': view, 'file': file, 'lat': lat, 'lon': lon, 'zoom': z,
                               'across_m': int(across_m(lat, z)), 'imagery': imagery(attr, lat, lon, z), 'fetched': today}
            print(f'{s} {view}: {len(data) // 1024} KB, {rows[(s, view)]["imagery"]}')
    for k in sorted(set(rows) - keep):
        path = os.path.join(OUT, f'{k[0]}-{k[1]}.webp')
        if os.path.exists(path):
            os.remove(path)
        del rows[k]
        print(f'{k[0]} {k[1]}: removed (no checked location)')
    order = list(VIEWS)
    rank = lambda v: order.index(v) if v in order else len(order) + int(v[1:])
    with open(CSV, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, lineterminator='\n')
        w.writeheader()
        for k in sorted(rows, key=lambda k: (k[0], rank(k[1]))):
            w.writerow(rows[k])


if __name__ == '__main__':
    main(sys.argv[1:])
