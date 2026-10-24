// Emission factors (t CO₂e per MWh generated), shared by the tracker and the home pages.
// Evidence: analysis/emission_factors.py and analysis/README.md.
//
// Fuel factors: gas 54.1 kg CO₂e/GJ (Ministry for the Environment, natural gas, stationary combustion); coal 91.8,
// fitted to Genesis's reported quarterly generation emissions and fuel burned (FY21–FY26, 24 quarters).
// Huntly's Rankine units burn coal or gas and the market data doesn't say which, so their factor follows the coal
// share of Rankine fuel that Genesis reports each quarter, at a heat rate of 11.2 GJ/MWh (Genesis coal burned per
// coal-fired MWh). Gas plant: generation-weighted fleet average, 0.46 (Huntly 5 combined cycle 0.41; peakers and
// cogeneration ~0.5–0.57). Applied to the dispatch data, these reproduce Genesis's reported Huntly emissions to
// within ±5% in most quarters (−0.4% overall).

export const RANKINE_HEAT_RATE = 11.2;     // GJ per MWh
export const COAL = 91.8, GAS = 54.1;      // kg CO₂e per GJ

// Share of Huntly Rankine fuel that was coal, by Genesis financial quarter (FY ends 30 June: FY21 Q1 = Jul–Sep 2020).
// From FY21: Genesis performance reports. Add each new quarter as Genesis reports it (about 3 weeks after it ends).
// Before FY21 (the metered history, from Aug 1997) Genesis's reports aren't used: the share is derived from MBIE's
// quarterly electricity generation from coal (Energy in New Zealand, electricity data tables, sheet 1) less Glenbrook's
// metered output (MBIE counts Glenbrook's cogeneration, on gases from NZ Steel's coal-fed ironmaking, as coal), over the
// Rankines' metered output (Generation_MD). Over FY21-FY25 this reproduces Genesis's own figures to within a few
// points in most quarters. Quarters with under 100 GWh of Rankine output keep the quarter before's share.
export const RANKINE_COAL_SHARE_MBIE = [
  ['FY98 Q1', 0.48], ['FY98 Q2', 0.57], ['FY98 Q3', 0.49], ['FY98 Q4', 0.56],
  ['FY99 Q1', 0.72], ['FY99 Q2', 0.72], ['FY99 Q3', 0.25], ['FY99 Q4', 0.37],
  ['FY00 Q1', 0.37], ['FY00 Q2', 0.32], ['FY00 Q3', 0.31], ['FY00 Q4', 0.27],
  ['FY01 Q1', 0.19], ['FY01 Q2', 0.10], ['FY01 Q3', 0.19], ['FY01 Q4', 0.21],
  ['FY02 Q1', 0.28], ['FY02 Q2', 0.28], ['FY02 Q3', 0.27], ['FY02 Q4', 0.28],
  ['FY03 Q1', 0.20], ['FY03 Q2', 0.39], ['FY03 Q3', 0.56], ['FY03 Q4', 0.53],
  ['FY04 Q1', 0.54], ['FY04 Q2', 0.70], ['FY04 Q3', 0.67], ['FY04 Q4', 0.81],
  ['FY05 Q1', 0.81], ['FY05 Q2', 0.76], ['FY05 Q3', 0.63], ['FY05 Q4', 0.83],
  ['FY06 Q1', 0.84], ['FY06 Q2', 0.82], ['FY06 Q3', 0.77], ['FY06 Q4', 0.77],
  ['FY07 Q1', 0.78], ['FY07 Q2', 0.68], ['FY07 Q3', 0.49], ['FY07 Q4', 0.54],
  ['FY08 Q1', 0.47], ['FY08 Q2', 0.50], ['FY08 Q3', 0.88], ['FY08 Q4', 0.85],
  ['FY09 Q1', 0.82], ['FY09 Q2', 0.64], ['FY09 Q3', 0.82], ['FY09 Q4', 0.90],
  ['FY10 Q1', 0.92], ['FY10 Q2', 0.66], ['FY10 Q3', 0.68], ['FY10 Q4', 0.37],
  ['FY11 Q1', 0.38], ['FY11 Q2', 0.60], ['FY11 Q3', 0.72], ['FY11 Q4', 0.65],
  ['FY12 Q1', 0.90], ['FY12 Q2', 0.89], ['FY12 Q3', 0.98], ['FY12 Q4', 0.97],
  ['FY13 Q1', 0.95], ['FY13 Q2', 0.89], ['FY13 Q3', 0.92], ['FY13 Q4', 0.91],
  ['FY14 Q1', 0.80], ['FY14 Q2', 0.28], ['FY14 Q3', 0.78], ['FY14 Q4', 0.87],
  ['FY15 Q1', 0.89], ['FY15 Q2', 1.00], ['FY15 Q3', 0.97], ['FY15 Q4', 1.00],
  ['FY16 Q1', 0.76], ['FY16 Q2', 0.81], ['FY16 Q3', 0.59], ['FY16 Q4', 0.55],
  ['FY17 Q1', 0.55], ['FY17 Q2', 0.23], ['FY17 Q3', 0.23], ['FY17 Q4', 0.52],
  ['FY18 Q1', 0.65], ['FY18 Q2', 0.60], ['FY18 Q3', 0.60], ['FY18 Q4', 0.76],
  ['FY19 Q1', 0.87], ['FY19 Q2', 0.84], ['FY19 Q3', 0.94], ['FY19 Q4', 0.81],
  ['FY20 Q1', 0.95], ['FY20 Q2', 0.93], ['FY20 Q3', 0.79], ['FY20 Q4', 0.59],
];
export const RANKINE_COAL_SHARE_GENESIS = [
  ['FY21 Q1', 0.95], ['FY21 Q2', 0.90], ['FY21 Q3', 0.99], ['FY21 Q4', 0.96],
  ['FY22 Q1', 0.87], ['FY22 Q2', 0.29], ['FY22 Q3', 0.86], ['FY22 Q4', 0.93],
  ['FY23 Q1', 0.15], ['FY23 Q2', 0.13], ['FY23 Q3', 0.43], ['FY23 Q4', 0.11],
  ['FY24 Q1', 0.24], ['FY24 Q2', 0.49], ['FY24 Q3', 0.67], ['FY24 Q4', 0.99],
  ['FY25 Q1', 0.91], ['FY25 Q2', 0.21], ['FY25 Q3', 0.91], ['FY25 Q4', 0.95],
  ['FY26 Q1', 0.88], ['FY26 Q2', 0.14], ['FY26 Q3', 0.28], ['FY26 Q4', 0.24],
  ['FY27 Q1', 0.23],  // FY27 Q1 Performance Report, 21 Oct 2026: 155 GWh, 23% coal
];
export const RANKINE_COAL_SHARE = [...RANKINE_COAL_SHARE_MBIE, ...RANKINE_COAL_SHARE_GENESIS];

