// Data and methods: how each figure on Elenz is built, and every dataset it comes from.
//
// /methods is the overview, /methods/sources is the source register (SOURCES below), and each topic has its own page at
// /methods/<slug>, written as one Svelte file in ./pages/<slug>.svelte to the standard structure: Introduction, Data
// sources, How it works, How to interpret it, Accuracy and limitations, Historical coverage, References. A page's header
// comes from TOPICS, its Data sources section from ROLES (./roles.ts) and SOURCES, and its References section from
// REFERENCES and the topic's `code`, so a dataset or a report is described once.
//
// When a method changes: update its page, set `reviewed` on its topic, and keep ROLES and SOURCES in step. A date in
// `reviewed` says every formula, constant, date and claim on the page was compared with the code and data that day.
//
// REFERENCES holds what isn't a dataset: reports, papers and announcements behind a claim on a method page. The page
// links the claim with `ref('<id>')` (a mistyped id fails the build), and its References section lists every entry with
// that page's slug in `topics`. Only add one that was opened and says what the page says it does.
import type { Component } from 'svelte';
import { ROLES } from './roles.js';

export type Topic = {
	slug: string;
	title: string;
	summary: string; // one sentence under the title and on the overview's cards: what the figure is, not what data it uses
	shownOn: [string, string][]; // [label, href]: where the figure appears on the site
	estimate?: boolean; // the figure is mainly a calculated estimate (a mark in the contents and on the overview's cards)
	reviewed: string; // YYYY-MM-DD: the last review against the code
	code: string[]; // repository paths this page describes, listed in its References section
};

// the last review of the overview and the source register, which have no topic of their own
export const REVIEWED = '2026-11-06';

export const TOPICS: Topic[] = [
	{
		slug: 'generation',
		title: 'Generation',
		summary: 'How much electricity each plant and fuel is generating.',
		shownOn: [['Tracker', '/tracker'], ['Now', '/now']],
		reviewed: '2026-11-06',
		code: ['ingest/update.py', 'ingest/emi_live.py', 'ingest/build_tracker.py', 'facilities/overrides.toml', 'site/src/lib/tracker/fuels.js', 'analysis/README.md'],
	},
	{
		slug: 'embedded-solar',
		title: 'Embedded solar',
		summary: 'Solar on local networks that the market doesn’t dispatch, most of it on rooftops.',
		shownOn: [['Tracker', '/tracker'], ['Now', '/now']],
		estimate: true,
		reviewed: '2026-11-06',
		code: ['ingest/rooftop.py', 'ingest/pv.py', 'facilities/rooftop_points.csv', 'facilities/rooftop_capacity.json', 'analysis/rooftop_exports.py', 'analysis/README.md'],
	},
	{
		slug: 'other-embedded',
		title: 'Other embedded generation',
		summary: 'Small hydro, landfill gas and other generation on local networks that the market doesn’t dispatch.',
		shownOn: [['Tracker', '/tracker'], ['Now', '/now']],
		estimate: true,
		reviewed: '2026-11-06',
		code: ['ingest/embedded.py', 'site/src/lib/tracker/oemb.js', 'facilities/embedded_points.csv', 'facilities/embedded_registry_split.csv', 'analysis/embedded_backtest.py', 'analysis/embedded_split.py', 'analysis/README.md'],
	},
	{
		slug: 'demand',
		title: 'Demand',
		summary: 'The electricity taken from the national grid in each island, and demand with embedded generation added back.',
		shownOn: [['Tracker', '/tracker'], ['Now', '/now']],
		reviewed: '2026-11-06',
		code: ['ingest/metered.py', 'ingest/build_tracker.py', 'site/src/lib/tracker/oemb.js', 'analysis/README.md'],
	},
	{
		slug: 'hvdc',
		title: 'HVDC transfer',
		summary: 'The electricity moving between the North and South Islands on the HVDC link.',
		shownOn: [['Tracker', '/tracker'], ['Prices', '/tracker/prices'], ['Now', '/now']],
		estimate: true,
		reviewed: '2026-11-06',
		code: ['ingest/hvdc.py', 'analysis/hvdc_fit.py', 'analysis/README.md'],
	},
	{
		slug: 'prices',
		title: 'Wholesale prices',
		summary: 'The wholesale price of electricity at six points on the national grid, and the figures worked out from those prices.',
		shownOn: [['Tracker', '/tracker'], ['Prices', '/tracker/prices'], ['Now', '/now']],
		reviewed: '2026-11-06',
		code: ['ingest/history.py', 'site/src/lib/prices/data.js'],
	},
	{
		slug: 'price-explainer',
		title: 'Price explainer',
		summary: 'The “Why is the price high?” panel on the Now page, which compares what is happening on the power system with what is usual.',
		shownOn: [['Now', '/now']],
		reviewed: '2026-11-06',
		code: ['ingest/explain.py', 'site/src/lib/now/explain.js', 'analysis/price_triggers.py'],
	},
	{
		slug: 'emissions',
		title: 'Emissions intensity',
		summary: 'The greenhouse gas released for each kilowatt-hour of electricity generated.',
		shownOn: [['Tracker', '/tracker'], ['Now', '/now']],
		estimate: true,
		reviewed: '2026-11-06',
		code: ['site/src/lib/tracker/emissions.js', 'analysis/emission_factors.py', 'analysis/README.md'],
	},
	{
		slug: 'groupings',
		title: 'Renewable share and groupings',
		summary: 'How generation is counted as renewable, and how plants are grouped by fuel, flexibility, site, hydro scheme and owner.',
		shownOn: [['Tracker', '/tracker'], ['Now', '/now']],
		reviewed: '2026-11-06',
		code: ['site/src/lib/tracker/fuels.js', 'site/src/lib/tracker/tracker.js', 'facilities/overrides.toml', 'ingest/plant_meta.py'],
	},
	{
		slug: 'capacity',
		title: 'Installed capacity',
		summary: 'How much each plant can generate at full output, and how that has changed since 1997.',
		shownOn: [['Tracker', '/tracker']],
		reviewed: '2026-11-06',
		code: ['facilities/plant_capacity.csv', 'ingest/capacity.py', 'ingest/offered.py', 'analysis/capacity_check.py', 'analysis/README.md'],
	},
	{
		slug: 'history',
		title: 'History since 1997',
		summary: 'How Elenz joins metered data, dispatch data and the real-time feed into one record back to August 1997.',
		shownOn: [['Tracker', '/tracker'], ['Prices', '/tracker/prices']],
		reviewed: '2026-11-06',
		code: ['ingest/history.py', 'ingest/metered.py', 'facilities/metered_plants.csv', 'site/src/lib/tracker/series.js', 'analysis/metered_check.py', 'analysis/README.md'],
	},
	{
		slug: 'records',
		title: 'Records',
		summary: 'The highest and lowest half-hours, days, weeks, months, years and runs since August 1997.',
		shownOn: [['Records', '/records'], ['Now', '/now']],
		reviewed: '2026-11-06',
		code: ['ingest/records.py', 'site/src/lib/records/records.js', 'facilities/dispatch_adjust.json', 'analysis/dispatch_metered_fit.py', 'analysis/dispatch_vs_metered.py'],
	},
];

