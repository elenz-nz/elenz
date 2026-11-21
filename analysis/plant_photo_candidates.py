"""Photo candidates for plants with no photo yet, from Wikidata (CC0) and Wikimedia Commons.

For each plant file with a `wikidata` ID and no row in facilities/plant_images.csv, reads the item's image (P18) and
Commons category (P373) from Wikidata, then the image's licence, author and size from Commons. Prints one line per
candidate; it writes nothing. A person (or the batch's chat) picks which to use and reads the licence on the file's own
page before adding a row (facilities/PLANTS.md, Rules). Only CC BY, CC BY-SA, CC0 and public domain qualify.

Commons rate-limits this workspace (HTTP 429), so it sends few, batched requests with a pause between them and backs
off when asked to (a Retry-After header, else a minute).

  python3 analysis/plant_photo_candidates.py [--commons-category] [slug ...]

--commons-category also lists each category's own files (one request per plant; slower).
"""
import csv
import json
import os
import re
import sys
import time
import tomllib
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'ElenzBot/1.0 (https://elenz.co.nz; hello@elenz.co.nz)'
OK = ('CC BY', 'CC0', 'Public domain', 'CC BY-SA')


def get(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            return json.load(urllib.request.urlopen(req, timeout=60))
        except urllib.error.HTTPError as e:
            if e.code != 429 or i == tries - 1:
                raise
            wait = int(e.headers.get('Retry-After') or 60)
            print(f'429: waiting {wait} s', file=sys.stderr)
            time.sleep(wait)


def api(host, **p):
    p['format'] = 'json'
    return get(f'https://{host}/w/api.php?' + urllib.parse.urlencode(p))


def plants(only):
    have = {r['slug'] for r in csv.DictReader(open(os.path.join(ROOT, 'facilities', 'plant_images.csv')))}
    out = []
    folder = os.path.join(ROOT, 'facilities', 'plants')
    for f in sorted(os.listdir(folder)):
        if not f.endswith('.toml'):
            continue
        d = tomllib.load(open(os.path.join(folder, f), 'rb'))
        if only and d['slug'] not in only:
            continue
        if d['slug'] in have or not d.get('wikidata'):
            continue
        wd = d['wikidata']
        for q in ([wd] if isinstance(wd, str) else wd):
            out.append((d['slug'], q))
    return out


def info(titles):
    """Licence, author, size and 1280 px thumbnail of Commons files, 40 titles a request."""
    res = {}
    for i in range(0, len(titles), 40):
        time.sleep(4)
        d = api('commons.wikimedia.org', action='query', titles='|'.join(titles[i:i + 40]), prop='imageinfo',
                iiprop='extmetadata|size|url', iiurlwidth=1280,
                iiextmetadatafilter='LicenseShortName|Artist|DateTimeOriginal|Restrictions')
        for p in d['query']['pages'].values():
            ii = (p.get('imageinfo') or [{}])[0]
            m = ii.get('extmetadata', {})
            g = lambda k: re.sub('<[^>]+>', '', m.get(k, {}).get('value', '')).strip()
            res[p['title']] = dict(licence=g('LicenseShortName'), author=g('Artist')[:80], w=ii.get('width'),
                                   h=ii.get('height'), thumb=ii.get('thumburl'), restrictions=g('Restrictions'))
    return res


def main():
    args = sys.argv[1:]
    cats = '--commons-category' in args
    only = {a for a in args if not a.startswith('--')}
    todo = plants(only)
    claims = {}
    for i in range(0, len(todo), 40):
        d = api('www.wikidata.org', action='wbgetentities', ids='|'.join(q for _, q in todo[i:i + 40]),
                props='claims', )
        for q, e in d['entities'].items():
            c = e.get('claims', {})
            val = lambda pid: [x['mainsnak']['datavalue']['value'] for x in c.get(pid, [])
                               if 'datavalue' in x['mainsnak']]
            claims[q] = dict(image=val('P18'), category=val('P373'))
        time.sleep(2)
    files = sorted({'File:' + f for v in claims.values() for f in v['image']})
    meta = info(files) if files else {}
    for slug, q in todo:
        v = claims.get(q, {})
        for f in v.get('image', []):
            m = meta.get('File:' + f.replace('_', ' '), {})
            flag = 'OK ' if m.get('licence', '').startswith(OK) else 'NO '
            print(f"{flag}{slug}\t{q}\tP18\t{f}\t{m.get('licence')}\t{m.get('author')}\t{m.get('w')}x{m.get('h')}")
        for c in v.get('category', []):
            print(f'   {slug}\t{q}\tP373\tCategory:{c}')
            if cats:
                time.sleep(4)
                d = api('commons.wikimedia.org', action='query', generator='categorymembers',
                        gcmtitle='Category:' + c, gcmtype='file', gcmlimit='30', prop='imageinfo',
                        iiprop='extmetadata|size', iiextmetadatafilter='LicenseShortName|Artist')
                for p in (d.get('query', {}).get('pages') or {}).values():
                    ii = (p.get('imageinfo') or [{}])[0]
                    m = ii.get('extmetadata', {})
                    g = lambda k: re.sub('<[^>]+>', '', m.get(k, {}).get('value', '')).strip()
                    print(f"      {p['title'][5:]}\t{g('LicenseShortName')}\t{g('Artist')[:50]}\t{ii.get('width')}x{ii.get('height')}")
        if not v.get('image') and not v.get('category'):
            print(f'   {slug}\t{q}\tno image or category on Wikidata')


if __name__ == '__main__':
    main()
