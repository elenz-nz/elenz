"""Figures and chart data for the article "What sets the wholesale price" (site/src/lib/articles/posts/wholesale-prices.svelte).

Every price is the EA's final energy price, averaged over trading periods (time-weighted, not load-weighted), in
nominal dollars. "Haywards" and "Benmore" are the reference nodes HAY2201 and BEN2201.

Inputs (all Electricity Authority, EMI, CC BY 4.0; downloaded into data/articles/ if missing):
  fep/ref, fep/node        final energy prices since Oct 1996, reduced by analysis/price_fetch.py (run it first)
  gmd/YYYYMM_Generation_MD.csv   metered generation by plant and fuel, Aug 1997 on (Wholesale/Generation/Generation_MD)
  hmd/*_Storage_*.csv, hmd/energy.csv   Hydrological Modelling Dataset: daily active storage of the 10 main lakes
                           (Mm³) and the derived storage capacity in Mm³ and GWh per lake, used to turn storage
                           into energy. The dataset ends on 31 Dec 2024.
  offers/YYYYMMDD_Offers.csv   generator offers (Wholesale/BidsAndOffers/Offers) for the two example trading periods
  hist/hh/YYYY-MM.json     the site's half-hourly history (generation at the example trading periods)
  retail/rgm.xlsx          EA retail gross margins (Datasets/Retail/RetailGrossMargins): each large retailer's mass-market
                           revenue per MWh split into electricity, distribution, metering, levies and margin, by
                           financial year, excluding GST
  retail/rpp.csv           EA regional power prices (Datasets/Retail/RegionalPowerPrices): household prices and bills by
                           network region and month, including GST

Output: site/src/lib/articles/data/wholesale-prices.json, plus every figure quoted in the text, printed.

  python3 analysis/price_fetch.py && python3 analysis/wholesale_prices.py
"""
import glob, json, os, re, sys
from urllib.request import urlopen

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'ingest'))
from build_tracker import register  # noqa: E402

DATA = os.path.join(ROOT, 'data', 'articles')
OUT = os.path.join(ROOT, 'site', 'src', 'lib', 'articles', 'data', 'wholesale-prices.json')
OUT_MONTHS = os.path.join(ROOT, 'site', 'src', 'lib', 'articles', 'data', 'wholesale-months.json')   # Part 4's month charts
BLOB = 'https://emidatasets.blob.core.windows.net/publicdata'
SITE = 'https://elenz.co.nz/data/history'
NZ = 'Pacific/Auckland'
HMD = 'Datasets/Environment/HydrologicalModellingDataset'
LAKES = ['NI_TPO_Storage_LakeTaupo', 'NI_WKA_Storage_LakeWaikaremoana', 'SI_HWE_Storage_LakeHawea', 'SI_MAN_Storage_LakeManapouri',
         'SI_OHA_Storage_LakeOhau', 'SI_PKI_Storage_LakePukaki', 'SI_TAU_Storage_LakeTeAnau', 'SI_TKA_Storage_LakeTekapo',
         'SI_WAN_Storage_LakeWanaka', 'SI_WPU_Storage_LakeWakatipu']
FUEL_MD = {'Coal': 'thermal', 'Gas': 'thermal', 'Gas&Oil': 'thermal', 'Diesel': 'thermal', 'Hydro': 'hydro', 'HYD': 'hydro',
           'Geo': 'geo', 'GEO': 'geo', 'Wind': 'wind', 'WIN': 'wind', 'Solar': 'solar', 'SOL': 'solar', 'Wood': 'other', 'ELE': 'other'}
# the two example trading periods: 6:00 pm (trading period 37) on two Wednesdays
EXAMPLES = [('2024-08-07', 37), ('2026-01-21', 37)]
NODES = {'MAN2201': 'Manapōuri', 'INV2201': 'Invercargill', 'BEN2201': 'Benmore', 'ISL2201': 'Islington (Christchurch)',
         'HAY2201': 'Haywards (Wellington)', 'WKM2201': 'Whakamaru', 'HLY2201': 'Huntly', 'SFD2201': 'Stratford',
         'OTA2201': 'Ōtāhuhu (Auckland)', 'STK2201': 'Stoke (Nelson)', 'WEL0331': 'Wellsford (north of Auckland)'}
# (KIW2201 is Kaiwera Downs wind farm in Southland, priced only since February 2026, not Kikiwa (KIK2201): grid points are
# compared only over months they were priced in every one of)
P = lambda *a: print(*a, flush=True)
GEN8 = ['coal', 'gas', 'diesel', 'geo', 'hydro', 'wind', 'solar', 'batt']
RETAIL = f'{BLOB}/Datasets/Retail'
GENTAILERS = ['Contact Energy', 'Genesis Energy', 'Mercury NZ', 'Meridian Energy']  # financial years end 30 June