export type Source = {
	id: string;
	name: string;
	publisher: string;
	dataset?: string; // the dataset's own name or path, shown in code type
	url: string;
	role: 'Main data' | 'Recent and live data' | 'Mapping' | 'Reference' | 'Check';
	what: string; // what it contains
	use: string; // what Elenz uses it for
	period: string; // what it covers
	fresh: string; // how soon it is published
	licence: string;
	check?: boolean; // used only to test a method, not shown on the site
};

const EMI = 'https://www.emi.ea.govt.nz/Wholesale/Datasets/';
const EA = 'Electricity Authority (EMI)';
const CCBY = 'CC BY 4.0.';

export const SOURCES: Source[] = [
	// ---------- live and recent market data ----------
	{
		id: 'rtd', name: 'Real-time dispatch', publisher: EA, dataset: 'EMI API: real-time-dispatch', role: 'Recent and live data',
		url: 'https://emi.developer.azure-api.net/',
		what: 'Each 5-minute dispatch case, with the output of every generating unit, the load at every connection point and the price at every node.',
		use: 'Provides generation, grid demand and prices for the live week. Also supplies the inputs to the HVDC estimate and the Price explainer.',
		period: 'About the last month.', fresh: 'Usually 1 to 2 minutes after each interval starts.', licence: CCBY,
	},
	{
		id: 'dispatch', name: 'Dispatch prices and volumes', publisher: EA, dataset: 'DispatchAndPricing/NodalPricesAndVolumes', role: 'Recent and live data',
		url: EMI + 'DispatchAndPricing/NodalPricesAndVolumes',
		what: 'Each dispatch case in daily files, for connection points with load or generation. Bus nodes aren’t included.',
		use: 'Supplies recent weeks and fills in plants that aren’t metered, such as batteries and new solar farms.',
		period: '10 September 2020 onward.', fresh: 'Usually 1 to 4 days late.', licence: CCBY,
	},
	// ---------- prices and offers ----------
	{
		id: 'final', name: 'Final energy prices', publisher: EA, dataset: 'DispatchAndPricing/FinalEnergyPrices', role: 'Main data',
		url: EMI + 'DispatchAndPricing/FinalEnergyPrices',
		what: 'The price the market settles on, for every node and half-hour. A price is marked interim (_I) for the first day or two and while it is under review.',
		use: 'Provides every price in the history, and the usual prices that the Price explainer compares with.',
		period: '1996 onward. Elenz uses August 1997 onward.', fresh: 'Usually the next day.', licence: CCBY,
	},
	{
		id: 'offers', name: 'Generator offers', publisher: EA, dataset: 'BidsAndOffers/Offers', role: 'Main data',
		url: EMI + 'BidsAndOffers/Offers',
		what: 'Each generator’s energy offers for every half-hour: blocks of MW at a price, which it can revise up to gate closure.',
		use: 'Provides the possible price setter in the Price explainer, from the newest published day. Provides offered capacity for the Generation tab’s spare dispatchable capacity chart, every half-hour from 2013.',
		period: 'January 2013 onward, in daily files.', fresh: 'Usually the morning after. A day occasionally arrives later.', licence: CCBY,
	},
	// ---------- metered data ----------
	{
		id: 'genmd', name: 'Metered generation', publisher: EA, dataset: 'Generation/Generation_MD', role: 'Main data',
		url: EMI + 'Generation/Generation_MD',
		what: 'Half-hourly energy from each station, by connection point and generator code. Grid-connected stations start in August 1997, and stations on local networks start in January 2009.',
		use: 'Provides generation by plant and fuel for every month it has been published.',
		period: 'August 1997 onward.', fresh: 'About 5 to 6 weeks after each month.', licence: CCBY,
	},
	{
		id: 'embedded', name: 'Embedded generation', publisher: EA, dataset: 'Metered_data/Embedded_generation', role: 'Main data',
		url: EMI + 'Metered_data/Embedded_generation',
		what: 'Half-hourly energy injected at connection points on local networks.',
		use: 'Provides stations on local networks before 2009, and their gross output where metered generation is net of local load.',
		period: 'October 1998 onward, with most points from April 1999.', fresh: 'About 2 weeks after each month.', licence: CCBY,
	},
	{
		id: 'gridexport', name: 'Grid exports', publisher: EA, dataset: 'Metered_data/Grid_export', role: 'Main data',
		url: EMI + 'Metered_data/Grid_export',
		what: 'Half-hourly energy leaving the national grid at every connection point.',
		use: 'Supplies the energy leaving the grid, one of the inputs to metered demand.',
		period: 'October 1996 onward.', fresh: 'About 2 weeks after each month.', licence: CCBY,
	},
	{
		id: 'gridimport', name: 'Grid imports', publisher: EA, dataset: 'Metered_data/Grid_import', role: 'Main data',
		url: EMI + 'Metered_data/Grid_import',
		what: 'Half-hourly energy entering the national grid at every connection point. Until about 2003 it covers only injections from local networks.',
		use: 'Supplies the energy entering the grid from local networks, one of the inputs to metered demand. Stands in for Kawerau (Onepu) from 2013 to 2019, and for Huntly in September 2020.',
		period: 'October 2000 onward.', fresh: 'About 2 weeks after each month.', licence: CCBY,
	},
	{
		id: 'tiwai', name: 'Grid exports to Tiwai', publisher: EA, dataset: 'Metered_data/Grid_export_to_Tiwai', role: 'Main data',
		url: EMI + 'Metered_data/Grid_export_to_Tiwai',
		what: 'Half-hourly energy supplied to the Tiwai Point aluminium smelter.',
		use: 'Stored with the metered history but not shown on its own, because the smelter is part of demand like any other consumer.',
		period: 'October 1996 onward.', fresh: 'About 2 weeks after each month.', licence: CCBY,
	},
	{
		id: 'hvdcflows', name: 'HVDC flows', publisher: EA, dataset: 'Metered_data/HVDC_Flows', role: 'Main data',
		url: EMI + 'Metered_data/HVDC_Flows',
		what: 'Half-hourly energy at the Benmore and Haywards ends of the HVDC link, in layouts that have changed over the years.',
		use: 'Provides HVDC transfer in the history, and the record that the live estimate is fitted to.',
		period: 'October 1996 onward.', fresh: 'About 2 weeks after each month.', licence: CCBY,
	},
	{
		id: 'reconciliation', name: 'Reconciled injection and offtake', publisher: EA, dataset: 'Volumes/Reconciliation', role: 'Main data',
		url: EMI + 'Volumes/Reconciliation',
		what: 'Monthly files of metered injection and offtake by connection point, network, trader and half-hour.',
		use: 'Provides other embedded generation from January 2009, and Mill Creek wind farm from May 2014 to August 2015. Also checks embedded solar against metered exports.',
		period: 'January 2005 onward. Elenz uses January 2009 onward, apart from checks.', fresh: 'About 3 to 4 weeks after each month. Each month is revised about 3, 7 and 14 months later.', licence: CCBY,
	},
	// ---------- plants and network ----------
	{
		id: 'register', name: 'Dispatched generation plant', publisher: EA, dataset: 'Generation/GenerationFleet/Existing/DispatchedGenerationPlant.csv', role: 'Mapping',
		url: EMI + 'Generation/GenerationFleet/Existing',
		what: 'Every dispatched unit, with its plant name, connection point, unit code, fuel, technology, operator and nameplate MW. Rows are dated as units are added, moved or retired.',
		use: 'Maps each unit in the dispatch data to its plant, fuel, island and operator. Supplies plant capacities.',
		period: 'Current and past units.', fresh: 'About twice a year.', licence: CCBY,
	},
	{
		id: 'nsp', name: 'Network supply points', publisher: EA, dataset: 'MappingsAndGeospatial/NetworkSupplyPointsTable', role: 'Mapping',
		url: EMI + 'MappingsAndGeospatial/NetworkSupplyPointsTable',
		what: 'Every connection point, current and retired, with its island, network and coordinates.',
		use: 'Gives the island of connection points that appear only in the metered history, and places the irradiance points for embedded solar.',
		period: 'Current and past connection points.', fresh: 'Every few days.', licence: CCBY,
	},
	{
		id: 'shapes', name: 'Network region shapes', publisher: EA, dataset: 'MappingsAndGeospatial/NetworkRegionShapefiles', role: 'Mapping',
		url: EMI + 'MappingsAndGeospatial/NetworkRegionShapefiles',
		what: 'Outlines of the market’s network zones, from 2018.',
		use: 'Supplies the simplified outlines of the two islands on the Now page’s map.',
		period: 'A single 2018 dataset.', fresh: 'Static dataset, not updated.', licence: CCBY,
	},
	{
		id: 'guehmt', name: 'Installed distributed generation', publisher: EA, dataset: 'Report GUEHMT', role: 'Main data',
		url: 'https://www.emi.ea.govt.nz/Retail/Reports/GUEHMT',
		what: 'Installed distributed generation each month, from the registry, by grid exit point and fuel. Solar is also split into systems up to 10 kW and over 10 kW.',
		use: 'Supplies embedded solar capacity at each grid exit point, and the split by fuel of other embedded generation where no public document states the fuel.',
		period: 'August 2013 onward.', fresh: 'Monthly.', licence: CCBY,
	},
	{
		id: 'capacity', name: 'Plant capacity histories', publisher: 'Elenz', dataset: 'facilities/plant_capacity.csv', role: 'Main data',
		url: 'https://github.com/elenz-nz/elenz/blob/main/facilities/plant_capacity.csv',
		what: 'Every plant the tracker shows, with its installed MW and the dates each figure applies. It starts from the EA’s plant register and corrects missed upgrades, closures and staged commissioning. Each row names its source.',
		use: 'Supplies the capacity factors in the Generation tab’s mix table, and its spare dispatchable capacity chart.',
		period: 'August 1997 onward.', fresh: 'Updated by hand as plants change.', licence: 'Compiled by Elenz from the sources each row names.',
	},
	// ---------- weather ----------
	{
		id: 'satellite', name: 'Satellite irradiance', publisher: 'Open-Meteo (Himawari, JMA/JAXA)', dataset: 'Satellite Radiation API', role: 'Main data',
		url: 'https://open-meteo.com/en/docs/satellite-radiation-api',
		what: 'Sunshine reaching the ground, as global and diffuse irradiance every 10 minutes, from the Himawari geostationary satellite.',
		use: 'Drives embedded solar at 35 points, live and from 2016.',
		period: '2016 onward.', fresh: 'About 45 minutes behind real time.', licence: CCBY,
	},
	{
		id: 'era5', name: 'ERA5 reanalysis', publisher: 'Open-Meteo (Copernicus ERA5)', dataset: 'Historical Weather API', role: 'Main data',
		url: 'https://open-meteo.com/en/docs/historical-weather-api',
		what: 'Hourly modelled irradiance on a grid of about 30 km, reconstructed from weather observations.',
		use: 'Drives embedded solar from August 2013 to 2015, before the satellite archive starts.',
		period: 'August 2013 to 2015, as used by Elenz. The dataset itself goes back decades.', fresh: 'About 5 days behind.', licence: CCBY,
	},
	{
		id: 'forecast', name: 'Weather forecast irradiance', publisher: 'Open-Meteo', dataset: 'Forecast API', role: 'Recent and live data',
		url: 'https://open-meteo.com/en/docs',
		what: 'Forecast sunshine, as irradiance.',
		use: 'Drives live embedded solar only if satellite data stops arriving.',
		period: 'The coming days.', fresh: 'Hourly.', licence: CCBY,
	},
	// ---------- emissions and national statistics ----------
	{
		id: 'genesis', name: 'Quarterly performance reports', publisher: 'Genesis Energy', role: 'Reference',
		url: 'https://www.genesisenergy.co.nz/investors/reports-and-presentations',
		what: 'Each quarter’s Huntly Rankine output, the share of their fuel that was coal, the coal and gas burned, and generation emissions.',
		use: 'Supplies the Rankines’ coal share each quarter from July 2020, and the coal factor fitted to their reported emissions.',
		period: 'July 2020 onward, as used by Elenz.', fresh: 'About 3 weeks after each quarter.', licence: 'Published figures, cited.',
	},
	{
		id: 'mbie', name: 'Electricity statistics', publisher: 'Ministry of Business, Innovation and Employment', dataset: 'Electricity data tables (quarterly generation by fuel)', role: 'Reference',
		url: 'https://www.mbie.govt.nz/building-and-energy/energy-and-natural-resources/energy-statistics-and-modelling/energy-statistics/electricity-statistics',
		what: 'Quarterly and annual electricity generation by fuel, including generation from coal.',
		use: 'Supplies the Rankines’ coal share before July 2020. Also checks the history’s annual totals.',
		period: 'The 1970s onward.', fresh: 'Quarterly.', licence: CCBY,
	},
	{
		id: 'mfe', name: 'Measuring emissions guidance', publisher: 'Ministry for the Environment', dataset: 'Fuels: natural gas, stationary combustion', role: 'Reference',
		url: 'https://measuringemissionsguide.environment.govt.nz/3_fuels.html',
		what: 'Emission factors for fuels burned in New Zealand.',
		use: 'Supplies the natural gas factor, 54.1 kg CO₂e/GJ.',
		period: 'Current guidance.', fresh: 'Yearly.', licence: CCBY,
	},
	{
		id: 'nzga', name: 'Geothermal emissions working group', publisher: 'NZ Geothermal Association (McLean et al.)', role: 'Reference',
		url: 'https://www.nzgeothermal.org.nz/downloads/NZGA-Updates-from-emissions-working-group-2023.pdf',
		what: 'Each geothermal station’s operational emissions per kWh, from gas released from the field, for 2020, 2022 and 2023.',
		use: 'Supplies each geothermal station’s own factor by year.',
		period: '2020, 2022 and 2023.', fresh: 'Each November, at the NZ Geothermal Workshop.', licence: 'Published figures, cited.',
	},
	{
		id: 'inventory', name: 'New Zealand’s Greenhouse Gas Inventory', publisher: 'Ministry for the Environment', role: 'Check',
		url: 'https://environment.govt.nz/facts-and-science/climate-change/new-zealands-greenhouse-gas-inventory/',
		what: 'National emissions by sector and year.',
		use: 'Checks the history’s yearly emissions against the energy industries series.',
		period: '1990 onward.', fresh: 'Yearly.', licence: CCBY, check: true,
	},
];

