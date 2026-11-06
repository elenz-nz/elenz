# Analysis behind the embedded solar and HVDC estimates

"Embedded solar" on the site (data key `roof`): solar on local networks that isn't dispatched, rooftops and
ground-mounted arrays up to ~10 MW. Earlier notes below say "rooftop" for the same thing.

Development scripts, not run by the jobs. Results as of 15 Oct 2026 (later sections dated); rerun them when the inputs change a lot.

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

Annual 2025 sunshine (kWh/m²) at the points runs 6-9% above NIWA's 1991-2020 means (https://figure.nz/chart/72IvcxUqOYF0xjMa,
MJ/m²/day × 365.25 / 3.6; checked 2 Nov 2026): Christchurch 1,468 against 1,371, Wellington 1,467 against 1,385, Dunedin 1,277
against 1,200, Auckland 1,623 against 1,491; Nelson/Tasman 1,600 isn't in that list. One year against a 30-year mean, at
network points rather than NIWA's stations. An earlier note here said "close to NIWA, Auckland ~5% high", with no source.

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
- Clear days 18-19 Oct 2026 (satellite clear-sky index ~1.08 at every farm; `farm_check.py` geometries fitted to
  those two days only, trips left out): tracking clearly best (RMSE margin over the best fixed geometry ×1.35-2.8) at
  Kohirā, Rangitaiki, Whitianga, Clandeboye, Dannevirke; likely at Ruawai (×1.20) and Te Herenga o Te Rā (×1.12);
  Lauriston undecided (×1.01). Fixed at Twin Rivers, Taiohi, Papareireiā, Tauhei (north; Tauhei new, 147 MW),
  Omeheu and Pukenui (east-west vs north nearly tied). Kōwhai Park can't be fitted: dispatch held at ~130-135 MW
  (of ~160 MW AC) and stopped abruptly, to zero for the rest of the day, at 18:10 on 16 Oct, 17:15 on 18 Oct and
  16:45 on 19 Oct; no output at all 20-22 Oct (as of 22 Oct). Team note (22 Oct 2026): it tripped off twice and hasn't
  come back; photos show single-axis trackers, turning east to west, so it is recorded as tracking without a fit.
