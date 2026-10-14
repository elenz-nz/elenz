"""History: half-hourly generation, prices and demand since 10 September 2020, from the EA's daily dispatch files.

The daily NodalPricesAndVolumes files (the same RTD cases as the live feed) start on 10 Sep 2020 and arrive
1-4 days late. Each run fetches any published days that aren't stored yet, oldest first, within a time budget,
so the first run backfills everything and later runs add the newest days.

Stored (Cloudflare KV in GitHub Actions, data/store locally), one set per NZ calendar month:
  hist/state/YYYY-MM.csv.gz  half-hourly compact state: unit MW, island load, Tiwai, reference prices (state.py
                             columns averaged over each trading period), n = 5-minute intervals present (0-6),
                             R|NI and R|SI = island-weighted irradiance (W/m², Open-Meteo) for rooftop solar
  hist/hh/YYYY-MM.json       the month in the tracker.json layout, half-hourly (the website's 30-day view)
  hist/dd/YYYY-MM.json       daily averages for the month, plus each day's peak demand
and across all months:
  hist/day.json              every day since 2020 (the 1-year and all-time views)
  hist/index.json            months stored, first and last time (published once the backfill has caught up)
  hist/progress.json         the job's own record: months stored and finished, and the plant mapping used
  hist/solar_capacity.csv    EA report GUEHMT: installed distributed solar by month (rooftop solar model)

The JSON is rebuilt from the stored state when the plant register, overrides or this file's BUILD number change,
so mapping fixes apply to history as they do to the live page.

Run from the repo root:  python3 ingest/history.py [--budget MINUTES] [--rebuild] [--from YYYY-MM-DD]
"""
import hashlib
import io
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import numpy as np
import pandas as pd

import state as st
from build_tracker import KEYS, ROOF_CAP, ROOF_PR, ROOF_W, assemble, enc
from common import BLOB, FACILITIES, NZ
from store import open_store
from sync import CITIES, DISPATCH

BUILD = 1                    # bump to rebuild every month's JSON after changing how it is built
FIRST_DAY = date(2020, 9, 10)
STEP = pd.Timedelta(minutes=30)
WORKERS = 6
GUEHMT = ('https://www.emi.ea.govt.nz/Retail/Download/DataReport/CSV/GUEHMT?DateFrom=20130101&DateTo={to}'
          '&_rsdr=ALL&RegionType=NZ&FuelType=solar_all&MarketSegment=All&Capacity=All_Total&Show=Cap_Total&_si=v|3')


def get(url, timeout=120):
    for attempt in range(4):
        try:
            with urlopen(Request(url, headers={'Accept-Encoding': 'identity', 'User-Agent': 'elenz-history'}), timeout=timeout) as r:
                return r.read()
        except HTTPError as e:
            if e.code == 404:
                return None
            if attempt == 3:
                raise
            if e.code == 429:  # rate limited (Open-Meteo): wait out the minute
                time.sleep(65)
                continue
        except (URLError, TimeoutError, ConnectionError):
            if attempt == 3:
                raise
        time.sleep(2 ** attempt)


# ---------- one day: daily dispatch file -> half-hourly state rows ----------

def fetch_day(d):
    """Half-hourly state rows for one trading date, or None if the file isn't published (yet)."""
    raw = get(f'{BLOB}/{DISPATCH}/{d.year}/{d:%Y%m%d}_DispatchNodalPricesAndVolumes.csv')
    if raw is None:
        return None
    s = st.compact(pd.read_csv(io.BytesIO(raw), keep_default_na=False), 'file').drop(columns='src')
    tp = s.index.floor('30min')
    out = s.groupby(tp).mean()
    out.insert(0, 'n', s.groupby(tp).size())
    out.index.name = 't'
    return out


# ---------- rooftop solar inputs ----------

