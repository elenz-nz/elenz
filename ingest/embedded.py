"""Other embedded generation: plant on local networks that isn't dispatched and isn't solar.

Its output reaches the market data only as lower demand at the grid exit point. The EA's reconciliation data
(Volumes/Reconciliation, CC BY 4.0) has the metered energy every trader injects at every grid exit point, by local
network and half-hour, from January 2005; each month is first published 3-4 weeks after it ends and replaced by
revisions about 3, 7 and 14 months later. Method page: /methods/other-embedded.

Each injection series (grid exit point x network x trader) is sorted, in this order:
  1. solar-shaped (under NIGHT_SHARE of its energy between 9 pm and 5 am): left out, embedded solar is modelled
  2. on a network that belongs to a generator (GEN_NETWORKS: its grid stations, which the generation series has)
  3. facilities/embedded_points.csv role "exclude" (Glenbrook: a known meter-versus-dispatch difference)
  4. role "named": stays with a plant the site already shows (Ngāwhā, Teviot)
  5. the rest is the starting point for other embedded generation
then, at each grid exit point and half-hour, what the site already counts there is taken off:
    other = max(0, injection - counted)
counted being the non-solar output of every plant in the month's tracker layout at that point (metered generation,
gross embedded generation where the metered figure is net, plants filled in from dispatch data). Counting only
Generation_MD would make Matahina (dispatch-filled) and Cobb (gross from Embedded_generation) look missing.

Fuel: embedded_points.csv role "fuel" rows (from public documents; a name only where a document ties the plant to the
grid exit point, design decision 6 Nov 2026), otherwise the split in facilities/embedded_registry_split.csv (the
distributed generation registry's capacity by fuel at each point less dispatched plant, weighted by typical capacity
factors; made by analysis/embedded_split.py; the registry starts in 2013, so one split serves every year), otherwise
"other" (unclassified: in total generation, not renewable, no emission factor; design decision 6 Nov 2026).

For the weeks the reconciliation data doesn't cover yet (the live week among them), each grid exit point's average for
each half-hour of the day (profile) is carried forward: the mean of the latest published month's and the same month
a year earlier's (blend).
"""
import csv
import gzip
import io
import os
import re

import numpy as np
import pandas as pd

from common import BLOB, FACILITIES, NZ

RECON = 'Datasets/Wholesale/Volumes/Reconciliation'
RECON_FROM = '2005-01'           # the reconciliation data's first month (consistent only from May 2008: analysis/README.md)
NIGHT_SHARE = 0.05               # under this share of energy between 9 pm and 5 am: solar
NIGHT_HOURS = (21, 22, 23, 0, 1, 2, 3, 4)
# reconciliation networks that belong to generators (their grid-connected stations), not to local networks
GEN_NETWORKS = {'MERI', 'CTCT', 'MRPL', 'GENE', 'NAPJ', 'TAOM', 'TODD', 'WPWF', 'KRGL', 'TUAR', 'CHHE', 'NZST', 'KIWI',
                'RUAK'}
FUELS = ('hydro', 'geo', 'wind', 'bio', 'gas', 'diesel', 'other')   # tracker fuel keys; landfill gas is 'bio'
STEP_MS = 1_800_000


# ---------- reference tables ----------

def points():
    """facilities/embedded_points.csv as a list of dicts."""
    with open(os.path.join(FACILITIES, 'embedded_points.csv'), encoding='utf-8') as f:
        return list(csv.DictReader(f))


def registry_split():
    """{poc: {fuel: share}} from facilities/embedded_registry_split.csv; {} if it hasn't been made."""
    path = os.path.join(FACILITIES, 'embedded_registry_split.csv')
    if not os.path.exists(path):
        return {}
    out = {}
    with open(path) as f:
        for r in csv.DictReader(f):
            out.setdefault(r['poc'], {})[r['fuel']] = float(r['share'])
    return out


def fuel_of(poc, rows=None, split=None):
    """{fuel: share} for a grid exit point: its embedded_points.csv fuel, else the registry split, else other."""
    rows = points() if rows is None else rows
    for r in rows:
        if r['poc'] == poc and r['role'] == 'fuel' and r['fuel']:
            return {r['fuel']: 1.0}
    split = registry_split() if split is None else split
    return split.get(poc) or {'other': 1.0}