def fetch(url, path):
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with urlopen(url.replace(' ', '%20'), timeout=600) as r, open(path, 'wb') as f:
            f.write(r.read())
    return path


def r1(v, dp=1):
    return None if v is None or v != v else round(float(v), dp)


# ---------------------------------------------------------------- inputs

def prices():
    fs = sorted(glob.glob(os.path.join(DATA, 'fep', 'ref', '*.csv')))
    if len(fs) < 359:
        sys.exit('run analysis/price_fetch.py first')
    d = pd.concat([pd.read_csv(f) for f in fs])
    p = d.pivot_table(index=['date', 'tp'], columns='poc', values='price').reset_index()
    # trading period k starts (k-1) half-hours after local midnight, in elapsed time (so DST days have 46 or 50)
    p['t'] = pd.to_datetime(p.date).dt.tz_localize(NZ) + pd.to_timedelta((p.tp - 1) * 30, unit='min')
    return p.set_index('t').sort_index()


def storage():
    """National storage of the 10 main lakes in GWh, daily to 31 Dec 2024."""
    e = pd.read_csv(fetch(f'{BLOB}/{HMD}/1_InfrastructureAndHydroConstraintAttributes/DerivedSeriesForStorageCapacityAndSpecificEnergy/'
                          '20241231_EnergyStorageCapacity(DerivedForScheme).csv', os.path.join(DATA, 'hmd', 'energy.csv')), parse_dates=['Date'])
    e['k'] = e.ActiveStorageCapacityScheme_GigaWattHours / e.ActiveStorageCapacityScheme_MillionCubicMeters  # GWh per Mm³
    out = {}
    for name in LAKES:
        site = name.split('_')[1]
        d = pd.read_csv(fetch(f'{BLOB}/{HMD}/3_StorageAndSpill_20241231/3_1_Storage/{name}.csv', os.path.join(DATA, 'hmd', name + '.csv')),
                        parse_dates=['Date'])
        d = d.dropna(subset=['Date']).sort_values('Date').drop_duplicates('Date').set_index('Date')
        k = e[e.SiteCode == site].dropna(subset=['k']).set_index('Date').k
        out[site] = d['Active storage (Mm³)'] * k.reindex(d.index).ffill().bfill()
    S = pd.DataFrame(out).sort_index().sum(axis=1, min_count=len(LAKES)).dropna()
    mean = S.groupby(S.index.dayofyear).mean()  # 1980-2024 average for each day of the year
    return S, 100 * S / S.index.dayofyear.map(mean).values


def generation():
    """Metered generation by fuel group and month (GWh), from Generation_MD."""
    xml = urlopen(f'{BLOB}?restype=container&comp=list&prefix=Datasets/Wholesale/Generation/Generation_MD/', timeout=60).read().decode()
    rows = []
    for n in re.findall(r'<Name>([^<]*_Generation_MD\.csv)</Name>', xml):
        d = pd.read_csv(fetch(f'{BLOB}/{n}', os.path.join(DATA, 'gmd', os.path.basename(n))), low_memory=False)
        tp = [c for c in d.columns if c.startswith('TP')]
        d['gwh'] = d[tp].apply(pd.to_numeric, errors='coerce').sum(axis=1) / 1e6
        d['m'] = pd.Period(f"{os.path.basename(n)[:4]}-{os.path.basename(n)[4:6]}", 'M')
        rows.append(d.groupby(['m', 'Fuel_Code']).gwh.sum())
    g = pd.concat(rows).reset_index()
    unknown = set(g.Fuel_Code) - set(FUEL_MD)
    if unknown:
        sys.exit(f'unmapped Generation_MD fuel codes: {unknown}')
    g['f'] = g.Fuel_Code.map(FUEL_MD)
    return g.pivot_table(index='m', columns='f', values='gwh', aggfunc='sum').fillna(0)


def offer_stack(day, tp):
    """Every energy offer tranche for one trading period (final offers), with the MW each can actually supply:
    tranches are capped by the unit's maximum output and, for wind and solar, its forecast generation potential."""
    fuel, names, _ = register()
    y, ymd = day[:4], day.replace('-', '')
    path = fetch(f'{BLOB}/Datasets/Wholesale/BidsAndOffers/Offers/{y}/{ymd}_Offers.csv', os.path.join(DATA, 'offers', f'{ymd}_Offers.csv'))
    d = pd.read_csv(path, dtype={'Unit': str}, usecols=['TradingPeriod', 'PointOfConnection', 'Unit', 'ProductType', 'ProductClass',
                    'IsLatestYesNo', 'MaximumOutputMegawatts', 'ForecastOfGenerationPotentialMegawatts', 'Megawatts', 'DollarsPerMegawattHour'])
    d = d[(d.TradingPeriod == tp) & (d.ProductType == 'Energy') & (d.ProductClass == 'Injection') & (d.IsLatestYesNo == 'Y') & (d.Megawatts > 0)].copy()
    d['fuel'] = [fuel.get((a, b), '?') for a, b in zip(d.PointOfConnection, d.Unit)]
    d['plant'] = [names.get((a, b), f'{a} {b}') for a, b in zip(d.PointOfConnection, d.Unit)]
    if (d.fuel == '?').any():
        sys.exit(f'unmapped offers: {d[d.fuel == "?"][["PointOfConnection", "Unit"]].drop_duplicates().values.tolist()}')
    d = d.sort_values(['PointOfConnection', 'Unit', 'DollarsPerMegawattHour'])
    pot = d.ForecastOfGenerationPotentialMegawatts.where(d.ForecastOfGenerationPotentialMegawatts > 0)
    lim = np.fmin(d.MaximumOutputMegawatts.fillna(np.inf), pot.fillna(np.inf))
    cum = d.groupby(['PointOfConnection', 'Unit']).Megawatts.cumsum()
    d['mw'] = np.clip(np.minimum(cum, lim) - (cum - d.Megawatts), 0, None)
    d = d[d.mw > 0.05].sort_values(['DollarsPerMegawattHour', 'fuel'], kind='stable')
    return d


