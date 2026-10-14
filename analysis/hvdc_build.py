"""Island generation and load (as the tracker computes them) from daily dispatch files, for fitting the HVDC
estimate. Development only.   python3 analysis/hvdc_build.py <folder of daily dispatch CSVs> <out.csv>"""
import sys, glob, pandas as pd, numpy as np
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'ingest'))
from concurrent.futures import ProcessPoolExecutor
import state as st
from common import connection_islands, island_of
def one(f):
    d=pd.read_csv(f,keep_default_na=False)
    s=st.compact(d,'file')
    isl=connection_islands()
    out={}
    for k in ('NI','SI'):
        u=[c for c in s.columns if c.startswith('U|') and island_of(c[2:].split(' ')[0],isl)==k]
        ch=[c for c in s.columns if c.startswith('C|') and island_of(c[2:].split(' ')[0],isl)==k]
        out['G'+k]=s[u].sum(axis=1)-s[ch].sum(axis=1)
        out['L'+k]=s['L|'+k]
    return pd.DataFrame(out)
fs=sorted(glob.glob(os.path.join(sys.argv[1], '*.csv')))
if __name__ == '__main__':
    with ProcessPoolExecutor(6) as ex: parts=list(ex.map(one,fs))
    d=pd.concat(parts).sort_index(); d=d[~d.index.duplicated()]
    d.to_csv(sys.argv[2]); print(d.shape)
