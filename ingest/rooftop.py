"""Rooftop (distributed) solar: installed capacity and modelled output.

Capacity: the EA's installed distributed solar (EMI report GUEHMT) by Root NSP, for systems of 10 kW or less and
over 10 kW, less the dispatched solar farms the registry also counts (facilities/overrides.toml
[solar_farms_in_registry]): the tracker already shows those as grid solar. Each NSP belongs to one of ~22 irradiance
points (facilities/rooftop_points.csv, rooftop_nsp.csv), clusters weighted by installed capacity.

Output: Himawari satellite irradiance for each point (Open-Meteo Satellite Radiation API, 10-minute, ~1 hour behind
real time, archive back to 2016), through a PV model (pv.py) with a mix of roof orientations and tilts, cell
temperature, inverter clipping and losses, then a calibration factor from the analysis in analysis/.
"""
import csv
import io
import json
import os
import warnings
from urllib.request import Request, urlopen

import numpy as np
import pandas as pd

import pv
from common import FACILITIES, overrides

GUEHMT_NSP = ('https://www.emi.ea.govt.nz/Retail/Download/DataReport/CSV/GUEHMT?DateFrom=20130901&DateTo={to}'
              '&RegionType=NSP_ROOT&FuelType=solar_all&MarketSegment=All&Capacity={band}&seriesFilter=ALL')
SATELLITE = 'https://satellite-api.open-meteo.com/v1/archive'
FORECAST = 'https://api.open-meteo.com/v1/forecast'

# Roof orientations: (tilt°, azimuth° clockwise from north, share). Small: systems of 10 kW or less (mostly homes,
# pitched roofs facing north-ish); large: over 10 kW (businesses, farm sheds, schools: flatter roofs, more east-west).
# Assumptions, not measured: see the About page and analysis/README.md.
ORIENT = {
    'small': [(20, 0, .40), (20, 45, .15), (20, 315, .15), (20, 90, .10), (20, 270, .10), (10, 0, .10)],
    'large': [(10, 0, .35), (10, 90, .20), (10, 270, .20), (25, 0, .25)],
}
DC_AC = 1.2          # panel (DC) to inverter (AC) ratio; the registry records the lesser of the two, about the AC rating
LOSSES = 0.115       # soiling 2%, shading 3%, wiring and mismatch 3%, ageing 2.5%, downtime 1.5% (combined)
# Calibration (analysis/README.md, Oct 2026): established dispatched farms produce 88-98% of what this chain
# predicts from satellite irradiance, and satellite sunshine totals run up to ~5% above NIWA's long-term figures in
# places, so the model is scaled by 0.95 (about ±6%).
CAL = 0.95
UNCERTAINTY = {'capacity': 0.04, 'calibration': 0.06, 'clear': 0.05, 'cloudy': 0.18, 'nowcast': 0.12}   # one std dev
EXTRAPOLATE_DAYS = 120    # carry the recent growth beyond the latest report for at most this long


# ---------- points ----------

def points():
    """[(point id, island, lat, lon)] and {Root NSP: point id}."""
    with open(os.path.join(FACILITIES, 'rooftop_points.csv')) as f:
        pts = [(r['point'], r['island'], float(r['lat']), float(r['lon'])) for r in csv.DictReader(f)]
    with open(os.path.join(FACILITIES, 'rooftop_nsp.csv')) as f:
        nsp = {r['nsp']: r['point'] for r in csv.DictReader(f)}
    return pts, nsp


def point_of(nsp, table, pts):
    """An NSP's point: from the table, else another NSP at the same grid connection (POC) or site, else the
    biggest point on the NSP's island (facilities/connection_points.csv)."""
    if nsp in table:
        return table[nsp]
    for n in (7, 3):
        for k, v in table.items():
            if k[:n] == nsp[:n]:
                return v
    from common import connection_islands, island_of
    isl = island_of(nsp[:7], connection_islands()) or 'NI'
    with open(os.path.join(FACILITIES, 'rooftop_points.csv')) as f:
        rows = [r for r in csv.DictReader(f) if r['island'] == isl]
    return max(rows, key=lambda r: float(r['mw']))['point']


# ---------- capacity ----------

def parse_guehmt(raw, value='Total capacity installed'):
    """GUEHMT CSV (Root NSP rows) -> DataFrame, months (YYYY-MM) x NSP, of the column starting with `value`
    (MW installed by default; 'Avg. capacity - new' gives the average size of that month's new systems, kW)."""
    lines = raw.decode('utf-8-sig').splitlines()
    head = next(i for i, l in enumerate(lines) if l.startswith('Month end,'))
    d = pd.read_csv(io.StringIO('\n'.join(lines[head:])))
    col = next(c for c in d.columns if c.startswith(value))
    d['month'] = pd.to_datetime(d['Month end'], dayfirst=True).dt.strftime('%Y-%m')
    return d.pivot_table(index='month', columns='Region ID', values=col, aggfunc='sum').fillna(0.0)


