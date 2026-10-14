"""Metered rooftop solar exports from EMI Volumes/Reconciliation (ReconciledInjectionAndOfftake, one month):
injection on distribution networks, by POC, network and trader, keeping series that are solar-shaped (under 5% at
night) and dropping the dispatched farms. Development only.

  python3 analysis/rooftop_exports.py <ReconciledInjectionAndOfftake_YYYYMM_*.csv.gz> <out prefix> <GUEHMT NSP_ROOT small.csv>
Writes <out prefix>_hh_mw.csv (half-hourly MW by island) and <out prefix>_series.csv (each series and its class)."""
import sys, pandas as pd, numpy as np
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'ingest'))
import rooftop
f, out, small = sys.argv[1:4]
EDB = {r[-6:-2] for r in rooftop.parse_guehmt(open(small, 'rb').read()).columns}   # distribution network codes
x=pd.read_csv(f)
inj=x[(x.FlowDirection=='Injection')&x.Network.isin(EDB)].copy()
inj['h']=inj.TradingPeriodStartTime.str[:2].astype(int)
key=['PointOfConnection','Network','Participant']
g=inj.groupby(key); tot=g.KilowattHours.sum(); peak=g.KilowattHours.max()*2/1000
night=inj[(inj.h<=4)|(inj.h>=21)].groupby(key).KilowattHours.sum().reindex(tot.index).fillna(0)/tot
c=pd.DataFrame({'gwh':tot/1e6,'peak_mw':peak,'night':night}).reset_index()
FARM_TRADERS={'LODE','AQNZ','NPEL','HENZ','RANU','DSFL','NPGL','MSFP','FNSF'}
FARM_POC={'KOE1101','ASB0661','MTO0331','EDG0331','HLY0331','KPU0661','ISL0661','WAI0331','TMK0331','DVK0111','WHU1101','BRB0331'}
solar=c.night<0.05
farm=solar&(c.Participant.isin(FARM_TRADERS)|(c.PointOfConnection.isin(FARM_POC)&(c.peak_mw>5)))
c['cls']=np.select([farm, solar, c.night<0.25],['dispatched solar farm','solar exports','mixed (solar + battery/other)'],'other embedded generation')
summary=c.groupby('cls').agg(series=('gwh','size'),gwh=('gwh','sum'),max_series_peak_mw=('peak_mw','max')).round(2)
print(summary)
ks=set(map(tuple,c[c.cls=='solar exports'][key].values))
inj['k']=list(zip(inj.PointOfConnection,inj.Network,inj.Participant))
s=inj[inj.k.isin(ks)].merge(pd.read_csv(os.path.join(os.path.dirname(__file__), '..', 'facilities', 'connection_points.csv')).rename(columns={'poc':'PointOfConnection'}),how='left')
hh=s.pivot_table(index=['TradingDate','TradingPeriodStartTime'],columns='island',values='KilowattHours',aggfunc='sum').fillna(0)*2/1000
hh['NZ']=hh.sum(axis=1); hh.to_csv(out+'_hh_mw.csv')
day=hh.groupby(level=0).sum()/2000   # GWh
print('solar exports GWh', day.sum().round(1).to_dict(), ' peak MW', hh.NZ.max().round(1), hh.NZ.idxmax())
print('largest series:'); print(c[c.cls=='solar exports'].sort_values('peak_mw',ascending=False).head(8).round(2).to_string(index=False))
c.to_csv(out+'_series.csv',index=False)