def irradiance(start, end):
    """Island-weighted irradiance (W/m²) per trading period from start to end (UTC timestamps), from Open-Meteo:
    the ERA5 archive, with the forecast service's recent past filling the archive's last ~5 days. Periods neither
    service could supply are NaN, and are retried on later runs (see main)."""
    lat = ','.join(str(c[0]) for c in CITIES)
    lon = ','.join(str(c[1]) for c in CITIES)
    d0, d1 = (start - pd.Timedelta(hours=2)).date(), (end + pd.Timedelta(hours=2)).date()
    q = f'latitude={lat}&longitude={lon}&start_date={d0}&end_date={d1}&hourly=shortwave_radiation&timezone=GMT'
    frames = []
    bases = ['https://archive-api.open-meteo.com/v1/archive']
    if end > pd.Timestamp.now(tz='UTC') - pd.Timedelta(days=80):  # the forecast service keeps ~3 months of past data
        bases.append('https://api.open-meteo.com/v1/forecast')
    for base in bases:
        try:
            locs = json.loads(get(f'{base}?{q}'))
        except Exception as e:  # the forecast service only reaches ~3 months back; the archive covers the rest
            print(f'  irradiance: {base.split("/")[2]} unavailable for {d0}..{d1} ({e})')
            continue
        idx = pd.DatetimeIndex(pd.to_datetime(locs[0]['hourly']['time'])).tz_localize('UTC')
        frames.append(pd.DataFrame({i: pd.Series(l['hourly']['shortwave_radiation'], index=idx, dtype=float) for i, l in enumerate(locs)}))
    tps = pd.date_range(start, end, freq='30min')
    if not frames:
        return pd.DataFrame({'R|NI': np.nan, 'R|SI': np.nan}, index=pd.DatetimeIndex(tps, name='t'))
    ghi = frames[0]
    for f in frames[1:]:
        ghi = ghi.combine_first(f)
    # an hourly value is the mean over the preceding hour, so it belongs to the half-way point
    ghi.index = ghi.index - pd.Timedelta(minutes=30)
    tps = tps + pd.Timedelta(minutes=15)
    out = {}
    for isl in ('NI', 'SI'):
        cols = [i for i, (i2, _) in enumerate(ROOF_W) if i2 == isl]
        w = np.array([ROOF_W[i][1] for i in cols])
        series = (ghi[cols] * w).sum(axis=1, min_count=len(cols)) / w.sum()
        series = series.reindex(series.index.union(tps)).interpolate(limit_area='inside', limit=3).reindex(tps)
        out[f'R|{isl}'] = series.clip(lower=0).values
    return pd.DataFrame(out, index=pd.DatetimeIndex(tps - pd.Timedelta(minutes=15), name='t'))


def solar_capacity(store):
    """Installed distributed solar MW by month (EA report GUEHMT), as {'YYYY-MM': MW}. Kept in the store so a
    failed download falls back to the last copy."""
    raw = None
    try:
        raw = get(GUEHMT.format(to=date.today().strftime('%Y%m%d')))
        fresh = parse_capacity(raw)
        old = store.get('hist/solar_capacity.csv')
        if old is None or parse_capacity(old) != fresh:  # KV writes are limited: only save a changed report
            store.put('hist/solar_capacity.csv', raw, 'text/csv')
    except Exception as e:
        print('solar capacity download failed, using the stored copy:', e)
        raw = store.get('hist/solar_capacity.csv')
    if raw is None:
        raise SystemExit('No solar capacity data (EMI report GUEHMT).')
    return parse_capacity(raw)


def parse_capacity(raw):
    lines = raw.decode('utf-8-sig').splitlines()
    head = next(i for i, l in enumerate(lines) if l.startswith('Month end,'))
    df = pd.read_csv(io.StringIO('\n'.join(lines[head:])))
    col = next(c for c in df.columns if c.startswith('Total capacity installed'))
    months = pd.to_datetime(df['Month end'], dayfirst=True).dt.strftime('%Y-%m')
    cap = dict(zip(months, df[col].astype(float)))
    if len(cap) < 12:
        raise ValueError('solar capacity report looks incomplete')
    return cap


