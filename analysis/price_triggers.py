"""When should the price explainer on /now draw attention to itself? Tests the trigger rules on 30 years of prices.

The explainer ("Why is the price high?") is always on /now, folded into one line under the price tiles. It has
three states:
  quiet        the folded line ("$138 is about usual for a Saturday at 10:30 am") with a "Why this price?" button
  highlighted  the line is outlined and asks to be opened: prices are up, the islands have split, or a new low
  open         the card opens by itself: extremes only. Lows never open it.

The rules (RULES below) compare max(Haywards, Benmore) with "typical", the median price of the same half-hour of the
week over the previous four weeks, and with "level", the median price over the previous 365 days (a floor, so a
$20 price over a $5 typical during spill doesn't count as "3×", and so the rules work in 1997 and 2026 dollars).
Every state holds for 30 minutes after its condition ends (gaps of one trading period are bridged).

Input: final energy prices at HAY2201 and BEN2201, every trading period since Jan 1997, from data/articles/fep/ref
(written by analysis/price_fetch.py; run it first). Final prices, half-hourly; the live page has 5-minute dispatch
prices, which spike more and can be revised (9 Aug 2021: dispatch peak $356,621, final $2,698), so the live trigger
should test the 30-minute average of dispatch prices.

Output: every figure quoted in analysis/README.md ("Price explainer triggers"), printed.

  python3 analysis/price_fetch.py && python3 analysis/price_triggers.py
"""
import glob
import os

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(ROOT, 'data', 'articles', 'fep', 'ref')
NZ = 'Pacific/Auckland'
RECENT = 2021   # "recent" = 2021 on: the market the live page will see (lower median, more spill, sharper spikes)

RULES = {
    # highlighted: max(HAY, BEN) at least 1.5× typical and at least 1.25× the past year's median ...
    'hl_ratio': 1.5, 'hl_level': 1.25,
    # ... or the islands apart by more than $50 and more than 25% of the lower price
    'split_gap': 50, 'split_rel': 0.25,
    # a new low: under $5, with no price under $5 in the previous 24 hours; highlighted for its first 2 hours
    'low': 5, 'low_quiet_h': 24, 'low_show_h': 2,
    # open by itself: at least 3× typical, 3× the past year's median and $300; or $800 at any time
    'open_ratio': 3, 'open_level': 3, 'open_floor': 300, 'open_any': 800,
}


def load():
    """Half-hourly HAY/BEN final prices with typical (same half-hour of the week, previous 4 weeks) and level."""
    files = sorted(glob.glob(os.path.join(REF, '*.csv')))
    if not files:
        raise SystemExit(f'No price files in {REF}: run analysis/price_fetch.py first.')
    d = pd.concat(pd.read_csv(f) for f in files)
    d = d[d.poc.isin(['HAY2201', 'BEN2201'])]
    d = d.pivot_table(index=['date', 'tp'], columns='poc', values='price', aggfunc='mean').reset_index()
    d = d.rename(columns={'HAY2201': 'hay', 'BEN2201': 'ben'})
    # trading period k starts (k-1) half-hours after local midnight, counting straight through a clock change
    midnight = pd.to_datetime(d.date).dt.tz_localize(NZ).dt.tz_convert('UTC')
    d['t'] = midnight + pd.to_timedelta((d.tp - 1) * 30, unit='min')
    d = d.set_index('t').sort_index().drop(columns=['date', 'tp'])
    d = d[~d.index.duplicated()].dropna()
    loc = d.index.tz_convert(NZ)
    d['hi'] = d[['hay', 'ben']].max(axis=1)
    d['lo'] = d[['hay', 'ben']].min(axis=1)
    # typical: median of the same half-hour of the week (local clock) over the previous four weeks, this week excluded
    week = loc.normalize() - pd.to_timedelta(loc.dayofweek, unit='D')
    slot = loc.dayofweek * 48 + loc.hour * 2 + (loc.minute >= 30)
    piv = d.hi.groupby([week, slot]).mean().unstack()
    typ = piv.shift(1).rolling(4, min_periods=3).median().stack()
    d['typ'] = typ.reindex(pd.MultiIndex.from_arrays([week, slot])).to_numpy()
    # level: median over the previous 365 days (needs 60 days of data)
    d['level'] = d.hi.rolling('365D', min_periods=48 * 60).median().shift(1)
    d = d.dropna(subset=['typ', 'level'])
    d['r'] = d.hi / d.typ.clip(lower=1)
    d['gap'] = (d.hay - d.ben).abs()
    d['gap_rel'] = d.gap / d.lo.clip(lower=1)
    return d


def hold(flag, periods=1):
    """Bridge gaps of up to `periods` trading periods (the 30-minute hold)."""
    f = np.asarray(flag, dtype=bool).copy()
    idx = np.flatnonzero(f)
    for a, gap in zip(idx[:-1], np.diff(idx)):
        if 1 < gap <= periods + 1:
            f[a:a + gap] = True
    return f


def runs(f):
    """Start index and length (trading periods) of each run of True."""
    f = np.asarray(f, dtype=bool)
    starts = np.flatnonzero(f & ~np.r_[False, f[:-1]])
    ends = np.flatnonzero(f & ~np.r_[f[1:], False])
    return starts, ends - starts + 1


