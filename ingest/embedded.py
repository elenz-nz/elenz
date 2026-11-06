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
a year earlier's (blend). Named plants the dispatch data has only part of, or none of, get the rest the same way
from their own metered output (Ngāwhā A; Teviot).

history.py keeps the layer from LAYER_FROM in each month's 'oemb' block (month_block), and the average days in
hist/oemb/profiles.json.
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
LAYER_FROM = '2009-01'           # the layer's first month (design decision, 6 Nov 2026): the data is complete and
                                 # consistent from May 2008, and Generation_MD has embedded stations from Jan 2009
REVISION_MONTHS = 16             # months checked each run for a revised file (revisions come about 3, 7 and 14 months on)
PROFILE_MONTHS = 15              # months of average days kept in hist/oemb/profiles.json (the blend needs a year back)
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
    months) the rest shows at that point; month_block moves it to the plant (_rest)."""
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


# ---------- history months (history.py) ----------
#
# A month's state keeps the reconciliation series as columns 'O|POC TRADER' (MW, every series that isn't solar-shaped
# and isn't on a generator's network, summed over networks), plus 'oq' = 1 once the file has been read. The rest of
# the sorting (embedded_points.csv: exclude, named, meters, fuels) is done when the month is built, so a change to the
# table needs no new download. The file's name (a revision has a new one) is kept in hist/progress.json.

def state_columns(inj):
    """Reconciliation injection (read_recon) -> the state's 'O|POC TRADER' columns, half-hourly MW."""
    s = sort_series(inj, rows=[])
    keep = s[s.role == 'other'].index   # with no table rows, everything but solar and generator networks
    k = pd.MultiIndex.from_frame(inj[['poc', 'network', 'trader']])
    sub = inj[k.isin(keep)]
    return sub.assign(key='O|' + sub.poc + ' ' + sub.trader).pivot_table(index='t', columns='key', values='mw',
                                                                         aggfunc='sum').sort_index()


def month_bounds(month):
    m0 = pd.Timestamp(month + '-01', tz=NZ)
    return m0.tz_convert('UTC'), (m0 + pd.offsets.MonthBegin(1)).tz_convert('UTC')


def fetch(get, month, name=None):
    """(file name, state columns over the month's trading periods) for 'YYYY-MM', or None if it isn't published."""
    name = name or latest_name(get, month)
    if not name:
        return None
    raw = get(f'{BLOB}/{name}')
    if raw is None:
        return None
    inj = read_recon(raw)
    a, b = month_bounds(month)
    inj = inj[(inj.t >= a) & (inj.t < b)]
    return name, state_columns(inj)


def has_recon(s):
    return s is not None and 'oq' in s and bool((s['oq'] == 1).any())


def merge(s, cols):
    """A month's state with its reconciliation columns replaced by a newly read set. Only the state's own rows are
    kept, and a missing reading is zero (the files leave zero readings out)."""
    old = [c for c in s.columns if c.startswith('O|')] + [c for c in ('oq',) if c in s]
    s = s.drop(columns=old)
    s = s.join(cols.reindex(s.index).fillna(0.0))
    s['oq'] = 1
    return s


def _frame(cols, index):
    return pd.DataFrame(cols, index=index) if cols else pd.DataFrame(index=index, dtype=float)


def _plant(js, name, index):
    """A plant's half-hourly MW in a month in the tracker layout (zero if the month doesn't have it)."""
    for p in js['plants']:
        if p['name'] == name:
            return pd.Series(np.asarray(p['s'], float), index=index)
    return pd.Series(0.0, index=index)


def _rest(o, js, prof, month, nmap, recon):
    """Each named plant's output the month's layout lacks (Ngāwhā A and the rest of the station when only Ngāwhā B is
    dispatched; all of Teviot, never dispatched), half-hourly MW by plant.
    With reconciliation data (recon), the point's leftover holds it alongside any other plant there: the plant gets
    the leftover less the other plants' usual output at that point (their average day, the blend), and the leftover
    keeps the rest (Ngāwhā's point has nothing else, so it gets all of it). Without, it is the plant's own average day
    from months with its metered output, less what the layout has; the leftover's average day already leaves it out.
    Not a fixed share of the point: that changes with the season (Teviot's from nearly all to almost none)."""
    rest = {}
    for poc, name in nmap.items():
        if recon:
            if poc not in o:
                continue
            have = {k: v for k, v in prof.items() if poc in v.get('other', {})}
            days = [_prof_frame({poc: have[k]['other'][poc]}) for k in _used(have, month)]
            usual = carry(blend(days[0], days[1] if len(days) > 1 else None), o.index)[poc] if days else 0.0
            r = (o[poc] - usual).clip(lower=0)
            o[poc] = o[poc] - r
        else:
            have = {k: v for k, v in prof.items() if name in v.get('plants', {})}
            days = [_prof_frame({name: have[k]['plants'][name]}) for k in _used(have, month)]
            if not days:
                continue
            est = carry(blend(days[0], days[1] if len(days) > 1 else None), o.index)[name]
            r = (est - _plant(js, name, o.index)).clip(lower=0)
        rest[name] = r
    return o, rest