def history(first='2021-01', last='2026-09'):
    """The site's half-hourly history for whole months: generation by island and fuel (MW) and island prices."""
    frames = []
    for m in pd.period_range(first, last, freq='M'):
        d = json.load(open(fetch(f'{SITE}/hh/{m}.json', os.path.join(DATA, 'hist', 'hh', f'{m}.json'))))
        idx = pd.to_datetime(d['t0'] + np.arange(d['N']) * d['step'], unit='ms', utc=True).tz_convert(NZ)
        frames.append(pd.DataFrame({f'{i}_{k}': d[i][k] for i in ('NI', 'SI') for k in GEN8 + ['price', 'metered']}, index=idx))
    h = pd.concat(frames)
    return h[~h.index.duplicated()].sort_index()


def history_at(t):
    m = t.strftime('%Y-%m')
    d = json.load(open(fetch(f'{SITE}/hh/{m}.json', os.path.join(DATA, 'hist', 'hh', f'{m}.json'))))
    idx = pd.to_datetime(d['t0'] + np.arange(d['N']) * d['step'], unit='ms', utc=True).tz_convert(NZ)
    i = idx.get_loc(t)
    gen = {k: sum(d[isl][k][i] for isl in ('NI', 'SI')) for k in ['coal', 'gas', 'diesel', 'geo', 'hydro', 'wind', 'solar', 'batt']}
    return gen


# ---------------------------------------------------------------- analysis

