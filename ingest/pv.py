"""A small photovoltaic model in numpy: sun position, plane-of-array irradiance, cell temperature and AC output.

Written for the rooftop solar estimate so the 5-minute job doesn't need pvlib; checked against pvlib 0.16
(analysis/check_pv.py): sun position within 0.02°, plane-of-array irradiance within 0.5%, AC output within 1%.

Conventions: times are UTC (pandas DatetimeIndex), angles in degrees, azimuth clockwise from north (north = 0,
east = 90), irradiance in W/m². Irradiance values describe the instant given (callers pass interval midpoints).
"""
import numpy as np
import pandas as pd

RAD = np.pi / 180


def sun(times, lat, lon):
    """Apparent solar zenith and azimuth (degrees) and extraterrestrial normal irradiance (W/m²), NOAA algorithm."""
    t = pd.DatetimeIndex(times)
    jd = t.to_julian_date().values
    jc = (jd - 2451545.0) / 36525.0
    l0 = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360
    m = 357.52911 + jc * (35999.05029 - 0.0001537 * jc)
    e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc)
    c = (np.sin(m * RAD) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) + np.sin(2 * m * RAD) * (0.019993 - 0.000101 * jc)
         + np.sin(3 * m * RAD) * 0.000289)
    true_long = l0 + c
    omega = 125.04 - 1934.136 * jc
    app_long = true_long - 0.00569 - 0.00478 * np.sin(omega * RAD)
    eps0 = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60
    eps = eps0 + 0.00256 * np.cos(omega * RAD)
    decl = np.arcsin(np.sin(eps * RAD) * np.sin(app_long * RAD))
    y = np.tan(eps / 2 * RAD) ** 2
    eqt = 4 / RAD * (y * np.sin(2 * l0 * RAD) - 2 * e * np.sin(m * RAD) + 4 * e * y * np.sin(m * RAD) * np.cos(2 * l0 * RAD)
                     - 0.5 * y * y * np.sin(4 * l0 * RAD) - 1.25 * e * e * np.sin(2 * m * RAD))   # minutes
    minutes = (jd + 0.5) % 1 * 1440
    tst = (minutes + eqt + 4 * lon) % 1440
    ha = np.where(tst / 4 < 0, tst / 4 + 180, tst / 4 - 180) * RAD
    latr = lat * RAD
    cosz = np.clip(np.sin(latr) * np.sin(decl) + np.cos(latr) * np.cos(decl) * np.cos(ha), -1, 1)
    zen = np.arccos(cosz) / RAD
    # atmospheric refraction (NOAA approximation)
    elev = 90 - zen
    te = np.tan(np.clip(elev, -0.575, 89.9) * RAD)
    refr = np.where(elev > 85, 0,
           np.where(elev > 5, 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5,
           np.where(elev > -0.575, 1735 + elev * (-518.2 + elev * (103.4 + elev * (-12.79 + elev * 0.711))), -20.772 / te))) / 3600
    zen_app = zen - refr
    sinz = np.sin(zen * RAD)
    with np.errstate(invalid='ignore', divide='ignore'):
        caz = (np.sin(latr) * cosz - np.sin(decl)) / (np.cos(latr) * sinz)
    az = np.arccos(np.clip(caz, -1, 1)) / RAD
    az = np.where(ha > 0, (az + 180) % 360, (540 - az) % 360)
    doy = t.dayofyear.values
    b = 2 * np.pi * doy / 365
    dni_extra = 1366.1 * (1.00011 + 0.034221 * np.cos(b) + 0.00128 * np.sin(b) + 0.000719 * np.cos(2 * b) + 0.000077 * np.sin(2 * b))
    return zen_app, az, dni_extra


def clearsky_ghi(zen):
    """Clear-sky global horizontal irradiance (Haurwitz), for the clear-sky index used in short-term persistence."""
    cz = np.cos(np.minimum(zen, 90) * RAD)
    with np.errstate(divide='ignore', over='ignore'):
        g = 1098 * cz * np.exp(-0.059 / np.where(cz > 0, cz, np.nan))
    return np.nan_to_num(np.where(cz > 0, g, 0))