def roof_mw(cap, month):
    """Rooftop solar capacity by island for a month: the EA's installed distributed solar, capped at the live
    page's assumed total (build_tracker.ROOF_CAP) so history and the live week agree where they meet."""
    known = sorted(cap)
    m = month if month in cap else (known[-1] if month > known[-1] else known[0])
    total = min(cap[m], sum(ROOF_CAP.values()))
    return {isl: total * v / sum(ROOF_CAP.values()) for isl, v in ROOF_CAP.items()}


# ---------- one month: state -> tracker-layout JSON and daily summary ----------

def build_month(s, month, roof_cap, log):
    """Half-hourly state for one month -> (hh JSON, dd JSON)."""
    s = s.sort_index()
    have = s.index[s.n > 0]
    full = pd.date_range(have.min(), have.max(), freq='30min')
    g = s.reindex(full).copy()
    g['src'] = np.where(g.n > 0, 'file', None)
    roof = {isl: (roof_cap[isl] * g[f'R|{isl}'].interpolate(limit_direction='both').fillna(0) / 1000 * ROOF_PR) for isl in ('NI', 'SI')}
    js = assemble(g, full, roof, log)
    n = g.n.fillna(0)
    js['meta'] = {'month': month, 'intervals': int((n > 0).sum()), 'expected': len(full),
                  'five_min': round(float(n.sum() / (6 * len(full))), 4), 'roof_mw': round(sum(roof_cap.values())),
                  'end': js['t0'] + (len(full) - 1) * js['step']}
    return js, daily(js, month)


def daily(js, month):
    """Daily averages (MW) of a half-hourly month, each day keyed by its NZ local midnight, plus daily peaks."""
    t = pd.to_datetime(js['t0'] + np.arange(js['N']) * js['step'], unit='ms', utc=True)
    day = t.tz_convert(NZ).normalize()
    days = day.unique()
    mean = lambda arr, dp=0: enc(pd.Series(arr, index=day, dtype=float).groupby(level=0).mean().reindex(days), dp)
    out = {'month': month, 'end': js['meta']['end'], 't': [int(d.tz_convert('UTC').timestamp() * 1000) for d in days],
           'h': [float(x) for x in pd.Series(0.5, index=day).groupby(level=0).sum().reindex(days)],
           'hvdcN': mean(js['hvdcN'])}
    for isl in ('NI', 'SI'):
        out[isl] = {k: mean(v, 2 if k == 'price' else 0) for k, v in js[isl].items()}
    peak = {}
    for k in ('metered', 'underlying'):
        ni, si = np.array(js['NI'][k], float), np.array(js['SI'][k], float)
        for r, arr in (('NZ', ni + si), ('NI', ni), ('SI', si)):
            peak.setdefault(r, {})[k] = enc(pd.Series(arr, index=day).groupby(level=0).max().reindex(days))
    out['peak'] = peak
    out['plants'] = []
    for p in js['plants']:
        q = {k: p[k] for k in ('name', 'fuel', 'isl', 'poc', 'cap')}
        q['s'] = mean(p['s'])
        if 'units' in p:
            q['units'] = [{'name': u['name'], 'cap': u['cap'], 's': mean(u['s'])} for u in p['units']]
        out['plants'].append(q)
    return out


