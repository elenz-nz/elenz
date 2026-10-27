"""History: half-hourly generation, prices and demand since 1 August 1997, from the EA's metered data and daily
dispatch files.

Every month the EA has published metering for (Generation_MD and friends, ~5-6 weeks after the month; metered.py)
uses metered generation and demand, back to Aug 1997. The daily NodalPricesAndVolumes files (the same RTD cases as
the live feed) start on 10 Sep 2020 and arrive 1-4 days late: they cover the weeks since the latest metered month and
fill in plants the metering lacks. Each run fetches anything published that isn't stored yet, oldest first, within a
time budget and the day's KV write allowance, so the first run starts a backfill that later runs finish.

Stored (Cloudflare KV in GitHub Actions, data/store locally), one set per NZ calendar month:
  hist/state/YYYY-MM.csv.gz  half-hourly compact state: the metered columns (metered.py: M|, E|, X|, I|, J|, Q|, MT, mg, mq, mc,
                             me) where published, and from Sep 2020 unit MW, island load, Tiwai, reference prices (state.py
                             columns averaged over each trading period), n = 5-minute intervals present (0-6),
                             G|<point>, D|<point> = satellite global and diffuse irradiance (W/m², Open-Meteo,
                             Himawari) at each rooftop solar point (facilities/rooftop_points.csv),
                             F|NI and F|SI = final prices at Haywards and Benmore (fi = 1 while only interim),
                             F|OTA, ... = final prices at the other [price_nodes],
                             H|BEN, H|HAY = metered HVDC transfer northward at each end (MW, once published)
  hist/hh/YYYY-MM.json       the month in the tracker.json layout, half-hourly (the website's 30-day view)
  hist/dd/YYYY-MM.json       daily averages for the month, plus each day's peak demand, peak generation and peak
                             dispatchable output (peak.disp: hydro, thermal, battery discharge; dispx without hydro), the spread of each island's half-hourly price (p10, p90, pmin, pmax, n500, n1000 = half-hours
                             over $500 and $1,000) and each fuel's revenue at its island's price (rv_<fuel>, $/h, so
                             rv / generation is the price it captured; batt_d = battery discharge only; batt_c and
                             rv_battc = battery charging and its cost, the price batteries paid)
and across all months:
  hist/day.json              every day since 2020 (the 1-year and all-time views)
  hist/index.json            months stored, first and last time (published once the backfill has caught up)
  hist/progress.json         the job's own record: months stored and finished, and the plant mapping used
  hist/roof_cap.json         rooftop solar capacity by point and month (EA report GUEHMT by Root NSP, less the
                             dispatched farms it also counts); the live job reads it too
  hist/explain.json, hist/offers.json   the /now price explainer's usual values and the newest day of generator
                             offers (explain.py; written only when history moves on or a new offers day appears, within
                             the write allowance); the live job reads both
  hist/rec/months.json.gz, hist/records.json   the Records pages: a summary of every month and the records drawn from
                             them (records.py; published while the history is complete, only when something changed)
  hist/tod.json              each month's average for every half-hour of the day (tod.py): the heat maps' rows on All

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

import explain
import hvdc
import metered as mt
import records
import tod
import rooftop
import state as st
from build_tracker import assemble, enc, enc_na
from common import BLOB, FACILITIES, NZ, overrides
from store import open_store
from sync import DISPATCH

warnings.simplefilter("ignore", pd.errors.PerformanceWarning)  # wide monthly frames; harmless
FINAL = 'Datasets/Wholesale/DispatchAndPricing/FinalEnergyPrices'
HVDC_FLOWS = 'Datasets/Wholesale/Metered_data/HVDC_Flows'

BUILD = 8                    # bump to rebuild every month's JSON after changing how it is built (2: final prices, 3: peak generation,
                             # 4: satellite rooftop solar model by point, metered HVDC; 5: more price nodes, daily price
                             # spread and revenue by fuel, bioenergy and waste heat; 6: metered history back to Aug 1997,
                             # metered generation wherever published, plant groups; 7: Generation_MD's clock-numbered
                             # change days before 2009 renumbered (metered.straighten()), Mill Creek 2014-15, peak.disp)
                             # 8: (being collected, see facilities/NEXT_REBUILD.md)
GEN_FUELS = ('geo', 'bio', 'waste', 'coal', 'gas', 'diesel', 'hydro', 'wind', 'solar', 'roof', 'batt')
DISPATCHABLE = ('hydro', 'gas', 'coal', 'diesel', 'batt')   # as DISPATCHABLE in site/src/lib/tracker/series.js
WRITE_BUDGET = 280           # KV writes a day (UTC) for this job; the live job needs ~600 of the 1,000
FIRST_DAY = date(2020, 9, 10)  # first daily dispatch file
FIRST_MONTH = mt.FIRST_MONTH   # first month of metered history (Generation_MD): Aug 1997
ROOF_FROM = pd.Timestamp('2013-08-01', tz=NZ).tz_convert('UTC')   # embedded solar: the registry's first month
METERED_WAIT = 100           # days after a month ends before its metered data must be there for the month to be done
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
    s = st.compact(pd.read_csv(io.BytesIO(raw), keep_default_na=False), 'file').drop(columns=['src', 'R'], errors='ignore')
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
    period starts): Himawari from 2016, ERA5 reanalysis before (rooftop.reanalysis), none before embedded solar's
    registry starts (Aug 2013). Periods the service couldn't supply (outage, rate limit, or too recent) are NaN and
    are fetched again on later runs (see main)."""
    tps = pd.date_range(start, end, freq='30min')
    blank = pd.DataFrame(np.nan, index=pd.DatetimeIndex(tps, name='t'), columns=irr_cols())
    if end < ROOF_FROM:
        return blank
    start = max(start, ROOF_FROM)
    today = pd.Timestamp.now(tz='UTC').date()
    parts = []
    sat_from = rooftop.SATELLITE_FROM
    for a, b, fn, label in ((start, min(end, sat_from - STEP), rooftop.reanalysis, 'reanalysis'),
                            (max(start, sat_from), end, rooftop.satellite, 'satellite')):
        if a > b:
            continue
        d0, d1 = a.date(), min(b.date(), today)
        try:
            parts.append(fn(get, d0, d1))
        except Exception as e:
            print(f'  irradiance: {label} service unavailable for {d0}..{d1} ({e})')
    if not parts:
        return blank
    out = rooftop.half_hourly(pd.concat(parts).sort_index(), tps).reindex(columns=irr_cols())
    out.index.name = 't'
    return out