export const rankineFactor = (coalShare) => (RANKINE_HEAT_RATE * (coalShare * COAL + (1 - coalShare) * GAS)) / 1000;

// each quarter's start as a timestamp (NZ midnight, near enough: 12:00 UTC the day before) and its Rankine factor
const STEPS = RANKINE_COAL_SHARE.map(([q, s]) => {
  const yy = Number(q.slice(2, 4)), fy = (yy >= 90 ? 1900 : 2000) + yy, n = Number(q.slice(-1));   // FY98 = year to June 1998
  const month = (6 + 3 * (n - 1)) % 12, year = n <= 2 ? fy - 1 : fy;   // Q1 Jul, Q2 Oct, Q3 Jan, Q4 Apr
  return [Date.UTC(year, month, 1) - 12 * 3600e3, rankineFactor(s)];
});

/** Rankine factor at time t (ms): the quarter's own, the latest reported for newer times, the first for older. */
export function rankineAt(t) {
  let ef = STEPS[0][1];
  for (const [start, f] of STEPS) { if (t >= start) ef = f; else break; }
  return ef;
}

/** Emission factor for a fuel (an entry of FUELS) at time t: time-varying for the Rankines, otherwise the fuel's own. */
export const efAt = (f, t) => (f.k === 'coal' ? rankineAt(t) : f.ef || 0);

