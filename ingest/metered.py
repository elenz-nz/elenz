"""Metered history: generation, demand and Tiwai from the EA's monthly metered data, back to August 1997.

The daily dispatch files only start on 10 Sep 2020, so older history comes from metering. It is also the more
accurate record (it's what the market settles on), so every month the EA has published it for uses it, and dispatch
data only fills in what the metering lacks (plants not in it yet, batteries) and the last few weeks before it's
published (Generation_MD arrives ~5-6 weeks after each month).

Sources (EMI, CC BY 4.0), one file per month:
  Generation/Generation_MD             half-hourly kWh per (POC, generator code), Aug 1997 on: grid-connected
                                       stations, and embedded ones from 2009
  Metered_data/Embedded_generation     half-hourly kWh injected at embedded connection points (Oct 1998 on): the
                                       embedded stations before 2009, and the gross output where Generation_MD has only
                                       a net figure (Mangahao, Cobb, Te Huka 3, Omeheu ...)
  Metered_data/Grid_export             half-hourly kWh leaving the grid at every connection point (Oct 1996 on)
  Metered_data/Grid_import             half-hourly kWh entering the grid at every connection point (Oct 2000 on)
  Metered_data/Grid_export_to_Tiwai    the smelter (Oct 1996 on)
  Volumes/Reconciliation               monthly injection and offtake by connection point, network and trader (2005 on,
                                       ~20 MB gzipped): read only for months a metered_plants.csv row with code
                                       R:<trader> is active (Mill Creek's first months, Apr 2014 - Aug 2015, are in
                                       neither file above)

State columns for a month (half-hourly, trading period start, UTC), alongside the dispatch columns (state.py):
  M|POC code   Generation_MD MW by connection point and generator code (mapped to plants later, so fixes to
               facilities/metered_plants.csv apply to history without downloading again)
  E|POC        Embedded_generation injection MW, for the connection points listed in metered_plants.csv
  X|NI, X|SI   Grid_export MW by island; I|NI, I|SI Grid_import MW by island (blank before Oct 2000)
  J|NI, J|SI   Generation_MD MW at connection points Grid_import doesn't cover (see demand())
  MT           Tiwai MW
  Q|POC TRADER reconciled injection MW, for the R:<trader> rows of metered_plants.csv; mq 1 once the month's
               reconciliation file has been read
  mg           1 where Generation_MD covers the trading period
  mc           1 once a month with a clock-numbered change day (before 2009) has been read with straighten()

Generation per plant (generation()): each Generation_MD code goes to its plant (metered_plants.csv); where an
embedded meter is listed for a connection point and reads more than Generation_MD there (a net meter, or a plant
Generation_MD lacks), the difference goes to that row's plant.

Demand (demand()): what leaves the grid for consumers, defined as dispatch defines island load (the sum of load at
every node, with dispatched embedded generation counted as generation, not as less load):
  demand = grid exports - grid imports + generation
so embedded plants netted off at their grid point are added back, and losses come out of generation. Before
Oct 2000 there is no Grid_import file and Generation_MD (then grid stations only, which inject at their own grid
point) stands in for imports, and until about 2003 Grid_import covered only local networks' injections, so
Generation_MD stands in for every connection point it lacks. Over Sep 2020 - Sep 2026 this matches the dispatch
data's island load within 1-2%.
"""
import csv
import gzip
import io
import os
import re
from datetime import date

import numpy as np
import pandas as pd

from common import BLOB, FACILITIES, NZ, connection_islands, island_of

GMD = 'Datasets/Wholesale/Generation/Generation_MD'
MD = 'Datasets/Wholesale/Metered_data'
RECON = 'Datasets/Wholesale/Volumes/Reconciliation'
FIRST_MONTH = date(1997, 8, 1)          # Generation_MD's first month
GRID_IMPORT_FROM = date(2000, 10, 1)    # Grid_import's first month
EMBEDDED_FROM = date(1998, 10, 1)       # Embedded_generation's first month
GMD_STRAIGHT_FROM = date(2009, 1, 1)    # Generation_MD counts clock-change days straight from 2009 (straighten())
STEP = pd.Timedelta(minutes=30)


