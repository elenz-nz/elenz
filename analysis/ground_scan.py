"""Ground-mounted embedded arrays from the metered exports: every solar-shaped export series in the EA's
reconciliation data (rooftop_exports.py's series file) that has flat-topped output on its sunniest days (inverter
clipping, the mark of a ground-mounted array with oversized panels, or an export limit) rather than a rounded rooftop
curve. Development only; results in analysis/README.md (Ground-mounted embedded arrays).

  python3 analysis/ground_scan.py <NetworkSupplyPointsTable.csv> <ReconciledInjectionAndOfftake_YYYYMM.csv.gz> <prefix_series.csv> [more pairs]
"""
import sys
import numpy as np, pandas as pd
names = pd.read_csv(sys.argv[1])
names = names[names['Current flag'] == 1].drop_duplicates('POC code').set_index('POC code')['Description'].str.title().to_dict()
keep = []
pairs = sys.argv[2:]
for rec, series in zip(pairs[::2], pairs[1::2]):
    ser = pd.read_csv(series)
    ks = set(map(tuple, ser[ser.cls == 'solar exports'][['PointOfConnection', 'Network', 'Participant']].values))
    x = pd.read_csv(rec)
    x = x[x.FlowDirection == 'Injection']
    x = x[[k in ks for k in zip(x.PointOfConnection, x.Network, x.Participant)]]
    keep.append(x)
x = pd.concat(keep)
x['mw'] = x.KilowattHours * 2 / 1000
x['hh'] = x.TradingPeriodStartTime.str[:2].astype(int) + x.TradingPeriodStartTime.str[3:5].astype(int) / 60
out = []
for k, g in x.groupby(['PointOfConnection', 'Network', 'Participant']):
    if g.mw.max() < 0.5:
        continue
    p = g.pivot_table(index='TradingDate', columns='hh', values='mw', aggfunc='sum').fillna(0)
    day = p.sum(axis=1)
    best = day.sort_values().index[-5:]          # its five sunniest days
    flat, frac = [], []
    for dd in best:
        r = p.loc[dd]
        mx = r.max()
        if mx <= 0:
            continue
        win = r[(r.index >= 9) & (r.index <= 16)]
        flat.append(int((win >= 0.97 * mx).sum()) / 2)        # hours within 3% of the day's peak
        frac.append(r.sum() / 2 / (mx * 24))                   # daily energy over peak x 24 h (fills more when flat)
    out.append({'poc': k[0], 'place': names.get(k[0], ''), 'network': k[1], 'trader': k[2], 'peak_mw': round(g.mw.max(), 2),
                'gwh': round(g.mw.sum() / 2000, 2), 'flat_h': np.median(flat), 'fill': round(np.median(frac), 3)})
o = pd.DataFrame(out).sort_values('peak_mw', ascending=False)
o['flat'] = o.flat_h >= 2.5
pd.set_option('display.width', 200)
print(len(o), 'series over 0.5 MW;', int(o.flat.sum()), 'flat-topped (2.5 h or more within 3% of the peak on the sunniest days)')
print(o[o.flat].to_string(index=False))
print('\nlargest rounded ones:'); print(o[~o.flat].head(12).to_string(index=False))

