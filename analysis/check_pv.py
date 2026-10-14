"""Check ingest/pv.py against pvlib (development only; pvlib is not needed by the jobs)."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'ingest'))
import numpy as np, pandas as pd, pvlib
import pv

t = pd.date_range('2026-01-01', '2026-12-31 23:50', freq='10min', tz='UTC')
for lat, lon in [(-36.85, 174.76), (-43.53, 172.63), (-45.87, 170.50)]:
    zen, az, dex = pv.sun(t, lat, lon)
    sp = pvlib.solarposition.get_solarposition(t, lat, lon)
    up = sp.apparent_zenith.values < 88
    print(f'{lat},{lon}: max |zenith| diff {np.abs(zen - sp.apparent_zenith.values)[up].max():.3f}°, '
          f'max |azimuth| diff {np.abs(((az - sp.azimuth.values) + 180) % 360 - 180)[up].max():.3f}°, '
          f'extra-terrestrial max diff {np.abs(dex - pvlib.irradiance.get_extra_radiation(t).values).max():.1f} W/m²')
    loc = pvlib.location.Location(lat, lon)
    cs = loc.get_clearsky(t, model='ineichen', solar_position=sp)
    for tilt, saz in [(20, 0), (10, 90), (30, 300)]:
        eff, tot = pv.poa(cs.ghi.values, cs.dhi.values, sp.apparent_zenith.values, sp.azimuth.values, dex, tilt, saz)
        dni = np.where(sp.apparent_zenith < 89.5, (cs.ghi - cs.dhi) / np.cos(np.radians(sp.apparent_zenith)).clip(0.0175), 0)
        p = pvlib.irradiance.get_total_irradiance(tilt, saz, sp.apparent_zenith, sp.azimuth, np.clip(dni, 0, dex), cs.ghi, cs.dhi,
                                                  dni_extra=dex, model='haydavies', albedo=0.2)
        e_ref, e_mine = p.poa_global.sum(), tot.sum()
        print(f'   tilt {tilt} az {saz}: annual POA ratio mine/pvlib {e_mine / e_ref:.4f}')
    tt, ta = pv.tracker_angles(sp.apparent_zenith.values, sp.azimuth.values)
    tr = pvlib.tracking.singleaxis(sp.apparent_zenith, sp.azimuth, axis_tilt=0, axis_azimuth=0, max_angle=60, backtrack=True, gcr=0.35)
    ok = tr.surface_tilt.notna() & up
    print(f'   tracker: max tilt diff {np.abs(tt[ok] - tr.surface_tilt[ok]).max():.2f}°, '
          f'azimuth agree {np.mean(np.abs(((ta[ok] - tr.surface_azimuth[ok]) + 180) % 360 - 180) < 1):.3f}')
    tc = pv.cell_temp(np.full(3, 800.0), np.full(3, 20.0))
    tc_ref = pvlib.temperature.sapm_cell(800, 20, 2, **pvlib.temperature.TEMPERATURE_MODEL_PARAMETERS['sapm']['close_mount_glass_glass'])
    print(f'   cell temp at 800 W/m², 20 °C: mine {tc[0]:.2f} pvlib {tc_ref:.2f}')
