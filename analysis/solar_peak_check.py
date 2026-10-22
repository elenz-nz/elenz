"""Modelled embedded solar (the history's half-hourly months) against metered rooftop exports (rooftop_exports.py's
half-hourly file): midday export share, how much of each extra modelled MW turns up as exports (day to day and through
the clearest days), and timing. Development only; results in analysis/README.md (Calibration).

  python3 analysis/solar_peak_check.py <hist hh YYYY-MM.json> <prefix_hh_mw.csv> [more pairs]
"""
import json, sys
import numpy as np, pandas as pd
rows = []
a = sys.argv[1:]
for hh, exf in zip(a[::2], a[1::2]):
    js = json.load(open(hh))
    t = pd.to_datetime(js['t0'] + np.arange(js['N']) * js['step'], unit='ms', utc=True).tz_convert('Pacific/Auckland')
    mod = pd.DataFrame({'NI': js['NI']['roof'], 'SI': js['SI']['roof']}, index=t).astype(float)
    mod['NZ'] = mod.NI + mod.SI
    ex = pd.read_csv(exf)
    ex['t'] = pd.to_datetime(ex.TradingDate + ' ' + ex.TradingPeriodStartTime).dt.tz_localize('Pacific/Auckland', ambiguous='NaT', nonexistent='NaT')
    ex = ex.dropna(subset=['t']).set_index('t')[['NI', 'SI', 'NZ']]
    rows.append(mod.join(ex, rsuffix='_x', how='inner'))
d = pd.concat(rows)
print('model peak MW', d.NZ.max().round(), d.NZ.idxmax(), '| export peak MW', d.NZ_x.max().round(), d.NZ_x.idxmax())
mid = d[(d.index.hour >= 11) & (d.index.hour < 14)]
day = mid.groupby(mid.index.date).mean()
day['share'] = day.NZ_x / day.NZ
print('midday export share p10/50/90:', day.share.quantile([.1, .5, .9]).round(3).to_dict())
# day-to-day: exports against model at midday (self-consumption roughly constant, so the slope is how much of each
# extra modelled MW turns up as exports)
for isl in ('NZ', 'NI', 'SI'):
    b, a = np.polyfit(day[isl], day[isl + '_x'], 1)
    r = np.corrcoef(day[isl], day[isl + '_x'])[0, 1]
    print(f'{isl}: midday exports = {b:.3f} x model {a:+.0f} MW  (r {r:.3f}, model range {day[isl].min():.0f}-{day[isl].max():.0f} MW)')
# clearest days (top quartile of modelled midday output) vs the rest
q = day.NZ.quantile(0.75)
print('share on clear days', day.share[day.NZ >= q].mean().round(3), 'other days', day.share[day.NZ < q].mean().round(3))
# half-hour slope on the five clearest days: exports against model through the day
clear = day.NZ.sort_values().index[-6:]
for dd in clear:
    x = d[d.index.date == dd]
    x = x[(x.NZ > 50)]
    b, a = np.polyfit(x.NZ, x.NZ_x, 1)
    print(dd, f'peak model {x.NZ.max():.0f} exports {x.NZ_x.max():.0f}; within-day slope {b:.2f}')

# timing: the lag (half-hours) that best lines the model up with the exports, and the hour of each one's centre of mass
for lag in range(-4, 5):
    print('lag', lag, 'r', round(d.NZ.shift(lag).corr(d.NZ_x), 4))
w = d[d.index.date == pd.Timestamp('2026-09-24').date()]
hrs = w.index.hour + w.index.minute / 60
print('centre of output, hour: model', round((w.NZ * hrs).sum() / w.NZ.sum(), 2), 'exports', round((w.NZ_x * hrs).sum() / w.NZ_x.sum(), 2))
print(w[['NZ', 'NZ_x']].iloc[14:34].round(0).T.to_string())