- Hence `CAL = 0.95` (about ±6%: one standard deviation on the factor, so about 0.89-1.01; it feeds the
  uncertainty band, it isn't applied on top).
- Clear-day peaks (`solar_peak_check.py`, 22 Oct 2026): the estimate's highest so far is 748 MW (1 pm, 18 Oct 2026),
  ~87% of registry (≈AC) capacity; grid + embedded solar 1,342 MW against ~1,500 MW of all solar (~860 embedded +
  636 MW in the 15 dispatched farms). South Australia's fleet peaked at 2,070 MW on 7 Oct 2026, ~73% of its panel (DC)
  capacity (Clean Energy Council, end 2025), so ~85-95% on an AC basis: 87% isn't out of line. Against Aug-Sep 2026
  metered exports: midday export share p10-p90 0.43-0.54 (0.51 on the clearest quarter of days, 0.46 on the rest);
  day to day, midday exports = 0.55 × model − 32 MW (NI 0.46, SI 0.68; r 0.95); through the six clearest days each
  extra modelled MW gives 0.57-0.63 MW of exports. Consistent with ~40% of extra output used on site; can't rule out
  the model being somewhat high on clear days. Timing matches (best lag 0; exports' centre ~20 minutes after the
  model's, as morning use on site absorbs early output). Recheck with October 2026's exports (18-19 Oct).
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

## Ground-mounted embedded arrays (`ground_cal.py`, `gxp_fit.py`, 15 Oct 2026)

- At Blenheim (BLN0331) and Southbrook (SBK0661) most September 2026 solar exports come from one or two trader
  series with flat-topped clear-day output: ~22 MW at Blenheim (MERX, ETRN; 3.5 GWh) and ~11 MW at Southbrook (MERX,
  MEEN; 1.9 GWh), 10 am to 3-4 pm. Ground-mounted arrays, not rooftops. Modelled as rooftops they came out ~20%
  low at both places.
- Their metered output fits fixed north-facing panels at 15-25° with DC/AC 1.3-1.4 (the flat tops are inverter
  clipping), 8% losses, metered/model energy 1.02-1.05: the 'ground' type in `ingest/rooftop.py` (20°, 1.35, 8%,
  open rack, no calibration factor).
- Which registry capacity is ground-mounted: growth in systems over 10 kW in months when an NSP's new systems
  averaged 1 MW or more (`GROUND_KW`): ~101 MW nationally in Sep 2026 (131 MW at 500 kW; 70 MW at 2 MW). Largest at
  Piako (PAO1101, Thames Valley; 18 MW; earlier notes said Paeroa), Blenheim, Southbrook, Huntly (the Taiohi
  extension), Takanini, Huirangi. At Blenheim and Southbrook the
  model then gives 5.39 and 3.38 GWh for September, against 5.5 and 3.4 GWh from metered arrays plus modelled
  rooftops; national September generation 95 → 102 GWh.
- Scan of every export series (`ground_scan.py`, Aug-Sep 2026): 208 solar series of 0.5 MW or more; 11 have
  flat-topped output on their five sunniest days (median ≥ 2.5 h within 3% of the day's peak; rooftop aggregates
  ~1-1.5 h): Blenheim MERX 12.6 MW and ETRN 10.0, Takanini ECOT 11.1, Southbrook MERX 7.2 and MEEN 4.2, Tuai
  (TUI1101) TAOM 4.6, Ashburton ETRN 3.7, Masterton CNIR 3.6, Huntly ECOT 3.5, Waihou MERX 3.2, Waikino PUNZ 2.5
  (peaks). Eight of the nine places are in `GROUND_KW`'s list; Ashburton isn't. Piako and Huirangi, in the list,
  export a rounded curve (self-use on site, or tracking). Flat tops can also be export limits.
- Grid exit point load (`gxp_fit.py`): regressing metered net offtake (EMI `Grid_export` − `Grid_import`) on the
  model brackets it rather than pinning it down: in levels (time-of-day, weekend and overnight-load controls) the
  ratio is 1.12 (Blenheim) and 1.21 (Southbrook) over Oct 2025 – Sep 2026, higher in winter when cloudy days also
  bring heating load; in half-hour changes it is 0.64-0.71, pulled towards zero because area-average satellite
  irradiance doesn't place every cloud. Neither GXP sees reverse flow (Ashburton does).

## HVDC (`hvdc_build.py`, `hvdc_fit.py`)

Metered: EMI `Metered_data/HVDC_Flows`, monthly, BEN2201 and HAY2201 injection (I) and offtake (X) kWh per
trading period, back to 1996, published about two weeks after the month.

Estimate from the dispatch feed (72 days, Dec 2025 – Oct 2026, 2,877 half-hours): the simple mean of the two
island balances had a mean error of 22 MW and read ~22 MW low. A linear fit on both balances and both island loads
(`hvdc.FIT`) has a mean error of ~10 MW and no bias, tested on held-out days and on each month left out of the
fit (better in five of six months). Link loss between the ends ≈ 5.86e-5 × flow² (59 MW at 1,000 MW).

Early layouts (23 Oct 2026, `hvdc.VERSION` 2). Before 2003 the file has three layouts, month by month: four rows
(`HVDC_BN/BS/HN/HS`: each end's northward and southward flow; Oct 1996 - Jan 1997), eight rows per pole (`DCP1_*`,
`DCP2_*`; most months Feb 1997 - Oct 2000), and two rows, `HVDC_BN` and `HVDC_HS` only (39 months: Dec 1997, Aug 1998,
Jun and Sep 1999, Feb-Sep 2000, Nov 2000 - Dec 2002; 2002 adds BEN3501/HAY3501, which repeat the same two). The
two-row months meter only each end's sending side, so the old parser read Haywards as zero whenever power went north
and Benmore as zero whenever it went south, which halved the mid-link transfer (Dec 1997: 367 MW average instead of
~714). The receiving side is now the sending side less the old link's losses, fitted on every half-hour of 1996-2002
with both ends metered: north a·P + b·P² with a = 0.0182, b = 4.494e-5 (mean error 1.8 MW over 51,330 half-hours;
~63 MW at 1,000 MW), south a = 0.0365, b = 3.832e-5 (1.2 MW over 1,845). Dropping the receiving rows from complete
months and estimating them back: mean error 1.3-2.9 MW (Oct 1996, Jan 1998, Jul 1999). The old link ran near its
1,040 MW limit northward for weeks in early 1998 (both ends metered, losses 5-6%), so the HVDC north records from
then are real; the two-row months understated 2000-2002, including the dry winter of 2001's southward flows.

## Emission factors (`emission_factors.py`, 15 Oct 2026)

Huntly's Rankine units burn coal or gas and the market data doesn't say which. Genesis's quarterly performance
reports give, for the Rankines combined (not per unit): output, the share of their fuel that was coal, coal and gas
burned for generation, and generation emissions. 25 quarters, FY21 Q1 (Jul–Sep 2020) to FY27 Q1 (Jul–Sep 2026; added 24 Oct 2026, 23% coal).

- Our dispatch data's Rankine output matches Genesis's reported Rankine output within 1–2% every full quarter.
- Gas: 54.1 kg CO₂e/GJ (MfE Measuring Emissions guide, natural gas, stationary combustion). Coal: 91.8, fitted to
  Genesis's emissions with gas fixed (fitting both gives coal 89.7, gas 57.1).
- Rankine heat rate 11.2 GJ/MWh (median coal PJ per coal-fired GWh, quarters ≥85% coal; range 10.8–11.9), so
  0.61 t/MWh on gas to 1.03 on coal; each quarter's factor follows Genesis's coal share, carried forward until the
  next report.
- Huntly 5 heat rate 7.6 GJ/MWh (Genesis gas burned less the Rankines' gas, per Huntly 5 GWh): 0.41 t/MWh.
- Gas fleet (assumed heat rates for the rest: Huntly 6, McKee 10.5; Stratford 9.0; Junction Road and cogeneration
  9.5): 0.455 t/MWh generation-weighted over the history; by quarter 0.44–0.52, depending on how much Huntly 5 ran.
  The site uses 0.46 for all gas.
- Check: Rankines, Huntly 5 and 6 modelled from the dispatch data reproduce Genesis's reported generation emissions
  within ±5% in 20 of 23 quarters, −0.4% overall. FY22 Q3 emissions were revised in a later report from 404 to 611 kt.
- Geothermal: each station's operational emissions by year (NZGA emissions working group, McLean et al.: CY2020,
  CY2022 published as lifecycle less 10 g/kWh, CY2023), the latest carried forward; Contact's stations use Contact's own figures from FY23 (GEO_CONTACT, green borrowing update reports; Tauhara was TIMES-NZ's assumed 32 until 2 Nov 2026), Ngāwhā 0 from 2024 (Top Energy); TOPP2 0
  (TIMES-NZ assumptions) until published. Generation-weighted over the dispatch data: 2021 70, 2022 69, 2023 60,
  2025 54 g/kWh (NZGA MW-weighted fleet including undispatched stations: 2020 69, 2023 57). Dispatched stations only:
  Ngāwhā B (OEC4) is the only dispatched Ngāwhā plant; TOPP1, GDL and Ngāwhā A are on local networks; 'Wairakei' is
  the whole site.
- See "Kawerau (Onepu)" below for KAW0112 ONU0, which this note first treated as bioenergy. As first written: Kawerau pulp mill cogeneration (KAW0112 ONU0, 'Carter Holt Harvey Energy Ltd CoGen' / 'Norske Skog CoGen', 53 MW,
  Oji): listed as geothermal, but runs ~35–45 MW steady, far more than the 10 MW geothermal mill turbine in the ISK
  Kawerau field study, and geothermal once supplied only ~6% of the mill's electricity (OSTI). Most likely the kraft
  mill's recovery and bark boilers (black liquor and wood), so counted as zero (bioenergy) for now. Not confirmed (2 Nov 2026): the mill's cogeneration was about 13.5 MW in 2012 (ISK study), a power boiler closed in 2019 (Oji), and Oji reports 96 GWh at Tasman in 2025 against about 240 GWh here. The site also has the 8 MW TA3a geothermal turbine (NZGA, Bloomer 2015; the ISK study says 10 MW) and GDL/KA24 (57 GWh in 2023) connected to the mill complex. What ONU0 covers is an open question to the EA; no fuel change until it's answered.
- To reclassify at the next history rebuild: Kinleith (wood-waste cogeneration; turbine failed 2025) and the Kawerau
  mill as Bioenergy; Glenbrook (NZ Steel, waste gas from the ironmaking kilns; two of four kilns replaced by the arc
  furnace in Aug 2026) as zero-emission waste heat (UN CDM ACM0004 counts waste-gas generation as zero; the
  ironmaking emissions sit in industrial processes). Both are 'gas' in the EA register.

**Kawerau (Onepu), KAW0112 ONU0** (5 Nov 2026, `kawerau_onepu.py`). The EA's public meters, not the register's name,
say what this is:

- Generation_MD's `norskeskog` row equals Grid_import at KAW0112 in every half-hour of the months compared (5,808
  half-hours in Jan 2020, Jun 2021, Apr 2025 and Sep 2026). It's a connection meter's into-grid side, and
  the row starts only in January 2020, so before then Grid_import stands in (from 2013, `IMPORT_STAND_IN`).
- Power crosses this connection both ways, in the same half-hour 98% of the time since 2014, so the flows look to be
  on separate circuits. Into the grid: about 25 MW on average since 2014. Out: 20-120 GWh a year since 2013.
- Before 2013 it was a load: 300-610 GWh a year out, 5 GWh or less in. Into the grid rose from January 2013, to about
  25 MW by mid-2014, as Eastland's 24 MW TOPP1 (2012-13) started and the power coming out fell (303 GWh to 90).
- TOPP1 and GDL (9 MW, 2008) have no row in the register, Generation_MD or Embedded_generation, and what goes in is
  under their 33 MW in 93% of half-hours since 2014. So: geothermal, as the register says, with their NZGA factors
  weighted 24:9 (TOPP1 and GDL: CY2021 lifecycle 68 and 55, less 10; CY2022 lifecycle 84 and 63, less 10; CY2023
  operational 56 and 56), not bioenergy. Oji's 96 GWh at Tasman in 2025 is well under the 241 GWh going in.
- Still an inference: no public document places TOPP1 or GDL behind this meter. The ISK Kawerau study does say GDL
  connects directly to the mill complex.
- The series stays the into-grid side. Netting Grid_export off would move it with the site's own load, and demand
  already counts both directions in the grid flows.

Against em6's factors (Carbon Methodology v1.6, Nov 2025, checked 2 Nov 2026): close on the Rankines (1.01 coal, 0.589 gas), Huntly 5 (0.40), the
Taranaki Combined Cycle (0.40) and most geothermal; apart on Tauhara (0.080 from the generator, close to Contact's commissioning-year 86.53; Contact's FY26 is 22.8), Kinleith (0.364 from the generator, 0 here by
the design decision, 2 Nov 2026: Oji calls it biomass cogeneration, and the limit is stated on the method page; 2.1 PJ of fossil fuels against 10.1 PJ of biomass at
the mill in 2025), Kawerau (Onepu) (0.060, 0.054-0.068 here), Whareroa and Kapuni (0.683, the 0.46 fleet average here), Junction Road (0.548, ~0.51 here), diesel (0.76, 0.80 here).
MBIE doesn't document that its coal generation includes Glenbrook (Energy in New Zealand 2025 lists 0.68 PJ of waste heat separately and puts the mill's
coal under other transformation); the case for it is that subtracting Glenbrook reproduces Genesis's figures.

## Metered history (`metered_check.py`, BUILD 6, 16 Oct 2026)

History back to Aug 1997 comes from the EA's metering (`ingest/metered.py`, `facilities/metered_plants.csv`); the daily
dispatch files (from 10 Sep 2020) cover the weeks since the latest published month and fill what the metering lacks.

**Overlap, Sep 2020 - Sep 2026 (73 months).** Generation_MD against the site's dispatch history, matched by connection
point: half-hourly national correlation 0.999 every month. (The by-fuel figures first given here, dispatch 1-2% above
metered and wind +3-4%, don't hold on the site's own series: see "Dispatch against metered, and records" below.) Plant level: some embedded points are metered net of local load in
Generation_MD (Mangahao ~10% of dispatch, Cobb ~35%, Whareroa ~50%); `Embedded_generation` at those points matches
dispatch within ~1% (Mangahao 12.4 vs 12.3 GWh, Sep 2026; Te Huka 3 26.7 vs 27.2; Omeheu + Rangitaiki 8.6 vs 8.7), so
where an embedded meter reads more than Generation_MD at a listed point the difference goes to that point's plant.
Waikato stations correlate only 0.4-0.7 by half-hour while the chain's total agrees, so a station's dispatch there
isn't taken as its output. Glenbrook's Generation_MD is ~1.45 × dispatch (dispatch sees part of the plant).

**Data quirks.** Generation_MD covers embedded stations only from Jan 2009; before that they are in
`Embedded_generation` (Oct 1998 on, most from Apr 1999) under old codes, only those the tracker shows later being
used (so totals don't jump in 2009). Trustpower's embedded meters (Kaimai, Rotokawa, Tararua, Highbank, Paerau,
Waipori, Teviot) read double until Jul 2005 (peaks at twice nameplate; halved where a month's peak exceeds 1.4 ×
`max_mw`). `Grid_import` starts Oct 2000 and until ~2003 covered only local networks' injections (~240 MW against
~4,200 MW of generation), so Generation_MD stands in for connection points it lacks. Generation_MD's `patea_unit_1/2/3`
rows (Jun 2026 on) each repeat the station total; `kawerau_(topp2)` covers Te Ahi O Maui too (split 35/65 from Dec
2025); WPG0331 is Deep Stream hydro and Mahinerangi wind together (split 30/70 from Jun 2011, their 2020-26 dispatch
shares). Gaps: Huntly's Rankines and unit 5 have no Generation_MD rows for Sep 2020 (dispatch fills from 10 Sep, so
1-9 Sep 2020 have no Huntly), Matahina none from Oct 2021 (dispatch fills).