def combine_days(dds):
    """Monthly daily summaries (oldest first) -> one daily series for the whole history."""
    n = sum(len(d['t']) for d in dds)
    out = {'t': [], 'h': [], 'hvdcN': [], 'NI': {}, 'SI': {}, 'peak': {}, 'plants': []}
    plants, pos = {}, 0
    for d in dds:
        m = len(d['t'])
        out['t'] += d['t']; out['h'] += d['h']; out['hvdcN'] += d['hvdcN']
        for isl in ('NI', 'SI'):
            for k, v in d[isl].items():
                out[isl].setdefault(k, [0] * pos)
                out[isl][k] += v
        for r, kv in d['peak'].items():
            for k, v in kv.items():
                out['peak'].setdefault(r, {}).setdefault(k, [0] * pos)
                out['peak'][r][k] += v
        for p in d['plants']:
            key = (p['name'], p['fuel'], p['isl'])
            q = plants.get(key)
            if q is None:
                q = plants[key] = {'name': p['name'], 'fuel': p['fuel'], 'isl': p['isl'], 'poc': [], 'cap': None,
                                   's': np.zeros(n), 'units': {}}
            q['s'][pos:pos + m] = p['s']
            q['poc'] = sorted(set(q['poc']) | set(p['poc']))
            q['cap'] = p['cap'] if p['cap'] is not None else q['cap']   # the latest month's capacity
            for u in p.get('units', []):
                q['units'].setdefault(u['name'], {'name': u['name'], 'cap': u['cap'], 's': np.zeros(n)})['s'][pos:pos + m] = u['s']
        pos += m
        for isl in ('NI', 'SI'):  # a series missing from a month (no output anywhere) is zero
            for k, v in out[isl].items():
                v += [0] * (pos - len(v))
    out['N'] = n
    for q in plants.values():
        entry = {k: q[k] for k in ('name', 'fuel', 'isl', 'poc', 'cap')}
        entry['s'] = enc(q['s'])
        if len(q['units']) > 1:
            entry['units'] = [{'name': u['name'], 'cap': u['cap'], 's': enc(u['s'])} for u in sorted(q['units'].values(), key=lambda u: u['name'])]
        out['plants'].append(entry)
    out['plants'].sort(key=lambda p: (p['fuel'], -sum(p['s'])))
    return out


# ---------- the job ----------

def months_between(d0, d1):
    m = date(d0.year, d0.month, 1)
    while m <= d1:
        yield m
        m = date(m.year + (m.month == 12), m.month % 12 + 1, 1)


def month_days(m, last_day):
    nxt = date(m.year + (m.month == 12), m.month % 12 + 1, 1)
    d = max(m, FIRST_DAY)
    while d < nxt and d <= last_day:
        yield d
        d += timedelta(days=1)


def mapping_hash():
    h = hashlib.sha256(f'build {BUILD}'.encode())
    for f in ('plant_register.csv', 'overrides.toml', 'connection_points.csv'):
        with open(os.path.join(FACILITIES, f), 'rb') as fh:
            h.update(fh.read())
    return h.hexdigest()[:16]


def load_state(store, key):
    raw = store.get(key)
    if not raw:
        return None
    s = pd.read_csv(io.BytesIO(raw), compression='gzip', index_col='t')
    s.index = pd.to_datetime(s.index, utc=True)
    return s


def dump_state(s):
    buf = io.BytesIO()
    s.to_csv(buf, compression={'method': 'gzip', 'mtime': 0}, float_format='%.3f', index_label='t')
    return buf.getvalue()


def put_json(store, key, obj):
    store.put(key, json.dumps(obj, separators=(',', ':'), allow_nan=False).encode(), 'application/json')


