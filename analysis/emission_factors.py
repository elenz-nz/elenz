"""Emission factors for the site (site/src/lib/tracker/emissions.js), from Genesis's quarterly performance reports
and the history's per-plant dispatch.

Genesis reports, each quarter (FY to 30 June; FY21 Q1 = Jul-Sep 2020): Huntly Rankine output, the share of Rankine
fuel that was coal, coal and gas burned for generation (PJ) and generation emissions (kt CO2). Reports:
https://www.genesisenergy.co.nz/investors/reports-and-presentations (also on NZX). Values below are each quarter's own
report, except FY21 Q1 gas (FY22 Q1's prior-year column), FY21 Q3 (FY22 Q3's prior-year column) and FY26 Q1 (FY26
Q2's previous-quarter column; the FY26 Q1 PDF has no text layer). FY22 Q3 emissions were revised from 404 to 611 kt
in the FY23 Q3 report; the revised figure is used.

  1. Coal factor (kg CO2e/GJ) fitted to emissions = coal PJ x a + gas PJ x 54.1, with gas fixed at the Ministry for
     the Environment's stationary-combustion factor for natural gas (fitting both lets gas drift to 54-57).
  2. Rankine heat rate: coal PJ / coal-fired GWh, in quarters that were mostly coal.
  3. Huntly 5 heat rate: gas PJ, less the Rankines' gas, per Huntly 5 GWh (Huntly 6 at 10.5 GJ/MWh).
  4. Gas fleet factor: generation-weighted over the history, with per-plant heat rates.
  5. Check: modelled Huntly emissions from the dispatch data against Genesis's reported emissions, by quarter.

  python3 analysis/emission_factors.py <folder of history hh/YYYY-MM.json files>
  (download them with: curl -s -o hh/2025-06.json https://elenz.co.nz/data/history/hh/2025-06.json)
"""
import glob, json, os, sys
from collections import Counter, defaultdict
import numpy as np

Q = {  # quarter: (Rankine GWh, coal % of Rankine fuel, coal PJ, gas PJ, emissions kt CO2)
    'FY21 Q1': (585, 95, 6.32, 5.7, 956), 'FY21 Q2': (397, 90, 4.05, 5.0, 625), 'FY21 Q3': (877, 99, 9.7, 4.6, 1080),
    'FY21 Q4': (1222, 96, 13.07, 4.4, 1368), 'FY22 Q1': (382, 87, 3.9, 6.0, 656), 'FY22 Q2': (23, 29, 0.1, 4.5, 250),
    'FY22 Q3': (331, 86, 3.40, 5.5, 611), 'FY22 Q4': (383, 93, 3.9, 5.4, 704), 'FY23 Q1': (151, 15, 0.3, 5.4, 322),
    'FY23 Q2': (49, 13, 0.1, 2.0, 119), 'FY23 Q3': (129, 43, 0.7, 5.1, 342), 'FY23 Q4': (105, 11, 0.2, 5.2, 293),
    'FY24 Q1': (825, 24, 2.1, 6.9, 581), 'FY24 Q2': (474, 49, 2.6, 2.9, 405), 'FY24 Q3': (290, 67, 2.2, 4.2, 441),
    'FY24 Q4': (743, 99, 8.1, 4.1, 1009), 'FY25 Q1': (763, 91, 7.5, 4.7, 984), 'FY25 Q2': (48, 21, 0.14, 2.4, 145),
    'FY25 Q3': (433, 91, 4.42, 4.4, 666), 'FY25 Q4': (459, 95, 4.81, 5.0, 743), 'FY26 Q1': (175, 88, 1.8, 4.9, 439),
    'FY26 Q2': (67, 14, 0.1, 1.0, 66), 'FY26 Q3': (187, 28, 0.6, 2.0, 169), 'FY26 Q4': (76, 24, 0.2, 4.2, 251),
}
# assumed heat rates (GJ/MWh) for gas plant other than Huntly 5, which is measured
HEAT_RATE = {'Huntly 6': 10.5, 'Taranaki Combined Cycle': 7.6, 'Stratford Peaker 1': 9.0, 'Stratford Peaker 2': 9.0,
             'McKee': 10.5, 'Junction Road': 9.5}