def irr_missing(s, icols, before=None):
    """Trading periods (from ROOF_FROM on, and before `before` if given) missing irradiance at any point."""
    keep = s.index >= ROOF_FROM
    if before is not None:
        keep &= s.index < before
    return s.index[keep & s[icols].isna().any(axis=1).values]


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


HVDC_REREAD_TO = date(2003, 1, 1)   # months before this are read again when hvdc.VERSION goes up (the old layouts)


def add_hvdc(s, m):
    """Fill in metered HVDC transfer (H|BEN, H|HAY) for month m once EMI publishes it, and read a month of the old
    layouts again when hvdc.VERSION has gone up since it was read (column hv). True if anything changed."""
    for c in ('H|BEN', 'H|HAY'):
        if c not in s:
            s[c] = np.nan
    reread = m < HVDC_REREAD_TO and ('hv' not in s or not (s['hv'] >= hvdc.VERSION).all())
    need = s.index if reread else s.index[s['H|BEN'].isna() | s['H|HAY'].isna()]
    if not len(need):
        return False
    raw = get(f'{BLOB}/{HVDC_FLOWS}/{m:%Y%m}_HVDC_flows.csv')
    if raw is None:
        return False
    f = hvdc.parse_metered(raw).reindex(need).dropna(how='all')
    if f.empty:
        return False
    s.loc[f.index, ['H|BEN', 'H|HAY']] = f[['H|BEN', 'H|HAY']].values
    if m < HVDC_REREAD_TO:
        s['hv'] = hvdc.VERSION
    return True


# ---------- final prices ----------

def price_nodes():
    """Column key -> node: the island reference nodes (NI: HAY2201, SI: BEN2201) and the other [price_nodes]."""
    O = overrides()
    return {**O['reference_nodes'], **O.get('price_nodes', {})}


