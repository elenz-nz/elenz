// Fuels in stack order, bottom to top: geothermal (baseload) first, then thermal, hydro and the variable sources.
// Shared by the tracker and the home page. ef: emission factor (t CO₂e/MWh; the Rankines' varies by quarter, see
// emissions.js, which every emissions calculation goes through); ren: renewable;
// signed: can be negative (charging, export), so never part of shares or totals.
export const FUELS = [
  { k: 'geo', name: 'Geothermal', tok: '--f-geo', ef: 0.07, ren: 1 },
  { k: 'coal', name: 'Coal/gas, Rankine', tok: '--f-coal', ef: 0.95 },  // fallback only: emissions.js sets the Rankines' factor by quarter
  { k: 'gas', name: 'Gas', tok: '--f-gas', ef: 0.46 },
  { k: 'diesel', name: 'Diesel', tok: '--f-diesel', ef: 0.80 },
  { k: 'hydro', name: 'Hydro', tok: '--f-hydro', ren: 1 },
  { k: 'wind', name: 'Wind', tok: '--f-wind', ren: 1 },
  { k: 'solar', name: 'Solar, grid', tok: '--f-solar', ren: 1 },
  { k: 'roof', name: 'Embedded solar', tok: '--f-solar', hatch: 1, ren: 1, tag: 'est.' },
  { k: 'batt', name: 'Battery', tok: '--f-batt', signed: 1 },
  { k: 'hvdc', name: 'HVDC', tok: '--f-hvdc', hatch: 1, signed: 1 },
];