export type Reference = {
	id: string;
	title: string;
	by: string; // author or publisher
	date?: string;
	url: string;
	use: string; // what it backs up, in a line
	topics: string[]; // slugs of the topic pages that cite it
};

export const REFERENCES: Reference[] = [
	// ---------- emission factors ----------
	{
		id: 'mclean2024', title: 'Reducing greenhouse gas emissions from NZ geothermal power stations',
		by: 'McLean, Richardson, Hanik, Siega and Gibson, New Zealand Geothermal Workshop', date: '2024',
		url: 'https://www.worldgeothermal.org/pdf/IGAstandard/NZGW/2024/044.pdf',
		use: 'Gives each geothermal station’s operational emissions for 2023 (table 2), and how reinjection is changing them.',
		topics: ['emissions'],
	},
	{
		id: 'nzga2023', title: 'CO₂ group presentation, Geothermal Week 2024', by: 'NZ Geothermal Association', date: '2024',
		url: 'https://www.nzgeothermal.org.nz/downloads/CO2-group-presentation-for-geo-week-2024_Final.pptx.pdf',
		use: 'Gives 2023 operational emissions by station, including TOPP1 and GDL at 56 g CO₂e/kWh.',
		topics: ['emissions'],
	},
	{
		id: 'nzga2021', title: 'NZGA Strategic Project Update: CO₂ Reduction', by: 'McLean, NZ Geothermal Association', date: 'undated, with 2021’s figures',
		url: 'https://www.nzgeothermal.org.nz/downloads/CO2-Emissions-Reduction-project.pdf',
		use: 'Gives 2021 lifecycle emissions by station, including TOPP1 (68) and GDL (55), from which we take the 10 g/kWh allowance.',
		topics: ['emissions'],
	},
	{
		id: 'eastland-geo', title: 'Geothermal', by: 'Eastland Generation', date: '2026',
		url: 'https://eastlandgeneration.nz/renewable-generation/geothermal/',
		use: 'Lists TOPP1 (24 MW, 2012) and Geothermal Developments Ltd (9 MW, 2008), both at Kawerau.',
		topics: ['generation', 'emissions'],
	},
	{
		id: 'mclean2021', title: 'Geothermal Greenhouse Gas Emissions in New Zealand in 2020: Lifecycle and Operational Emissions',
		by: 'McLean and Richardson, New Zealand Geothermal Workshop', date: '2021',
		url: 'https://worldgeothermal.org/pdf/IGAstandard/NZGW/2021/111.pdf',
		use: 'Gives each geothermal station’s operational emissions for 2020 (table 3).',
		topics: ['emissions'],
	},
	{
		id: 'contact-gbp', title: 'Green Borrowing Programme update reports, FY23 to FY26', by: 'Contact Energy',
		url: 'https://contact.co.nz/greenborrowing',
		use: 'Gives each Contact geothermal station’s emissions intensity by year to June.',
		topics: ['emissions'],
	},
	{
		id: 'ojifs2025', title: 'Sustainability Report 2025', by: 'Oji Fibre Solutions', date: '2026',
		url: 'https://cdn.sanity.io/files/gz4vq3tx/production/b0136366ad00459a2e07e8a88f74fa366f5bf146.pdf',
		use: 'Gives Kinleith’s fuels in 2025, 10.1 PJ of biomass and 2.1 PJ of fossil fuels, and the electricity generated at each mill. Reports biomass CO₂ separately, as the GHG Protocol sets out.',
		topics: ['emissions', 'generation'],
	},
	{
		id: 'oji-ea', title: 'Submission on strengthening price discovery in the forward electricity markets', by: 'Oji Fibre Solutions, to the Electricity Authority', date: 'December 2024',
		url: 'https://www.ea.govt.nz/documents/9188/Oji_Fibre_Solutions.pdf',
		use: 'Describes Oji’s generation as biomass cogeneration.',
		topics: ['emissions'],
	},
	{
		id: 'topenergy', title: 'Sustainability Report 2025', by: 'Top Energy', date: '2025',
		url: 'https://topenergy.co.nz/assets/Sustainability-Report-2025_Final_Online.pdf',
		use: 'Says 2024 was the first year all Ngāwhā’s geothermal emissions were avoided, with a Unique Emission Factor from the EPA.',
		topics: ['emissions'],
	},
	{
		id: 'times', title: 'TIMES-NZ documentation: emission factors', by: 'Energy Efficiency and Conservation Authority',
		url: 'https://times-nz-dev.readthedocs.io/en/stable/model_methodology/electricity/emission_factors.html',
		use: 'Gives the assumed factor for Kawerau’s TOPP2 (0), and shows Ngāwhā’s OEC4 falling to 0 in 2024.',
		topics: ['emissions'],
	},
	{
		id: 'stack2020', title: '2020 Thermal Generation Stack Update Report', by: 'WSP for MBIE', date: 'October 2020',
		url: 'https://www.mbie.govt.nz/assets/2020-thermal-generation-stack-update-report.pdf',
		use: 'Gives heat rates for Huntly 5 and 6, Stratford’s peakers and Whirinaki (table 3-3), and Kinleith’s fuels (section 3.1.3).',
		topics: ['emissions', 'generation'],
	},
	{
		id: 'mbie-elec', title: 'Electricity statistics', by: 'Ministry of Business, Innovation and Employment',
		url: 'https://www.mbie.govt.nz/building-and-energy/energy-and-natural-resources/energy-statistics-and-modelling/energy-statistics/electricity-statistics',
		use: 'Publishes annual net generation, which we use to check the history’s yearly totals.',
		topics: ['history'],
	},
	{
		id: 'mbie-methods', title: 'Energy statistics: sources and methods', by: 'Ministry of Business, Innovation and Employment',
		url: 'https://www.mbie.govt.nz/assets/Energy-statistics-sources-and-methods.pdf',
		use: 'Explains how MBIE compiles those figures, and what it counts that the EA’s metered data doesn’t.',
		topics: ['history'],
	},
	{
		id: 'stack2011', title: '2011 NZ Generation Data Update', by: 'Parsons Brinckerhoff for the Ministry of Economic Development', date: 'January 2012',
		url: 'https://www.mbie.govt.nz/dmsdocument/127-2011-nz-generation-data-update-v006a-pdf',
		use: 'Gives heat rates for Ōtāhuhu B, Southdown and the Taranaki Combined Cycle (table 3-1).',
		topics: ['emissions'],
	},
	{
		id: 'ipcc', title: '2019 Refinement to the 2006 IPCC Guidelines: Stationary Combustion', by: 'Intergovernmental Panel on Climate Change', date: '2019',
		url: 'https://www.ipcc-nggip.iges.or.jp/public/2019rf/pdf/2_Volume2/19R_V2_2_Ch02_Stationary_Combustion.pdf',
		use: 'Treats CO₂ from burning biomass as an information item, left out of the energy sector’s total (section 2.3.3.4).',
		topics: ['emissions'],
	},
	{
		id: 'acm0004', title: 'ACM0004: Consolidated methodology for waste gas and/or heat for power generation', by: 'UNFCCC Clean Development Mechanism',
		url: 'https://cdm.unfccc.int/methodologies/DB/3NL6ELY805NDZHF4YZRPK94MAPALUB/view.html',
		use: 'Counts project emissions only from auxiliary fuel, so none from the waste gas itself. ACM0012 has since replaced it.',
		topics: ['emissions'],
	},
	{
		id: 'em6', title: 'em6: Carbon Methodology, version 1.6', by: 'Energy Market Services', date: 'November 2025',
		url: 'https://www.ems.co.nz/documents/817/em6_carbon_intensity_1.6.pdf',
		use: 'Leaves battery discharge out of carbon intensity and the renewable share, and lists em6’s emission factor for each generator.',
		topics: ['emissions', 'groupings'],
	},
	// ---------- the HVDC link ----------
	{
		id: 'hvdc-link', title: 'Transpower exploring future role of New Zealand’s inter-island HVDC electricity link', by: 'Transpower', date: '7 March 2024',
		url: 'https://www.transpower.co.nz/news/transpower-exploring-future-role-new-zealands-inter-island-hvdc-electricity-link',
		use: 'Describes what the link connects, between Benmore and Haywards, and what it is used for.',
		topics: ['hvdc'],
	},
	// ---------- real-time pricing and reference nodes ----------
	{
		id: 'rtp', title: 'Introducing the real-time pricing project', by: 'Electricity Authority, fact sheet',
		url: 'https://www.ea.govt.nz/documents/1964/25352RTP-fact-sheet-FINAL-141274099.1.pdf',
		use: 'Says real-time pricing went live on 1 November 2022, and that a time-weighted average of each trading period’s prices is published as its final price.',
		topics: ['prices', 'price-explainer', 'records'],
	},
	{
		id: 'hedge', title: 'Hedge market', by: 'Electricity Authority',
		url: 'https://www.ea.govt.nz/industry/wholesale/hedge-market/',
		use: 'Names the two grid reference nodes for ASX electricity futures: Ōtāhuhu in the North Island and Benmore in the South Island.',
		topics: ['prices'],
	},
	// ---------- other embedded generation ----------
	{
		id: 'figure-net', title: 'Net electricity generation in New Zealand', by: 'Figure.NZ, from MBIE’s energy statistics',
		url: 'https://figure.nz/chart/CSqp1BUnN4f8iyTp',
		use: 'Lists MBIE’s annual net generation from 1974, the figures our check on the history’s totals uses.',
		topics: ['history'],
	},
	{
		id: 'wm-2022', title: 'A tale of two generators', by: 'WM New Zealand', date: '25 February 2022',
		url: 'https://www.wm.nz/news-and-media/2022/a-tale-of-two-generators',
		use: 'Describes landfill gas generation at Whitford and Redvale.',
		topics: ['other-embedded'],
	},
	{
		id: 'wm-2026', title: 'Landfill gas to power: WM New Zealand reaches significant clean energy milestone', by: 'WM New Zealand', date: '2026',
		url: 'https://www.wm.nz/news-and-media/2026/wm-new-zealand-achieves-major-renewable-energy-milestone',
		use: 'Gives the electricity generated from landfill gas at Redvale, Whitford, Kate Valley and Tirohia.',
		topics: ['other-embedded'],
	},
	{
		id: 'manawa-coast', title: 'Submission on the proposed Te Tai o Poutini Plan', by: 'Manawa Energy, submission 438', date: '2022',
		url: 'https://ttpp.nz/wp-content/uploads/2023/04/Submission-438-Manawa-Energy.pdf',
		use: 'Lists Manawa’s West Coast hydro schemes (Arnold, Kumara, Kaniere and McKays, and Wahapo), connected to the local distribution network.',
		topics: ['other-embedded'],
	},
	{
		id: 'kce', title: 'Submission on the Proposed Waitomo District Plan', by: 'King Country Energy', date: '22 December 2022',
		url: 'https://www.waitomo.govt.nz/media/ivygn5vs/33-pdp-submission-to-wdc-king-country-energy.pdf',
		use: 'Lists King Country Energy’s hydro schemes, including Wairere, Mokauiti, Piriaka and Kuratau.',
		topics: ['other-embedded'],
	},
	{
		id: 'westpower', title: 'Amethyst Hydro Scheme', by: 'Westpower',
		url: 'https://westpower.co.nz/power-generation-amethyst-hydro',
		use: 'Describes the Amethyst hydro scheme on the West Coast.',
		topics: ['other-embedded'],
	},
	{
		id: 'pioneer', title: 'Pioneer Energy', by: 'Wikipedia',
		url: 'https://en.wikipedia.org/wiki/Pioneer_Energy_(NZ)',
		use: 'Lists Pioneer Energy’s hydro and wind plants in the lower South Island.',
		topics: ['other-embedded'],
	},
	{
		id: 'tpr-wellington', title: 'Transmission Planning Report 2017: Wellington regional plan', by: 'Transpower', date: '2017',
		url: 'https://static.transpower.co.nz/public/publications/resources/Chapter%2014%20-%20Wellington%20Regional%20Plan%202017%20-%20FINAL.pdf',
		use: 'Places Silverstream landfill at the Haywards grid exit point and the Southern Landfill at Central Park (table 14-2).',
		topics: ['other-embedded'],
	},
	{
		id: 'waipori', title: 'Revised 110 kV Waipori Generation Embedment Proposal', by: 'Prepared for TrustPower, published by Transpower', date: 'June 2013',
		url: 'https://static.transpower.co.nz/public/uncontrolled_docs/Waipori-PDA-External-Report.pdf',
		use: 'Describes embedding the Waipori power stations into the Halfway Bush grid exit point.',
		topics: ['other-embedded'],
	},
	{
		id: 'hampton', title: 'Hampton Downs landfill gas project', by: 'Bioenergy Association of New Zealand',
		url: 'https://www.bioenergy.org.nz/facility/hampton-downs-landfill-gas-project',
		use: 'Describes landfill gas generation at Hampton Downs, which may be the output seen at Bombay. No document we have found confirms the link.',
		topics: ['other-embedded'],
	},
	// ---------- plants ----------
	{
		id: 'nzsteel', title: 'Energy resources and recovery', by: 'New Zealand Steel',
		url: 'https://www.nzsteel.co.nz/sustainability/our-environment/energy-resources-and-recovery/',
		use: 'Describes Glenbrook’s two cogeneration plants, which run on waste gas from the multi-hearth furnaces and waste heat from the rotary kilns.',
		topics: ['generation', 'emissions'],
	},
	{
		id: 'kinleith', title: 'CHH Kinleith Cogeneration Plant', by: 'Bioenergy Association of New Zealand',
		url: 'https://www.bioenergy.org.nz/facility/chh-kinleith-cogeneration-plant',
		use: 'Says Kinleith’s boiler burns wood waste.',
		topics: ['generation'],
	},
	{
		id: 'tasman', title: 'Carbon reduction case study: Tasman Mill', by: 'Oji Fibre Solutions, Climate Leaders Coalition', date: '2022',
		url: 'https://climateleaderscoalition.org.nz/wp-content/uploads/2022/06/OjiFS-carbon-reduction-case-study_Tasman-Mill.pdf',
		use: 'Describes the Tasman mill’s 2019 changes: black liquor burned in the recovery boiler, a power boiler closed, and more geothermal steam.',
		topics: ['generation'],
	},
	{
		id: 'manawa', title: 'Contact Energy completes Manawa Energy acquisition', by: 'Contact Energy, NZX announcement', date: '11 July 2025',
		url: 'https://announcements.nzx.com/announcement/454948',
		use: 'Gives the date Contact took over Manawa Energy.',
		topics: ['groupings'],
	},
	{
		id: 'block', title: 'Electricity Industry Participation Code 2010, Part 1', by: 'Electricity Authority', date: '15 May 2025',
		url: 'https://www.ea.govt.nz/documents/7239/Part_1_-_Preliminary_provisions.pdf',
		use: 'Defines a block dispatch group as generating stations on one continuous water course under an agreement with the system operator. We have found no public list that names the groups.',
		topics: ['generation', 'history'],
	},
	{
		id: 'dispatch', title: 'Dispatch Policy and Guideline', by: 'Transpower, system operator', date: 'July 2019',
		url: 'https://www.transpower.co.nz/media/15187',
		use: 'Says offered assets are “blocks” in the market system, which may be block dispatch groups or station dispatch groups (section 2.3).',
		topics: ['generation'],
	},
	{
		id: 'wikipedia', title: 'List of power stations in New Zealand', by: 'Wikipedia',
		url: 'https://en.wikipedia.org/wiki/List_of_power_stations_in_New_Zealand',
		use: 'Supplies many of the capacity table’s dates and sizes, with each station’s own article. Every row of the table names its source.',
		topics: ['capacity'],
	},
	// ---------- offers and security of supply ----------
	{
		id: 'ea-offers', title: 'Current bids and offers data to be decommissioned and replaced on 28 Aug 2017', by: 'EMI forum, Electricity Authority', date: 'August 2017',
		url: 'https://forum.emi.ea.govt.nz/thread/bids-and-offers-data-current-files-to-be-decommissioned-and-replaced-on-28-august-2017/',
		use: 'Says bids and offers before 13 December 2012 were left out of the published files because of their poor quality.',
		topics: ['capacity'],
	},
	{
		id: 'sos', title: 'Security of supply', by: 'Transpower, system operator',
		url: 'https://transpower.co.nz/system-operator/security-supply',
		use: 'Holds the system operator’s reports on whether there is enough generation, including the New Zealand Generation Balance.',
		topics: ['capacity'],
	},
	// ---------- solar ----------
	{
		id: 'dg-capacity', title: 'Batteries in Installed distributed generation trends', by: 'EMI forum, Electricity Authority',
		url: 'https://forum.emi.ea.govt.nz/thread/batteries-in-installed-distributed-generation-trends/',
		use: 'Says the registry’s capacity field is meant to hold the lesser of summed generation capacity and the inverter or injection limit.',
		topics: ['embedded-solar'],
	},
	{
		id: 'eeca-dcac', title: 'Solar PV and Battery Capacities and Costs', by: 'Miller, for the Energy Efficiency and Conservation Authority', date: 'January 2025',
		url: 'https://www.eeca.govt.nz/assets/EECA-Resources/Research-papers-guides/Appendix-Five-Solar-PV-capacities-and-costs.pdf',
		use: 'Gives DC:AC ratios of 1.0 and 1.2 for New Zealand homes.',
		topics: ['embedded-solar'],
	},
	{
		id: 'niwa', title: 'Mean daily global radiation across selected New Zealand locations', by: 'NIWA climate averages 1991–2020, on Figure.NZ',
		url: 'https://figure.nz/chart/72IvcxUqOYF0xjMa',
		use: 'Gives long-term sunshine at Auckland, Wellington, Christchurch and Dunedin, which we compare with the satellite.',
		topics: ['embedded-solar'],
	},
	{
		id: 'sa-peak', title: 'Rooftop solar smashes output records in two states, as home batteries dull grid impact in sunny Spring', by: 'RenewEconomy', date: '8 October 2026',
		url: 'https://reneweconomy.com.au/rooftop-solar-smashes-output-records-in-two-states-as-home-batteries-dull-grid-impact-in-sunny-spring/',
		use: 'Reports South Australia’s rooftop solar peak of 2,070 MW.',
		topics: ['embedded-solar'],
	},
	{
		id: 'cec', title: 'Rooftop solar and storage report, July–December 2025', by: 'Clean Energy Council', date: '2026',
		url: 'https://cleanenergycouncil.org.au/getmedia/16ed1cff-8ddb-423a-b3ad-3f9fa8e4d594/rooftop-solar-and-storage-biannual-report_july-december-2025.pdf',
		use: 'Gives South Australia’s installed rooftop solar as 2.85 GW at the end of 2025 (figure 4).',
		topics: ['embedded-solar'],
	},
	{
		id: 'pvlib', title: 'pvlib python', by: 'pvlib project',
		url: 'https://pvlib-python.readthedocs.io/',
		use: 'The library Elenz checks its PV model against. Its documentation gives the published reference for each model, including Hay–Davies.',
		topics: ['embedded-solar'],
	},
	{
		id: 'noaa', title: 'Solar calculation details', by: 'NOAA Global Monitoring Laboratory',
		url: 'https://gml.noaa.gov/grad/solcalc/calcdetails.html',
		use: 'Gives the equations Elenz uses for the sun’s position.',
		topics: ['embedded-solar'],
	},
	{
		id: 'ashrae', title: 'ASHRAE IAM model', by: 'PV Performance Modeling Collaborative, Sandia National Laboratories',
		url: 'https://pvpmc.sandia.gov/modeling-guide/1-weather-design-inputs/shading-soiling-and-reflection-losses/incident-angle-reflection-losses/ashrae-iam-model/',
		use: 'Provides the model Elenz uses for reflection losses at low sun angles.',
		topics: ['embedded-solar'],
	},
	{
		id: 'sandia', title: 'Sandia cell temperature model', by: 'PV Performance Modeling Collaborative, Sandia National Laboratories',
		url: 'https://pvpmc.sandia.gov/modeling-guide/2-dc-module-iv/cell-temperature/sandia-cell-temperature-model/',
		use: 'Provides the model Elenz uses to calculate panel temperature.',
		topics: ['embedded-solar'],
	},
	{
		id: 'pvwatts', title: 'PVWatts Version 5 Manual', by: 'Dobos, National Renewable Energy Laboratory', date: '2014',
		url: 'https://www.osti.gov/biblio/1158421',
		use: 'Provides the models Elenz uses for DC output, the inverter limit and fixed losses.',
		topics: ['embedded-solar'],
	},
];

