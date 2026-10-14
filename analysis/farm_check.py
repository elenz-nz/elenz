"""Check satellite irradiance + ingest/pv.py against dispatched solar farms (5-minute output, which matches metered
injection within ~1-2%). Development only.

  python3 analysis/farm_check.py <farm_disp.csv> <farm_sat.csv>
For each farm: best-fitting mounting and DC/AC ratio (clear-sky shape), the scale factor left over (satellite bias
and the farm's own losses), and how errors grow with cloud.
"""
import os, sys
import numpy as np, pandas as pd
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'ingest'))
import pv

FARMS = {'KSF0': ('Kohirā', -35.12, 173.26, 24), 'PSF0': ('Pukenui', -34.82, 173.12, 20.8), 'TRS0': ('Twin Rivers', -35.05, 173.27, 24),
         'LAU0': ('Lauriston', -43.72, 171.75, 47), 'RGT0': ('Rangitaiki', -38.04, 176.79, 24), 'EDS0': ('Omeheu', -37.96, 176.84, 28.7),
         'TOH0': ('Taiohi', -37.57, 175.13, 22.4), 'WTA0': ('Whitianga', -36.85, 175.69, 23.8), 'GDS0': ('Papareireiā', -36.10, 174.36, 17.6),
         'RWI0': ('Ruawai', -36.13, 174.02, 16.8), 'CLB0': ('Clandeboye', -44.19, 171.35, 24), 'HTR0': ('Te Herenga o Te Rā', -38.00, 177.22, 33),
         'TAH0': ('Tauhei', -37.62, 175.40, 147), 'DVK0': ('Dannevirke', -40.21, 176.10, 23), 'KPS0': ('Kōwhai Park', -43.49, 172.53, None)}
GEOMS = {'fixed N 20°': [(20, 0, 1)], 'fixed N 30°': [(30, 0, 1)], 'fixed E-W 10°': [(10, 90, .5), (10, 270, .5)], 'tracker': 'tracker'}
UTIL_LOSSES = 0.07

disp = pd.read_csv(sys.argv[1], index_col=0, parse_dates=True)
sat = pd.read_csv(sys.argv[2], index_col=0, parse_dates=True)
rows, agg = [], []
for u, (name, lat, lon, cap) in FARMS.items():
    a = disp[u].dropna()
    if cap is None:
        cap = a.quantile(0.995)
    t = a.index
    g = sat[f'G|{u}'].reindex(sat.index.union(t)).interpolate(limit_area='inside', limit=2).reindex(t)
    d = sat[f'D|{u}'].reindex(sat.index.union(t)).interpolate(limit_area='inside', limit=2).reindex(t)
    ok = g.notna().values
    zen, az, dex = pv.sun(t, lat, lon)
    ta = 18.0 - 0.55 * (abs(lat) - 36.8) + 4.5 * np.cos(2 * np.pi * (t.dayofyear.values - 35) / 365.25)
    cs = pv.clearsky_ghi(zen)
    kt = np.where(cs > 50, g.values / np.maximum(cs, 1), np.nan)
    y = a.values / cap
    best = None
    for gname, geo in GEOMS.items():
        if geo == 'tracker':
            tilt, saz = pv.tracker_angles(zen, az)
            eff, tot = pv.poa(g.values, d.values, zen, az, dex, tilt, saz)
        else:
            eff, tot = 0, 0
            for tl, sa, w in geo:
                e1, t1 = pv.poa(g.values, d.values, zen, az, dex, tl, sa); eff = eff + w * e1; tot = tot + w * t1
        tc = pv.cell_temp(tot, ta, a=-3.56, b=-0.075, dt=3)    # open rack
        for dcac in np.arange(1.0, 1.61, 0.05):
            m = pv.ac_output(eff, tc, dcac, UTIL_LOSSES)
            sel = ok & (np.nan_to_num(kt) > 0.75) & (cs > 200)          # clear periods: shape and clipping
            if sel.sum() < 50:
                continue
            k = np.sum(m[sel] * y[sel]) / np.sum(m[sel] ** 2)
            sse = np.mean((k * m[sel] - y[sel]) ** 2)
            if best is None or sse < best[0]:
                best = (sse, gname, dcac, k, m)
    if best is None:
        continue
    sse, gname, dcac, k, m = best
    day = pd.DataFrame({'y': y * cap, 'm': m * cap}, index=t)[ok]
    dd = day.groupby(day.index.tz_convert('Pacific/Auckland').date).sum() / 12
    dd = dd[dd.m > 0.5 * dd.m.max() * 0.2]
    r = dd.y / dd.m
    sel = ok & (cs > 100)
    rows.append(dict(farm=name, geometry=gname, dc_ac=round(dcac, 2), clear_scale=round(k, 3), days=len(dd),
                     energy_ratio=round(day.y.sum() / day.m.sum(), 3), daily_ratio_p10=round(r.quantile(.1), 2), daily_ratio_p90=round(r.quantile(.9), 2),
                     corr_5min=round(np.corrcoef(m[sel], y[sel])[0, 1], 3)))
    agg.append(pd.DataFrame({'y': y * cap, 'm': m * cap, 'kt': kt}, index=t)[ok].assign(farm=u))
r = pd.DataFrame(rows)
pd.set_option('display.width', 250)
print(r.to_string(index=False))
A = pd.concat(agg)
A = A[A.index >= '2026-09-01']   # most farms running: aggregate across them
hh = A.groupby(A.index.floor('30min')).agg(y=('y', 'sum'), m=('m', 'sum'), kt=('kt', 'mean'), n=('farm', 'nunique'))
hh = hh[(hh.n >= hh.n.max() - 1) & (hh.m > 20)]
hh['err'] = (hh.y - hh.m) / hh.m
hh['ktb'] = pd.cut(hh.kt, [0, .3, .5, .7, .85, 1.5])
print('\nAll farms together (Sep-Oct 2026), half-hourly relative error by clear-sky index:')
print(hh.groupby('ktb', observed=True).err.agg(['count', 'mean', 'std', lambda s: s.abs().median()]).round(3))
print('total energy ratio actual/model:', round(hh.y.sum() / hh.m.sum(), 3))
r.to_csv(os.path.join(os.path.dirname(sys.argv[1]), 'farm_check.csv'), index=False)
hh.to_csv(os.path.join(os.path.dirname(sys.argv[1]), 'farm_check_hh.csv'))
