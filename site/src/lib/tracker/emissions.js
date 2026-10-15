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

const RANKINE_HEAT_RATE = 11.2;     // GJ per MWh
const COAL = 91.8, GAS = 54.1;      // kg CO₂e per GJ

// Genesis performance reports: share of Huntly Rankine fuel that was coal, by Genesis financial quarter
// (FY ends 30 June: FY21 Q1 = Jul–Sep 2020). Add each new quarter as Genesis reports it (about 3 weeks after it ends).
export const RANKINE_COAL_SHARE = [
  ['FY21 Q1', 0.95], ['FY21 Q2', 0.90], ['FY21 Q3', 0.99], ['FY21 Q4', 0.96],
  ['FY22 Q1', 0.87], ['FY22 Q2', 0.29], ['FY22 Q3', 0.86], ['FY22 Q4', 0.93],
  ['FY23 Q1', 0.15], ['FY23 Q2', 0.13], ['FY23 Q3', 0.43], ['FY23 Q4', 0.11],
  ['FY24 Q1', 0.24], ['FY24 Q2', 0.49], ['FY24 Q3', 0.67], ['FY24 Q4', 0.99],
  ['FY25 Q1', 0.91], ['FY25 Q2', 0.21], ['FY25 Q3', 0.91], ['FY25 Q4', 0.95],
  ['FY26 Q1', 0.88], ['FY26 Q2', 0.14], ['FY26 Q3', 0.28], ['FY26 Q4', 0.24],
];

export const rankineFactor = (coalShare) => (RANKINE_HEAT_RATE * (coalShare * COAL + (1 - coalShare) * GAS)) / 1000;

// each quarter's start as a timestamp (NZ midnight, near enough: 12:00 UTC the day before) and its Rankine factor
const STEPS = RANKINE_COAL_SHARE.map(([q, s]) => {
  const fy = 2000 + Number(q.slice(2, 4)), n = Number(q.slice(-1));
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
const GEO_YEARS = {
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
const GEO_YEAR_COLS = [2020, 2022, 2023];
// stations without published figures yet: estimates (TIMES-NZ assumptions), until the NZGA publishes them
const GEO_ASSUMED = { tauhara: 32, te_huka_3: 0, topp2: 0,
  // Kawerau pulp mill cogeneration (KAW0112 ONU0): likely mostly black liquor and wood, so treated as bioenergy
  // (biogenic CO₂, counted as zero) until it moves to a Bioenergy fuel with Kinleith at the next history rebuild
  kawerau_mill: 0 };
const GEO_DEFAULT = 57;   // fleet average, CY2023: for anything unmatched

// dispatch plant name → station (confirmed by the owner, 15 Oct 2026): 'Wairakei' is the whole site (A, B and binary);
// 'Ngāwhā B' (OEC4) is the only dispatched Ngāwhā plant (Ngāwhā A, ~20 MW, isn't); TOPP1 and GDL aren't dispatched;
// Te Ahi O Maui and TOPP2 share a 33 kV bus on Kawerau's 220 kV since TOPP2 came online.
const GEO_PLANT = {
  'Wairakei': 'wairakei', 'Te Mihi 1': 'te_mihi', 'Te Mihi 2': 'te_mihi', 'Poihipi': 'poihipi', 'Ōhaaki': 'ohaaki',
  'Te Huka': 'te_huka', 'Te Huka 3': 'te_huka_3', 'Tauhara': 'tauhara', 'Rotokawa': 'rotokawa',
  'Nga Awa Pūrua': 'nga_awa_purua', 'Mokai': 'mokai', 'Ngā Tamariki': 'ngatamariki', 'Kawerau': 'kawerau_kgl',
  'Kawerau (Te Ahi O Maui)': 'te_ahi_o_maui', 'Kawerau (TOPP2)': 'topp2', 'Ngāwhā B': 'ngawha_oec4',
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

/** Generation-weighted geothermal factor at index i of a set of plant series (plants with fuel 'geo'), or null. */
export function geoFactor(plants, i, t) {
  let mw = 0, em = 0;
  for (const p of plants) {
    const x = p.s[i];
    if (x > 0) { mw += x; em += x * geoEf(p.name, t); }
  }
  return mw > 0 ? em / mw : null;
}