def download_guehmt(get, today):
    """(small, large) raw CSVs: systems of 10 kW or less and over 10 kW, by Root NSP."""
    return tuple(get(GUEHMT_NSP.format(to=today.strftime('%Y%m%d'), band=b), timeout=300) for b in ('Small', 'Large'))


def solar_units():
    """POCs with a dispatched solar unit (register + overrides): a registry step there may be that farm."""
    from build_tracker import register
    fuel, names, cap = register()
    return {poc: names.get((poc, unit), unit) for (poc, unit), f in fuel.items() if f == 'solar'}


def capacity_table(raw_small, raw_large, log=print, warn_from=None):
    """Monthly installed distributed solar by Root NSP, less dispatched farms: {'months', 'nsps', 'small', 'large',
    'farms'}. Logs a warning for any unexplained step of 5 MW or more at an NSP with a dispatched solar unit."""
    small, large = parse_guehmt(raw_small), parse_guehmt(raw_large)
    months = sorted(set(small.index) | set(large.index))
    nsps = sorted(set(small.columns) | set(large.columns))
    small = small.reindex(index=months, columns=nsps).fillna(0.0)
    large = large.reindex(index=months, columns=nsps).fillna(0.0)
    farms = overrides().get('solar_farms_in_registry', {})
    removed = pd.DataFrame(0.0, index=months, columns=nsps)
    for name, f in farms.items():
        if f['nsp'] not in nsps:
            log(f'WARNING solar farm {name}: NSP {f["nsp"]} not in the GUEHMT report')
            continue
        for m, mw in f['steps']:
            removed.loc[removed.index >= m, f['nsp']] += mw
    net = (large - removed).clip(lower=0)
    try:
        units = solar_units()
    except Exception:
        units = {}
    step = net.diff()
    new_kw = parse_guehmt(raw_large, 'Avg. capacity - new').reindex(index=months, columns=nsps).fillna(0.0)
    warn_from = warn_from or months[max(0, len(months) - 3)]
    for nsp in nsps:
        if nsp[:7] in units:
            big = step[nsp][(step.index >= warn_from) & (step[nsp] >= 5) & (new_kw[nsp] >= 2000)]
            for m, v in big.items():
                log(f'WARNING distributed solar at {nsp} rose {v:.1f} MW (>10 kW) in {m}, and {units[nsp[:7]]} dispatches '
                    f'there: if that is the farm entering the registry, add it to [solar_farms_in_registry] in overrides.toml')
    total = (small + net).sum(axis=1)
    log(f'rooftop solar capacity: {total.iloc[-1]:.0f} MW at the end of {months[-1]} '
        f'({small.iloc[-1].sum():.0f} MW of 10 kW or less), after removing {removed.iloc[-1].sum():.0f} MW of dispatched farms')
    return {'months': months, 'nsps': nsps, 'small': {n: [round(float(x), 3) for x in small[n]] for n in nsps},
            'large': {n: [round(float(x), 3) for x in net[n]] for n in nsps},
            'farms': round(float(removed.iloc[-1].sum()), 1)}


def by_point(table):
    """Capacity table by NSP -> by irradiance point: {'months', 'small': {point: [MW]}, 'large': {...}}."""
    pts, nsp_pt = points()
    out = {'months': table['months'], 'small': {p[0]: np.zeros(len(table['months'])) for p in pts},
           'large': {p[0]: np.zeros(len(table['months'])) for p in pts}}
    for n in table['nsps']:
        p = point_of(n, nsp_pt, pts)
        for cls in ('small', 'large'):
            out[cls][p] += np.array(table[cls][n])
    for cls in ('small', 'large'):
        out[cls] = {p: [round(float(x), 2) for x in v] for p, v in out[cls].items()}
    out['farms'] = table.get('farms')
    return out