def final_cols():
    return [f'F|{k}' for k in price_nodes()]


def parse_final(raw, interim=False):
    """An EA FinalEnergyPrices CSV -> rows per trading period (UTC start): F|NI, F|SI, F|<other nodes>, fi."""
    ref = price_nodes()
    d = pd.read_csv(io.BytesIO(raw), usecols=['TradingDate', 'TradingPeriod', 'PointOfConnection', 'DollarsPerMegawattHour'])
    d = d[d.PointOfConnection.isin(ref.values())]
    if d.empty:
        return None
    # trading period k starts (k-1) half-hours after local midnight, counting straight through a clock change
    midnight = pd.to_datetime(d.TradingDate).dt.tz_localize(NZ).dt.tz_convert('UTC')
    d['t'] = midnight + pd.to_timedelta((d.TradingPeriod - 1) * 30, unit='min')
    out = d.pivot_table(index='t', columns='PointOfConnection', values='DollarsPerMegawattHour', aggfunc='mean')
    out = out.rename(columns={node: f'F|{isl}' for isl, node in ref.items()}).reindex(columns=final_cols())
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
    """Fill in final prices for trading periods that lack them (or have interim ones). True if anything changed.

    Also periods priced before the other nodes were added (none of them stored): their final prices are fetched again."""
    cols = final_cols()
    extra = [c for c in cols if c not in ('F|NI', 'F|SI')]
    for c in cols + ['fi']:
        if c not in s:
            s[c] = np.nan
    need = s.index[s['F|NI'].isna() | s['F|SI'].isna() | (s['fi'] == 1) | (s[extra].isna().all(axis=1) if extra else False)]
    if not len(need):
        return False
    days = sorted(set(need.tz_convert(NZ).date))
    f = final_prices(m, days)
    if f is None:
        return False
    f = f.reindex(need).dropna(subset=['F|NI', 'F|SI'], how='all')
    if f.empty:
        return False
    f = f.reindex(columns=cols + ['fi'])
    before = s.loc[f.index, cols + ['fi']].copy()
    s.loc[f.index, cols + ['fi']] = f[cols + ['fi']].values
    return not before.equals(s.loc[f.index, cols + ['fi']])


# ---------- one month: state -> tracker-layout JSON and daily summary ----------

