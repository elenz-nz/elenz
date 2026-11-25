"""Shared paths and curated reference data for the Elenz ingest jobs."""
import csv
import os
import re
import tomllib
from zoneinfo import ZoneInfo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.environ.get('ELENZ_DATA', os.path.join(ROOT, 'data'))   # raw and reference files, not committed
RAW_DAILY = os.path.join(DATA, 'raw', 'daily')                     # EMI NodalPricesAndVolumes, one CSV per day
RAW_API = os.path.join(DATA, 'raw', 'api')                         # real-time dispatch API, one CSV per day
REF = os.path.join(DATA, 'ref')                                    # plant register, irradiance
OUT = os.environ.get('ELENZ_OUT', os.path.join(ROOT, 'site', 'static', 'data'))  # JSON the website reads
FACILITIES = os.path.join(ROOT, 'facilities')

NZ = ZoneInfo('Pacific/Auckland')
BLOB = 'https://emidatasets.blob.core.windows.net/publicdata'

for p in (RAW_DAILY, RAW_API, REF, OUT):
    os.makedirs(p, exist_ok=True)


def overrides():
    with open(os.path.join(FACILITIES, 'overrides.toml'), 'rb') as f:
        return tomllib.load(f)


def connection_islands():
    """POC -> 'NI' / 'SI', from facilities/connection_points.csv plus the curated [islands] table."""
    with open(os.path.join(FACILITIES, 'connection_points.csv')) as f:
        isl = {r['poc']: r['island'] for r in csv.DictReader(f)}
    isl.update(overrides().get('islands', {}))
    return isl


def island_of(poc, table):
    """Exact POC first, then any POC at the same site (first three letters)."""
    if poc in table:
        return table[poc]
    for k, v in table.items():
        if k[:3] == poc[:3]:
            return v
    return ''


def key():
    """EMI API subscription key: EMI_KEY environment variable, or a .emi_key file in the repo root (git-ignored)."""
    k = os.environ.get('EMI_KEY')
    if not k:
        path = os.path.join(ROOT, '.emi_key')
        if not os.path.exists(path):
            raise SystemExit('No EMI API key. Set EMI_KEY or create a .emi_key file in the repo root.')
        with open(path) as f:
            k = f.read().strip()
    return k


ISO_DATE = re.compile(r'^\d{4}-\d{2}-\d{2}')


def ea_dates(values):
    """EA dates as pandas timestamps (NaT where blank or 'null'), whichever way the file writes them: ISO
    (2014-05-02, the register since Nov 2026) or day first (2/05/2014, the older register and the EMI reports).
    pd.to_datetime(..., dayfirst=True) alone swaps day and month in an ISO date (2014-05-02 -> 5 Feb), so each
    value is read by its own shape."""
    import pandas as pd
    s = pd.Series(values, dtype=object)
    iso = s.astype(str).str.match(ISO_DATE)
    out = pd.Series(pd.NaT, index=s.index, dtype='datetime64[ns]')
    if iso.any():
        out[iso] = pd.to_datetime(s[iso].astype(str).str[:10], format='%Y-%m-%d', errors='coerce')
    if (~iso).any():
        out[~iso] = pd.to_datetime(s[~iso], dayfirst=True, errors='coerce', format='mixed')
    return out