def clock_change_days(days):
    """{date: +1 (clocks forward: 46 trading periods) or -1 (back: 50)} for the NZ clock-change days among days."""
    out = {}
    for x in pd.unique(days):
        x = pd.Timestamp(x).normalize()
        a = x.tz_localize(NZ).utcoffset()
        b = (x + pd.Timedelta(days=1)).tz_localize(NZ).utcoffset()
        if a != b:
            out[x] = 1 if b > a else -1
    return out


def straighten(d, tps):
    """Renumber clock-change days that a file numbers by the clock. The current files count trading periods straight
    through a change (46 periods on the day the clocks go forward, 50 when they go back), but Generation_MD until
    2008 numbers those days by the clock (every other metered file counts straight throughout: checked for each change
    day Oct 1997 - Sep 2026). On those days it has
      clocks forward: TP1-4 (00:00-02:00), TP5-6 empty (02:00-03:00 never happens), TP7-46 = 03:00-23:00, and nothing
                      for 23:00-24:00 (it stops at TP46): TP7-46 become straight periods 5-44, and 45-46 repeat TP46
      clocks back:    48 periods, with the repeated hour 02:00-03:00 only once (TP5-6): TP5-48 become straight periods
                      7-50, and the hour's first occurrence (straight 5-6) repeats TP5-6
    so the generation there is right in time, and the missing hour is filled from its neighbour rather than left at
    nothing (which made demand negative). d's trading_date must be parsed already; returns (d, tps)."""
    days = clock_change_days(d.trading_date)
    if not days:
        return d, tps
    for k in range(1, 51):
        if f'tp{k}' not in d:
            d[f'tp{k}'] = np.nan
    tps = [f'tp{k}' for k in range(1, 51)]
    for day, way in days.items():
        rows = (d.trading_date == day).to_numpy()
        if not rows.any():
            continue
        x = d.loc[rows, tps].to_numpy(dtype=float)
        has = ~np.isnan(x).all(axis=0)              # has[k-1]: some row has TPk
        new = np.full_like(x, np.nan)
        if way == 1 and not has[4] and not has[5] and has[6] and not has[46:].any():
            new[:, :4] = x[:, :4]
            new[:, 4:44] = x[:, 6:46]
            new[:, 44] = new[:, 45] = x[:, 45]
        elif way == -1 and not has[48:].any() and has[47]:
            new[:, :4] = x[:, :4]
            new[:, 4:6] = x[:, 4:6]
            new[:, 6:50] = x[:, 4:48]
        else:
            continue
        d.loc[rows, tps] = new
    return d, tps


def read_emi(raw):
    """An EMI metered-data CSV (TP1..TP50 columns, kWh) -> long frame: lower-case id columns, t (trading period start,
    UTC) and mw. Handles both date styles (dd/mm/yyyy in the early files, yyyy-mm-dd later)."""
    d = pd.read_csv(io.BytesIO(raw), low_memory=False)
    d.columns = [c.strip().lower() for c in d.columns]
    tps = [c for c in d.columns if c.startswith('tp') and c[2:].isdigit()]
    ids = [c for c in d.columns if c not in tps]
    for c in tps:
        d[c] = pd.to_numeric(d[c], errors='coerce')
    s = d.trading_date.astype(str)
    d['trading_date'] = pd.to_datetime(s, format='%d/%m/%Y') if s.iloc[0][2:3] == '/' else pd.to_datetime(s.str[:10], format='%Y-%m-%d')
    d, tps = straighten(d, tps)
    m = d.melt(id_vars=ids, value_vars=tps, var_name='tp', value_name='kwh').dropna(subset=['kwh'])
    m['tp'] = m.tp.str[2:].astype(int)
    day = m.trading_date
    # trading period k starts (k-1) half-hours after local midnight, counting straight through a clock change
    m['t'] = day.dt.tz_localize(NZ).dt.tz_convert('UTC') + pd.to_timedelta((m.tp - 1) * 30, unit='min')
    m['mw'] = m.kwh / 500.0
    return m