def states(d, R=RULES):
    """Boolean arrays for each state (after the hold). 'highlight' excludes the times the card is open."""
    high = (d.r >= R['hl_ratio']) & (d.hi >= R['hl_level'] * d.level)
    split = (d.gap > R['split_gap']) & (d.gap_rel > R['split_rel'])
    low = d.lo < R['low']
    q, s = 2 * R['low_quiet_h'], 2 * R['low_show_h']
    lows_before = low.astype(int).rolling(q, min_periods=1).max().shift(1).fillna(0).astype(bool)
    new_low = (low & ~lows_before).astype(int).rolling(s, min_periods=1).max().astype(bool) & low
    opened = ((d.r >= R['open_ratio']) & (d.hi >= R['open_level'] * d.level) & (d.hi >= R['open_floor'])) | (d.hi >= R['open_any'])
    o = hold(opened)
    return {
        'high': hold(high) & ~o, 'split': hold(split) & ~o, 'new_low': np.asarray(new_low) & ~o,
        'highlight': hold(high | split | new_low) & ~o, 'open': o,
        'under_low': np.asarray(low),
    }


def summary(d, f, years):
    """Share of time, episodes a year, median episode length and share of days with one, over the given years."""
    m = np.isin(d.index.tz_convert(NZ).year, years)
    x, idx = f[m], d.index[m]
    span = (idx[-1] - idx[0]).days / 365.25
    starts, lens = runs(x)
    days = pd.Series(x, index=idx.tz_convert(NZ).normalize()).groupby(level=0).any().mean()
    return 100 * x.mean(), len(starts) / span, np.median(lens) / 2 if len(lens) else 0, 100 * days


def table(d, rows, years_all, years_recent):
    print(f'{"":68s} {"% time":>7s} {"recent":>7s} {"ep/yr":>6s} {"recent":>7s} {"med h":>6s} {"% days":>7s}')
    for name, f in rows:
        a = summary(d, f, years_all)
        r = summary(d, f, years_recent)
        print(f'{name:68s} {a[0]:7.1f} {r[0]:7.1f} {a[1]:6.0f} {r[1]:7.0f} {r[2]:6.1f} {r[3]:7.1f}')


def main():
    d = load()
    loc = d.index.tz_convert(NZ)
    yr = loc.year
    all_years = sorted(set(yr))
    recent = [y for y in all_years if y >= RECENT]
    print(f'{len(d):,} trading periods, {loc[0]:%d %b %Y} to {loc[-1]:%d %b %Y}; "recent" = {RECENT} on\n')
    S = states(d)

    print('The rules (share of time; episodes a year; median length and share of days with one, recent years):')
    table(d, [
        ('Highlighted: price up (≥1.5× typical, ≥1.25× year median)', S['high']),
        ('Highlighted: islands split (> $50 and > 25%)', S['split']),
        ('Highlighted: new low (< $5, first 2 h after 24 h without)', S['new_low']),
        ('Highlighted: any of the three', S['highlight']),
        ('Open by itself (≥3× typical, ≥3× year median, ≥ $300; or ≥ $800)', S['open']),
    ], all_years, recent)

    print('\nWhy the floors (alternatives, same measures):')
    table(d, [
        ('Ratio alone: ≥1.5× typical', hold(d.r >= 1.5)),
        ('Ratio alone: ≥2× typical', hold(d.r >= 2)),
        ('First draft: ≥2× typical and ≥ $250 (opens)', hold((d.r >= 2) & (d.hi >= 250))),
        ('Open without the $300 floor and $800 backstop', hold((d.r >= 3) & (d.hi >= 3 * d.level))),
        ('Open on ≥ $1,000 alone', hold(d.hi >= 1000)),
        ('Any price under $5 (if lows were highlighted throughout)', S['under_low']),
    ], all_years, recent)

    by = pd.DataFrame({
        'highlighted %': pd.Series(S['highlight'], index=yr).groupby(level=0).mean() * 100,
        'open %': pd.Series(S['open'], index=yr).groupby(level=0).mean() * 100,
        'open episodes': pd.Series(S['open'] & ~np.r_[False, S['open'][:-1]], index=yr).groupby(level=0).sum(),
        'under $5 %': pd.Series(S['under_low'], index=yr).groupby(level=0).mean() * 100,
        'year median $': d.hi.groupby(yr).median(),
    }).round(1)
    print('\nBy year:\n' + by.to_string())

    print(f'\nPast-year median at the end of the data: ${d.level.iloc[-1]:.0f}/MWh (highlight floor '
          f'${RULES["hl_level"] * d.level.iloc[-1]:.0f}, open floor ${max(RULES["open_level"] * d.level.iloc[-1], RULES["open_floor"]):.0f})')

    print('\nKnown events (max of HAY/BEN that day, typical, half-hours open and highlighted):')
    for day in ('2021-08-09', '2024-05-08', '2024-08-08', '2024-08-15', '2024-12-12', '2026-08-04'):
        sel = loc.normalize() == pd.Timestamp(day, tz=NZ)
        if sel.any():
            x = d[sel]
            print(f'  {day}: max ${x.hi.max():,.0f}, typical ${x.typ.median():,.0f}, '
                  f'open {int(S["open"][sel].sum())}, highlighted {int(S["highlight"][sel].sum())}')

    starts, lens = runs(S['under_low'])
    i = int(np.argmax(lens))
    rec = np.isin(yr, recent)
    _, lens_r = runs(S['under_low'][rec])
    print(f'\nRuns under $5: median {np.median(lens_r) / 2:.1f} h, 90th percentile {np.percentile(lens_r, 90) / 2:.1f} h '
          f'(recent); longest {lens[i] / 2:.0f} h from {loc[starts[i]]:%d %b %Y %H:%M} to '
          f'{loc[starts[i] + lens[i] - 1]:%d %b %Y %H:%M}')
    x = d[rec]
    print(f'Recent share under $5: Haywards {100 * (x.hay < 5).mean():.1f}%, Benmore {100 * (x.ben < 5).mean():.1f}%, '
          f'both {100 * ((x.hay < 5) & (x.ben < 5)).mean():.1f}%')


if __name__ == '__main__':
    main()