def capacity_at(cap, times):
    """MW installed at each time, by class and point: {'small': DataFrame (times x points), 'large': ...}.
    Each month's figure is taken at the month's end and interpolated by day between them; after the latest month the
    last six months' average growth carries on for up to EXTRAPOLATE_DAYS, then holds."""
    times = pd.DatetimeIndex(times)
    ends = pd.DatetimeIndex([pd.Timestamp(m + '-01', tz='UTC') + pd.offsets.MonthEnd(0) + pd.Timedelta(hours=12)
                             for m in cap['months']])
    epoch = pd.Timestamp(0, tz='UTC')
    x = np.asarray((ends - epoch) / pd.Timedelta(days=1), float)
    xt = np.asarray((times.tz_convert('UTC') - epoch) / pd.Timedelta(days=1), float)
    out = {}
    for cls in ('small', 'large'):
        cols = {}
        for p, v in cap[cls].items():
            v = np.asarray(v, float)
            s = np.interp(xt, x, v)
            if len(v) > 6:
                rate = max(0.0, (v[-1] - v[-7]) / (x[-1] - x[-7]))
                ahead = np.clip(xt - x[-1], 0, EXTRAPOLATE_DAYS)
                s = np.where(xt > x[-1], v[-1] + rate * ahead, s)
            cols[p] = s
        out[cls] = pd.DataFrame(cols, index=times)
    return out


# ---------- irradiance ----------

def satellite(get, start=None, end=None, past_hours=None):
    """Satellite GHI and diffuse (W/m²) for every point, 10-minute, indexed by each interval's midpoint (UTC):
    columns G|<point>, D|<point>. Either a UTC date range (start, end: dates) or the last past_hours."""
    pts, _ = points()
    lat = ','.join(str(p[2]) for p in pts)
    lon = ','.join(str(p[3]) for p in pts)
    q = (f'{SATELLITE}?latitude={lat}&longitude={lon}&hourly=shortwave_radiation,diffuse_radiation'
         '&models=satellite_radiation_seamless&temporal_resolution=native&timezone=GMT')
    q += f'&past_hours={past_hours}&forecast_hours=0' if past_hours else f'&start_date={start}&end_date={end}'
    locs = json.loads(get(q))
    if isinstance(locs, dict):
        locs = [locs]
    t = pd.DatetimeIndex(pd.to_datetime(locs[0]['hourly']['time'])).tz_localize('UTC')
    step = (t[1] - t[0]) if len(t) > 1 else pd.Timedelta(minutes=10)
    cols = {}
    for p, l in zip(pts, locs):
        cols[f'G|{p[0]}'] = pd.Series(l['hourly']['shortwave_radiation'], index=t, dtype=float)
        cols[f'D|{p[0]}'] = pd.Series(l['hourly']['diffuse_radiation'], index=t, dtype=float)
    df = pd.DataFrame(cols)
    df.index = df.index - step / 2      # backward averages: each value describes the interval ending at its time
    return df.dropna(how='all')


def fill_gaps(irr):
    """Satellite values come back blank while the sun is low (until it is roughly 10° up) and for a couple of
    Himawari housekeeping slots a day. Fill them from the clear-sky index (cloudiness) of the nearest valid values
    within two hours, times the clear-sky irradiance; with the sun below the horizon, zero."""
    if irr is None or irr.empty:
        return irr
    pts, _ = points()
    irr = irr.copy()
    for pid, isl, lat, lon in pts:
        g, d = f'G|{pid}', f'D|{pid}'
        if g not in irr:
            continue
        zen, _, _ = pv.sun(irr.index, lat, lon)
        cs = pv.clearsky_ghi(zen)
        gap = irr[g].isna().values
        if not gap.any():
            continue
        kt = pd.Series(np.where(cs > 20, irr[g].values / np.maximum(cs, 1), np.nan), index=irr.index)
        kt = kt.where(~gap).interpolate(limit=12, limit_direction='both').clip(0, 1.2)
        fr = pd.Series(np.where(irr[g].values > 20, irr[d].values / np.maximum(irr[g].values, 1), np.nan), index=irr.index)
        fr = fr.interpolate(limit=12, limit_direction='both').fillna(0.6).clip(0.1, 1)
        fill_g = np.where(zen >= 90, 0.0, kt.values * cs)
        fill = gap & np.isfinite(fill_g)
        irr.loc[fill, g] = fill_g[fill]
        if d in irr:
            irr.loc[fill & irr[d].isna().values, d] = (fill_g * fr.values)[fill & irr[d].isna().values]
    return irr


def half_hourly(irr, tps):
    """10-minute irradiance -> mean over each trading period starting at tps (UTC); NaN where none."""
    if irr is None or irr.empty:
        return pd.DataFrame(index=tps)
    full = pd.date_range(tps[0] + pd.Timedelta(minutes=5), tps[-1] + pd.Timedelta(minutes=25), freq='10min')
    irr = fill_gaps(irr.reindex(irr.index.union(full)))
    g = irr.groupby(irr.index.floor('30min')).mean()
    n = irr.groupby(irr.index.floor('30min')).count()
    g = g.where(n >= 2)      # at least two of the three 10-minute values
    return g.reindex(tps)