export const topic = (slug: string) => TOPICS.find((t) => t.slug === slug);
export const sourceHref = (id: string) => `/methods/sources#${id}`;
export const sourceOf = (id: string) => {
	const s = SOURCES.find((x) => x.id === id);
	if (!s) throw new Error(`no source called ${id}`);
	return s;
};
// the topics whose Data sources section uses a dataset
export const topicsOf = (id: string) => TOPICS.filter((t) => ROLES[t.slug]?.[id]);
export const refsFor = (slug: string) => REFERENCES.filter((r) => r.topics.includes(slug));
export const ref = (id: string) => {
	const r = REFERENCES.find((x) => x.id === id);
	if (!r) throw new Error(`no reference called ${id}`);
	return r.url;
};

// each topic page's body, by slug
const bodies = import.meta.glob<{ default: Component }>('./pages/*.svelte', { eager: true });
export const body = (slug: string) => bodies[`./pages/${slug}.svelte`]?.default;

const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const longDate = (d: string) => {
	const [y, m, day] = d.split('-').map(Number);
	return `${day} ${MON[m - 1]} ${y}`;
};

// the source code these pages describe, on GitHub
export const REPO = 'https://github.com/elenz-nz/elenz/blob/main/';

// "Spotted a problem with this page?": an email with the page already named, so reviewers' corrections are easy to sort
export const reportHref = (title: string, path: string) =>
	'mailto:hello@elenz.co.nz?subject=' + encodeURIComponent(`Elenz methods: ${title}`) +
	'&body=' + encodeURIComponent(`Page: https://elenz.co.nz${path}\n\n`);
