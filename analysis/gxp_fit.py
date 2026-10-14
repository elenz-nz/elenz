"""Embedded solar from grid exit point load: regress metered net offtake (EMI Grid_export minus Grid_import) on the
modelled embedded solar at registry capacity, in levels (with time-of-day, weekend and overnight-load controls) and
in half-hour changes. Development only.
  python3 analysis/gxp_fit.py <data folder: dl/nsp_All_Small.csv, dl/nsp_All_Large.csv, area_sat.csv, gx_net.csv>"""
import sys, numpy as np, pandas as pd
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'ingest'))
import rooftop, pv
S=sys.argv[1].rstrip('/')+'/'
tab=rooftop.capacity_table(open(S+'dl/nsp_All_Small.csv','rb').read(),open(S+'dl/nsp_All_Large.csv','rb').read(),log=lambda *a:None)
sat=pd.read_csv(S+'area_sat.csv',index_col=0,parse_dates=True).sort_index()
net=pd.read_csv(S+'gx_net.csv',index_col=0,parse_dates=True)
SITES={'BLN':('BLN0331','BLN0331MARLGN',-41.515,173.955),'SBK':('SBK0661','SBK0661MPOWGN',-43.335,172.625)}
out=[]
for area,(poc,nsp,lat,lon) in SITES.items():
    # area-average irradiance -> half-hourly, gaps filled as in production
    g=sat[[c for c in sat if c.startswith(f'G|{area}|')]].mean(axis=1); d=sat[[c for c in sat if c.startswith(f'D|{area}|')]].mean(axis=1)
    tps=net.index
    irr=pd.DataFrame({'G|X':g,'D|X':d})
    irr=irr.groupby(irr.index.floor('30min')).mean().reindex(tps).interpolate(limit=2)
    mid=tps+pd.Timedelta(minutes=15)
    zen,az,dex=pv.sun(mid,lat,lon); ta=rooftop.t_air(mid,lat)
    y={}
    for cls,mix in rooftop.ORIENT.items():
        acc=np.zeros(len(tps))
        for tilt,saz,w in mix:
            eff,tot=pv.poa(irr['G|X'].values,irr['D|X'].values,zen,az,dex,tilt,saz)
            tc=pv.cell_temp(tot,ta) if rooftop.MOUNT[cls]=='roof' else pv.cell_temp(tot,ta,a=-3.56,b=-0.075,dt=3)
            acc+=w*pv.ac_output(eff,tc,rooftop.DC_AC[cls],rooftop.LOSSES[cls])
        y[cls]=acc*rooftop.CAL[cls]
    # registry capacity at this NSP, month by month (interpolated by day like production)
    cap={'months':tab['months'],**{cls:{'X':tab[cls][nsp]} for cls in rooftop.CLASSES}}
    c=rooftop.capacity_at(cap,mid)
    model=pd.Series(sum(y[cls]*c[cls]['X'].values for cls in rooftop.CLASSES),index=tps)   # modelled MW at registry capacity
    capmw=pd.Series(sum(c[cls]['X'].values for cls in rooftop.CLASSES),index=tps)
    L=net[poc].copy(); L[L<1]=np.nan   # outages
    loc=tps.tz_convert('Pacific/Auckland')
    df=pd.DataFrame({'L':L,'M':model,'cap':capmw,'hh':loc.hour*2+loc.minute//30,'wk':(loc.dayofweek>=5).astype(int),'day':loc.date,'mon':loc.strftime('%Y-%m')},index=tps).dropna()
    night=df[(df.hh>=1)&(df.hh<=9)].groupby('day').L.mean()
    df['N']=df.day.map(night)
    for mon,g0 in list(df.groupby('mon'))+[('year',df)]:
        g0=g0.dropna()
        if g0.N.isna().all() or len(g0)<400: continue
        # (1) levels: hh x weekend dummies + hh-specific slope on the day's overnight load, minus beta * modelled solar
        Xd=pd.get_dummies(g0.hh.astype(str)+'_'+g0.wk.astype(str)).astype(float)
        Nc=g0.N-g0.N.mean()
        Xn=pd.get_dummies(g0.hh).astype(float).mul(Nc,axis=0)
        X=np.c_[Xd.values,Xn.values,-g0.M.values]
        co,*_=np.linalg.lstsq(X,g0.L.values,rcond=None); b_lev=co[-1]
        # (2) half-hour changes within daylight: d(load) = hh effect - beta * d(model)
        g1=g0.copy(); g1['dL']=g1.L.diff(); g1['dM']=g1.M.diff(); g1=g1[(g1.index.to_series().diff()==pd.Timedelta(minutes=30))&(g1.M+g1.M.shift()>0.5)].dropna()
        Xd1=pd.get_dummies(g1.hh.astype(str)+'_'+g1.wk.astype(str)).astype(float)
        co1,*_=np.linalg.lstsq(np.c_[Xd1.values,-g1.dM.values],g1.dL.values,rcond=None); b_dif=co1[-1]
        # bootstrap by day for the change estimate
        days=g1.day.unique(); bs=[]
        rng=np.random.default_rng(0)
        for _ in range(100 if mon=='year' else 0):
            pick=rng.choice(days,len(days)); gg=pd.concat([g1[g1.day==dd] for dd in pick])
            Xb=pd.get_dummies(gg.hh.astype(str)+'_'+gg.wk.astype(str)).astype(float)
            cb,*_=np.linalg.lstsq(np.c_[Xb.values,-gg.dM.values],gg.dL.values,rcond=None); bs.append(cb[-1])
        out.append(dict(site=area,month=mon,registry_MW=round(g0.cap.mean(),1),model_peak_MW=round(g0.M.max(),1),model_GWh=round(g0.M.sum()/2000,2),
            ratio_levels=round(b_lev,2),ratio_changes=round(b_dif,2),ci90=(f'{np.percentile(bs,5):.2f}-{np.percentile(bs,95):.2f}' if bs else ''),
            implied_MW_changes=round(b_dif*g0.cap.mean(),1)))
r=pd.DataFrame(out); pd.set_option('display.width',220); print(r.to_string(index=False)); 