OTHER_GAS = 9.5   # cogeneration and anything else
GAS_MFE = 54.1    # kg CO2e/GJ, MfE Measuring Emissions guide, natural gas, stationary combustion


def by_quarter(folder):
    """GWh by quarter and 'fuel|plant' for the thermal plant, from the history's half-hourly files."""
    out = defaultdict(Counter)
    for f in sorted(glob.glob(os.path.join(folder, '*.json'))):
        D = json.load(open(f))
        y, m = map(int, os.path.basename(f)[:7].split('-'))
        q = f'FY{(y + 1 if m >= 7 else y) % 100} Q{((m - 7) % 12) // 3 + 1}'
        h = D['step'] / 3.6e6
        for p in D['plants']:
            if p['fuel'] in ('gas', 'coal', 'diesel'):
                out[q][f"{p['fuel']}|{p['name']}"] += sum(x for x in p['s'] if x and x > 0) * h / 1000
    return out


def main(folder):
    k = list(Q); gwh, pct, coal, gas, em = np.array([Q[q] for q in k], float).T
    eg = GAS_MFE
    ec = float(np.linalg.lstsq(coal[:, None], em - gas * eg, rcond=None)[0][0])
    free = np.linalg.lstsq(np.c_[coal, gas], em, rcond=None)[0]
    print(f'1. coal {ec:.1f} kg CO2e/GJ with gas fixed at {eg} (both free: coal {free[0]:.1f}, gas {free[1]:.1f})')
    m = (pct >= 85) & (gwh > 200)
    hr = float(np.median(coal[m] * 1e6 / (gwh[m] * pct[m] / 100 * 1e3)))
    print(f'2. Rankine heat rate {hr:.2f} GJ/MWh (quarters >= 85% coal)')
    B = by_quarter(folder)
    u5 = np.array([B[q].get('gas|Huntly 5', 0) for q in k]); u6 = np.array([B[q].get('gas|Huntly 6', 0) for q in k])
    rgas = gwh * (1 - pct / 100) * hr / 1000
    ok = u5 > 100
    hr5 = float(np.median(((gas - rgas) * 1000 - u6 * 10.5)[ok] / u5[ok]))
    print(f'3. Huntly 5 heat rate {hr5:.2f} GJ/MWh -> {hr5 * eg / 1000:.3f} t/MWh')
    rates = dict(HEAT_RATE, **{'Huntly 5': hr5})
    e = g = 0
    for q in B:
        for key, v in B[q].items():
            fuel, name = key.split('|')
            if fuel == 'gas':
                g += v; e += v * rates.get(name, OTHER_GAS) * eg / 1000
    print(f'4. gas fleet factor {e / g:.3f} t/MWh ({g:,.0f} GWh)')
    print('5. quarter  coal%  Rankine t/MWh  model kt  Genesis kt')
    tm = tg = 0
    for i, q in enumerate(k):
        if q not in B or q == 'FY21 Q1':   # history starts 10 Sep 2020
            continue
        s = pct[i] / 100; ef = hr * (s * ec + (1 - s) * eg) / 1000
        rk = sum(v for key, v in B[q].items() if key.startswith('coal|'))
        model = rk * ef + u5[i] * hr5 * eg / 1000 + u6[i] * 10.5 * eg / 1000
        tm += model; tg += em[i]
        print(f'   {q}  {pct[i]:3.0f}%  {ef:.3f}  {model:6.0f}  {em[i]:6.0f}  {100 * (model / em[i] - 1):+5.1f}%')
    print(f'   overall {100 * (tm / tg - 1):+.1f}%')


if __name__ == '__main__':
    main(sys.argv[1])
