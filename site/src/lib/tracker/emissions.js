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
