"""Fetch and add plant photos from Wikimedia Commons.

Two steps, so a person looks at each picture and its licence before it goes in:

  python3 analysis/plant_photos.py fetch picks.json OUTDIR
      picks.json is a list of {"slug", "file" (a Commons file name, with or without "File:"), "n" (1 for the plant's
      first photo, 2 for <slug>-2.webp, and so on), "title" (the caption, in our words)}. Downloads each file's
      1280 px thumbnail (a standard width; Commons rate-limits other sizes; a file that is no wider is taken as it is) into OUTDIR, a few seconds apart, and
      writes OUTDIR/meta.json with the licence, author and file page Commons reports. Only CC BY, CC BY-SA, CC0 and
      public domain pass; anything else is refused.

  python3 analysis/plant_photos.py add OUTDIR
      Converts each fetched picture to WebP (at most 1,600 px wide, quality 75) at site/static/plants/<slug>.webp
      (<slug>-2.webp ...) and adds its row to facilities/plant_images.csv. Run it after the licences have been read on the
      file pages (the file page is `source_url` in the row). Then run ingest/plant_files.py --check,
      ingest/plant_pages.py and ingest/plant_research.py (PLANTS.md, Checking a plant).

Commons returns HTTP 429 to this workspace when asked too fast: the script waits as the response says (default a
minute) and tries again.
"""
import csv
import datetime
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV = os.path.join(ROOT, 'facilities', 'plant_images.csv')
STATIC = os.path.join(ROOT, 'site', 'static', 'plants')
UA = 'ElenzBot/1.0 (https://elenz.co.nz; hello@elenz.co.nz)'
LICENCES = {
    'CC BY': 'by', 'CC BY-SA': 'by-sa',
}
FIELDS = ['slug', 'file', 'title', 'author', 'source_url', 'licence', 'licence_url', 'checked', 'crop']


def fetch_url(url, tries=4):
    for i in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=90).read()
        except urllib.error.HTTPError as e:
            if e.code != 429 or i == tries - 1:
                raise
            wait = int(e.headers.get('Retry-After') or 60)
            print(f'429: waiting {wait} s', file=sys.stderr)
            time.sleep(wait)


def licence_ok(name):
    return bool(re.match(r'^(CC BY(-SA)? \d\.\d( [a-z]{2})?|CC0 1\.0|Public domain)$', name or ''))


def fetch(picks_path, out):
    os.makedirs(out, exist_ok=True)
    picks = json.load(open(picks_path))
    meta = []
    for p in picks:
        title = p['file'] if p['file'].startswith('File:') else 'File:' + p['file']
        q = urllib.parse.urlencode(dict(
            action='query', format='json', titles=title, prop='imageinfo', iiprop='extmetadata|size|url',
            iiurlwidth=1280, iiextmetadatafilter='LicenseShortName|LicenseUrl|Artist|Restrictions'))
        time.sleep(4)
        d = json.loads(fetch_url('https://commons.wikimedia.org/w/api.php?' + q))
        page = next(iter(d['query']['pages'].values()))
        ii = (page.get('imageinfo') or [None])[0]
        if not ii:
            print('MISSING', title)
            continue
        m = ii['extmetadata']
        g = lambda k: re.sub('<[^>]+>', '', m.get(k, {}).get('value', '')).strip()
        lic = g('LicenseShortName')
        if not licence_ok(lic) or g('Restrictions'):
            print('REFUSED', title, lic, g('Restrictions'))
            continue
        n = p.get('n', 1)
        name = p['slug'] + ('' if n == 1 else f'-{n}')
        path = os.path.join(out, name + '.jpg')
        if not (os.path.exists(path) and os.path.getsize(path)):
            time.sleep(15)  # upload.wikimedia.org answers 429 with Retry-After: 600 after a quick run of downloads
            # A file at most 1,280 px wide has no thumbnail of that width: take the original.
            data = fetch_url(ii['url'] if ii['width'] <= 1280 else ii['thumburl'])
            open(path, 'wb').write(data)
        meta.append(dict(slug=p['slug'], n=n, name=name, title=p['title'], commons_title=page['title'],
                         author=g('Artist'), licence=lic, licence_url=g('LicenseUrl'),
                         source_url='https://commons.wikimedia.org/wiki/' + page['title'].replace(' ', '_'),
                         width=ii['width'], height=ii['height']))
        print('OK', name, lic, '|', g('Artist')[:40], '|', ii['width'], 'x', ii['height'], flush=True)
        json.dump(meta, open(os.path.join(out, 'meta.json'), 'w'), indent=1, ensure_ascii=False)


def add(out):
    meta = json.load(open(os.path.join(out, 'meta.json')))
    rows = list(csv.DictReader(open(CSV)))
    have = {r['file'] for r in rows}
    today = datetime.date.today().isoformat()
    for m in meta:
        file = m['name'] + '.webp'
        if file in have:
            print('already there', file)
            continue
        im = Image.open(os.path.join(out, m['name'] + '.jpg')).convert('RGB')
        if im.width > 1600:
            im = im.resize((1600, round(im.height * 1600 / im.width)), Image.LANCZOS)
        im.save(os.path.join(STATIC, file), 'WEBP', quality=75)
        rows.append(dict(slug=m['slug'], file=file, title=m['title'], author=m['author'], source_url=m['source_url'],
                         licence=m['licence'],
                         licence_url=m['licence_url'] or ('https://creativecommons.org/publicdomain/mark/1.0/'
                                                          if m['licence'] == 'Public domain' else ''), checked=today,
                         crop=f'none; resized to {im.width} px wide, WebP'))
        print('added', file, im.size)
    with open(CSV, 'w', newline='') as f:
        w = csv.DictWriter(f, FIELDS, lineterminator='\n')
        w.writeheader()
        w.writerows(rows)


if __name__ == '__main__':
    if len(sys.argv) == 4 and sys.argv[1] == 'fetch':
        fetch(sys.argv[2], sys.argv[3])
    elif len(sys.argv) == 3 and sys.argv[1] == 'add':
        add(sys.argv[2])
    else:
        sys.exit(__doc__)
