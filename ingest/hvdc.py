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

# How metered HVDC is read (history.py re-reads every month before 2003 once when this goes up). 2: the two-row
# months, Dec 1997 to Dec 2002 (39 of them), estimate the receiving end (below) instead of counting it as zero.
VERSION = 2
# The old link's losses, sending end minus receiving end, as a·P + b·P² of the power sent (MW), fitted on every
# half-hour of 1996-2002 where the files meter both ends (old four-row and per-pole layouts): mean error 1.8 MW
# northward (51,330 half-hours), 1.2 MW southward (1,845): about 63 MW at 1,000 MW north (analysis/README.md).
LOSS_NORTH = (0.0182, 4.494e-05)
LOSS_SOUTH = (0.0365, 3.832e-05)


def estimate(gen_ni, gen_si, load_ni, load_si):
    """Estimated mid-link transfer (MW, northward positive) from island generation and load series."""
    a, b, c, d, e = FIT
    return a * (gen_si - load_si) + b * (load_ni - gen_ni) + c * load_si + d * load_ni + e


def ends(mid):
    """Mid-link transfer -> (sent from Benmore, received at Haywards), northward positive; the sending end carries
    the extra half of the link losses. With northward positive, Benmore minus Haywards is the loss whichever way the
    link runs (as LOSS was fitted in analysis/hvdc_fit.py): southward, Haywards sends more than Benmore receives."""
    loss = LOSS * mid ** 2
    return mid + loss / 2, mid - loss / 2


def parse_metered(raw):
    """An HVDC_Flows monthly CSV -> half-hourly MW northward at each end: columns H|BEN (leaving the SI at Benmore)
    and H|HAY (arriving in the NI at Haywards), indexed by trading period start (UTC).

    The file's layout changed over the years: to about 1999, one row per direction at each end (HVDC_BN/BS, HVDC_HN/HS:
    Benmore and Haywards, northward and southward, all exports); then per pole (DCP1_BN ...); from the mid-2000s, flows
    at the Benmore and Haywards connection points (BEN2201, BEN0161, HAY2201, HAY1101; X out of the AC grid, I into it;
    the 350 kV rows, BEN3501/HAY3501, repeat totals and are left out).

    Some months of the old layout (Dec 1997, Aug 1998, Jun and Sep 1999, most of 2000, all of 2001 and 2002) have only
    two rows, HVDC_BN and HVDC_HS: each end's sending side. The receiving side there (Haywards northward, Benmore
    southward) is estimated as what was sent less the link's losses (LOSS_NORTH, LOSS_SOUTH); counting it as zero halved
    the mid-link transfer in those months."""
    from metered import read_emi
    m = read_emi(raw)
    m['dir'] = m.flow_direction.str.upper()
    end = m.poc.str.upper()
    ben = pd.Series(0.0, index=sorted(m.t.unique()))
    hay = ben.copy()
    side = {}   # the old layouts' rows by side: BN, BS, HN, HS (summed over poles)
    for (poc, d), g in m.groupby([end, 'dir']):
        v = g.groupby('t').mw.sum().reindex(ben.index).fillna(0)
        if poc[-3:] in ('_BN', '_BS', '_HN', '_HS'):
            k = poc[-2:]
            side[k] = side.get(k, 0) + v
        elif poc.startswith('BEN') and not poc.endswith('3501'):
            ben += v if d == 'X' else -v
        elif poc.startswith('HAY') and not poc.endswith('3501'):
            hay += v if d == 'I' else -v
    if side:
        loss = lambda p, ab: ab[0] * p + ab[1] * p ** 2   # noqa: E731
        bn, hs = side.get('BN', 0 * ben), side.get('HS', 0 * ben)
        # a receiving side the file lacks: what the other end sent, less the losses (never below zero)
        hn = side['HN'] if 'HN' in side else (bn - loss(bn, LOSS_NORTH)).clip(lower=0)
        bs = side['BS'] if 'BS' in side else (hs - loss(hs, LOSS_SOUTH)).clip(lower=0)
        ben += bn - bs
        hay += hn - hs
    out = pd.DataFrame({'H|BEN': ben, 'H|HAY': hay})
    out.index = pd.DatetimeIndex(out.index, name='t')
    return out