def nowcast(irr, times):
    """Irradiance at `times` (UTC, 5-minute) from 10-minute satellite values: interpolated where covered, and
    after the latest satellite value, the latest clear-sky index (mean of the last 30 minutes) carried forward for
    up to two hours. Returns (irradiance DataFrame, number of nowcast steps)."""
    pts, _ = points()
    times = pd.DatetimeIndex(times)
    out = {}
    irr = fill_gaps(irr)
    last = irr.dropna(how='all').index.max() if irr is not None and not irr.empty else None
    n_now = int((times > last).sum()) if last is not None else len(times)
    for pid, isl, lat, lon in pts:
        for k in ('G', 'D'):
            c = f'{k}|{pid}'
            s = irr[c] if irr is not None and c in irr else pd.Series(dtype=float)
            s = s.reindex(s.index.union(times)).interpolate(limit_area='inside', limit=4).reindex(times)
            out[c] = s
        if last is not None and n_now:
            zen_all, _, _ = pv.sun(irr.index, lat, lon)
            recent = irr.index > last - pd.Timedelta(minutes=30)
            cs = pv.clearsky_ghi(zen_all)
            g = irr[f'G|{pid}'].values
            ok = recent & (cs > 50) & np.isfinite(g)
            kt = float(np.clip(g[ok].sum() / cs[ok].sum(), 0, 1.2)) if ok.any() else np.nan
            dfrac = float(np.nanmean((irr[f'D|{pid}'].values / np.maximum(g, 1))[ok])) if ok.any() else 0.5
            ahead = (times > last) & (times <= last + pd.Timedelta(hours=2))
            zen_t, _, _ = pv.sun(times, lat, lon)
            gt = kt * pv.clearsky_ghi(zen_t)
            if np.isfinite(kt):
                out[f'G|{pid}'] = out[f'G|{pid}'].where(~ahead, gt)
                out[f'D|{pid}'] = out[f'D|{pid}'].where(~ahead, gt * min(max(dfrac, 0.1), 1))
    return pd.DataFrame(out, index=times), n_now


def t_air(times, lat):
    """Daytime air temperature (°C): a seasonal climatology by latitude (about Auckland 18 °C, Dunedin 13.5 °C
    annual daytime mean, ±4.5 °C summer to winter). Day-to-day swings change output by a few per cent at most."""
    doy = pd.DatetimeIndex(times).dayofyear.values
    mean = 18.0 - 0.55 * (abs(lat) - 36.8)
    return mean + 4.5 * np.cos(2 * np.pi * (doy - 35) / 365.25)


# ---------- output ----------

def yields(irr, times):
    """Output per MW installed (0-1) by class and point at `times` (interval midpoints, UTC), from the irradiance
    columns G|<point>, D|<point>: {'small': DataFrame, 'large': DataFrame, 'kt': DataFrame (clear-sky index)}."""
    pts, _ = points()
    times = pd.DatetimeIndex(times)
    out = {'small': {}, 'large': {}, 'kt': {}}
    for pid, isl, lat, lon in pts:
        zen, az, dex = pv.sun(times, lat, lon)
        ghi = irr[f'G|{pid}'].values if f'G|{pid}' in irr else np.full(len(times), np.nan)
        dhi = irr[f'D|{pid}'].values if f'D|{pid}' in irr else np.full(len(times), np.nan)
        missing = ~np.isfinite(ghi)
        ta = t_air(times, lat)
        for cls, mix in ORIENT.items():
            y = np.zeros(len(times))
            for tilt, saz, w in mix:
                eff, tot = pv.poa(ghi, dhi, zen, az, dex, tilt, saz)
                y += w * pv.ac_output(eff, pv.cell_temp(tot, ta), DC_AC, LOSSES)
            out[cls][pid] = np.where(missing, np.nan, y * CAL)
        cs = pv.clearsky_ghi(zen)
        out['kt'][pid] = np.where(cs > 50, np.nan_to_num(ghi) / np.maximum(cs, 1), np.nan)
    return {k: pd.DataFrame(v, index=times) for k, v in out.items()}