def name_of(poc, rows=None):
    """The plant name a public document ties to this grid exit point, or ''."""
    rows = points() if rows is None else rows
    return next((r['name'] for r in rows if r['poc'] == poc and r['role'] == 'fuel' and r['name']), '')


# ---------- the reconciliation file ----------

def latest_name(get, month):
    """The month's newest ReconciledInjectionAndOfftake file name in the EA's store (its revisions replace it),
    or None. The name is also the month's fingerprint: a revision has a new name."""
    tag = month.replace('-', '')
    listing = get(f'{BLOB}?restype=container&comp=list&prefix={RECON}/{month[:4]}/ReconciledInjectionAndOfftake_{tag}_')
    names = sorted(re.findall(r'<Name>([^<]+)</Name>', listing.decode())) if listing else []
    return names[-1] if names else None


def read_recon(raw):
    """Injection rows of a reconciliation file (gzipped CSV bytes) -> long frame: t (UTC trading period start), poc,
    network, trader, mw. Trading period k starts (k - 1) half-hours after local midnight, straight through clock
    changes."""
    d = pd.read_csv(io.BytesIO(gzip.decompress(raw)), usecols=['PointOfConnection', 'Network', 'Participant',
                                                                'TradingDate', 'TradingPeriod', 'FlowDirection',
                                                                'KilowattHours'])
    d = d[d.FlowDirection == 'Injection']
    days = pd.to_datetime(pd.Series(d.TradingDate.astype(str).str[:10].unique()), format='%Y-%m-%d')
    midnight = dict(zip(days.dt.strftime('%Y-%m-%d'), days.dt.tz_localize(NZ).dt.tz_convert('UTC')))
    t = d.TradingDate.astype(str).str[:10].map(midnight) + pd.to_timedelta((d.TradingPeriod - 1) * 30, unit='min')
    return pd.DataFrame({'t': t.to_numpy(), 'poc': d.PointOfConnection.to_numpy(), 'network': d.Network.to_numpy(),
                         'trader': d.Participant.to_numpy(), 'mw': (d.KilowattHours / 500.0).to_numpy()})


def sort_series(inj, rows=None):
    """Classify each (poc, network, trader) series. Returns a frame indexed by series with gwh, night (share of energy
    9 pm-5 am), and role: solar | generator | exclude | named | other."""
    rows = points() if rows is None else rows
    excl = {r['poc'] for r in rows if r['role'] == 'exclude'}
    named = {(r['poc'], r['trader']): r['plant'] for r in rows if r['role'] == 'named'}
    hour = inj.t.dt.tz_convert(NZ).dt.hour
    key = ['poc', 'network', 'trader']
    tot = inj.groupby(key).mw.sum()
    night = inj[hour.isin(NIGHT_HOURS).to_numpy()].groupby(key).mw.sum().reindex(tot.index).fillna(0)
    s = pd.DataFrame({'gwh': tot / 2000.0, 'night': (night / tot.where(tot > 0)).fillna(1.0)})
    role = []
    for (poc, net, trader), r in s.iterrows():
        if r.night < NIGHT_SHARE:
            role.append('solar')
        elif net in GEN_NETWORKS:
            role.append('generator')
        elif poc in excl:
            role.append('exclude')
        elif (poc, trader) in named:
            role.append('named')
        else:
            role.append('other')
    s['role'] = role
    s['plant'] = [named.get((p, tr), '') for p, _, tr in s.index]
    return s


def wide(inj, sorted_, roles):
    """Half-hourly MW by grid exit point (columns), summed over the series with one of the given roles."""
    keep = sorted_[sorted_.role.isin(roles)].index
    k = pd.MultiIndex.from_frame(inj[['poc', 'network', 'trader']])
    sub = inj[k.isin(keep)]
    return sub.pivot_table(index='t', columns='poc', values='mw', aggfunc='sum').sort_index()


# ---------- what the site already counts ----------

def meters(rows=None):
    """{metered point: grid exit point} for embedded meters the reconciliation data reports under their grid exit
    point (embedded_points.csv role "meter", the grid exit point in column plant)."""
    rows = points() if rows is None else rows
    return {r['poc']: r['plant'] for r in rows if r['role'] == 'meter'}


