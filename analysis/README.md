# Analysis behind the rooftop solar and HVDC estimates

Development scripts, not run by the jobs. Results as of 15 Oct 2026; rerun them when the inputs change a lot.

## Rooftop solar capacity

EMI report GUEHMT (installed distributed generation, from the registry) by Root NSP, systems of 10 kW or less and
over 10 kW, `seriesFilter=ALL` to get every region (the Island region type returns nothing; use Zone or Root NSP).

- September 2026: 1,270 MW in the registry, of which ~410 MW is eleven dispatched solar farms on local networks
  that the tracker already shows as grid solar (Kōwhai Park alone is the ~160 MW jump in July 2026). Without them:
  ~860 MW (NI ~574, SI ~287; 472 MW of systems up to 10 kW). The farms are listed in
  `facilities/overrides.toml` `[solar_farms_in_registry]`, each matched to a step in the registry at its own
  Root NSP within a megawatt of its nameplate.
- Farms can enter the registry late (Rangitaiki ~17 months after commissioning). `rooftop.capacity_table` warns
  when, in the last three months, systems over 10 kW grow 5 MW or more at an NSP where a solar unit dispatches and
  the new systems average 2 MW or more.
- Registry capacity is the lesser of the generators' total and the inverter or injection limit: roughly AC.
- `SolarInstallationsByRegion`/`ByStreet` come from the same registry (totals match to the kW): not an independent
  check. Published national figures (EECA, MBIE's *Energy in New Zealand*) also trace back to the registry.
- Taiohi: the registry rose 10 MW at HLY0331 in March 2026 (4 systems averaging 2.5 MW) and Taiohi's metered
  injection (trader NPEL) ran ~45–50% above its dispatch on 20 and 24 Sep 2026 (peak ~34 MW vs 22.4 MW nameplate):
  probably an extension behind the same meter that isn't dispatched. It stays counted as distributed solar.

## Irradiance points (`make_points.py`)

One point per network reporting region (a distribution company's area) at its capacity-weighted centre, regions
under 2 MW merged into the nearest one and regions within 5 km of a bigger one sharing its point: 35 points
(22 NI, 13 SI). `facilities/rooftop_nsp.csv` maps every grid-connected NSP to its point.

## Satellite irradiance

Open-Meteo Satellite Radiation API (`satellite-api.open-meteo.com/v1/archive`, `models=satellite_radiation_seamless`,
`temporal_resolution=native`): Himawari, 10-minute, values are means over the preceding 10 minutes, archive back to
at least 2016, about 40–50 minutes behind real time. Values are blank while the sun is under ~10° and for a couple
of housekeeping slots a day: `rooftop.fill_gaps` fills them from the nearest valid clear-sky index.

Annual 2025 sunshine (kWh/m²) at the points is close to NIWA's long-term figures: Christchurch 1,468, Wellington
1,467, Dunedin 1,277, Nelson/Tasman 1,600; Auckland 1,623 may be ~5% high.

## PV model (`ingest/pv.py`, `check_pv.py`)

NOAA sun position, Hay-Davies transposition, ASHRAE incidence-angle loss, Sandia close-roof-mount cell
temperature, PVWatts-style DC and inverter clipping. Matches pvlib 0.16 to within 0.03° (sun position), 0.01%
(annual plane-of-array irradiance) and exactly on cell temperature and tracking.

Rooftop assumptions (`ingest/rooftop.py`): systems up to 10 kW at 20° tilt, 40% north, 30% north-east/north-west,
20% east/west, 10% at 10°; larger systems flatter (10°, 35% north, 40% east/west) plus 25% at 25° north; DC/AC 1.2;
losses 11.5%; air temperature from a latitude/season climatology. 2025 yield: ~1,516 kWh per kW of registry (AC)
capacity, ~1,264 kWh per kW of panels, before calibration.

## Calibration (`farm_check.py`, `rooftop_exports.py`)

- Dispatched farms: renewable dispatch MW reflect actual output unless constrained (checked against metered
  injection for Sep 2026: Lauriston, Rangitaiki, Whitianga, Tauhei, Kōwhai Park and Te Herenga o Te Rā within
  ~1–2% by half-hour). Running the satellite + PV chain for each farm (mounting and DC/AC fitted to clear-sky
  shape), established farms (Lauriston, Omeheu, Rangitaiki, Kohirā, Te Herenga o Te Rā, Dannevirke) produce
  88–98% of the modelled output; new farms are still ramping. 5-minute correlation 0.7–0.9 at a single farm.
- Fitted mounting (tentative, one to two months each): tracking at Lauriston, Rangitaiki, Kohirā, Whitianga,
  Ruawai, Clandeboye, Te Herenga o Te Rā, Dannevirke, Kōwhai Park (confirmed single-axis); fixed east-west at
  Pukenui, Omeheu; fixed north at Twin Rivers, Taiohi, Papareireiā. Ruakākā (not yet generating) is fixed.
- Hence `CAL = 0.95` (about ±6%).
- Metered rooftop exports (EMI `Volumes/Reconciliation`, injection on distribution networks, solar-shaped
  series, dispatched farms removed): Sep 2026 46.6 GWh, peak 363 MW. Modelled generation 95 GWh after calibration.
  Daily totals correlate at 0.985 (Sep 2026) and 0.991 (Sep 2025); the midday export share is steady (p10–p90
  0.45–0.54 of modelled generation); exports never exceed modelled generation nationally. The South Island
  exports a larger share (0.6) because of new 4–12 MW ground-mounted systems at Blenheim and Southbrook, which
  export nearly everything. September exports per registry MW: 0.039 (2021), 0.039 (2022), 0.046 (2023),
  0.051 (2024), 0.049 (2025), 0.056 GWh/MW (2026): the registry's growth looks real.
- Live edge: carrying the latest clear-sky index forward has a median error of 4–7% at 30–90 minutes ahead,
  90th percentile ~20%.
- Uncertainty shown on the site (one standard deviation): capacity 4%, calibration 6%, model 5% when clear rising
  to 18% under cloud, plus 12% for carried-forward intervals: about ±9% clear, ±19% cloudy.

## HVDC (`hvdc_build.py`, `hvdc_fit.py`)

Metered: EMI `Metered_data/HVDC_Flows`, monthly, BEN2201 and HAY2201 injection (I) and offtake (X) kWh per
trading period, back to 1996, published about two weeks after the month.

Estimate from the dispatch feed (72 days, Dec 2025 – Oct 2026, 2,877 half-hours): the simple mean of the two
island balances had a mean error of 22 MW and read ~22 MW low. A linear fit on both balances and both island loads
(`hvdc.FIT`) has a mean error of ~10 MW and no bias, tested on held-out days and on each month left out of the
fit (better in five of six months). Link loss between the ends ≈ 5.86e-5 × flow² (59 MW at 1,000 MW).
