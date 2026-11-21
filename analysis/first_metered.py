"""First metered output for every generator code, for the plant pages' commissioned date (design decisions,
21 Nov 2026; facilities/PLANTS.md, "Which date commissioned gives").

For a plant metered from the start, the page's `commissioned` fact is the first half-hour of output in the EA's metered
generation: Generation_MD, or the embedded meter for a plant without its own row. This reads every monthly
Generation_MD file (Aug 1997 on) and Embedded_generation file (Oct 1998 on) and writes, for each (connection point,
generator code) and each embedded connection point and participant (injection only), the first month it appears, the
first trading period with any output, the first with at least 1 MW, and the first day with at least 1 MWh (all in NZ
time).

  python3 analysis/first_metered.py [out.csv]          (default data/first_metered.csv)

Downloads are cached in data/raw/metered/ (~1 GB for everything). Read the result with care:
  - Generation_MD covers embedded stations only from Jan 2009, and Embedded_generation starts in Oct 1998 and misses
    some stations before Apr 1999, so a first month at the start of either file is where the data begins, not when the
    plant began.
  - An embedded connection point can carry several stations and load: its first output is the first station's.
  - A first trading period with a few kWh weeks before the plant ran properly is usually a test; the 1 MW and 1 MWh
    columns show when it began running.
"""
import csv
import os
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'ingest'))
import metered as mt  # noqa: E402
from common import BLOB, NZ  # noqa: E402

CACHE = os.path.join(ROOT, 'data', 'raw', 'metered')


def get(url):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, url.rsplit('/', 1)[-1])
    if os.path.exists(path):
        return open(path, 'rb').read() or None
    try:
        raw = urllib.request.urlopen(url, timeout=600).read()
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
        raw = b''
    open(path, 'wb').write(raw)
    return raw or None


def months():
    m, today = date(1997, 8, 1), date.today()
    while m <= today:
        yield m
        m = date(m.year + (m.month == 12), m.month % 12 + 1, 1)


def firsts(m, kind):
    """{key: (month, first>0, first>=1MW, first day>=1MWh)} for one month's file."""
    tag = f'{m:%Y%m}'
    if kind == 'G':
        raw = get(f'{BLOB}/{mt.GMD}/{tag}_Generation_MD.csv')
    else:
        raw = get(f'{BLOB}/{mt.MD}/Embedded_generation/{tag}_Embedded_generation.csv')
    if raw is None:
        return {}
    d = mt.read_emi(raw)
    d['t'] = d.t.dt.tz_convert(NZ)
    if kind == 'G':
        d['key'] = 'G|' + d.poc_code + '|' + d.gen_code.astype(str)
    else:
        d = d[d.flow_direction == 'I']
        d['key'] = 'E|' + d.poc + '|' + d.participant_code.astype(str)
    out = {}
    for k, g in d.groupby('key'):
        g = g.groupby('t').mw.sum().sort_index()
        pos, big = g[g > 0], g[g >= 1]
        day = g.resample('D').sum() * 0.5
        day = day[day >= 1]
        out[k] = (f'{m:%Y-%m}',
                  f'{pos.index[0]:%Y-%m-%d %H:%M}' if len(pos) else '',
                  f'{big.index[0]:%Y-%m-%d %H:%M}' if len(big) else '',
                  f'{day.index[0]:%Y-%m-%d}' if len(day) else '')
    return out


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'data', 'first_metered.csv')
    jobs = [(m, 'G') for m in months()] + [(m, 'E') for m in months() if m >= date(1998, 10, 1)]
    seen = {}
    with ThreadPoolExecutor(4) as ex:
        for (m, kind), res in zip(jobs, ex.map(lambda j: firsts(*j), jobs)):
            for k, (month, pos, big, day) in res.items():
                r = seen.setdefault(k, {'key': k, 'first_month': month, 'first_output': '', 'first_1mw': '',
                                        'first_1mwh_day': ''})
                for col, v in (('first_output', pos), ('first_1mw', big), ('first_1mwh_day', day)):
                    if v and not r[col]:
                        r[col] = v
            print(f'{m:%Y-%m} {kind}', file=sys.stderr, flush=True)
    with open(out, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, ['key', 'first_month', 'first_output', 'first_1mw', 'first_1mwh_day'])
        w.writeheader()
        for k in sorted(seen):
            w.writerow(seen[k])
    print(f'{len(seen)} keys -> {out}', file=sys.stderr)


if __name__ == '__main__':
    main()