def counted(js, at=None):
    """Non-solar generation the site already counts at each grid exit point, half-hourly MW (columns = poc), from a
    month in the tracker layout (hist/hh/YYYY-MM.json, or assemble()'s output). Batteries count their discharge only.
    Embedded meter points are moved to their grid exit point (meters())."""
    at = meters() if at is None else at
    idx = pd.to_datetime(js['t0'] + np.arange(js['N']) * js['step'], unit='ms', utc=True)
    cols = {}
    for p in js['plants']:
        if p['fuel'] == 'solar':
            continue
        pocs = p['poc']
        parts = []
        units = p.get('units') or []
        if len(pocs) > 1 and units and all(u['name'] in pocs for u in units):
            parts = [(u['name'], u['s']) for u in units]
        else:
            parts = [(pocs[0], p['s'])]
        for poc, s in parts:
            poc = at.get(poc, poc)
            v = np.asarray(s, float)
            if p['fuel'] == 'batt':
                v = np.clip(v, 0, None)
            cols[poc] = cols.get(poc, 0) + v
    return pd.DataFrame(cols, index=idx)


# ---------- the residual ----------

def residual(inj, js, rows=None, sorted_=None):
    """Other embedded generation for a month: (MW by grid exit point, half-hourly, on the month's grid), and the sorted
    series table. A half-hour with no reading is zero: each file covers its whole month and leaves zero readings out
    (about a fifth of the cells; reading them as gaps put the live estimate ~10% high).

    Series of named plants are counted as injection at their point too, so that where the site already has the
    whole plant (metered months) nothing is left over, and where it has only part of it (Ngāwhā B in dispatch
    months) the rest shows at that point; history.py moves those points' rest to the plant (named_rest)."""
    rows = points() if rows is None else rows
    s = sort_series(inj, rows) if sorted_ is None else sorted_
    i = wide(inj, s, ('other', 'named'))
    c = counted(js, meters(rows))
    grid = c.index
    i = i.reindex(grid).fillna(0.0)   # the file covers the whole month and leaves out zero readings
    c = c.reindex(columns=i.columns, fill_value=0.0)
    o = (i - c).clip(lower=0)
    return o, s


def named_points(rows=None):
    """{poc: plant} for the points whose leftover belongs to a plant the site shows."""
    rows = points() if rows is None else rows
    return {r['poc']: r['plant'] for r in rows if r['role'] == 'named'}


def by_fuel(o, rows=None, split=None):
    """Half-hourly MW by fuel (columns FUELS), from the residual by grid exit point."""
    rows = points() if rows is None else rows
    split = registry_split() if split is None else split
    out = pd.DataFrame(0.0, index=o.index, columns=list(FUELS))
    for poc in o.columns:
        for f, share in fuel_of(poc, rows, split).items():
            out[f] = out[f] + o[poc].fillna(0) * share
    return out


# ---------- weeks without reconciliation data ----------

def profile(o):
    """Each grid exit point's average MW for each half-hour of the NZ day (48 rows, row k = the half-hour starting
    k x 30 minutes after local midnight; clock-change days fall into the half-hour their local time says)."""
    local = o.index.tz_convert(NZ)
    slot = local.hour * 2 + local.minute // 30
    return o.groupby(slot).mean().reindex(range(48))


def blend(recent, year_before):
    """The average day used for weeks without reconciliation data: the mean of the latest published month's profile
    and the profile of the same month a year earlier (whichever exists, if only one does). Back-tested on 2023-26
    (analysis/README.md): a month's average out by 9% on average (16% at the 90th percentile), no bias; the latest
    month alone 12% (23%), the year-earlier month alone 10% (19%)."""
    if recent is None or year_before is None:
        return recent if year_before is None else year_before
    cols = recent.columns.union(year_before.columns)
    return (recent.reindex(columns=cols).fillna(0) + year_before.reindex(columns=cols).fillna(0)) / 2


def carry(prof, index):
    """The profile laid over a UTC half-hourly (or finer) index: MW by grid exit point."""
    local = index.tz_convert(NZ)
    slot = local.hour * 2 + local.minute // 30
    return pd.DataFrame(prof.to_numpy()[slot], index=index, columns=prof.columns)