/** The quarter whose coal share applies at time t, and whether it is carried forward from an earlier quarter. */
export function rankineQuarter(t) {
  let i = 0;
  while (i + 1 < STEPS.length && t >= STEPS[i + 1][0]) i++;
  const next = STEPS[i][0] + 92 * 86400e3;
  return { quarter: RANKINE_COAL_SHARE[i][0], share: RANKINE_COAL_SHARE[i][1], carried: t >= next };
}

// ---------- geothermal ----------
// Operational emissions (non-condensable gases released from the field) per station, g CO₂e/kWh (= kg/MWh), from the
// NZ Geothermal Association's emissions working group (McLean et al.): CY2020 from NZGW 2021 (Table 3); CY2022 from
// the NZGA 2023 update (published as lifecycle, less its 10 g/kWh plant-cycle allowance); CY2023 from McLean et al.
// 2024 (as used by TIMES-NZ). Each year uses the newest figures published for it or before it; years before 2020
// use 2020's. Stations reinject more CO₂ each year (Ngāwhā, Te Huka, Ngā Tamariki), so add new years as published
// (each November, at the NZ Geothermal Workshop).
export const GEO_YEARS = {
  //               2020  2022  2023
  wairakei:      [  18,   19,   21],
  te_mihi:       [  38,   37,   34],
  poihipi:       [  38,   38,   39],
  ohaaki:        [ 305,  282,  302],
  te_huka:       [  51,   49,   24],
  rotokawa:      [  99,   57,   58],
  nga_awa_purua: [  55,   56,   59],
  mokai:         [  32,   25,   27],
  ngatamariki:   [  52,   40,   43],
  kawerau_kgl:   [ 119,  126,  122],
  te_ahi_o_maui: [  49,   60,   61],
  ngawha_oec4:   [ 313,  313,   95],   // commissioned 2021; until 2023 the field's pre-reinjection figure (2020, OEC1–3)
};
export const GEO_YEAR_COLS = [2020, 2022, 2023];
// stations without published figures yet: estimates (TIMES-NZ assumptions), until the NZGA publishes them
export const GEO_ASSUMED = { tauhara: 32, te_huka_3: 0, topp2: 0,
  // Kawerau pulp mill cogeneration (KAW0112 ONU0): bioenergy since BUILD 5 (Oct 2026); kept at zero in case a file
  // built before then still lists it as geothermal
  kawerau_mill: 0 };
export const GEO_DEFAULT = 57;   // fleet average, CY2023: for anything unmatched

// dispatch plant name → station (confirmed by the owner, 15 Oct 2026): 'Wairakei' is the whole site (A, B and binary);
// 'Ngāwhā B' (OEC4) is the only dispatched Ngāwhā plant (Ngāwhā A, ~20 MW, isn't); TOPP1 and GDL aren't dispatched;
// Te Ahi O Maui and TOPP2 share a 33 kV bus on Kawerau's 220 kV since TOPP2 came online.
const GEO_PLANT = {
  'Wairakei': 'wairakei', 'Te Mihi 1': 'te_mihi', 'Te Mihi 2': 'te_mihi', 'Poihipi': 'poihipi', 'Ōhaaki': 'ohaaki',
  'Te Huka': 'te_huka', 'Te Huka 3': 'te_huka_3', 'Tauhara': 'tauhara', 'Rotokawa': 'rotokawa',
  'Nga Awa Pūrua': 'nga_awa_purua', 'Mokai': 'mokai', 'Ngā Tamariki': 'ngatamariki', 'Kawerau': 'kawerau_kgl',
  'Kawerau (Te Ahi O Maui)': 'te_ahi_o_maui', 'Kawerau (TOPP2)': 'topp2', 'Ngāwhā B': 'ngawha_oec4',
  // names since BUILD 6 (Oct 2026): stations the metered history sees whole (overrides.toml [plant_groups], [plant_names])
  'Te Mihi': 'te_mihi', 'Ngāwhā': 'ngawha_oec4',
  'Carter Holt Harvey Energy Ltd CoGen': 'kawerau_mill', 'Norske Skog CoGen': 'kawerau_mill',
};

