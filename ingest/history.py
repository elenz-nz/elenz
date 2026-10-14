"""History: half-hourly generation, prices and demand since 10 September 2020, from the EA's daily dispatch files.

The daily NodalPricesAndVolumes files (the same RTD cases as the live feed) start on 10 Sep 2020 and arrive
1-4 days late. Each run fetches any published days that aren't stored yet, oldest first, within a time budget,
so the first run backfills everything and later runs add the newest days.

Stored (Cloudflare KV in GitHub Actions, data/store locally), one set per NZ calendar month:
  hist/state/YYYY-MM.csv.gz  half-hourly compact state: unit MW, island load, Tiwai, reference prices (state.py
                             columns averaged over each trading period), n = 5-minute intervals present (0-6),
                             G|<point>, D|<point> = satellite global and diffuse irradiance (W/m², Open-Meteo,
                             Himawari) at each rooftop solar point (facilities/rooftop_points.csv),
                             F|NI and F|SI = final prices at Haywards and Benmore (fi = 1 while only interim),
                             H|BEN, H|HAY = metered HVDC transfer northward at each end (MW, once published)
  hist/hh/YYYY-MM.json       the month in the tracker.json layout, half-hourly (the website's 30-day view)
  hist/dd/YYYY-MM.json       daily averages for the month, plus each day's peak demand and peak generation
and across all months:
  hist/day.json              every day since 2020 (the 1-year and all-time views)
  hist/index.json            months stored, first and last time (published once the backfill has caught up)
  hist/progress.json         the job's own record: months stored and finished, and the plant mapping used
  hist/roof_cap.json         rooftop solar capacity by point and month (EA report GUEHMT by Root NSP, less the
                             dispatched farms it also counts); the live job reads it too

HVDC is metered (EMI HVDC_Flows) wherever published, about two weeks after each month, and estimated from the
island balances before that (hvdc.py).

Prices are the EA's final prices wherever published (monthly files for past months, daily files for the current
one, interim for the last day or two), and dispatch prices only for days not yet priced. Interim days are fetched
again until final.

The JSON is rebuilt from the stored state when the plant register, overrides or this file's BUILD number change,
so mapping fixes apply to history as they do to the live page. A rebuild that runs out of time or KV writes carries
on from where it stopped on the next run.

KV allows 1,000 writes a day (UTC) on the free plan and the live job uses ~600, so this job keeps to WRITE_BUDGET a
day, counted in hist/progress.json.

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

import warnings

import numpy as np
import pandas as pd

import hvdc
import rooftop
import state as st
from build_tracker import KEYS, assemble, enc
from common import BLOB, FACILITIES, NZ
from store import open_store
from sync import DISPATCH

warnings.simplefilter("ignore", pd.errors.PerformanceWarning)  # wide monthly frames; harmless
FINAL = 'Datasets/Wholesale/DispatchAndPricing/FinalEnergyPrices'
HVDC_FLOWS = 'Datasets/Wholesale/Metered_data/HVDC_Flows'

BUILD = 4                    # bump to rebuild every month's JSON after changing how it is built (2: final prices, 3: peak generation,
                             # 4: satellite rooftop solar model by point, metered HVDC)
GEN_FUELS = ('geo', 'coal', 'gas', 'diesel', 'hydro', 'wind', 'solar', 'roof', 'batt')
WRITE_BUDGET = 280           # KV writes a day (UTC) for this job; the live job needs ~600 of the 1,000
FIRST_DAY = date(2020, 9, 10)
IRR_MONTHS_PER_RUN = 20      # months of missing satellite irradiance fetched per run (~100 Open-Meteo calls each)
STEP = pd.Timedelta(minutes=30)
WORKERS = 6


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


# ---------- rooftop solar and HVDC inputs ----------

def irr_cols():
    pts, _ = rooftop.points()
    return [f'{k}|{p[0]}' for p in pts for k in ('G', 'D')]


def irradiance(start, end):
    """Satellite irradiance (G|<point>, D|<point>, W/m²) averaged over each trading period from start to end (UTC
    period starts). Periods the service couldn't supply (outage, rate limit, or too recent) are NaN and are fetched
    again on later runs (see main)."""
    tps = pd.date_range(start, end, freq='30min')
    today = pd.Timestamp.now(tz='UTC').date()
    d0, d1 = start.date(), min(end.date(), today)
    try:
        sat = rooftop.satellite(get, d0, d1)
    except Exception as e:
        print(f'  irradiance: satellite service unavailable for {d0}..{d1} ({e})')
        return pd.DataFrame(np.nan, index=pd.DatetimeIndex(tps, name='t'), columns=irr_cols())
    out = rooftop.half_hourly(sat, tps).reindex(columns=irr_cols())
    out.index.name = 't'
    return out


def solar_capacity(store):
    """Rooftop solar capacity by point and month (rooftop.capacity_table + by_point), saved to the store when it
    changes (the live job reads it); a failed download falls back to the stored copy, then the committed snapshot."""
    old_raw = store.get('hist/roof_cap.json')
    try:
        small, large = rooftop.download_guehmt(get, date.today())
        cap = rooftop.by_point(rooftop.capacity_table(small, large))
        body = json.dumps(cap, separators=(',', ':')).encode()
        if old_raw != body:  # KV writes are limited: only save a changed table
            store.put('hist/roof_cap.json', body, 'application/json')
        return cap
    except Exception as e:
        print('rooftop solar capacity download failed, using the stored copy:', e)
    if old_raw:
        return json.loads(old_raw)
    with open(os.path.join(FACILITIES, 'rooftop_capacity.json')) as f:
        return json.load(f)


def cap_total(cap, month):
    """Installed embedded solar at the end of a month (MW, one decimal): a change means the month needs rebuilding."""
    end = pd.Timestamp(month + '-01', tz='UTC') + pd.offsets.MonthEnd(0)
    c = rooftop.capacity_at(cap, [end])
    return round(float(sum(df.values.sum() for df in c.values())), 1)


def add_hvdc(s, m):
    """Fill in metered HVDC transfer (H|BEN, H|HAY) for month m once EMI publishes it. True if anything changed."""
    for c in ('H|BEN', 'H|HAY'):
        if c not in s:
            s[c] = np.nan
    need = s.index[s['H|BEN'].isna() | s['H|HAY'].isna()]
    if not len(need):
        return False
    raw = get(f'{BLOB}/{HVDC_FLOWS}/{m:%Y%m}_HVDC_flows.csv')
    if raw is None:
        return False
    f = hvdc.parse_metered(raw).reindex(need).dropna(how='all')
    if f.empty:
        return False
    s.loc[f.index, ['H|BEN', 'H|HAY']] = f[['H|BEN', 'H|HAY']].values
    return True


# ---------- final prices ----------

def parse_final(raw, interim=False):
    """An EA FinalEnergyPrices CSV -> rows per trading period (UTC start): F|NI, F|SI, fi."""
    from common import overrides
    ref = overrides()['reference_nodes']   # NI: HAY2201, SI: BEN2201
    d = pd.read_csv(io.BytesIO(raw), usecols=['TradingDate', 'TradingPeriod', 'PointOfConnection', 'DollarsPerMegawattHour'])
    d = d[d.PointOfConnection.isin(ref.values())]
    if d.empty:
        return None
    # trading period k starts (k-1) half-hours after local midnight, counting straight through a clock change
    midnight = pd.to_datetime(d.TradingDate).dt.tz_localize(NZ).dt.tz_convert('UTC')
    d['t'] = midnight + pd.to_timedelta((d.TradingPeriod - 1) * 30, unit='min')
    out = d.pivot_table(index='t', columns='PointOfConnection', values='DollarsPerMegawattHour', aggfunc='mean')
    out = out.rename(columns={node: f'F|{isl}' for isl, node in ref.items()})
    out['fi'] = 1.0 if interim else 0.0
    return out


def final_prices(m, days):
    """Final (or interim) reference prices for the given days of month m: the monthly file once it exists,
    otherwise one daily file per day."""
    current = m >= datetime.now(NZ).date().replace(day=1)
    if not current:
        raw = get(f'{BLOB}/{FINAL}/ByMonth/{m:%Y%m}_FinalEnergyPrices.csv')
        if raw is not None:
            return parse_final(raw)

    def one(d):
        raw = get(f'{BLOB}/{FINAL}/{d:%Y%m%d}_FinalEnergyPrices.csv')
        if raw is not None:
            return parse_final(raw)
        raw = get(f'{BLOB}/{FINAL}/{d:%Y%m%d}_FinalEnergyPrices_I.csv')
        return parse_final(raw, interim=True) if raw is not None else None
    with ThreadPoolExecutor(WORKERS) as ex:
        parts = [x for x in ex.map(one, days) if x is not None]
    return pd.concat(parts) if parts else None


def add_final(s, m):
    """Fill in final prices for trading periods that lack them (or have interim ones). True if anything changed."""
    for c in ('F|NI', 'F|SI', 'fi'):
        if c not in s:
            s[c] = np.nan
    need = s.index[s['F|NI'].isna() | s['F|SI'].isna() | (s['fi'] == 1)]
    if not len(need):
        return False
    days = sorted(set(need.tz_convert(NZ).date))
    f = final_prices(m, days)
    if f is None:
        return False
    f = f.reindex(need).dropna(subset=['F|NI', 'F|SI'], how='all')
    if f.empty:
        return False
    before = s.loc[f.index, ['F|NI', 'F|SI', 'fi']].copy()
    s.loc[f.index, ['F|NI', 'F|SI', 'fi']] = f[['F|NI', 'F|SI', 'fi']].values
    return not before.equals(s.loc[f.index, ['F|NI', 'F|SI', 'fi']])


# ---------- one month: state -> tracker-layout JSON and daily summary ----------

def build_month(s, month, cap, log):
    """Half-hourly state for one month -> (hh JSON, dd JSON)."""
    s = s.sort_index()
    have = s.index[s.n > 0]
    full = pd.date_range(have.min(), have.max(), freq='30min')
    g = s.reindex(full).copy()
    g['src'] = np.where(g.n > 0, 'file', None)
    final = pd.Series(False, index=full)
    if 'F|NI' in g:
        # final prices where published; dispatch prices only for trading periods not yet priced
        for isl in ('NI', 'SI'):
            g[f'P|{isl}'] = g[f'F|{isl}'].combine_first(g[f'P|{isl}'])
        final = g['F|NI'].notna() & (g['fi'] != 1)
    irr = g.reindex(columns=irr_cols()).interpolate(limit_area='inside', limit=2)
    roof = rooftop.output(irr.set_axis(full + pd.Timedelta(minutes=15)), full + pd.Timedelta(minutes=15), cap)
    roof = {k: pd.Series(v.values, index=full) for k, v in roof.items()}
    js = assemble(g, full, roof, log)
    hv_ok = g['H|BEN'].notna() if 'H|BEN' in g else pd.Series(False, index=full)
    n = g.n.fillna(0)
    js['meta'] = {'month': month, 'intervals': int((n > 0).sum()), 'expected': len(full),
                  'five_min': round(float(n.sum() / (6 * len(full))), 4), 'roof_mw': cap_total(cap, month),
                  'hvdc_metered': round(float(hv_ok.mean()), 4),
                  'final_prices': round(float(final.mean()), 4),
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
    for k in ('metered', 'underlying', 'gen'):
        if k == 'gen':  # total generation including rooftop solar, as the page sums it (output only, no HVDC)
            fu = lambda isl: {f: np.array(js[isl].get(f, np.zeros(js['N'])), float) for f in GEN_FUELS}
            a, b = fu('NI'), fu('SI')
            ni, si = (sum(np.maximum(v, 0) for v in x.values()) for x in (a, b))
            nz = sum(np.maximum(a[f] + b[f], 0) for f in GEN_FUELS)
        else:
            ni, si = np.array(js['NI'][k], float), np.array(js['SI'][k], float)
            nz = ni + si
        for r, arr in (('NZ', nz), ('NI', ni), ('SI', si)):
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


# overrides.toml tables only the website uses (plant_meta.py): editing them doesn't rebuild history
SITE_ONLY = ('owners', 'plant_owners', 'hydro_schemes')


def mapping_hash():
    """Fingerprint of everything history months are built from; a change rebuilds every month."""
    from common import overrides
    h = hashlib.sha256(f'build {BUILD}'.encode())
    for f in ('plant_register.csv', 'connection_points.csv', 'rooftop_points.csv', 'rooftop_nsp.csv'):
        with open(os.path.join(FACILITIES, f), 'rb') as fh:
            h.update(fh.read())
    o = {k: v for k, v in overrides().items() if k not in SITE_ONLY}
    h.update(json.dumps(o, sort_keys=True, ensure_ascii=False).encode())
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


class Counted:
    """The store, counting writes against the job's daily KV allowance."""
    def __init__(self, store, used):
        self.store, self.used = store, used

    def get(self, key):
        return self.store.get(key)

    def put(self, key, body, ctype='application/octet-stream'):
        self.used += 1
        self.store.put(key, body, ctype)

    def room(self, n):
        return self.used + n <= WRITE_BUDGET


