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
    and H|HAY (arriving in the NI at Haywards), indexed by trading period start (UTC).

    The file's layout changed over the years: to about 1999, one row per direction at each end (HVDC_BN/BS, HVDC_HN/HS:
    Benmore and Haywards, northward and southward, all exports); then per pole (DCP1_BN ...); from the mid-2000s, flows
    at the Benmore and Haywards connection points (BEN2201, BEN0161, HAY2201, HAY1101; X out of the AC grid, I into it;
    the 350 kV rows, BEN3501/HAY3501, repeat totals and are left out)."""
    from metered import read_emi
    m = read_emi(raw)
    m['dir'] = m.flow_direction.str.upper()
    end = m.poc.str.upper()
    ben = pd.Series(0.0, index=sorted(m.t.unique()))
    hay = ben.copy()
    for (poc, d), g in m.groupby([end, 'dir']):
        v = g.groupby('t').mw.sum().reindex(ben.index).fillna(0)
        if poc.endswith('_BN'):
            ben += v
        elif poc.endswith('_BS'):
            ben -= v
        elif poc.endswith('_HN'):
            hay += v
        elif poc.endswith('_HS'):
            hay -= v
        elif poc.startswith('BEN') and not poc.endswith('3501'):
            ben += v if d == 'X' else -v
        elif poc.startswith('HAY') and not poc.endswith('3501'):
            hay += v if d == 'I' else -v
    out = pd.DataFrame({'H|BEN': ben, 'H|HAY': hay})
    out.index = pd.DatetimeIndex(out.index, name='t')
    return out