const geoCache = new Map();
/** Geothermal factor (t CO₂e/MWh) for a dispatch plant at time t. */
export function geoEf(name, t) {
  const year = new Date(t + 13 * 3600e3).getUTCFullYear();   // NZ year, near enough
  const key = name + '|' + year;
  let ef = geoCache.get(key);
  if (ef === undefined) {
    const st = GEO_PLANT[name], row = st && GEO_YEARS[st];
    if (row) {
      let i = 0;
      while (i + 1 < GEO_YEAR_COLS.length && year >= GEO_YEAR_COLS[i + 1]) i++;
      ef = row[i] / 1000;
    } else ef = (st && st in GEO_ASSUMED ? GEO_ASSUMED[st] : GEO_DEFAULT) / 1000;
    geoCache.set(key, ef);
  }
  return ef;
}

// ---------- gas ----------
// The gas fleet factor, 0.46, is the generation-weighted average of today's fleet. The metered history (back to 1997)
// also has plants that have closed, much more or less efficient than that; they get factors from their typical heat
// rates at 54.1 kg CO₂e/GJ (estimates, not reported figures): combined cycle ~7.4 GJ/MWh, conventional steam and
// open-cycle turbines ~11-11.5.
export const GAS_FLEET = 0.46;
export const GAS_PLANT = {
  'Ōtāhuhu B': 0.40,       // combined cycle, 1999-2015
  'New Plymouth': 0.60,    // steam, gas and some oil, to 2008
  'Ōtāhuhu A': 0.62,       // open-cycle turbines
  'Southdown': 0.45,       // combined cycle, to 2016
  'Te Awamutu': 0.45,      // dairy factory cogeneration, to 2007
};
const TCC_END = Date.UTC(2026, 2, 31, 11);   // Taranaki Combined Cycle (in 'Stratford' with the peakers) closed in Mar 2026 (Contact's FY26 results; derated 2022-23)
export const STRATFORD_TCC = 0.40;

// history built before Oct 2026 spells them without macrons
const GAS_ALIAS = { 'Otahuhu A': 'Ōtāhuhu A', 'Otahuhu B': 'Ōtāhuhu B' };

/** Gas factor (t CO₂e/MWh) for a plant at time t: a closed plant's own, otherwise the fleet average. */
export function gasEf(name, t) {
  if (name === 'Stratford' && t < TCC_END) return STRATFORD_TCC;
  return GAS_PLANT[GAS_ALIAS[name] ?? name] ?? GAS_FLEET;
}

/** A plant's own factor for fuels that vary by plant (geothermal, gas), or null for the others. */
export const plantEf = (fuel, name, t) => (fuel === 'geo' ? geoEf(name, t) : fuel === 'gas' ? gasEf(name, t) : null);
export const BY_PLANT = ['geo', 'gas'];

/** Generation-weighted factor of a fuel at index i of a set of plant series (plants with that fuel), or null. */
export function plantFactor(fuel, plants, i, t) {
  let mw = 0, em = 0;
  for (const p of plants) {
    const x = p.s[i];
    if (x > 0) { mw += x; em += x * plantEf(fuel, p.name, t); }
  }
  return mw > 0 ? em / mw : null;
}

/** Generation-weighted geothermal factor at index i of a set of plant series (plants with fuel 'geo'), or null. */
export const geoFactor = (plants, i, t) => plantFactor('geo', plants, i, t);