def main():
    p = prices()
    H, B = p.HAY2201, p.BEN2201
    loc = p.index.tz_localize(None)
    month = loc.to_period('M')
    out = {}

    # ---- 30 years, month by month
    m = p.groupby(month)[['HAY2201', 'BEN2201', 'OTA2201']].mean()
    P(f'Months: {m.index[0]} to {m.index[-1]} ({len(m)})')
    P('Highest Haywards months:', m.HAY2201.nlargest(5).round(1).to_dict())
    P('Lowest Haywards months:', m.HAY2201.nsmallest(5).round(1).to_dict())
    P('Lowest Benmore months:', m.BEN2201.nsmallest(3).round(1).to_dict())
    out['months'] = {'start': str(m.index[0]), 'HAY': [r1(v, 2) for v in m.HAY2201], 'BEN': [r1(v, 2) for v in m.BEN2201]}
    yr = p.groupby(loc.year).HAY2201.mean()
    yb = p.groupby(loc.year).BEN2201.mean()
    out['years'] = {'years': list(range(1997, 2027)), 'HAY': [r1(yr[y]) for y in range(1997, 2027)], 'BEN': [r1(yb[y]) for y in range(1997, 2027)]}
    P('Haywards by year:', yr.round(0).astype(int).to_dict())
    P('Haywards average 1997-2017:', round(H.loc['1997':'2017'].mean(), 1), ' 2018-2023:', round(H.loc['2018':'2023'].mean(), 1),
      ' all to Sep 2026:', round(H.mean(), 1))
    for a, b in [('1997', '2017'), ('2018', '2023')]:
        P(f'  months above $150 at Haywards {a}-{b}:', int((m.HAY2201.loc[a:b] > 150).sum()))

    day = p.groupby(loc.normalize())[['HAY2201', 'BEN2201']].mean()
    P('Highest Haywards days:', {str(k.date()): round(v) for k, v in day.HAY2201.nlargest(9).items()})

    jan, aug = p.loc['2026-01'], p.loc['2024-08']
    P(f'Jan 2026: HAY mean {jan.HAY2201.mean():.2f}, median {jan.HAY2201.median():.2f}, under $1 {100 * (jan.HAY2201 < 1).mean():.1f}% '
      f'(BEN {100 * (jan.BEN2201 < 1).mean():.1f}%), max {jan.HAY2201.max():.2f}')
    P(f'Aug 2024: HAY mean {aug.HAY2201.mean():.1f}, median {aug.HAY2201.median():.1f}, max {aug.HAY2201.max():.0f} at {aug.HAY2201.idxmax()}, '
      f'under $100 {100 * (aug.HAY2201 < 100).mean():.1f}%')
    P(f'Dec 2025 HAY {m.HAY2201["2025-12"]:.1f}, BEN {m.BEN2201["2025-12"]:.1f}; Jun 2026 BEN {m.BEN2201["2026-06"]:.1f}, OTA {m.OTA2201["2026-06"]:.1f}, '
      f'HAY {m.HAY2201["2026-06"]:.1f}; Q1 2026 BEN {B.loc["2026-01":"2026-03"].mean():.1f}, OTA {p.OTA2201.loc["2026-01":"2026-03"].mean():.1f}')
    P(f'Oct 2025-Sep 2026 HAY {H.loc["2025-10":"2026-09"].mean():.1f}, Oct 2023-Sep 2024 {H.loc["2023-10":"2024-09"].mean():.1f}, '
      f'Jan-Sep 2026 HAY {H.loc["2026"].mean():.1f}, BEN {B.loc["2026"].mean():.1f}')

    # ---- water: price against storage, month by month to Dec 2024
    S, rel = storage()
    P(f'Storage: {S.index[0].date()} to {S.index[-1].date()}; early Aug 2024 {S.loc["2024-08-01":"2024-08-10"].min():.0f} GWh '
      f'({rel.loc["2024-08-01":"2024-08-10"].min():.0f}% of the average for the date); min since 2018 before that '
      f'{S.loc["2018":"2024-07"].min():.0f} GWh on {S.loc["2018":"2024-07"].idxmin().date()}')
    sm = rel.groupby(rel.index.to_period('M')).mean()
    j = pd.DataFrame({'stor': sm, 'price': (m.HAY2201 + m.BEN2201) / 2}).dropna().loc['1997-01':'2024-12']
    j['era'] = np.where(j.index.year >= 2018, 1, 0)
    P(f'Aug 2024 storage {sm["2024-08"]:.0f}% of average; lowest month since 1997: {sm.loc["1997":].idxmin()} {sm.loc["1997":].min():.0f}%; '
      f'Jun 2008 {sm["2008-06"]:.0f}%; 2001-05..07 {sm.loc["2001-05":"2001-07"].round(0).tolist()}')
    for e, sub in j.groupby('era'):
        c = np.corrcoef(sub.stor, np.log(sub.price))[0, 1]
        P(f'  era {e}: {len(sub)} months, corr(storage, log price) {c:.2f}')
    bands = [0, 80, 95, 105, 120, 999]
    lab = ['Under 80%', '80–95%', '95–105%', '105–120%', 'Over 120%']
    j['band'] = pd.cut(j.stor, bands, labels=lab, right=False)
    tab = j.groupby(['band', 'era'], observed=False).price.agg(['mean', 'count']).unstack()
    P(tab.round(0).to_string())
    out['scatter'] = {'pts': [[r1(r.stor), r1(r.price), int(r.era), str(i)] for i, r in j.iterrows()],
                      'bands': lab, 'before': [r1(v, 0) for v in tab['mean'][0]], 'after': [r1(v, 0) for v in tab['mean'][1]],
                      'n_before': [int(v) for v in tab['count'][0]], 'n_after': [int(v) for v in tab['count'][1]]}
    near = j[(j.stor >= 95) & (j.stor < 105)]
    P(f'Near-average storage: {near.price[near.era == 0].mean():.0f} before 2018, {near.price[near.era == 1].mean():.0f} 2018-2024')

    # ---- generation, January to August each year
    G = generation()
    ja = G[(G.index.month <= 8)]
    ja = ja.groupby(ja.index.year).sum()
    P('Generation Jan-Aug (GWh):'); P(ja.loc[2018:].round(0).to_string())
    g26, g24 = ja.loc[2026], ja.loc[2024]
    P(f'2026 vs 2024 Jan-Aug: geo {g26.geo - g24.geo:+.0f} ({100 * (g26.geo / g24.geo - 1):+.0f}%), wind {g26.wind - g24.wind:+.0f}, '
      f'solar {g26.solar - g24.solar:+.0f}, hydro {g26.hydro - g24.hydro:+.0f}, thermal {g26.thermal - g24.thermal:+.0f} '
      f'({100 * (g26.thermal / g24.thermal - 1):+.0f}%), total {g26.sum() - g24.sum():+.0f}')
    tot = ja.sum(axis=1)
    P('Thermal share Jan-Aug %:', (100 * ja.thermal / tot).loc[2018:].round(1).to_dict(),
      ' lowest Jan-Aug shares since 1998:', (100 * ja.thermal / tot).loc[1998:].nsmallest(3).round(1).to_dict())
    fy = G.groupby(G.index.year).sum()
    th = lambda a, b: 100 * fy.loc[a:b].thermal.sum() / fy.loc[a:b].sum().sum()
    P(f'Thermal share of metered generation: 1998-2017 {th(1998, 2017):.1f}%, 2018-2025 {th(2018, 2025):.1f}%')
    P(f'Storage Oct 2018: {sm["2018-10"]:.0f}% of average; Haywards {m.HAY2201["2018-10"]:.0f}')
    x25 = H.loc['2025']
    P('2025 trading periods over $300 by month:', (x25 > 300).groupby(x25.index.month).sum().to_dict())
    yrs = list(range(2019, 2027))
    hja = p[(loc.month <= 8)].groupby(loc[(loc.month <= 8)].year).HAY2201.mean()
    out['mix'] = {'years': yrs, **{k: [r1(ja.loc[y, k], 0) for y in yrs] for k in ['geo', 'hydro', 'wind', 'solar', 'thermal']},
                  'price': [r1(hja[y], 0) for y in yrs]}
    P('Haywards Jan-Aug:', {y: round(hja[y]) for y in yrs})

    # ---- extremes
    ys = list(range(2005, 2027))
    ext = pd.DataFrame({'low': (H < 1).groupby(loc.year).mean() * 100, 'high': (H > 300).groupby(loc.year).mean() * 100}).loc[ys]
    P('Share of trading periods at Haywards under $1 / over $300:'); P(ext.round(1).to_string())
    out['extremes'] = {'years': ys, 'low': [r1(v) for v in ext.low], 'high': [r1(v) for v in ext.high]}

    # ---- the shape of a day: average price by half-hour of the day, each year since 1997, also as a % of that
    # year's average (the shape the chart compares)
    hh = loc.hour * 2 + loc.minute // 30
    prof, rows = {}, []
    for y in range(1997, 2027):
        sel = loc.year == y
        q = H[sel].groupby(hh[sel]).mean().reindex(range(48))
        prof[y] = q
        ix = 100 * q / q.mean()
        rows.append({'y': y, 'low': ix.min(), 'low_t': ix.idxmin() / 2, 'am': ix.loc[10:22].max(), 'am_t': ix.loc[10:22].idxmax() / 2,
                     'mid': ix.loc[24:29].mean(), 'pm': ix.loc[30:44].max(), 'pm_t': ix.loc[30:44].idxmax() / 2})
    R = pd.DataFrame(rows).set_index('y')
    P('Daily shape, % of each year\'s average (mid = noon to 3 pm):'); P(R.round(1).to_string())
    P(f'  midday 1997-2022: {R.mid.loc[:2022].min():.0f}-{R.mid.loc[:2022].max():.0f}%; 2023-2025 {R.mid.loc[2023:2025].min():.0f}-'
      f'{R.mid.loc[2023:2025].max():.0f}%; 2026 {R.mid[2026]:.0f}%; lowest year {R.mid.idxmin()}')
    P(f'  morning peak times {sorted(set(R.am_t))}, evening peak times {sorted(set(R.pm_t))}')
    q = prof[2026]
    P(f'  2026: noon-3 pm ${q.loc[24:29].mean():.0f}, 5-8 pm ${q.loc[34:39].mean():.0f}')
    out['profile'] = {'years': list(prof), 'values': [[r1(v, 0) for v in prof[y]] for y in prof]}

    # ---- nodes: the last 12 months
    nodes = []
    for f in sorted(glob.glob(os.path.join(DATA, 'fep', 'node', '*.csv'))):
        ym = os.path.basename(f)[:6]
        if '202510' <= ym <= '202609':
            nodes.append(pd.read_csv(f))
    n = pd.concat(nodes)
    n['s'] = n['mean'] * n['count']
    months = n.groupby('poc').s.size()
    full = months[months == months.max()].index   # grid points priced in all 12 months; a point priced for part of the
    # year would be averaged over different months from the rest
    n = n[n.poc.isin(full)]
    avg = (n.groupby('poc').s.sum() / n.groupby('poc')['count'].sum()).sort_values()
    P(f'  grid points priced all year: {len(full)} of {len(months)}; the five most expensive: ' +
      ', '.join(f'{k} {v:.1f}' for k, v in avg.tail(5).items()) + '; five cheapest: ' + ', '.join(f'{k} {v:.1f}' for k, v in avg.head(5).items()))
    P(f'Nodes Oct 2025-Sep 2026: {len(avg)} nodes, lowest {avg.index[0]} {avg.iloc[0]:.1f}, highest {avg.index[-1]} {avg.iloc[-1]:.1f}')
    out['nodes'] = [{'poc': k, 'name': v, 'price': r1(avg[k])} for k, v in NODES.items()]
    P({v: round(avg[k], 1) for k, v in NODES.items()})
    sp = (H - B).loc['2025-10':'2026-09']
    P(f'HAY-BEN Oct25-Sep26: mean {sp.mean():.1f}; HAY>BEN+10 {100 * (sp > 10).mean():.1f}%; BEN>HAY+10 {100 * (sp < -10).mean():.1f}%')
    # what the HVDC link was doing when Haywards ran $10+ above Benmore (mid-link flow, north positive, site history)
    hv = []
    for mo in pd.period_range('2025-10', '2026-09', freq='M'):
        d = json.load(open(fetch(f'{SITE}/hh/{mo}.json', os.path.join(DATA, 'hist', 'hh', f'{mo}.json'))))
        hv.append(pd.Series(d['hvdcN'], index=pd.to_datetime(d['t0'] + np.arange(d['N']) * d['step'], unit='ms', utc=True).tz_convert(NZ)))
    hv = pd.concat(hv)
    hv = hv[~hv.index.duplicated()].reindex(sp.index)
    wide = sp > 10
    P(f'  HVDC when HAY>BEN+10: median {hv[wide].median():.0f} MW north; >=700 MW in {100 * (hv[wide] >= 700).mean():.0f}% '
      f'(all trading periods {100 * (hv >= 700).mean():.0f}%); >=1000 MW in {100 * (hv[wide] >= 1000).mean():.0f}%')

    # ---- where the money is made: every trading period's grid generation (dispatch) paid at its island's reference
    # price (Haywards for the North Island, Benmore for the South), before any hedge contracts
    hh = history()
    rev = {f: sum(hh[f'{i}_{f}'] * 0.5 * hh[f'{i}_price'] for i in ('NI', 'SI')) for f in GEN8}
    R = pd.DataFrame(rev)
    gen = sum(hh[f'{i}_{f}'] * 0.5 for i in ('NI', 'SI') for f in GEN8)
    tot = R.sum(axis=1)
    price = tot / gen   # the generation-weighted national price of each trading period
    yr = hh.index.year
    BANDS = [-np.inf, 50, 150, 300, 500, np.inf]
    blab = ['Under $50', '$50–150', '$150–300', '$300–500', 'Over $500']
    band = pd.cut(price, BANDS, labels=blab)
    money = tot.groupby([yr, band], observed=False).sum().unstack() / 1e9
    time = band.groupby([yr, band], observed=False).size().unstack()
    time = 100 * time.div(time.sum(axis=1), axis=0)
    P('Spot revenue by band ($bn):'); P(money.round(2).to_string()); P('Share of trading periods by band (%):'); P(time.round(1).to_string())
    share = 100 * money.div(money.sum(axis=1), axis=0)
    P('Share of revenue by band (%):'); P(share.round(1).to_string())
    for y in sorted(set(yr)):
        s = price[yr == y].sort_values(ascending=False)
        c = tot.reindex(s.index).cumsum() / tot[yr == y].sum()
        n = len(s)
        P(f'  {y}: revenue ${tot[yr == y].sum() / 1e9:.2f}bn from {gen[yr == y].sum() / 1e6:.1f} TWh; most expensive 1% of trading periods '
          f'{100 * c.iloc[int(np.ceil(.01 * n)) - 1]:.1f}% of revenue, 5% {100 * c.iloc[int(np.ceil(.05 * n)) - 1]:.1f}%, '
          f'25% {100 * c.iloc[int(np.ceil(.25 * n)) - 1]:.1f}%; cheapest half {100 * (1 - c.iloc[n // 2 - 1]):.1f}%')
    ys = [y for y in sorted(set(yr)) if y <= 2026]
    out['money'] = {'years': ys, 'bands': blab, 'money': [[r1(money.loc[y, b], 2) for b in blab] for y in ys],
                    'time': [[r1(time.loc[y, b]) for b in blab] for y in ys]}
    # each fuel's reliance on the dearest trading periods: the share of its 2021-2025 revenue earned in the most
    # expensive 5% of each year's trading periods
    full = (yr >= 2021) & (yr <= 2025)
    top = pd.Series(False, index=hh.index)
    for y in range(2021, 2026):
        sel = yr == y
        top[sel] = price[sel] >= price[sel].quantile(0.95)
    fs = {f: 100 * R.loc[full & top, f].sum() / R.loc[full, f].sum() for f in GEN8}
    fs['all'] = 100 * tot[full & top].sum() / tot[full].sum()
    P('Share of 2021-2025 spot revenue earned in each year\'s most expensive 5% of trading periods:', {k: round(v, 1) for k, v in fs.items()},
      ' revenue $m:', {f: round(R.loc[full, f].sum() / 1e6) for f in GEN8})
    out['reliance'] = {k: r1(v) for k, v in fs.items()}

    # ---- wholesale to retail
    # the four gentailers' mass-market revenue per MWh by component (weighted by MWh sold), against the Haywards
    # average over the same financial year (July to June)
    x = pd.read_excel(fetch(f'{RETAIL}/RetailGrossMargins/Retail%20gross%20margins.xlsx', os.path.join(DATA, 'retail', 'rgm.xlsx')), sheet_name=None)
    comp = ['Electricity', 'Distribution', 'Metering', 'Levies', 'Margin']
    rr = {'years': [], 'revenue': [], 'spot': [], **{c.lower(): [] for c in comp}}
    for fy in sorted(x):
        d = x[fy][x[fy]['Participant name'].isin(GENTAILERS)].copy()
        if len(d) != len(GENTAILERS):
            sys.exit(f'retail gross margins {fy}: expected the four gentailers, found {d["Participant name"].tolist()}')
        wt = pd.to_numeric(d['Electricity sold MWh'])
        avg = lambda c: float((pd.to_numeric(d[f'{c} $/MWh']) * wt).sum() / wt.sum())
        y = int(fy)
        spot = H.loc[f'{y - 1}-07':f'{y}-06'].mean()
        rr['years'].append(y); rr['revenue'].append(r1(avg('Revenue'))); rr['spot'].append(r1(spot))
        for c in comp:
            rr[c.lower()].append(r1(avg(c)))
        P(f'Gentailers FY{y}: revenue {avg("Revenue"):.0f}/MWh ({wt.sum() / 1e6:.1f} TWh sold), ' +
          ', '.join(f'{c.lower()} {avg(c):.1f}' for c in comp) + f'; electricity share {100 * avg("Electricity") / avg("Revenue"):.0f}%, '
          f'distribution {100 * avg("Distribution") / avg("Revenue"):.0f}%; Haywards Jul-Jun {spot:.0f}')
    out['retail'] = rr

    # households: average of every network region's standard-user price per kWh, against the Haywards monthly average
    b = pd.read_csv(fetch(f'{RETAIL}/RegionalPowerPrices/20260531_AveragePowerUseAndCosts.csv', os.path.join(DATA, 'retail', 'rpp.csv')),
                    encoding='utf-8-sig', parse_dates=['MonthEnd'])
    s = b[b.LoadType == 'Standard user'].copy()
    s['share'] = s.NetworkMonthlyChargeDollarsInclGST / s.TotalMonthlyBillDollarsInclGST
    g = s.groupby(s.MonthEnd.dt.to_period('M')).agg(var=('VariableDollarPerkWhInclGST', 'mean'), fixed=('FixedDollarPerDayInclGST', 'mean'),
                                                     share=('share', 'mean'), n=('NetworkReportingRegionCode', 'nunique'))
    g['var_ex'] = g['var'] / 1.15 * 1000   # $/MWh excluding GST, to compare with wholesale
    g['hay'] = m.HAY2201.reindex(g.index)
    P('Households, standard users (mean of regions):'); P(g.round(3).to_string())
    P(f'  variable price {g["var"].iloc[0] * 100:.1f} c/kWh incl GST ({g.index[0]}) to {g["var"].iloc[-1] * 100:.1f} ({g.index[-1]}), '
      f'{100 * (g["var"].iloc[-1] / g["var"].iloc[0] - 1):+.0f}%; network share of the bill {g.share.min() * 100:.0f}-{g.share.max() * 100:.0f}%')
    out['bills'] = {'start': str(g.index[0]), 'household': [r1(v, 0) for v in g.var_ex], 'hay': [r1(v, 0) for v in g.hay]}

    # a power bill in parts: the gentailers' latest year per MWh, plus GST at 15% on the whole
    last = {c.lower(): rr[c.lower()][-1] for c in comp}
    gst = 0.15 * rr['revenue'][-1]
    out['bill_parts'] = {'year': rr['years'][-1], **{k: r1(v) for k, v in last.items()}, 'gst': r1(gst), 'total': r1(rr['revenue'][-1] + gst)}
    P(f'Bill in parts FY{rr["years"][-1]}: ' + ', '.join(f'{k} {v:.1f}' for k, v in last.items()) + f', GST {gst:.1f}, total {rr["revenue"][-1] + gst:.1f}/MWh incl GST')

    # every network region in the latest month: a standard user's bill for the same 600 kWh, so regions compare
    lm = s.MonthEnd.max()
    reg = s[s.MonthEnd == lm].copy()
    reg['bill600'] = reg.FixedDollarPerDayInclGST * lm.day + reg.VariableDollarPerkWhInclGST * 600
    reg = reg.sort_values('bill600')
    P(f'Regions {lm.date()}: 600 kWh bill ${reg.bill600.min():.0f} ({reg.NetworkReportingRegion.iloc[0]}) to ${reg.bill600.max():.0f} '
      f'({reg.NetworkReportingRegion.iloc[-1]}), median ${reg.bill600.median():.0f}; {len(reg)} regions; '
      f'lines share {100 * reg.share.min():.0f}-{100 * reg.share.max():.0f}%')
    reg['lines600'] = reg.NetworkMonthlyChargeDollarsInclGST / reg.MonthlyNetworkMeankWh * 600   # the lines charge scaled to 600 kWh
    P(f'  lines charge scaled to 600 kWh: {reg.lines600.iloc[0]:.0f} (cheapest region) to {reg.lines600.iloc[-1]:.0f} (most expensive); '
      f'correlation with the 600 kWh bill {reg.bill600.corr(reg.lines600):.2f}')
    out['regions'] = {'month': str(lm.date()), 'days': int(lm.day),
                      'rows': [{'name': r.NetworkReportingRegion, 'bill': r1(r.bill600, 0), 'share': r1(100 * r.share, 0)} for r in reg.itertuples()]}

    # ---- the two example trading periods
    out['stacks'] = []
    for day_, tp in EXAMPLES:
        d = offer_stack(day_, tp)
        t = pd.Timestamp(day_).tz_localize(NZ) + pd.Timedelta(minutes=30 * (tp - 1))
        gen = history_at(t)
        load = sum(gen.values())
        row = p.loc[t]
        d['cum'] = d.mw.cumsum()
        at = d.iloc[min(np.searchsorted(d.cum.values, load), len(d) - 1)]
        P(f'{t}: generation {load:.0f} MW, offered {d.mw.sum():.0f} MW; offer at that point ${at.DollarsPerMegawattHour:.2f} '
          f'({at.plant}); HAY ${row.HAY2201:.2f}, BEN ${row.BEN2201:.2f}, OTA ${row.OTA2201:.2f}')
        P('  generation by fuel:', {k: round(v) for k, v in gen.items()})
        under1 = d[d.DollarsPerMegawattHour <= 1].mw.sum()
        P(f'  offered at $1 or less: {under1:.0f} MW; by fuel', d[d.DollarsPerMegawattHour <= 1].groupby('fuel').mw.sum().round(0).to_dict())
        P(f'  offered above $300: {d[d.DollarsPerMegawattHour > 300].mw.sum():.0f} MW', d[d.DollarsPerMegawattHour > 300].groupby('fuel').mw.sum().round(0).to_dict())
        hydro = d[d.fuel == 'hydro']
        P(f'  hydro offered: {hydro.mw.sum():.0f} MW, of which under $1 {hydro[hydro.DollarsPerMegawattHour <= 1].mw.sum():.0f}, over $300 '
          f'{hydro[hydro.DollarsPerMegawattHour > 300].mw.sum():.0f}')
        # merge neighbouring tranches of the same fuel at the same price (to the cent) so the chart stays light
        d['pr'] = d.DollarsPerMegawattHour.round(2)
        blocks = []
        for r in d.itertuples():
            if blocks and blocks[-1][0] == r.fuel and blocks[-1][1] == r.pr:
                blocks[-1][2] += r.mw
            else:
                blocks.append([r.fuel, float(r.pr), float(r.mw)])
        out['stacks'].append({'label': t.strftime('%-I:%M %p %A %-d %B %Y').replace('PM', 'pm').replace('AM', 'am'), 'day': day_, 'tp': tp,
                              'load': round(load), 'price': {'HAY': r1(row.HAY2201, 2), 'BEN': r1(row.BEN2201, 2)},
                              'blocks': [[b[0], b[1], round(b[2], 1)] for b in blocks]})
        P(f'  blocks: {len(blocks)}')

    # ---- Part 4: the most expensive and cheapest months, two-hourly, generation by fuel, demand and the Haywards price
    two = {}
    for ym in ['2024-08', '2026-01']:
        x = hh.loc[ym]
        g2 = pd.DataFrame({f: x[f'NI_{f}'] + x[f'SI_{f}'] for f in GEN8})
        g2['demand'] = x.NI_metered + x.SI_metered
        g2['price'] = p.HAY2201.reindex(x.index)
        b2 = g2.resample('2h').mean()
        two[ym] = {'t0': int(b2.index[0].value // 10**6), 'step': 7200000, **{k: [r1(v, 0) for v in b2[k]] for k in GEN8 + ['demand', 'price']}}
        P(f'{ym}: two-hourly points {len(b2)}; mean demand {g2.demand.mean():.0f} MW; thermal mean {(g2.coal + g2.gas + g2.diesel).mean():.0f} MW; '
          f'hydro {g2.hydro.mean():.0f}; geo {g2.geo.mean():.0f}; wind {g2.wind.mean():.0f}; Haywards mean {g2.price.mean():.2f}')
    with open(OUT_MONTHS, 'w') as f:
        json.dump(two, f, separators=(',', ':'))
    P('wrote', OUT_MONTHS, os.path.getsize(OUT_MONTHS), 'bytes')

    with open(OUT, 'w') as f:
        json.dump(out, f, separators=(',', ':'), ensure_ascii=False)
    P('wrote', OUT, os.path.getsize(OUT), 'bytes')


if __name__ == '__main__':
    main()