def poa(ghi, dhi, zen, az, dni_extra, tilt, surf_az):
    """Plane-of-array irradiance (W/m²) on a fixed or tracking plane (tilt and surf_az may be arrays):
    beam with an incidence-angle loss, Hay-Davies sky diffuse, ground reflection (albedo 0.2).
    Returns (effective irradiance reaching the cells, total plane-of-array irradiance)."""
    ghi = np.nan_to_num(np.asarray(ghi, float))
    dhi = np.minimum(np.nan_to_num(np.asarray(dhi, float)), ghi)
    cz = np.cos(zen * RAD)
    up = (zen < 89.5) & (cz > 0.0175)                         # sun at least ~1° up
    dni = np.where(up, (ghi - dhi) / np.where(up, cz, 1), 0)
    dni = np.clip(dni, 0, dni_extra)
    cos_aoi = (np.cos(zen * RAD) * np.cos(tilt * RAD) + np.sin(zen * RAD) * np.sin(tilt * RAD) * np.cos((az - surf_az) * RAD))
    cos_aoi = np.clip(cos_aoi, 0, 1)
    beam = dni * cos_aoi
    ai = np.where(up, dni / dni_extra, 0)                       # anisotropy index
    rb = np.where(up, cos_aoi / np.maximum(cz, 0.0175), 0)
    sky = dhi * (ai * rb + (1 - ai) * (1 + np.cos(tilt * RAD)) / 2)
    ground = ghi * 0.2 * (1 - np.cos(tilt * RAD)) / 2
    # incidence-angle modifier (ASHRAE, b0 = 0.05) on the beam; diffuse modifiers folded into a flat 0.97
    with np.errstate(divide='ignore'):
        iam = np.clip(1 - 0.05 * (1 / np.where(cos_aoi > 0, cos_aoi, np.nan) - 1), 0, 1)
    iam = np.nan_to_num(iam)
    total = beam + sky + ground
    eff = beam * iam + 0.97 * (sky + ground)
    return eff, total


def cell_temp(poa_total, t_air, wind=2.0, a=-2.98, b=-0.0471, dt=1.0):
    """Cell temperature, Sandia model. Defaults: close roof mount (glass/glass, 'close_mount')."""
    tm = poa_total * np.exp(a + b * wind) + t_air
    return tm + poa_total / 1000 * dt


def ac_output(eff, t_cell, dc_ac=1.2, losses=0.10, gamma=-0.0037, eta_inv=0.965):
    """AC output per kW of inverter (AC) capacity, PVWatts-style: DC = (effective irradiance / 1000) × DC/AC ratio
    × temperature factor × (1 − losses); AC = DC × inverter efficiency, clipped at 1 (the inverter rating)."""
    dc = eff / 1000 * dc_ac * (1 + gamma * (t_cell - 25)) * (1 - losses)
    return np.clip(dc * eta_inv, 0, 1)


def tracker_angles(zen, az, axis_az=0.0, max_angle=60.0, gcr=0.35):
    """Single-axis tracker (horizontal axis, azimuth axis_az) with backtracking: (surface tilt, surface azimuth)."""
    sx = np.sin(zen * RAD) * np.sin(az * RAD)
    sy = np.sin(zen * RAD) * np.cos(az * RAD)
    sz = np.cos(zen * RAD)
    # rotate the sun vector into the tracker frame (x across the axis, y along it)
    a = axis_az * RAD
    xp = sx * np.cos(a) - sy * np.sin(a)
    zp = sz
    with np.errstate(divide='ignore', invalid='ignore'):
        ideal = np.arctan2(xp, zp) / RAD
        # backtracking: reduce rotation so rows don't shade each other
        cosr = np.abs(np.cos(ideal * RAD)) / gcr
        corr = np.where(cosr < 1, np.arccos(np.clip(cosr, -1, 1)) / RAD, 0)
    rot = np.where(sz > 0, ideal - np.sign(ideal) * corr, 0)
    rot = np.clip(rot, -max_angle, max_angle)
    tilt = np.abs(rot)
    surf_az = np.where(rot >= 0, (axis_az + 90) % 360, (axis_az + 270) % 360)
    return tilt, surf_az