**Against MBIE's annual net generation** (Energy in New Zealand; MBIE also counts industrial cogeneration and small
embedded plant the EA's metering doesn't see): total 1.4-3.2% below MBIE 2000-08 and 3.9-5.7% below 2009-19; hydro
1.3-2.9% below throughout; geothermal within ±5% from 2001 (1998-2000 lack Rotokawa, Ngāwhā and Mokai before their
meters start, up to 15% below); thermal 6-15% below (MBIE counts Glenbrook as coal and more cogeneration). The ~2%
step in 2009 is in MBIE's thermal and geothermal series, not in the tracker's hydro or wind.

**Emissions** (site factors, emissions.js) against the national inventory's "energy industries" (which also holds
refining and gas processing, ~1.2 Mt): tracker coal + gas + diesel 4.4 Mt in 1998 against 5.6 - 1.2; 6.8 against 8.0 -
1.2 in 2001; 8.8 against 10.3 - 1.2 in 2005; 8.2 against 9.7 - 1.2 in 2008; 5.3 against 6.9 - 1.2 in 2010. The year-to-
year pattern matches (the 2001 and 2005-06 peaks, the 2007 dip, the 2011 low). Rankine coal share before FY21: MBIE
quarterly generation from coal less Glenbrook's metered output, over the Rankines' metered output; over FY21-FY25 it
reproduces Genesis's figures to a few points in most quarters (FY23 Q1 24 against 24 GWh of coal, FY24 Q1 201 against 200).

