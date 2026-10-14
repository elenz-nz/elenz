"""Fit the HVDC estimate (ingest/hvdc.py FIT, LOSS) against metered EMI HVDC_Flows. Development only.
  python3 analysis/hvdc_fit.py <island balance csv from hvdc_build.py> <folder of YYYYMM_HVDC_flows.csv>"""
import sys, os
import glob, pandas as pd, numpy as np
d=pd.read_csv(sys.argv[1],index_col=0,parse_dates=True)
hh=d.groupby(d.index.floor('30min')).mean()
# metered HVDC: kWh per trading period -> MW
rows=[]
for f in glob.glob(os.path.join(sys.argv[2], '*.csv')):
    x=pd.read_csv(f)
    tp=[c for c in x.columns if c.startswith('TP')]
    m=x.melt(id_vars=['POC','Flow_Direction','Trading_Date'],value_vars=tp,var_name='tp',value_name='kwh').dropna()
    m['k']=m.tp.str[2:].astype(int)
    mid=pd.to_datetime(m.Trading_Date).dt.tz_localize('Pacific/Auckland').dt.tz_convert('UTC')
    m['t']=mid+pd.to_timedelta((m.k-1)*30,unit='min')
    rows.append(m)
m=pd.concat(rows)
p=m.pivot_table(index='t',columns=['POC','Flow_Direction'],values='kwh',aggfunc='sum').fillna(0)*2/1000
H=pd.DataFrame({'ben_north':p[('BEN2201','X')]-p[('BEN2201','I')],'hay_north':p[('HAY2201','I')]-p[('HAY2201','X')]})
j=hh.join(H,how='inner').dropna()
j=j[(j.LNI>500)&(j.LSI>300)]
j['est']=((j.GSI-j.LSI)+(j.LNI-j.GNI))/2
j['si_bal']=j.GSI-j.LSI; j['ni_bal']=j.LNI-j.GNI
j['mid']=(j.ben_north+j.hay_north)/2
print(len(j),'half-hours')
def stats(name,e,ref='mid'):
    r=e-j[ref]; print(f'{name:45s} bias {r.mean():6.1f} MW  MAE {r.abs().mean():5.1f}  RMSE {np.sqrt((r**2).mean()):5.1f}  p95 |err| {r.abs().quantile(.95):5.1f}')
print('metered: mean north flow BEN %.0f, HAY %.0f; mean loss %.1f MW' % (j.ben_north.mean(), j.hay_north.mean(), (j.ben_north-j.hay_north).mean()))
stats('current estimate (mean of island balances)', j.est)
stats('SI balance alone (gen - load)', j.si_bal)
stats('NI balance alone (load - gen)', j.ni_bal)
# fit: HVDC = a*si_bal + b*ni_bal + c*LSI + d*LNI + e
X=np.c_[j.si_bal,j.ni_bal,j.LSI,j.LNI,np.ones(len(j))]
# time-split validation: fit on even days, test on odd days
day=j.index.tz_convert('Pacific/Auckland').day
tr=(day%2==0); te=~tr
co,*_=np.linalg.lstsq(X[tr],j.mid[tr],rcond=None)
e=X@co; r=(e-j.mid)[te]
print('fit coefs', np.round(co,4))
print(f'{"fitted (tested on held-out days)":45s} bias {r.mean():6.1f} MW  MAE {r.abs().mean():5.1f}  RMSE {np.sqrt((r**2).mean()):5.1f}  p95 |err| {r.abs().quantile(.95):5.1f}')
# by month bias of current estimate
j['m']=j.index.tz_convert('Pacific/Auckland').strftime('%Y-%m')
print((j.est-j.mid).groupby(j.m).agg(['mean','std']).round(1))


loss = j.ben_north - j.hay_north
a = np.sum(loss * j.mid ** 2) / np.sum(j.mid ** 4)
co, *_ = np.linalg.lstsq(X, j.mid, rcond=None)
print('all-data FIT =', tuple(float(x) for x in np.round(co, 4)), ' LOSS =', f'{a:.4g}')