def build_month(s, month, cap, log):
    """Half-hourly state for one month -> (hh JSON, dd JSON). Metered generation and demand wherever the month has
    metered data (metered.py; dispatch fills in what the metering lacks), dispatch data otherwise."""
    s = s.sort_index()
    if 'n' not in s:
        s['n'] = np.nan
    m0 = date.fromisoformat(month + '-01')
    met = mt.complete(s, m0)
    n_ok = s['n'].fillna(0) > 0
    have = s.index[n_ok | (s['mg'] == 1)] if met else s.index[n_ok]
    full = pd.date_range(have.min(), have.max(), freq='30min')
    g = s.reindex(full).copy()
    g['src'] = np.where((g['n'].fillna(0) > 0) | ((g['mg'] == 1) if met else False), 'file', None)
    final = pd.Series(False, index=full)
    if 'F|NI' in g:
        # final prices where published; dispatch prices only for trading periods not yet priced
        for isl in ('NI', 'SI'):
            g[f'P|{isl}'] = g[f'F|{isl}'].combine_first(g[f'P|{isl}']) if f'P|{isl}' in g else g[f'F|{isl}']
        final = g['F|NI'].notna() & (g['fi'] != 1)
    for k in overrides().get('price_nodes', {}):   # the other nodes: final prices (dispatch only for WKM2201)
        if f'F|{k}' in g:
            g[f'P|{k}'] = g[f'F|{k}'].combine_first(g[f'P|{k}']) if f'P|{k}' in g else g[f'F|{k}']
    irr = g.reindex(columns=irr_cols()).interpolate(limit_area='inside', limit=2)
    roof = rooftop.output(irr.set_axis(full + pd.Timedelta(minutes=15)), full + pd.Timedelta(minutes=15), cap)
    roof = {k: pd.Series(v.values, index=full) for k, v in roof.items()}
    gen = mt.generation(g, month, log) if met else None
    js = assemble(g, full, roof, log, metered=gen)
    hv_ok = g['H|BEN'].notna() if 'H|BEN' in g else pd.Series(False, index=full)
    n = g['n'].fillna(0)
    js['meta'] = {'month': month, 'intervals': int((n > 0).sum()), 'expected': len(full),
                  'five_min': round(float(n.sum() / (6 * len(full))), 4), 'roof_mw': cap_total(cap, month),
                  'hvdc_metered': round(float(hv_ok.mean()), 4),
                  'final_prices': round(float(final.mean()), 4),
                  'source': 'metered' if met else 'dispatch',
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
        # the day's half-hourly price spread, and revenue by fuel at the island price (the Prices page)
        price = pd.Series(js[isl]['price'], index=day, dtype=float)
        g = price.groupby(level=0)
        for k, v in (('p10', g.quantile(0.1)), ('p90', g.quantile(0.9)), ('pmin', g.min()), ('pmax', g.max())):
            out[isl][k] = enc(v.reindex(days), 2)
        for k, lim in (('n500', 500), ('n1000', 1000)):
            out[isl][k] = enc((price > lim).groupby(level=0).sum().reindex(days))
        p = price.values
        for f in GEN_FUELS:
            if f == 'roof' or f not in js[isl]:
                continue   # embedded solar isn't paid the spot price
            gen = np.array(js[isl][f], float)
            if f == 'batt':
                # charging (the net battery output below zero) and what it cost at the island price, for the Prices
                # page's Battery (charging) row; then discharge only for the battery's own revenue
                chg = np.maximum(-gen, 0)
                out[isl]['batt_c'] = mean(chg)
                out[isl]['rv_battc'] = mean(chg * p)
                gen = np.maximum(gen, 0)   # discharge only
                out[isl]['batt_d'] = mean(gen)
            out[isl][f'rv_{f}'] = mean(gen * p)
    if js.get('nodes'):
        out['nodes'] = {k: enc_na(pd.Series(v, index=day, dtype=float).groupby(level=0).mean().reindex(days))
                        for k, v in js['nodes'].items()}
    peak = {}
    for k in ('metered', 'underlying', 'gen', 'disp', 'dispx'):
        if k in ('gen', 'disp', 'dispx'):
            # gen: total generation including rooftop solar, as the page sums it (output only, no HVDC);
            # disp: dispatchable output (hydro, thermal, battery discharge), for the Generation tab's headroom chart;
            # dispx: the same without hydro
            fuels = GEN_FUELS if k == 'gen' else DISPATCHABLE if k == 'disp' else tuple(f for f in DISPATCHABLE if f != 'hydro')
            fu = lambda isl: {f: np.array(js[isl].get(f, np.zeros(js['N'])), float) for f in fuels}
            a, b = fu('NI'), fu('SI')
            ni, si = (sum(np.maximum(v, 0) for v in x.values()) for x in (a, b))
            nz = sum(np.maximum(a[f] + b[f], 0) for f in fuels)
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
    out = {'t': [], 'h': [], 'hvdcN': [], 'NI': {}, 'SI': {}, 'nodes': {}, 'peak': {}, 'plants': []}
    plants, pos = {}, 0
    for d in dds:
        m = len(d['t'])
        out['t'] += d['t']; out['h'] += d['h']; out['hvdcN'] += d['hvdcN']
        for isl in ('NI', 'SI'):
            for k, v in d[isl].items():
                out[isl].setdefault(k, [0] * pos)
                out[isl][k] += v
        for k, v in d.get('nodes', {}).items():
            out['nodes'].setdefault(k, [None] * pos)
            out['nodes'][k] += v
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
        for v in out['nodes'].values():  # a node price missing from a month is a gap
            v += [None] * (pos - len(v))
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


def dispatch_days(s):
    """NZ dates with dispatch data in a month's state (none for months before Sep 2020)."""
    if s is None or 'n' not in s:
        return set()
    return set(s.index[s['n'].fillna(0) > 0].tz_convert(NZ).date)


METERED_COLS = ('M|', 'E|', 'X|', 'I|', 'J|', 'Q|')


def merge_metered(s, mf):
    """A month's state with its metered columns replaced by a newly fetched set (rows the dispatch data lacks are added)."""
    if s is None:
        return mf.sort_index()
    old = [c for c in s.columns if c[:2] in METERED_COLS or c in ('MT', 'mg', 'me', 'mq', 'mc')]
    return s.drop(columns=old).join(mf, how='outer').sort_index()


# overrides.toml tables only the website uses (plant_meta.py): editing them doesn't rebuild history
SITE_ONLY = ('owners', 'plant_owners', 'hydro_schemes')


def mapping_hash():
    """Fingerprint of everything history months are built from; a change rebuilds every month."""
    from common import overrides
    h = hashlib.sha256(f'build {BUILD}'.encode())
    for f in ('plant_register.csv', 'connection_points.csv', 'rooftop_points.csv', 'rooftop_nsp.csv',
              'metered_plants.csv', 'metered_islands.csv'):
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
    # the old layouts' metered HVDC is read in a new way (hvdc.VERSION): read those months again and rebuild them
    if index.get('hv', 1) < hvdc.VERSION:
        left |= {mo for mo in stored if mo < f'{HVDC_REREAD_TO:%Y-%m}'}
    cap = solar_capacity(store)
    yesterday = datetime.now(NZ).date() - timedelta(days=1)
    caps_before = index.get('roof_mw', {})
    done = set(index.get('done', [])) - left   # complete months: nothing left to fetch or rebuild
    done_before = set(done)
    changed_dd = {}
    rec_fresh = {}   # records.py summaries of the months rebuilt this run
    tod_fresh = {}   # the months rebuilt this run, for tod.py
    stopped = ''
    repairs = 0
    icols = irr_cols()

    for m in months_between(start or FIRST_MONTH, yesterday):
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
        nxt = date(m.year + (m.month == 12), m.month % 12 + 1, 1)
        month_last = min(nxt - timedelta(days=1), yesterday)
        have_days = dispatch_days(s)
        todo = [d for d in month_days(m, yesterday) if d not in have_days]
        new = []
        if todo:
            with ThreadPoolExecutor(WORKERS) as ex:
                new = [x for x in ex.map(fetch_day, todo) if x is not None]
        if new:
            add = pd.concat(new).sort_index()
            add = add.join(irradiance(add.index.min(), add.index.max()))
            if s is not None:
                keep = [c for c in s.columns if c not in add.columns]   # metered columns stay with their rows
                add = add.join(s.loc[s.index.isin(add.index), keep])
            s = add if s is None else pd.concat([s[~s.index.isin(add.index)], add]).sort_index()
        # metered data (Generation_MD and friends), once the EA publishes the month; fetched again until complete
        got_m = False
        if not mt.complete(s, m):
            mf = mt.fetch_month(get, m, log)
            if mf is not None:
                s = merge_metered(s, mf)
                got_m = True
        if s is None or s.empty:
            continue
        dropped = [c for c in ('R|NI', 'R|SI') if c in s]   # BUILD 3's island-weighted reanalysis irradiance
        s = s.drop(columns=dropped)
        for c in icols:
            if c not in s:
                s[c] = np.nan
        # irradiance is only meaningful by day; a trading period counts as missing if any point lacks it (and only
        # from Aug 2013, when the embedded solar registry starts)
        gaps = irr_missing(s, icols)
        recent = month_last >= yesterday - timedelta(days=30)
        fixed = False
        # retry missing irradiance for recent months (the service can lag), or anywhere days of it are missing (a new
        # point, a backfill); a few hours missing long ago are outages and stay interpolated
        if len(gaps) and repairs < IRR_MONTHS_PER_RUN and ((recent and not new) or len(gaps) > 3 * 48):
            repairs += 1
            r = irradiance(gaps.min(), gaps.max())
            before = int(s[icols].isna().sum().sum())
            s.loc[gaps, icols] = r.reindex(gaps)[icols].values
            fixed = int(s[icols].isna().sum().sum()) < before
        # days of irradiance still missing (beyond this run's share): leave the month for a later run rather than
        # spend KV writes saving and rebuilding it twice
        two_days_ago = pd.Timestamp.now(tz='UTC') - pd.Timedelta(days=2)
        irr_short = len(irr_missing(s, icols, two_days_ago)) > 3 * 48
        if irr_short and month in stored and not new and not fixed and not got_m:
            continue
        priced = add_final(s, m)
        hv_metered = add_hvdc(s, m)
        if new or fixed or priced or hv_metered or dropped or got_m:
            store.put(key, dump_state(s))
            missing_r = len(irr_missing(s, icols))
            unpriced = int((s['F|NI'].isna() | (s['fi'] == 1)).sum())
            log(f'{month}: +{len(new)} days ({len(todo) - len(new)} not published yet), {len(dispatch_days(s))} days of dispatch data'
                + ('; metered data' + (' (complete)' if mt.complete(s, m) else ' (part published)') if 'mg' in s else '')
                + (f'; irradiance missing for {missing_r} trading periods' if missing_r else '')
                + (f'; {unpriced} trading periods without final prices yet' if unpriced else '')
                + ('; metered HVDC added' if hv_metered else ''))
        hv_missing = s[['H|BEN', 'H|HAY']].isna().any().any()
        irr_n = len(irr_missing(s, icols))
        met_ok = mt.complete(s, m) or month_last < yesterday - timedelta(days=METERED_WAIT)
        if (month_last < yesterday - timedelta(days=14)
                and (irr_n == 0 or (not recent and irr_n <= 3 * 48))
                and not s[['F|NI', 'F|SI']].isna().any().any() and not (s['fi'] == 1).any()
                and (not hv_missing or month_last < yesterday - timedelta(days=90))
                and met_ok
                and len(dispatch_days(s)) == len(list(month_days(m, yesterday)))):
            done.add(month)  # every day stored, metering, irradiance, final prices and HVDC complete, and the month long over
        # wait for irradiance before rebuilding a month with days of it missing (except the newest two days)
        irr_short = len(irr_missing(s, icols, two_days_ago)) > 3 * 48
        if irr_short:
            # stays in rebuild_left (or unbuilt): a later run fetches the irradiance, then builds it, rather than
            # spending KV writes building it twice
            continue
        if new or fixed or priced or hv_metered or got_m or month in left or month not in stored or caps_before.get(month) != rc:
            hh, dd = build_month(s, month, cap, lambda *a: log(f"  {month}:", *a))
            put_json(store, f'hist/hh/{month}.json', hh)
            put_json(store, f'hist/dd/{month}.json', dd)
            changed_dd[month] = dd
            rec_fresh[month] = records.summarise(hh)
            tod_fresh[month] = hh
            stored.add(month)
            left.discard(month)
            caps_before[month] = hh['meta']['roof_mw']

    # the /now price explainer's usual values (when history has moved on) and the newest day of offers (once a day)
    explain.update(store, log)
    # records (records.py): month summaries kept up to date; hist/records.json published while the history is
    # complete, as day.json is. Three writes stay free for the closing day, index and progress files.
    records.update(store, rec_fresh, sorted(stored), publish=not stopped and not left, log=log,
                   room=lambda n: store.room(n + 3))
    # the heat maps' monthly time-of-day profiles (tod.py): rebuilt months redone, missing ones read back a few at a time
    try:
        tod.update(store, tod_fresh, sorted(stored), room=lambda n: store.room(n + 3), log=log)
    except Exception as e:  # noqa: BLE001  never fatal: the heat maps fall back to daily rows
        log(f'time of day: skipped ({type(e).__name__}: {e})')

    months = sorted(stored)
    # 'at': when this run saved it; the Worker's health check and the watchdog treat a stale index as expected while a
    # rebuild is under way (rebuild_left not empty, progress saved within two days)
    progress = {'months': months, 'done': sorted(done), 'rebuild_left': sorted(left), 'hash': mhash, 'roof_mw': caps_before,
                'writes': {today: store.used + 1}, 'at': int(time.time() * 1000), 'hv': hvdc.VERSION}
    if not changed_dd:
        # no month rebuilt, but a run can still have saved files (a month's state, the solar capacity table) or
        # finished months: record them, so the day's KV write count stays right and finished months aren't revisited
        if store.used > used or done != done_before:
            put_json(store, 'hist/progress.json', progress)
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