## Price explainer triggers (`price_triggers.py`, 17 Oct 2026)

Added 5 Nov 2026 (test report NOW-07): under $100/MWh the islands count as apart from more than $20 and 25%, where the
card says so but the button stays quiet (`apartUnder`, `apartGap` in explain.js). Checked on the last 13 months of the
site's half-hourly history (19,008 half-hours): the existing rule ($50 and 25%) held 3.7% of the time, about 0.5
episodes a day; with the low-price rule 7.0%, about 0.8 a day. The extra half-hours have a median higher price of $58
and a median gap of $29, with HVDC near 900 MW, so they are real transfer limits, but too ordinary to highlight.

Planned for /now: a "Why is the price high?" card, always there but folded into one line under the price tiles. It
is highlighted (outlined, asking to be opened) when prices are unusual and opens by itself only at extremes. Tested
on every trading period of final prices at Haywards and Benmore, Mar 1997 to Sep 2026 (`price_fetch.py` first).
"Typical" is the median over the previous four weeks of every half-hour on the same kind of day (weekday or weekend)
within an hour of the same time of day (since 18 Oct 2026; before, the same half-hour of the week alone, see below); "year median" the median
over the previous 365 days. Each state holds 30 minutes after its condition ends. "Recent" is 2021-Sep 2026.