def table():
    """facilities/metered_plants.csv rows: poc, code (Generation_MD generator code, '*' = the embedded meter at the
    POC, 'R:<trader>' = that trader's reconciled injection at the POC), plant ('-' = ignore), fuel, isl, from/to (YYYY-MM, inclusive), share (of the code's output; default 1)."""
    with open(os.path.join(FACILITIES, 'metered_plants.csv'), encoding='utf-8') as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        r['share'] = float(r['share']) if r.get('share') else 1.0
    return rows


_ISL = None


def islands():
    """POC -> island for metered data: connection_points.csv and [islands], plus facilities/metered_islands.csv
    (connection points in EMI's NetworkSupplyPointsTable that the dispatch feed never uses, many of them retired)."""
    global _ISL
    if _ISL is None:
        t = {}
        with open(os.path.join(FACILITIES, 'metered_islands.csv')) as f:
            t.update({r['poc']: r['island'] for r in csv.DictReader(f)})
        t.update(connection_islands())
        _ISL = t
    return _ISL


def _active(r, month):
    return (not r['from'] or month >= r['from']) and (not r['to'] or month <= r['to'])


def embedded_pocs():
    return sorted({r['poc'] for r in table() if r['code'] == '*'})


def recon_rows(month):
    """metered_plants.csv rows read from the reconciliation data that are active in month 'YYYY-MM'."""
    return [r for r in table() if r['code'].startswith('R:') and _active(r, month)]


def fetch_recon(get, m, rows, log=print):
    """Reconciled injection (MW) at the rows' connection points by their traders, for month m: the month's latest
    revision of ReconciledInjectionAndOfftake. None if it isn't published."""
    tag = f'{m:%Y%m}'
    listing = get(f'{BLOB}?restype=container&comp=list&prefix={RECON}/{m.year}/ReconciledInjectionAndOfftake_{tag}_')
    names = sorted(re.findall(r'<Name>([^<]+)</Name>', listing.decode())) if listing else []
    if not names:
        log(f'  {tag}: no reconciliation file')
        return None
    raw = get(f'{BLOB}/{names[-1]}')
    if raw is None:
        return None
    d = pd.read_csv(io.BytesIO(gzip.decompress(raw)), usecols=['PointOfConnection', 'Participant', 'TradingDate',
                                                                'TradingPeriod', 'FlowDirection', 'KilowattHours'])
    want = {(r['poc'], r['code'][2:]) for r in rows}
    pairs = np.array([(p, t) in want for p, t in zip(d.PointOfConnection, d.Participant)], dtype=bool)
    d = d[(d.FlowDirection == 'Injection').to_numpy() & pairs]
    if d.empty:
        return pd.DataFrame({'mq': []})
    day = pd.to_datetime(d.TradingDate.astype(str).str[:10], format='%Y-%m-%d')
    d = d.assign(t=day.dt.tz_localize(NZ).dt.tz_convert('UTC') + pd.to_timedelta((d.TradingPeriod - 1) * 30, unit='min'),
                 key='Q|' + d.PointOfConnection + ' ' + d.Participant, mw=d.KilowattHours / 500.0)
    return d.pivot_table(index='t', columns='key', values='mw', aggfunc='sum')