def main(budget_min=300, rebuild=False, start=None, log=print):
    t_start = time.time()
    if os.environ.get('GITHUB_ACTIONS') and not all(os.environ.get(k) for k in ('CF_ACCOUNT_ID', 'CF_API_TOKEN')):
        print('::notice::Skipped: add the CF_ACCOUNT_ID and CF_API_TOKEN secrets to turn on history updates.')
        return
    store = open_store()
    # the job's own record of what's stored; hist/index.json is the public copy, written once history is complete
    index = json.loads(store.get('hist/progress.json') or b'{}')
    mhash = mapping_hash()
    rebuild = rebuild or index.get('hash') != mhash
    cap = solar_capacity(store)
    yesterday = datetime.now(NZ).date() - timedelta(days=1)
    caps_before = index.get('roof_mw', {})
    stored = set(index.get('months', []))
    done = set(index.get('done', [])) if not rebuild else set()   # complete months: nothing left to fetch
    changed_dd = {}
    out_of_time = False
    repairs = 0

    for m in months_between(start or FIRST_DAY, yesterday):
        month = f'{m:%Y-%m}'
        key = f'hist/state/{month}.csv.gz'
        rc = roof_mw(cap, month)
        if month in done and month in stored and caps_before.get(month) == round(sum(rc.values())):
            continue
        s = load_state(store, key)
        have_days = set(s.index.tz_convert(NZ).date) if s is not None else set()
        todo = [d for d in month_days(m, yesterday) if d not in have_days]
        new = []
        if todo and not out_of_time:
            if time.time() - t_start > budget_min * 60:
                out_of_time = True
                log(f'time budget used; {month} onwards is left for the next run')
            else:
                with ThreadPoolExecutor(WORKERS) as ex:
                    new = [x for x in ex.map(fetch_day, todo) if x is not None]
        if new:
            add = pd.concat(new).sort_index()
            add = add.join(irradiance(add.index.min(), add.index.max()))
            s = add if s is None else pd.concat([s[~s.index.isin(add.index)], add]).sort_index()
        if s is None or s.empty:
            continue
        gaps = s.index[s['R|NI'].isna() | s['R|SI'].isna()]
        fixed = False
        if len(gaps) and not new and repairs < 12 and not out_of_time:
            # irradiance a previous run couldn't get (Open-Meteo rate limit or outage): try again
            repairs += 1
            r = irradiance(gaps.min(), gaps.max())
            before = int(s[['R|NI', 'R|SI']].isna().sum().sum())
            s.loc[gaps, ['R|NI', 'R|SI']] = r.reindex(gaps).values
            fixed = int(s[['R|NI', 'R|SI']].isna().sum().sum()) < before
        if new or fixed:
            store.put(key, dump_state(s))
            missing_r = int(s['R|NI'].isna().sum())
            log(f'{month}: +{len(new)} days ({len(todo) - len(new)} not published yet), {len(set(s.index.tz_convert(NZ).date))} days stored'
                + (f'; irradiance missing for {missing_r} trading periods, retried next run' if missing_r else ''))
        last_day = list(month_days(m, yesterday))[-1:]
        if (last_day and last_day[0] < yesterday - timedelta(days=14) and
                not s[['R|NI', 'R|SI']].isna().any().any() and len(set(s.index.tz_convert(NZ).date)) == len(list(month_days(m, yesterday)))):
            done.add(month)  # every day stored, irradiance complete, and the month long over
        if new or fixed or rebuild or month not in stored or caps_before.get(month) != round(sum(rc.values())):
            hh, dd = build_month(s, month, rc, lambda *a: log(f'  {month}:', *a))
            put_json(store, f'hist/hh/{month}.json', hh)
            put_json(store, f'hist/dd/{month}.json', dd)
            changed_dd[month] = dd
            stored.add(month)
            caps_before[month] = hh['meta']['roof_mw']

    if not changed_dd:
        log('history: nothing new')
        return
    months = sorted(stored)
    progress = {'months': months, 'done': sorted(done), 'hash': mhash, 'roof_mw': caps_before}
    put_json(store, 'hist/progress.json', progress)
    if out_of_time:
        # months are saved as they're done; publish the combined files only once there are no gaps
        log(f'history: {len(changed_dd)} months saved; the rest continues next run')
        return
    dds = [changed_dd.get(mo) or json.loads(store.get(f'hist/dd/{mo}.json')) for mo in months]
    day = combine_days(dds)
    end = dds[-1]['end']
    day['meta'] = {'first': day['t'][0], 'end': end, 'built': int(time.time() * 1000)}
    put_json(store, 'hist/day.json', day)
    index = {**progress, 'first': day['t'][0], 'end': end, 'built': int(time.time() * 1000)}
    put_json(store, 'hist/index.json', index)
    log(f'history: {len(months)} months, {day["N"]} days to {pd.Timestamp(index["end"], unit="ms", tz="UTC").tz_convert(NZ)}, '
        f'{len(changed_dd)} months rebuilt in {time.time() - t_start:.0f} s')


if __name__ == '__main__':
    a = sys.argv[1:]
    budget = float(a[a.index('--budget') + 1]) if '--budget' in a else 300
    frm = date.fromisoformat(a[a.index('--from') + 1]) if '--from' in a else None
    main(budget, '--rebuild' in a, frm)