| State | Rule | Time, all / recent | Episodes a year, recent |
| --- | --- | --- | --- |
| Highlighted | max(HAY, BEN) ≥ 1.5× typical and ≥ 1.25× year median; or the islands > $50 and > 25% apart; or a new low (under $5 after 24 h without one, first 2 h only) | 10.9% / 12.5% (8.0-19.3% a year since 2021) | 397 (on 54% of days, median 1.5 h) |
| Open by itself | ≥ 3× typical and ≥ 3× year median and ≥ $300; or ≥ $800 at any time | 0.6% / 0.7% | 33 (about 3 a month, on 6.2% of days) |

- **The year-median floor matters.** On the ratio alone, 1.5× typical fires 24.6% of the recent time: spill makes
  typical tiny, so $20 against $5 counts as 4×. The first draft's opening rule (2× typical and $250) opened 98 times a
  year recently.
- **The $300 floor and $800 backstop.** The year median was only $36 at the end of Sep 2026, so 3× it is ~$110: not
  an extreme. A dry year raises typical with it, so the relative rule alone missed 8 Aug 2024 ($897 against a
  typical $366); the backstop opens it (42 half-hours). 15 Aug 2024 ($699, typical $433) is only highlighted.
- **Opened:** 9 Aug 2021 (final peak $2,698), 8 May 2024 ($4,522), 12 Dec 2024 ($4,573, typical $28), 4 Aug 2026 ($3,696).
- **Lows never open it.** Under $5 is 14.4% of the recent time (25.7% of 2026; nearly always both islands), runs
  last a median 1.5 h but 7.5 h at the 90th percentile, and the longest was 354 h at $0.01, 22 Dec 2025 to 6 Jan 2026.
  Highlighting every low would highlight 14% of the time on its own; a new low is ~45 times a year.
- **Typical pooled** (18 Oct 2026). The same half-hour of the week alone is four prices, and in spill season two of
  them can be a few cents: on 17 Oct 2026 the last four Saturdays at 11:30 pm were $0.02, $3.00, $20.76 and $66.55
  (median $11.88), so $72 read as "6.1× usual". Pooling the same kind of day within an hour (40-100 prices) gave $28
  ($40.86 for 10 pm-midnight). Over 30 years it changes little: highlighted 13.6% → 12.5% since 2021, opening 34 → 33
  times a year, every event above still caught, episodes a little longer (less flicker). The panel no longer quotes a
  multiple of usual.
- **Built** (17 Oct 2026): `ingest/explain.py` (usual values, offers, the live block) and `site/src/lib/now/explain.js`
  (these rules, on the 30-minute average of dispatch prices, and the wording).
- **Live use:** these are half-hourly final prices. /now has 5-minute dispatch prices, which spike more and can be
  revised (9 Aug 2021: dispatch peak $356,621, final $2,698), so test the 30-minute average of dispatch prices, and
  check the live rates after a month.

## Installed capacity (`capacity_check.py`, 17 Oct 2026)

`facilities/plant_capacity.csv` gives every plant the tracker shows its installed MW with dates (start and end
inclusive), for the capacity factors in the Generation tab's mix table; `ingest/capacity.py` turns it into
`site/src/lib/tracker/capacity.json` and checks it on every push. Built by comparing each plant's yearly peak
half-hour (99.5th percentile) in the metered history with the register's capacity, then researching every plant where
they disagreed.

**The register alone isn't enough.** `plant_capacity()` (the most a plant had installed at once) gives today's figure
for the whole history and counts some stations twice: Benmore 1,080 (units on two connections 2009-12), Matahina 160,
Whareroa 272 (68 MW repeated on four unit rows), West Wind 160 (two 80 MW rows for a 142.6 MW farm). It lacks Te
Awamutu, Edgecumbe, the old Stratford gas turbines (4 × 50 MW to 2001) and Kawerau TG1/TG2, has Ōtāhuhu A and B only
under macron names the history doesn't use, and has no end date for TCC (closed Mar 2026) or Te Rapa (2023).

