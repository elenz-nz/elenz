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

State columns for a month (half-hourly, trading period start, UTC), alongside the dispatch columns (state.py):
  M|POC code   Generation_MD MW by connection point and generator code (mapped to plants later, so fixes to
               facilities/metered_plants.csv apply to history without downloading again)
  E|POC        Embedded_generation injection MW, for the connection points listed in metered_plants.csv
  X|NI, X|SI   Grid_export MW by island; I|NI, I|SI Grid_import MW by island (blank before Oct 2000)
  J|NI, J|SI   Generation_MD MW at connection points Grid_import doesn't cover (see demand())
  MT           Tiwai MW
  mg           1 where Generation_MD covers the trading period

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
import io
import os
from datetime import date

import numpy as np
import pandas as pd

from common import BLOB, FACILITIES, NZ, connection_islands, island_of

GMD = 'Datasets/Wholesale/Generation/Generation_MD'
MD = 'Datasets/Wholesale/Metered_data'
FIRST_MONTH = date(1997, 8, 1)          # Generation_MD's first month
GRID_IMPORT_FROM = date(2000, 10, 1)    # Grid_import's first month
EMBEDDED_FROM = date(1998, 10, 1)       # Embedded_generation's first month
STEP = pd.Timedelta(minutes=30)


def read_emi(raw):
    """An EMI metered-data CSV (TP1..TP50 columns, kWh) -> long frame: lower-case id columns, t (trading period start,
    UTC) and mw. Handles both date styles (dd/mm/yyyy in the early files, yyyy-mm-dd later)."""
    d = pd.read_csv(io.BytesIO(raw), low_memory=False)
    d.columns = [c.strip().lower() for c in d.columns]
    tps = [c for c in d.columns if c.startswith('tp') and c[2:].isdigit()]
    ids = [c for c in d.columns if c not in tps]
    for c in tps:
        d[c] = pd.to_numeric(d[c], errors='coerce')
    m = d.melt(id_vars=ids, value_vars=tps, var_name='tp', value_name='kwh').dropna(subset=['kwh'])
    m['tp'] = m.tp.str[2:].astype(int)
    s = m.trading_date.astype(str)
    day = pd.to_datetime(s, format='%d/%m/%Y') if s.iloc[0][2:3] == '/' else pd.to_datetime(s.str[:10], format='%Y-%m-%d')
    # trading period k starts (k-1) half-hours after local midnight, counting straight through a clock change
    m['t'] = day.dt.tz_localize(NZ).dt.tz_convert('UTC') + pd.to_timedelta((m.tp - 1) * 30, unit='min')
    m['mw'] = m.kwh / 500.0
    return m


def table():
    """facilities/metered_plants.csv rows: poc, code (Generation_MD generator code, '*' = the embedded meter at the
    POC), plant ('-' = ignore), fuel, isl, from/to (YYYY-MM, inclusive), share (of the code's output; default 1)."""
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

    isl_tab = islands()
    isl = lambda poc: island_of(poc, isl_tab)

    raw = get(f'{BLOB}/{MD}/Embedded_generation/{tag}_Embedded_generation.csv')
    if raw is not None:
        out.append(covered.rename('me').to_frame())
        e = read_emi(raw)
        e = e[(e.flow_direction == 'I') & e.poc.isin(embedded_pocs())]
        if len(e):
            out.append(e.pivot_table(index='t', columns='poc', values='mw', aggfunc='sum').add_prefix('E|'))

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
    gen_cols = [c for c in s.columns if c[:2] in ('M|', 'E|')]
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
    return True


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