def fetch_month(get, m, log=print):
    """Metered columns for month m (a date, first of the month), or None if Generation_MD isn't published yet."""
    tag = f'{m:%Y%m}'
    raw = get(f'{BLOB}/{GMD}/{tag}_Generation_MD.csv')
    if raw is None:
        return None
    g = read_emi(raw)
    g['key'] = 'M|' + g.poc_code + ' ' + g.gen_code.astype(str)
    out = [g.pivot_table(index='t', columns='key', values='mw', aggfunc='sum')]
    covered = g.groupby('t').size().rename('mg') * 0 + 1
    out.append(covered.to_frame())
    if clock_month(m):
        out.append(covered.rename('mc').to_frame())   # read with straighten(): states from before it are refetched

    isl_tab = islands()
    isl = lambda poc: island_of(poc, isl_tab)

    raw = get(f'{BLOB}/{MD}/Embedded_generation/{tag}_Embedded_generation.csv')
    if raw is not None:
        out.append(covered.rename('me').to_frame())
        e = read_emi(raw)
        e = e[(e.flow_direction == 'I') & e.poc.isin(embedded_pocs())]
        if len(e):
            out.append(e.pivot_table(index='t', columns='poc', values='mw', aggfunc='sum').add_prefix('E|'))

    rr = recon_rows(f'{m:%Y-%m}')
    if rr:
        q = fetch_recon(get, m, rr, log)
        if q is not None:
            out.append(covered.rename('mq').to_frame())
            if len(q.columns):
                out.append(q)

    unknown = set()
    import_pocs = set()
    for name, prefix in (('Grid_export', 'X'), ('Grid_import', 'I')):
        raw = get(f'{BLOB}/{MD}/{name}/{tag}_{name}.csv')
        if raw is None:
            if prefix == 'X' or m >= GRID_IMPORT_FROM:
                log(f'  {tag}: {name} not published yet')
            continue
        x = read_emi(raw)
        x['isl'] = x.poc.map(isl)
        unknown |= set(x.poc[x.isl == ''])
        x = x[x.isl.isin(['NI', 'SI'])]
        if prefix == 'I':
            import_pocs = set(x.poc)
        out.append(x.pivot_table(index='t', columns='isl', values='mw', aggfunc='sum').add_prefix(f'{prefix}|'))
    # Generation_MD at connection points Grid_import doesn't cover (all of them before Oct 2000; the generating
    # stations until about 2003, when Grid_import had only local networks' injections): it stands in for their imports
    g['isl'] = g.poc_code.map(isl)
    j = g[~g.poc_code.isin(import_pocs) & g.isl.isin(['NI', 'SI'])]
    out.append(j.pivot_table(index='t', columns='isl', values='mw', aggfunc='sum').reindex(columns=['NI', 'SI']).fillna(0).add_prefix('J|'))
    if unknown:
        log(f'  {tag}: WARNING grid connection points with no island (add to [islands] in overrides.toml):', sorted(unknown))

    raw = get(f'{BLOB}/{MD}/Grid_export_to_Tiwai/{tag}_Grid_export_to_Tiwai.csv')
    if raw is not None:
        out.append(read_emi(raw).groupby('t').mw.sum().rename('MT').to_frame())

    s = pd.concat(out, axis=1)
    s.index.name = 't'
    # the month's own trading periods only (files carry whole NZ trading days)
    start = pd.Timestamp(m, tz=NZ).tz_convert('UTC')
    end = pd.Timestamp(date(m.year + (m.month == 12), m.month % 12 + 1, 1), tz=NZ).tz_convert('UTC')
    s = s[(s.index >= start) & (s.index < end)]
    gen_cols = [c for c in s.columns if c[:2] in ('M|', 'E|', 'Q|')]
    s[gen_cols] = s[gen_cols].fillna(0.0)
    return s


def complete(s, m):
    """True if a month's state holds all of its metered data: Generation_MD, grid exports, and grid imports and
    embedded generation for the months those files exist."""
    if s is None or 'mg' not in s or not (s['mg'] == 1).any():
        return False
    if 'X|NI' not in s or s['X|NI'].isna().all() or 'J|NI' not in s:
        return False
    if m >= GRID_IMPORT_FROM and ('I|NI' not in s or s['I|NI'].isna().all()):
        return False
    if m >= EMBEDDED_FROM and ('me' not in s or not (s['me'] == 1).any()):
        return False
    if recon_rows(f'{m:%Y-%m}') and ('mq' not in s or not (s['mq'] == 1).any()):
        return False
    if clock_month(m) and ('mc' not in s or not (s['mc'] == 1).any()):
        return False
    return True


def clock_month(m):
    """True for a month whose Generation_MD numbers a clock-change day by the clock (before 2009), so its metered data
    must have been read with straighten()."""
    if m >= GMD_STRAIGHT_FROM:
        return False
    nxt = date(m.year + (m.month == 12), m.month % 12 + 1, 1)
    return bool(clock_change_days(pd.date_range(m, nxt, inclusive='left')))