**Corrections** (each row of the CSV names its source; `override` rows are these):
- Hydro: Manapōuri 585 MW until the second tailrace (May 2002, output steps up then), 700 to end 2007 while units
  were refurbished, then 800 (854 installed, consent limit 800). Clyde 432 → 464 from Nov 2015, when output first goes
  past 432 (Wikipedia dates the consent change to 2005; the output says otherwise). Arapuni 188.7 → 196.7 (four units
  uprated in 2001). Whakamaru 100 → 124 one unit a year 2017-20, dates from the output steps. Karāpiro 96 → 112.5
  (Sep 2025). Benmore 540 → 552 (May 2024) → 570, Ōhau C 212 → 220 and Ōhau B → 220 (30 Jul 2026). Tekapo A 30 from
  2016 (output above 25 from then; register 25).
  Coleridge 40 → 42 from 27 May 2026 (dispatched at 42 MW all day since 20 Oct 2026; Manawa lists 39.5).
- Geothermal: Wairakei 167 → 181 (binary plant, Jun 2005) → 136 (May 2014, ~45 MW of steam to Te Mihi). Ōhaaki ~65
  (built as 104; steamfield decline, undated) → 43.7 from 2013. Mokai 55 → 95 (May 2005) → 112 (Jun 2007). Ngāwhā 10
  → 25 (Aug 2008, OEC3) → 57 (Dec 2020, OEC4; the register has only OEC4). Ngā Tamariki 86 → 132 (unit 5, Jan 2026).
  Rotokawa 29 → 35 (2003). Te Mihi 166 from its first output (Nov 2013; register 181).
  Ngā Awa Pūrua 144 → 148 from Apr 2023 and Te Huka 3 54 (register 51.4): both run above their listed capacity
  all the time, so the capacity is what they run at (design decision, 30 Oct 2026, after /now showed them over 100%).
- Thermal: Stratford 200 (old turbines) → 577 (TCC from Mar 1998 alongside them) → 377 (2002) → 589 (peakers, May
  2011) → 572 → 542 (TCC derated, register) → 212 (TCC closed Mar 2026). New Plymouth 600 to Dec 2007, 100 May-Dec
  2008. Ōtāhuhu A 180 to Apr 2004 (its last output); Ōtāhuhu B 385 → 404 (2005), to Sep 2015. Southdown 130 → 180
  (Mar 2007). Glenbrook 112, Junction Road 100 (register 130). Huntly Rankines 1,000 → 750 on the register's date for
  unit 3 (Jan 2014; Wikipedia says Jun 2015).
- Wind: Te Rere Hau 5 → 32.5 → 48.5 (2008-11), Turitea 118.8 → 221.4 (Apr 2023), Harapaki 88 → 176 (May 2024),
  West Wind 71.3 per connection.

**Counted from the first metered output.** For plants older than their first month in the history (embedded stations
before Apr 1999, Highbank before Mar 2002, Mill Creek before Sep 2015, Kawerau (Onepu) before 2013 ...), capacity starts
with the data, so a gap doesn't pull a capacity factor down.

**Check** (`python3 analysis/capacity_check.py`): plant-years where the peak runs more than 8% over capacity or the
capacity factor tops 98%. What's left is explained: Trustpower's double-reading meters to Jul 2005 (the build halves
them, the script doesn't); shared embedded meters the script counts for both plants (WRK0331, TWH0331, TWC2201,
KOE1101); West Wind's connections each carrying more than half the farm at times; Mahinerangi (a 70/30 split of a
shared meter); Waitaki at ~104 MW in 2025-26 against the register's 95 (left as the register); a few hours of output
before a plant's start (Huntly 5 testing in 2006, Ōtāhuhu B Nov 1998, traces at Whirinaki 1997-2000 with no known plant).

**Uncertain:** New Plymouth's units were run down before Dec 2007 (output ~300-400 MW 2002-07; dates not found);
Ōtāhuhu A's two Olympus units (MW not found); Ōhaaki's derating date; Kawerau (Onepu) (register 53, a connection meter whose
into-grid side peaks ~40); the Stratford peakers (register 2 × 106, Wikipedia 200).

## Other embedded generation (`embedded_other.py`, 1 Nov 2026)

Non-solar generation on local networks that isn't dispatched, so the live week sees it only as lower demand (raised on
r/nzsolar, 1 Nov 2026: Teviot, Hau Nui). Measured per month as reconciled injection (`Volumes/Reconciliation`, every
trader at every connection point) less the dispatch data's non-solar generation at the same point, leaving out
solar-shaped injection series (under 5% of their energy 9 pm-5 am), points whose injection is all on a generator's own
network (grid stations: block dispatch and terminal-vs-connection differences) and Glenbrook (metered ~1.45 x dispatch).

| Month | GWh | Average MW | Share of dispatched non-solar generation | At points with no dispatched unit |
| --- | --- | --- | --- | --- |
| Jan 2026 | 88 | 119 | 2.8% | 64 GWh |
| Jun 2026 | 102 | 142 | 2.8% | 72 GWh |
| Sep 2026 | 117 | 163 | 3.3% | 87 GWh |

- **Flat through the day:** Sep 153-173 MW by hour of day, Jan 111-125, so no solar leaks in, and a profile from the
  latest reconciliation month would estimate it well.
- **By fuel** (Sep; known plants by point, the rest by the point's GUEHMT registry capacity less dispatched plant,
  weighted by typical capacity factors): hydro ~57%, geothermal ~16%, landfill gas ~14%, wind ~6%, gas, diesel and
  unclassified ~7%. About 95% renewable. Jan and Jun are similar (hydro 46-45%, less from Teviot).
