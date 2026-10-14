"""Fit geometry and DC/AC ratio for ground-mounted embedded arrays against their metered injection (EMI
reconciliation, Sep 2026) at Blenheim and Southbrook. Development only.
  python3 analysis/ground_cal.py <data folder with dl/recon/ReconciledInjectionAndOfftake_202609_*.csv.gz and area_sat.csv>"""
import sys, numpy as np, pandas as pd
S=sys.argv[1].rstrip('/')+'/'
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'ingest')); import pv, rooftop
x=pd.read_csv(__import__('glob').glob(S+'dl/recon/ReconciledInjectionAndOfftake_202609_*.csv.gz')[0])
x=x[(x.FlowDirection=='Injection')]
x['loc']=pd.to_datetime(x.TradingDate+' '+x.TradingPeriodStartTime)
x['t']=x['loc'].dt.tz_localize('Pacific/Auckland',ambiguous='NaT',nonexistent='NaT').dt.tz_convert('UTC')
x=x[x.t.notna()]
sat=pd.read_csv(S+'area_sat.csv',index_col=0,parse_dates=True).sort_index()
ARR={'BLN':('BLN0331',['MERX','ETRN'],-41.515,173.955),'SBK':('SBK0661',['MERX','MEEN'],-43.335,172.625)}
GEO={'tracker':'tracker','fixed N 25°':[(25,0,1)],'fixed N 15°':[(15,0,1)],'fixed E-W 10°':[(10,90,.5),(10,270,.5)]}
for area,(poc,trs,lat,lon) in ARR.items():
    a=x[(x.PointOfConnection==poc)&x.Participant.isin(trs)].groupby('t').KilowattHours.sum()*2/1000
    a=a[a.index>='2026-09-12']   # after the ETRN array began exporting
    g=sat[[c for c in sat if c.startswith(f'G|{area}|')]].mean(axis=1); d=sat[[c for c in sat if c.startswith(f'D|{area}|')]].mean(axis=1)
    irr=pd.DataFrame({'G':g,'D':d}); irr=irr.groupby(irr.index.floor('30min')).mean().reindex(a.index)
    mid=a.index+pd.Timedelta(minutes=15); zen,az,dex=pv.sun(mid,lat,lon); ta=rooftop.t_air(mid,lat)
    cs=pv.clearsky_ghi(zen); kt=irr.G.values/np.maximum(cs,1)
    cap=a.quantile(0.995)
    res=[]
    for gn,geo in GEO.items():
        if geo=='tracker':
            tl,sa=pv.tracker_angles(zen,az); eff,tot=pv.poa(irr.G.values,irr.D.values,zen,az,dex,tl,sa)
        else:
            eff=tot=0
            for tl,sa,w in geo:
                e1,t1=pv.poa(irr.G.values,irr.D.values,zen,az,dex,tl,sa); eff=eff+w*e1; tot=tot+w*t1
        tc=pv.cell_temp(tot,ta,a=-3.56,b=-0.075,dt=3)
        for dcac in (1.1,1.2,1.3,1.4,1.5):
            m=pv.ac_output(eff,tc,dcac,0.08)*cap
            ok=np.isfinite(m)&(cs>50)
            clear=ok&(kt>0.75)
            rmse=np.sqrt(np.mean((m[clear]-a.values[clear])**2))
            res.append((rmse,gn,dcac,a.values[ok].sum()/m[ok].sum()))
    res.sort()
    print(f'{area}: AC (99.5th pct) {cap:.1f} MW, metered {a.sum()/2000:.2f} GWh since 12 Sep; best fits (clear-sky RMSE MW, geometry, DC/AC, metered/model energy):')
    for r in res[:5]: print('   %.2f  %-14s %.1f  %.2f' % r)