def layer(g, js, rows=None):
    """A month with reconciliation data: other embedded MW by grid exit point on the month's half-hourly grid
    (residual() from the state's columns). g is the state reindexed to that grid; js the month in the tracker layout
    (assemble()). Named plants' series count as injection at their point (see residual())."""
    rows = points() if rows is None else rows
    excl = {r['poc'] for r in rows if r['role'] == 'exclude'}
    c = counted(js, meters(rows))
    grid = c.index
    i = {}
    for col in (x for x in g.columns if x.startswith('O|')):
        poc = col[2:].split(' ', 1)[0]
        if poc not in excl:
            i[poc] = i.get(poc, 0) + g[col].reindex(grid).fillna(0.0).to_numpy()
    i = _frame(i, grid)
    return (i - c.reindex(columns=i.columns, fill_value=0.0)).clip(lower=0)


def _prof_json(p):
    return {k: [round(float(x), 2) for x in p[k].fillna(0).to_numpy()] for k in p.columns}


def _prof_frame(d):
    return pd.DataFrame(d, index=range(48)) if d else None


def _used(prof, month):
    """The months an estimate for 'month' is blended from: the newest before it, and the same month a year earlier."""
    keys = sorted(k for k in prof if k < month)
    if not keys:
        return []
    yb = f'{int(month[:4]) - 1}{month[4:]}'
    return [keys[-1]] + ([yb] if yb in prof and yb != keys[-1] else [])


def month_block(g, js, month, metered, prof, file=None, rows=None, split=None, isl=None, log=print):
    """js['oemb'] for a history month from LAYER_FROM, or None before it (or with nothing to estimate from).
    prof (hist/oemb/profiles.json's 'months') is read for estimates and updated with this month's average days.

    The block (kept apart from the island series until the site shows the layer):
      src: 'recon' (the reconciliation data) or 'estimate' (the blend of average days, months it doesn't cover yet)
      file / from: the reconciliation file read, or the months the estimate came from
      NI, SI: {fuel: half-hourly MW}; named: {plant: half-hourly MW the layout lacks for it} (Ngāwhā's and Teviot's
      rest in months without their metered data); pts: {grid exit point: average MW} (the layer, before fuels)
    prof[month], for a month with reconciliation data: other (each point's average day, the named plants' rest taken
    out), plants (the named plants' average day from their metered output, metered months only) and file."""
    if month < LAYER_FROM:
        return None
    rows = points() if rows is None else rows
    split = registry_split() if split is None else split
    nmap = named_points(rows)
    used = _used(prof, month)
    if has_recon(g):
        o = layer(g, js, rows)
        o, rest = (o, {}) if metered else _rest(o, js, prof, month, nmap, recon=True)
        prof[month] = {'other': _prof_json(profile(o)), 'file': file}
        if metered:   # the named plants' own average days, from their metered output
            idx = o.index
            prof[month]['plants'] = _prof_json(profile(pd.DataFrame({n: _plant(js, n, idx) for n in nmap.values()})))
        for k in sorted(prof)[:-PROFILE_MONTHS]:
            del prof[k]
        out = {'src': 'recon', 'file': file}
    else:
        if not used:
            log('other embedded: no average day to estimate from')
            return None
        grid = counted(js, meters(rows)).index
        other = blend(*[_prof_frame(prof[k]['other']) for k in used] + [None] * (2 - len(used)))
        o = carry(other, grid) if other is not None else _frame({}, grid)
        rest = {} if metered else _rest(o, js, prof, month, nmap, recon=False)[1]
        out = {'src': 'estimate', 'from': used}
    for side, fs in _by_island(o, rows, split, isl, log).items():
        out[side] = {f: [round(float(x), 1) for x in v] for f, v in fs.items()}
    out['named'] = {p: [round(float(x), 1) for x in np.asarray(v, float)] for p, v in rest.items()
                    if float(np.sum(v)) > 0}
    out['pts'] = {poc: round(float(o[poc].mean()), 2) for poc in sorted(o.columns) if o[poc].mean() >= 0.005}
    return out