- **Largest:** Ngāwhā's original units at `KOE1101` (16-18 GWh a month, ~22-25 MW: only Ngāwhā B, `NGB0`, is
  dispatched); Teviot and other Pioneer hydro at `CYD0331` (8-21 GWh); flat output sold through Contact at Silverdale
  `SVL0331`, Takapu Road `TAK0331` and Bombay `BOB1101` (~20 MW together, landfill gas; the registry files Bombay as
  natural gas); Hokitika `HKK0661` hydro (6-8 GWh); ~60 small points, mostly hydro (West Coast, Otago, Southland).
- **Wind is small** (~9 MW average). Hau Nui (`GYT0331`, 8.8 MW in the registry) injected only ~0.1 GWh in Sep 2026.
- **Effect on shares:** a 24% solar share in the live week is ~23.3% of all generation; the renewable share reads
  slightly low, the fossil share slightly high.
- **History vs live:** `Generation_MD` already carries all of Ngāwhā (29-40 GWh a month) and Teviot's own meter
  (1-13 GWh), so those step down where the history hands over to dispatch data. The rest is missing from the history
  too: ~2.2-2.4% of generation. Together with industrial cogeneration used on site (in neither dataset), this is the
  gap to MBIE's totals (`metered_check.py`).
- **Glenbrook:** metered 44-48 GWh against 32 GWh dispatched in Jan and Jun 2026 (Sep: 6.5 against 9.0).

### The layer: `ingest/embedded.py`, `embedded_backtest.py`, `embedded_split.py` (6 Nov 2026)

The site's version subtracts, at each grid exit point, what the history already counts there: the plants in the
month's own tracker layout (`hist/hh`), read for this work from https://elenz.co.nz/data/history/hh/. The analysis
above subtracted dispatch instead.

- **Totals:** Sep 2026 is 85.2 GWh, 119 MW, 2.31% of generation (the analysis above, less Ngāwhā's undispatched units
  and Teviot, gives 86). Jan 2026 is 68.3 GWh (2.03%), Jun 2026 80.0 GWh (2.17%). By point, everything matches the
  dispatch-based analysis except Ngāwhā and Teviot (named plants, expected) and Halfway Bush.
- **Halfway Bush:** Generation_MD meters Deep Stream and Mahinerangi at `WPG0331` (17.45 GWh in Sep 2026), and the
  reconciliation data reports the same energy at `HWB0331`. `embedded_points.csv` role `meter` maps a meter point to
  the grid exit point it's reported under.
- **Old embedded meter codes (to 2008):** `embedded_backtest.py match` finds the reconciliation series that tracks
  each unmatched meter point half-hour by half-hour:

  | Meter code | Plant | Reported under | Correlation | Energy ratio |
  | --- | --- | --- | --- | --- |
  | `KMI0331` | Kaimai | `TGA0331` | 1.00 | 1.00 |
  | `TWF0331` | Tararua | `LTN0331` | 1.00 | 1.00 |
  | `TWF0332` | Tararua | `BPE0331` | 1.00 | 1.00 |
  | `WPI0112` | Waipori | `HWB0331` | 1.00 | 1.00 |
  | `HBK0661` | Highbank | `ASB0661` | 1.00 | 1.02 |
  | `ANI0111` | Aniwhenua | `MAT1101` | 1.00 | 1.00 |
  | `PRU0111` | Patearoa | `NSY0331` | 1.00 | 1.15 |
  | `RKA0111` | Rotokawa | `WRK0331` | 0.99 | 1.01 |
  | `KUM0111` | Kūmara | `KUM0661` | 0.98 | 1.5 |
  | `TRC0331` | Te Rapa | `TWH0331` | 0.97 | 1.00 |
  | `TVT0111` | Teviot | `CYD0331` | 0.97 | 1.01 |
  | `GLN0111` | Glenbrook | `GLN0332` | 0.96 | 1.41 |
  | `NGA0331` | Ngāwhā | `KOE0331` | 0.88 | 0.91 |

  Ngāwhā's output is flat, so its correlation means little; the energy agrees. `WHL0661` (White Hill, 2007-08) maps
  to `NMA0331`. With these mapped, no counted point of 0.5 GWh or more is left unmatched in any month sampled from
  2009 on.
- **The reconciliation data isn't consistent before mid-2008.** Two samples a year, 2005-22 (all months 2007):
  - **To February 2007**, much embedded hydro is missing: Clyde, Hangatiki, Ongarue and Hokitika don't appear. The
    layer reads 0.6-1.4% of generation, under half the later level.
  - **March 2007 to April 2008**, the four large retailers report injection at urban grid exit points (Penrose 0221
    and 1101, Addington, Bromley, Henderson, Hepburn Rd, Mt Roskill, Albany, Hamilton, Halfway Bush 0332): up to
    ~50 GWh a month, shaped like demand (morning and evening peaks). Nothing in the data says what it is.
  - **From May 2008** it's steady: 2.0-2.3% in Jul and Oct 2008, about 2-2.9% every year since.
  - **Otāhuhu `OTA0221`** keeps ~2 GWh a month into 2009.