def main(budget_min=300, rebuild=False, start=None, log=print):
    t_start = time.time()
    if os.environ.get('GITHUB_ACTIONS') and not all(os.environ.get(k) for k in ('CF_ACCOUNT_ID', 'CF_API_TOKEN')):
        print('::notice::Skipped: add the CF_ACCOUNT_ID and CF_API_TOKEN secrets to turn on history updates.')
        return
    base = open_store()
    # the job's own record of what's stored; hist/index.json is the public copy, written once history is complete
    index = json.loads(base.get('hist/progress.json') or b'{}')
    today = pd.Timestamp.now(tz='UTC').strftime('%Y-%m-%d')   # KV's daily limit resets at midnight UTC
    used = index.get('writes', {}).get(today)
    if used is None:  # no count yet today: assume a full build already ran today if the public index is from today
        pub = json.loads(base.get('hist/index.json') or b'{}')
        built_today = pub.get('built') and pd.Timestamp(pub['built'], unit='ms', tz='UTC').strftime('%Y-%m-%d') == today
        used = 230 if built_today else 0
    store = Counted(base, used)
    mhash = mapping_hash()
    stored = set(index.get('months', []))
    # months still to rebuild under the current mapping (all of them when the mapping or BUILD changes)
    left = set(index.get('rebuild_left', []))
    if rebuild or index.get('hash') != mhash:
        left = set(stored)
    cap = solar_capacity(store)
    yesterday = datetime.now(NZ).date() - timedelta(days=1)
    caps_before = index.get('roof_mw', {})
    done = set(index.get('done', [])) - left   # complete months: nothing left to fetch or rebuild
    changed_dd = {}
    stopped = ''
    repairs = 0
    icols = irr_cols()

    for m in months_between(start or FIRST_DAY, yesterday):
        month = f'{m:%Y-%m}'
        key = f'hist/state/{month}.csv.gz'
        rc = cap_total(cap, month)
        if month in done and month in stored and caps_before.get(month) == rc:
            continue
        if stopped:
            continue
        if time.time() - t_start > budget_min * 60:
            stopped = f'time budget used at {month}'
            continue
        if not store.room(3 + 4):  # this month's three files, plus the closing day/index/progress writes
            stopped = f'daily KV write allowance used at {month}'
            continue
        s = load_state(store, key)
        have_days = set(s.index.tz_convert(NZ).date) if s is not None else set()
        todo = [d for d in month_days(m, yesterday) if d not in have_days]
        new = []
        if todo:
            with ThreadPoolExecutor(WORKERS) as ex:
                new = [x for x in ex.map(fetch_day, todo) if x is not None]
        if new:
            add = pd.concat(new).sort_index()
            add = add.join(irradiance(add.index.min(), add.index.max()))
            s = add if s is None else pd.concat([s[~s.index.isin(add.index)], add]).sort_index()
        if s is None or s.empty:
            continue
        dropped = [c for c in ('R|NI', 'R|SI') if c in s]   # BUILD 3's island-weighted reanalysis irradiance
        s = s.drop(columns=dropped)
        for c in icols:
            if c not in s:
                s[c] = np.nan
        # satellite irradiance is only meaningful by day; a trading period counts as missing if any point lacks it
        gaps = s.index[s[icols].isna().any(axis=1)]
        last_day = list(month_days(m, yesterday))[-1:]
        recent = bool(last_day) and last_day[0] >= yesterday - timedelta(days=30)
        fixed = False
        # retry missing irradiance for recent months (the service can lag), or anywhere days of it are missing (a new
        # point, the BUILD 4 switch); a few hours missing long ago are satellite outages and stay interpolated
        if len(gaps) and repairs < IRR_MONTHS_PER_RUN and ((recent and not new) or len(gaps) > 3 * 48):
            # irradiance not stored yet (a new point, the BUILD 4 switch) or that a previous run couldn't get
            repairs += 1
            r = irradiance(gaps.min(), gaps.max())
            before = int(s[icols].isna().sum().sum())
            s.loc[gaps, icols] = r.reindex(gaps)[icols].values
            fixed = int(s[icols].isna().sum().sum()) < before
        # days of irradiance still missing (BUILD 4 switch, beyond this run's share): leave the month for a later run
        # rather than spend KV writes saving and rebuilding it twice
        irr_short = int(s.loc[s.index < pd.Timestamp.now(tz='UTC') - pd.Timedelta(days=2), icols].isna().any(axis=1).sum()) > 3 * 48
        if irr_short and month in stored and not new and not fixed:
            continue
        priced = add_final(s, m)
        metered = add_hvdc(s, m)
        if new or fixed or priced or metered or dropped:
            store.put(key, dump_state(s))
            missing_r = int(s[icols].isna().any(axis=1).sum())
            unpriced = int((s['F|NI'].isna() | (s['fi'] == 1)).sum())
            log(f'{month}: +{len(new)} days ({len(todo) - len(new)} not published yet), {len(set(s.index.tz_convert(NZ).date))} days stored'
                + (f'; irradiance missing for {missing_r} trading periods' if missing_r else '')
                + (f'; {unpriced} trading periods without final prices yet' if unpriced else '')
                + ('; metered HVDC added' if metered else ''))
        hv_missing = s[['H|BEN', 'H|HAY']].isna().any().any()
        irr_missing = int(s[icols].isna().any(axis=1).sum())
        if (last_day and last_day[0] < yesterday - timedelta(days=14)
                and (irr_missing == 0 or (not recent and irr_missing <= 3 * 48))
                and not s[['F|NI', 'F|SI']].isna().any().any() and not (s['fi'] == 1).any()
                and (not hv_missing or last_day[0] < yesterday - timedelta(days=90))
                and len(set(s.index.tz_convert(NZ).date)) == len(list(month_days(m, yesterday)))):
            done.add(month)  # every day stored, irradiance, final prices and HVDC complete, and the month long over
        # wait for irradiance before rebuilding a month with days of it missing (except the newest two days)
        irr_short = int(s.loc[s.index < pd.Timestamp.now(tz='UTC') - pd.Timedelta(days=2), icols].isna().any(axis=1).sum()) > 3 * 48
        if irr_short and month in stored:
            continue   # stays in rebuild_left: a later run fetches the irradiance, then rebuilds it
        if new or fixed or priced or metered or month in left or month not in stored or caps_before.get(month) != rc:
            hh, dd = build_month(s, month, cap, lambda *a: log(f"  {month}:", *a))
            put_json(store, f'hist/hh/{month}.json', hh)
            put_json(store, f'hist/dd/{month}.json', dd)
            changed_dd[month] = dd
            stored.add(month)
            left.discard(month)
            caps_before[month] = hh['meta']['roof_mw']

    months = sorted(stored)
    progress = {'months': months, 'done': sorted(done), 'rebuild_left': sorted(left), 'hash': mhash, 'roof_mw': caps_before,
                'writes': {today: store.used + 1}}
    if not changed_dd:
        log('history: nothing new' + (f' ({stopped}; continues next run)' if stopped else ''))
        return
    if stopped or left:
        put_json(store, 'hist/progress.json', progress)
        # months are saved as they're done; publish the combined files only once nothing is missing or out of date
        log(f'history: {len(changed_dd)} months saved; {stopped or "some months still to rebuild"}; the rest continues next run')
        return
    dds = [changed_dd.get(mo) or json.loads(store.get(f'hist/dd/{mo}.json')) for mo in months]
    day = combine_days(dds)
    end = dds[-1]['end']
    day['meta'] = {'first': day['t'][0], 'end': end, 'built': int(time.time() * 1000)}
    put_json(store, 'hist/day.json', day)
    index = {**progress, 'first': day['t'][0], 'end': end, 'built': int(time.time() * 1000)}
    index['writes'] = {today: store.used + 2}
    put_json(store, 'hist/index.json', index)
    put_json(store, 'hist/progress.json', index)
    log(f'history: {len(months)} months, {day["N"]} days to {pd.Timestamp(index["end"], unit="ms", tz="UTC").tz_convert(NZ)}, '
        f'{len(changed_dd)} months rebuilt in {time.time() - t_start:.0f} s, {store.used} KV writes today')


if __name__ == '__main__':
    a = sys.argv[1:]
    budget = float(a[a.index('--budget') + 1]) if '--budget' in a else 300
    frm = date.fromisoformat(a[a.index('--from') + 1]) if '--from' in a else None
    main(budget, '--rebuild' in a, frm)