def _by_island(o, rows, split, isl=None, log=print):
    """MW by grid exit point -> {island: {fuel: array}}, fuels with no output left out."""
    isl = isl or (lambda poc: '')
    unknown = set()
    fu = {side: pd.DataFrame(0.0, index=o.index, columns=list(FUELS)) for side in ('NI', 'SI')}
    for poc in o.columns:
        side = isl(poc)
        if side not in fu:
            unknown.add(poc)
            continue
        for f, sh in fuel_of(poc, rows, split).items():
            fu[side][f] += o[poc].fillna(0).to_numpy() * sh
    if unknown:
        log('other embedded: WARNING grid exit points with no island, left out:', sorted(unknown))
    return {side: {f: fu[side][f].to_numpy() for f in FUELS if fu[side][f].abs().sum() > 0} for side in ('NI', 'SI')}


# ---------- the live week (update.py) ----------
#
# The history job writes hist/oemb/live.json (live_days): for the months the live week can touch, the layer's typical
# day by island and fuel and each named plant's, 48 half-hours each. The live job lays them over its week (live_block).

def live_days(prof, months, rows=None, split=None, isl=None, log=print):
    """{month: {from, NI: {fuel: [48]}, SI: {...}, plants: {name: [48]}}} for each month that has months to blend
    from (the newest with reconciliation data before it and the same month a year earlier, as month_block)."""
    rows = points() if rows is None else rows
    split = registry_split() if split is None else split
    out = {}
    for m in months:
        used = _used(prof, m)
        if not used:
            continue
        other = blend(*[_prof_frame(prof[k]['other']) for k in used] + [None] * (2 - len(used)))
        day = {'from': used}
        for side, fs in _by_island(other.fillna(0), rows, split, isl, log).items():
            day[side] = {f: [round(float(x), 2) for x in v] for f, v in fs.items()}
        day['plants'] = {}
        for name in named_points(rows).values():
            have = {k: v for k, v in prof.items() if name in v.get('plants', {})}
            ds = [_prof_frame({name: have[k]['plants'][name]}) for k in _used(have, m)]
            if ds:
                p = blend(ds[0], ds[1] if len(ds) > 1 else None)[name]
                day['plants'][name] = [round(float(x), 2) for x in p.fillna(0)]
        out[m] = day
    return out


def live_block(days, js):
    """tracker.json's 'oemb' for the live week (js in the tracker layout, 5-minute steps), or None without typical days.
      src: 'estimate'; days: {month: {from, NI, SI}}, the layer's typical day by island and fuel for each month the week
      touches (48 half-hours from local midnight; the site lays them over the week, since the layer here doesn't follow
      the live data); named: {plant: MW for each interval}, the named plants' typical day less what the live data has
      for them (Ngāwhā less Ngāwhā B; all of Teviot), which does follow it."""
    if not days:
        return None
    idx = pd.to_datetime(js['t0'] + np.arange(js['N']) * js['step'], unit='ms', utc=True)
    local = idx.tz_convert(NZ)
    month = local.strftime('%Y-%m')
    slot = np.asarray(local.hour * 2 + local.minute // 30)
    keys = sorted(days)
    pick = {m: days.get(m) or days[max([k for k in keys if k <= m] or keys[:1])] for m in sorted(set(month))}
    out = {'src': 'estimate', 'days': {m: {k: d[k] for k in ('from', 'NI', 'SI') if k in d} for m, d in pick.items()},
           'named': {}}
    names = {n for d in pick.values() for n in d.get('plants', {})}
    for name in sorted(names):
        est = np.zeros(len(idx))
        for m, d in pick.items():
            at = np.asarray(month == m)
            if name in d.get('plants', {}):
                est[at] = np.asarray(d['plants'][name])[slot[at]]
        have = next((np.asarray(p['s'], float) for p in js['plants'] if p['name'] == name), np.zeros(len(idx)))
        r = np.clip(est - np.nan_to_num(have), 0, None)
        if r.sum() > 0:
            out['named'][name] = [round(float(x), 1) for x in r]
    return out