def generation(s, month, log=print):
    """Metered columns of a month's state -> {(plant, fuel, island): {POC: MW Series}}: Generation_MD by code and
    the embedded meters' residuals, as metered_plants.csv says."""
    rows = [r for r in table() if _active(r, month)]
    isl_tab = islands()
    by_code, emb = {}, {}
    for r in rows:
        (emb if r['code'] == '*' else by_code).setdefault((r['poc'], r['code']), []).append(r)
    out, unmapped = {}, {}

    def add(r, series):
        if r['plant'] == '-':
            return
        isl = r['isl'] or island_of(r['poc'], isl_tab)
        d = out.setdefault((r['plant'], r['fuel'], isl), {})
        d[r['poc']] = d.get(r['poc'], 0) + series * r['share']

    gmd_at = {}
    for c in [c for c in s.columns if c.startswith('M|')]:
        poc, code = c[2:].split(' ', 1)
        series = s[c].fillna(0)
        rs = by_code.get((poc, code))
        if not rs:
            if series.abs().max() > 0.5:
                unmapped[c[2:]] = round(float(series.mean()), 1)
            continue
        if all(r['plant'] == '-' for r in rs):
            continue
        gmd_at[poc] = gmd_at.get(poc, 0) + series
        for r in rs:
            add(r, series)
    # reconciled injection by trader (R:<trader> rows), for plants in neither file above
    for c in [c for c in s.columns if c.startswith('Q|')]:
        poc, trader = c[2:].split(' ', 1)
        for r in by_code.get((poc, 'R:' + trader), []):
            add(r, s[c].fillna(0))
    # embedded meters: each listed one's reading over Generation_MD at its connection point, by plant; a plant whose
    # embedded reading for the month peaks above 1.4 times its max_mw is halved (Trustpower's embedded meters reported
    # double values until Jul 2005: Kaimai, Rotokawa, Tararua ... peaking at twice their capacity)
    emb_out, cap_of = {}, {}
    for c in [c for c in s.columns if c.startswith('E|')]:
        poc = c[2:]
        rs = emb.get((poc, '*'))
        if not rs:
            continue
        resid = (s[c].fillna(0) - gmd_at.get(poc, 0)).clip(lower=0)
        if resid.max() > 0:
            for r in rs:
                if r['plant'] == '-':
                    continue
                isl = r['isl'] or island_of(r['poc'], isl_tab)
                k = (r['plant'], r['fuel'], isl)
                d = emb_out.setdefault(k, {})
                d[poc] = d.get(poc, 0) + resid * r['share']
                if r.get('max_mw'):
                    cap_of[k] = float(r['max_mw'])
    for k, by_poc in emb_out.items():
        peak = float(sum(by_poc.values()).max())
        if k in cap_of and peak > 1.4 * cap_of[k]:
            log(f'{k[0]} embedded reading peaks at {peak:.0f} MW (max {cap_of[k]:.0f}): halved')
            by_poc = {p: v * 0.5 for p, v in by_poc.items()}
        d = out.setdefault(k, {})
        for p, v in by_poc.items():
            d[p] = d.get(p, 0) + v
    if unmapped:
        log(f'WARNING Generation_MD codes not in facilities/metered_plants.csv (mean MW): {unmapped}')
    return out


def capacities():
    """Nameplate MW for plants the register doesn't list (retired or never dispatched): metered_plants.csv's cap."""
    return {r['plant']: float(r['cap']) for r in table() if r.get('cap')}


def demand(s, gen_by_island):
    """Island demand (MW) for a metered month: grid exports - grid imports + generation (see the module notes), with
    Generation_MD standing in for the imports of connection points Grid_import doesn't cover (J|)."""
    out = {}
    for isl in ('NI', 'SI'):
        x = s.get(f'X|{isl}')
        imp = s[f'I|{isl}'].fillna(0) if f'I|{isl}' in s else 0
        imp = imp + (s[f'J|{isl}'].fillna(0) if f'J|{isl}' in s else 0)
        out[isl] = x - imp + gen_by_island[isl]
    return out