- **2009** (where Generation_MD starts covering embedded stations): 93 MW on average, 2.01% of generation; by month
  1.63% (Apr) to 2.46% (Oct).
- **Live estimate back-test, 2023-26** (45 months; each month's half-hours estimated from earlier months' average
  days by grid exit point):

  | Estimate | Bias | Mean absolute error, month's average | 90th percentile | Half-hourly mean absolute |
  | --- | --- | --- | --- | --- |
  | Month two before (A) | +0.5% | 11.8% | 23% | 14.9 MW |
  | Same month a year before (B) | +0.1% | 10.1% | 19% | 13.7 MW |
  | B scaled by the change from 14 to 2 months before (C) | +1.5% | 12.9% | 26% | 16.5 MW |
  | **Mean of A and B (D)** | +0.3% | **9.1%** | **16%** | **12.9 MW** |

  The layer averages 105 MW. D is the site's method (`embedded.blend`). For the named plants, D gives:
  - Teviot (4.3 MW average): out by 2.3 MW (90th percentile 5.0); A gives 3.3 MW.
  - Ngāwhā, whole station (50 MW): 4.9 MW (11.6); A gives 6.3 MW. Ngāwhā's error is mostly outages.
- **Missing readings are zero.** Each reconciliation file covers its whole month and leaves zero readings out (17-19%
  of a month's point-by-half-hour cells). Treating them as gaps put the live estimate ~10% high, which accounted for
  the earlier +8% bias.
- **Daily shape:** nearly level overnight, with a small morning rise and an evening one (Sep 2026: 109-128 MW by
  hour). The evening rise is hydro following demand, not solar leaking in.
- **Fuel:** from public documents per point (`facilities/embedded_points.csv`, with sources). Otherwise the
  registry's split (`facilities/embedded_registry_split.csv`, `embedded_split.py`: GUEHMT capacity by fuel at the
  latest month less dispatched plant, weighted by typical capacity factors; refresh yearly). Otherwise unclassified.
- **Named plants in months without their metered data** (history.py BUILD 10, `embedded._rest`). Teviot's share of
  its point's injection isn't steady: 0.69 of trader PUNZ in Sep 2026, 0.59 in Oct 2024, 0.06 in Dec 2024, almost
  nothing in summer 2024 (Teviot runs with the season; the trader at `CYD0331` was PION until mid-2024). So a fixed
  share won't do. With the month's reconciliation data, a named plant gets its point's leftover less the other plants'
  usual output there (the blend of that point's average days). Sep 2026 replayed as a dispatch month (Ngāwhā cut to
  55%, Teviot taken out): Ngāwhā's rest 24.1 MW (true 24.2), Teviot 17.4 MW (true 18.5), the layer 119.6 MW (118.5).
  Without reconciliation data, the plant's own average day from its metered months (the blend), less what the
  dispatch data has: the back-test above.

## Dispatch against metered, and records (`dispatch_vs_metered.py`, `dispatch_metered_fit.py`, 1 Nov 2026)

`dispatch_vs_metered.py` builds every month from Sep 2020 twice from the stored history states, with the site's own
code: as published (metered generation and demand, final prices, metered HVDC) and dispatch-only (as the site had it
before any of that arrived). Run read-only in GitHub Actions against KV (a one-off workflow on its own branch).

- **Averages agree closely:** over the 73 months, national wind +0.2%, hydro -0.1%, NZ demand 0.0% (NI -0.6%, SI
  +1.0%). The plants that differ: Ngāwhā -45% (only Ngāwhā B dispatched), Glenbrook -31%, Kawerau (Onepu) +43% (a
  site's connection meter), Te Rapa +36% (closed 2023), Teviot (metered only), and the Waikato chain station by station
  (Maraetai +11%, Arapuni -11%, Karāpiro -9%; the chain agrees). Fossil generation reads 3% low in dispatch.
- **Extremes don't:** a month's highest half-hour in dispatch data runs above the metered one: wind +10 MW nationally
  (NI 0, SI +10), hydro +21 MW, NZ demand +25 MW, the NI renewable share +0.6 points (Glenbrook and Ngāwhā).
  Dispatch prices: monthly highest up to $357,000/MWh against final prices of a few thousand.
- **Provisional records replayed** (each month's figure against the official record before it): uncorrected, 30
  provisional records the metered data didn't confirm (24 events: wind 12, renewable share 5, demand 4, fossil 2,
  hydro 1), plus 16 from dispatch prices; 4 real records missed. Missed by small amounts: wind 0-11 MW, the renewable
  share 0.0-0.7 points.
- **Corrections** (`dispatch_metered_fit.py` -> `facilities/dispatch_adjust.json`): Ngāwhā x1.80, Glenbrook x1.47,
  Kawerau (Onepu) x0.68 (latest 24 months); then each record's median shift at the month's extreme, and a margin, the 90th
  percentile of what is left. The same for whole days, weeks and months. Leave-one-month-out: no provisional record
  clear of the margin went unconfirmed; of 161 real records, 113 provisional, 46 close (within the margin), 2 missed.
  Prices set no provisional records (final prices arrive the next day).