def output(irr, times, cap):
    """Rooftop solar MW by island at `times` (interval midpoints, UTC), plus its uncertainty (one standard
    deviation, MW): {'NI': Series, 'SI': Series, 'NIu': Series, 'SIu': Series}."""
    pts, _ = points()
    y = yields(irr, times)
    c = capacity_at(cap, times)
    res = {}
    for isl in ('NI', 'SI'):
        ids = [p[0] for p in pts if p[1] == isl]
        mw = sum(y[cls][ids].fillna(np.nan).values * c[cls][ids].values for cls in ('small', 'large'))
        total = pd.Series(np.nansum(mw, axis=1), index=times)
        total[np.isnan(mw).all(axis=1)] = np.nan
        # uncertainty: capacity (registry) plus the model, larger under cloud (clear-sky index below ~0.6)
        with warnings.catch_warnings():   # all-NaN rows at night
            warnings.simplefilter('ignore', RuntimeWarning)
            kt = np.nanmean(np.clip(y['kt'][ids].values, 0, 1), axis=1) if len(ids) else np.full(len(times), np.nan)
        kt = np.nan_to_num(kt, nan=1.0)
        frac = UNCERTAINTY['cloudy'] + (UNCERTAINTY['clear'] - UNCERTAINTY['cloudy']) * np.clip((kt - 0.3) / 0.5, 0, 1)
        res[isl] = total
        res[isl + 'u'] = total * np.sqrt(frac ** 2 + UNCERTAINTY['capacity'] ** 2 + UNCERTAINTY['calibration'] ** 2)
    return res


# ---------- live (5-minute) use ----------

def forecast(get, past_days=8):
    """Fallback when the satellite feed is down: Open-Meteo's forecast service (15-minute model irradiance, with
    its own recent past) for every point, in the same layout as satellite()."""
    pts, _ = points()
    lat = ','.join(str(p[2]) for p in pts)
    lon = ','.join(str(p[3]) for p in pts)
    locs = json.loads(get(f'{FORECAST}?latitude={lat}&longitude={lon}&past_days={past_days}&forecast_days=1'
                          '&minutely_15=shortwave_radiation,diffuse_radiation&timezone=GMT'))
    if isinstance(locs, dict):
        locs = [locs]
    t = pd.DatetimeIndex(pd.to_datetime(locs[0]['minutely_15']['time'])).tz_localize('UTC') - pd.Timedelta(minutes=7.5)
    cols = {}
    for p, l in zip(pts, locs):
        cols[f'G|{p[0]}'] = pd.Series(l['minutely_15']['shortwave_radiation'], index=t, dtype=float)
        cols[f'D|{p[0]}'] = pd.Series(l['minutely_15']['diffuse_radiation'], index=t, dtype=float)
    return pd.DataFrame(cols).dropna(how='all')


def irr_dumps(sat, fc=None, fetched=None):
    """Satellite (and fallback forecast) irradiance -> compact JSON bytes for the store."""
    def pack(df):
        if df is None or df.empty:
            return None
        ms = (df.index - pd.Timestamp(0, tz='UTC')) // pd.Timedelta(milliseconds=1)
        return {'t': [int(x) for x in ms], 'c': {k: [None if v != v else int(round(v)) for v in df[k]] for k in df}}
    return json.dumps({'fetched': fetched, 'sat': pack(sat), 'fc': pack(fc)}, separators=(',', ':')).encode()


def irr_loads(raw):
    """Inverse of irr_dumps: (satellite DataFrame, forecast DataFrame or None, fetched time)."""
    d = json.loads(raw)
    def unpack(x):
        if not x:
            return None
        return pd.DataFrame({k: pd.Series(v, dtype=float).values for k, v in x['c'].items()},
                            index=pd.to_datetime(x['t'], unit='ms', utc=True))
    return unpack(d.get('sat')), unpack(d.get('fc')), d.get('fetched')


def live(sat, fc, full, cap):
    """Rooftop solar MW (and uncertainty) for the live 5-minute intervals starting at `full` (UTC): satellite,
    then the latest clear-sky index carried forward (up to two hours), then the forecast fallback."""
    mid = full + pd.Timedelta(minutes=2.5)
    irr, n_now = nowcast(sat, mid)
    if fc is not None and not fc.empty:
        f = fc.reindex(fc.index.union(mid)).interpolate(limit_area='inside', limit=4).reindex(mid)
        irr = irr.combine_first(f)
    res = output(irr, mid, cap)
    # beyond the latest satellite value the estimate is the carried-forward clear-sky index: typical error 4-7%
    # 30-90 minutes ahead, 90th percentile ~20% (analysis/README.md), so widen the band there
    last = sat.dropna(how='all').index.max() if sat is not None and not sat.empty else None
    ahead = (mid > last) if last is not None else np.ones(len(mid), bool)
    for isl in ('NI', 'SI'):
        res[isl + 'u'] = res[isl + 'u'].where(~ahead, np.sqrt(res[isl + 'u'] ** 2 + (UNCERTAINTY['nowcast'] * res[isl]) ** 2))
    return {k: pd.Series(v.values, index=full) for k, v in res.items()}, n_now
