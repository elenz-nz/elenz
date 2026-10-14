"""HVDC transfer between the islands (positive = northward).

Metered: EMI Metered_data/HVDC_Flows, half-hourly kWh at Benmore (BEN2201) and Haywards (HAY2201), published
about two weeks after each month. History uses it wherever published.

Estimated (the live week, and history until the metered file arrives): the dispatch feed has no HVDC row, so the
transfer comes from the island balances (generation − load in each island), fitted against the metered flows
(analysis/README.md: Dec 2025 – Sep 2026, 2,877 half-hours; mean error ~10 MW against ~22 MW for the simple
average of the two balances, checked on months left out of the fit). Link losses between the two ends are about
59 MW × (flow / 1000 MW)².
"""
import io

import numpy as np
import pandas as pd

from common import NZ

# transfer at mid-link ≈ a·(SI gen − SI load) + b·(NI load − NI gen) + c·SI load + d·NI load + e
FIT = (0.6533, 0.3386, -0.0639, 0.0231, 41.29)
LOSS = 5.862e-05     # MW of link loss per MW² of transfer


def estimate(gen_ni, gen_si, load_ni, load_si):
    """Estimated mid-link transfer (MW, northward positive) from island generation and load series."""
    a, b, c, d, e = FIT
    return a * (gen_si - load_si) + b * (load_ni - gen_ni) + c * load_si + d * load_ni + e


def ends(mid):
    """Mid-link transfer -> (sent from Benmore, received at Haywards), northward positive; the sending end carries
    the extra half of the link losses."""
    loss = LOSS * mid ** 2
    return mid + np.sign(mid) * loss / 2, mid - np.sign(mid) * loss / 2


def parse_metered(raw):
    """An HVDC_Flows monthly CSV -> half-hourly MW northward at each end: columns H|BEN (leaving the SI at Benmore)
    and H|HAY (arriving in the NI at Haywards), indexed by trading period start (UTC)."""
    x = pd.read_csv(io.BytesIO(raw))
    tps = [c for c in x.columns if c.startswith('TP')]
    m = x.melt(id_vars=['POC', 'Flow_Direction', 'Trading_Date'], value_vars=tps, var_name='tp', value_name='kwh').dropna(subset=['kwh'])
    m['k'] = m.tp.str[2:].astype(int)
    midnight = pd.to_datetime(m.Trading_Date).dt.tz_localize(NZ).dt.tz_convert('UTC')
    m['t'] = midnight + pd.to_timedelta((m.k - 1) * 30, unit='min')   # blank TP47-50 on normal days were dropped above
    p =m.pivot_table(index='t', columns=['POC', 'Flow_Direction'], values='kwh', aggfunc='sum').fillna(0) * 2 / 1000
    col = lambda poc, f: p[(poc, f)] if (poc, f) in p else 0.0
    out = pd.DataFrame({'H|BEN': col('BEN2201', 'X') - col('BEN2201', 'I'), 'H|HAY': col('HAY2201', 'I') - col('HAY2201', 'X')},
                       index=p.index)
    out.index.name = 't'
    return out
