// Data and methods: how each series on the site is built, and every dataset it comes from.
//
// /methods is the overview, /methods/sources lists every dataset (SOURCES below), and each topic has its own page at
// /methods/<slug>, written as one Svelte file in ./pages/<slug>.svelte (ordinary markup, using the classes in
// methods.css). The page's header (title, summary, where it is shown) and its "Data used" box come from TOPICS and
// SOURCES, so a dataset is described once and every page that uses it lists it the same way.
//
// When a method changes: update its page, set `updated` on its topic, and keep the dataset entries in step.
//
// REFERENCES holds what isn't a dataset: reports, papers and announcements behind a claim on a method page. The page
// links the claim with `ref('<id>')` (a mistyped id fails the build), and its "References" box lists every entry with
// that page's slug in `topics`, so a reference is also described once. Only add one that was opened and says what the
// page says it does.
import type { Component } from 'svelte';

export type Topic = {
	slug: string;
	title: string;
	summary: string; // one or two sentences under the title, and on the overview's cards
	shownOn: [string, string][]; // [label, href]: where the series appears on the site
	estimate?: boolean; // modelled rather than measured
	structured?: boolean; // follows the standard structure: its body places Data sources and References, and the header leaves out the estimate tag
	updated: string; // YYYY-MM-DD: when the page was last checked against the code
};

export const TOPICS: Topic[] = [
	{
		slug: 'generation',
		title: 'Generation',
		summary: 'How much electricity each plant and fuel is generating.',
		shownOn: [['Tracker', '/tracker'], ['Now', '/now']],
		structured: true,
		updated: '2026-11-06',
	},
	{
		slug: 'embedded-solar',
		title: 'Embedded solar',
		summary: 'Solar on local networks that isn’t dispatched, mostly rooftops. Nobody measures it as it happens, so it is modelled from installed capacity and satellite sunshine.',
		shownOn: [['Tracker', '/tracker'], ['Now', '/now']],
		estimate: true,
		updated: '2026-11-01',
	},
	{
		slug: 'other-embedded',
		title: 'Other embedded generation',
		summary: 'Small hydro, geothermal, landfill gas and wind on local networks that isn’t dispatched. Built from metered data from January 2009; the newest weeks are a typical day from earlier months.',
		shownOn: [['Tracker', '/tracker'], ['Now', '/now']],
		estimate: true,
		updated: '2026-11-06',
	},
	{
		slug: 'demand',
		title: 'Demand',
		summary: 'Electricity taken from the grid in each island, and with embedded solar added back for underlying demand.',
		shownOn: [['Tracker', '/tracker'], ['Now', '/now']],
		updated: '2026-11-01',
	},
	{
		slug: 'hvdc',
		title: 'HVDC transfer',
		summary: 'The electricity moving between the North and South Islands on the HVDC link.',
		shownOn: [['Tracker', '/tracker'], ['Prices', '/tracker/prices'], ['Now', '/now']],
		estimate: true,
		structured: true,
		updated: '2026-11-06',
	},
	{
		slug: 'prices',
		title: 'Wholesale prices',
		summary: 'Spot prices at the island reference nodes and four more, dispatch prices for the live week and final prices for history, and the figures the Prices tab derives from them.',
		shownOn: [['Tracker', '/tracker'], ['Prices', '/tracker/prices'], ['Now', '/now']],
		updated: '2026-11-01',
	},
	{
		slug: 'price-explainer',
		title: 'Price explainer',
		summary: 'The “Why is the price high?” panel on the Now page: what counts as usual, when it is highlighted or opens by itself, and how a possible price setter is found.',
		shownOn: [['Now', '/now']],
		updated: '2026-11-05',
	},
	{
		slug: 'emissions',
		title: 'Emissions intensity',
		summary: 'Greenhouse gas per kilowatt-hour generated, from each fuel’s output and emission factor. Every factor the site uses is listed here, with where it comes from.',
		shownOn: [['Tracker', '/tracker'], ['Now', '/now']],
		updated: '2026-11-05',
	},
	{
		slug: 'groupings',
		title: 'Renewable share and groupings',
		summary: 'How fuels are counted as renewable or fossil, flexible or variable, and how plants are grouped by site, hydro scheme and owner.',
		shownOn: [['Tracker', '/tracker'], ['Now', '/now']],
		updated: '2026-11-02',
	},
	{
		slug: 'capacity',
		title: 'Installed capacity',
		summary: 'How much each plant could generate, and when that changed, back to 1997: the basis for the Generation tab’s capacity factors and dispatchable headroom.',
		shownOn: [['Tracker', '/tracker']],
		updated: '2026-11-05',
	},
	{
		slug: 'history',
		title: 'History since 1997',
		summary: 'How the record back to August 1997 is put together from metered data, the daily dispatch files and the live feed, where the sources hand over, and the known gaps.',
		shownOn: [['Tracker', '/tracker'], ['Prices', '/tracker/prices']],
		updated: '2026-11-05',
	},
	{
		slug: 'records',
		title: 'Records',
		summary: 'The highest and lowest half-hours, days, weeks, months, years and runs since 1997: which data they rest on, when a record is official or provisional, when a period is on record pace, and what is left out.',
		shownOn: [['Records', '/records'], ['Now', '/now']],
		updated: '2026-11-05',
	},
];

export type Source = {
	id: string;
	name: string;
	publisher: string;
	dataset?: string; // the dataset's own name or path, shown in code type
	url: string;
	what: string; // what it contains
	use: string; // what the site uses it for
	period: string; // what years it covers
	fresh: string; // how soon it is published
	licence: string;
	topics: string[]; // slugs of the topic pages that use it
	check?: boolean; // used to check or fit the methods, not shown on the site itself
};

const EMI = 'https://www.emi.ea.govt.nz/Wholesale/Datasets/';
const EA = 'Electricity Authority (EMI)';
const CCBY = 'CC BY 4.0';

export const SOURCES: Source[] = [
	// ---------- market data ----------
	{
		id: 'capacity', name: 'Plant capacity histories', publisher: 'Elenz', dataset: 'facilities/plant_capacity.csv',
		url: 'https://github.com/elenz-nz/elenz/blob/main/facilities/plant_capacity.csv',
		what: 'Every plant the tracker shows, with its installed MW and the dates each figure applies: the EA plant register, corrected where it misses upgrades, closures or staged commissioning. Each row names its source.',
		use: 'Capacity factors in the Generation tab’s mix table, and its dispatchable headroom chart.',
		period: 'August 1997 on', fresh: 'Updated by hand as plants change', licence: 'Compiled from the sources each row names',
		topics: ['capacity'],
	},
	{
		id: 'rtd', name: 'Real-time dispatch', publisher: EA, dataset: 'EMI API: real-time-dispatch',
		url: 'https://emi.developer.azure-api.net/',
		what: 'Every 5-minute dispatch case: MW for each generating unit and load at every connection point, and the price at every node, including the island reference nodes.',
		use: 'The live week: generation by unit, island load, prices. Also the inputs to the HVDC estimate and the price explainer.',
		period: 'The last month or so', fresh: 'Usually 1–2 minutes after each interval starts', licence: CCBY,
		topics: ['generation', 'demand', 'prices', 'hvdc', 'price-explainer', 'history', 'records', 'other-embedded'],
	},
	{
		id: 'dispatch', name: 'Dispatch prices and volumes', publisher: EA, dataset: 'DispatchAndPricing/NodalPricesAndVolumes',
		url: EMI + 'DispatchAndPricing/NodalPricesAndVolumes',
		what: 'The same dispatch cases as the real-time feed, one file a day, for connection points with load or generation (no bus nodes).',
		use: 'History for the weeks since the latest metered month, and plants the metering doesn’t have (batteries, new solar farms).',
		period: 'From 10 Sep 2020', fresh: '1–4 days late', licence: CCBY,
		topics: ['generation', 'demand', 'prices', 'hvdc', 'history', 'records', 'other-embedded'],
	},
	{
		id: 'final', name: 'Final energy prices', publisher: EA, dataset: 'DispatchAndPricing/FinalEnergyPrices',
		url: EMI + 'DispatchAndPricing/FinalEnergyPrices',
		what: 'The price the market settles at, for every node and half-hour trading period. Marked interim (_I) for the last day or two and while under review.',
		use: 'Every price in the history. The usual prices the explainer compares with.',
		period: 'From 1996 (the site uses August 1997 on)', fresh: 'Usually the next day', licence: CCBY,
		topics: ['prices', 'price-explainer', 'history', 'records'],
	},
	{
		id: 'offers', name: 'Generator offers', publisher: EA, dataset: 'BidsAndOffers/Offers',
		url: EMI + 'BidsAndOffers/Offers',
		what: 'Each generator’s energy offers for every trading period: blocks of MW at a price, revised up to gate closure.',
		use: 'The possible price setter in the price explainer, from the final offers of the newest published day; offered capacity for the Generation tab’s dispatchable headroom, every half-hour from 2013.',
		period: 'January 2013 on, daily files', fresh: 'Usually the morning after; now and then a day comes later', licence: CCBY,
		topics: ['price-explainer', 'capacity'],
	},
	{
		id: 'register', name: 'Dispatched generation plant', publisher: EA, dataset: 'Generation/GenerationFleet/Existing/DispatchedGenerationPlant.csv',
		url: EMI + 'Generation/GenerationFleet/Existing',
		what: 'Every dispatched unit: plant name, connection point, unit code, fuel, technology, operator and nameplate MW, with dated rows as units are added, moved or retired.',
		use: 'Maps each unit in the dispatch data to its plant, fuel, island and owner; plant capacities.',
		period: 'Current and past units', fresh: 'About twice a year', licence: CCBY,
		topics: ['generation', 'groupings', 'capacity'],
	},
	{
		id: 'nsp', name: 'Network supply points', publisher: EA, dataset: 'MappingsAndGeospatial/NetworkSupplyPointsTable',
		url: EMI + 'MappingsAndGeospatial/NetworkSupplyPointsTable',
		what: 'Every connection point, current and retired, with its island, network and coordinates.',
		use: 'The island of connection points that appear only in the metered history; placing the embedded solar irradiance points.',
		period: 'Current and past points', fresh: 'Every few days', licence: CCBY,
		topics: ['generation', 'embedded-solar', 'history'],
	},
	{
		id: 'shapes', name: 'Network region shapes', publisher: EA, dataset: 'MappingsAndGeospatial/NetworkRegionShapefiles',
		url: EMI + 'MappingsAndGeospatial/NetworkRegionShapefiles',
		what: 'Outlines of the market’s network zones (2018).',
		use: 'The outlines of the two islands on the Now page’s map, simplified.',
		period: 'Static', fresh: '–', licence: CCBY,
		topics: [],
	},
	// ---------- metered data ----------
	{
		id: 'genmd', name: 'Metered generation', publisher: EA, dataset: 'Generation/Generation_MD',
		url: EMI + 'Generation/Generation_MD',
		what: 'Half-hourly energy from each station, by connection point and generator code: grid-connected stations from August 1997, stations on local networks from January 2009.',
		use: 'Generation by plant and fuel for every month it has been published.',
		period: 'From Aug 1997', fresh: 'About 5–6 weeks after each month', licence: CCBY,
		topics: ['generation', 'demand', 'history', 'capacity', 'records', 'other-embedded'],
	},
	{
		id: 'embedded', name: 'Embedded generation', publisher: EA, dataset: 'Metered_data/Embedded_generation',
		url: EMI + 'Metered_data/Embedded_generation',
		what: 'Half-hourly energy injected at connection points on local networks.',
		use: 'Stations on local networks before 2009, and their gross output where Generation_MD records it net of local load.',
		period: 'From Oct 1998 (most points from Apr 1999)', fresh: 'About 2 weeks after each month', licence: CCBY,
		topics: ['generation', 'history', 'capacity', 'records', 'other-embedded'],
	},
	{
		id: 'gridexport', name: 'Grid exports', publisher: EA, dataset: 'Metered_data/Grid_export',
		url: EMI + 'Metered_data/Grid_export',
		what: 'Half-hourly energy leaving the grid at every connection point.',
		use: 'Demand in history.',
		period: 'From Oct 1996', fresh: 'About 2 weeks after each month', licence: CCBY,
		topics: ['demand', 'history', 'records'],
	},
	{
		id: 'gridimport', name: 'Grid imports', publisher: EA, dataset: 'Metered_data/Grid_import',
		url: EMI + 'Metered_data/Grid_import',
		what: 'Half-hourly energy entering the grid at every connection point (until about 2003, only from local networks).',
		use: 'Demand in history.',
		period: 'From Oct 2000', fresh: 'About 2 weeks after each month', licence: CCBY,
		topics: ['demand', 'history', 'records'],
	},
	{
		id: 'tiwai', name: 'Grid exports to Tiwai', publisher: EA, dataset: 'Metered_data/Grid_export_to_Tiwai',
		url: EMI + 'Metered_data/Grid_export_to_Tiwai',
		what: 'Half-hourly energy supplied to the Tiwai Point aluminium smelter.',
		use: 'Read with the metered history but not shown on its own: the smelter is part of demand like any other consumer.',
		period: 'From Oct 1996', fresh: 'About 2 weeks after each month', licence: CCBY,
		topics: ['history'],
	},
	{
		id: 'hvdcflows', name: 'HVDC flows', publisher: EA, dataset: 'Metered_data/HVDC_Flows',
		url: EMI + 'Metered_data/HVDC_Flows',
		what: 'Half-hourly energy at the Benmore and Haywards ends of the HVDC link (three file layouts over the years).',
		use: 'HVDC transfer in history; the fit behind the live estimate.',
		period: 'From Oct 1996', fresh: 'About 2 weeks after each month', licence: CCBY,
		topics: ['hvdc', 'history', 'records'],
	},
	{
		id: 'reconciliation', name: 'Reconciled injection and offtake', publisher: EA, dataset: 'Volumes/Reconciliation',
		url: EMI + 'Volumes/Reconciliation',
		what: 'Monthly files of metered injection and offtake by connection point, network, trader and half-hour.',
		use: 'Mill Creek wind farm’s first 16 months (May 2014 to August 2015), which no other metered file has; checking the embedded solar model against metered exports, and the output of embedded solar farms; other embedded generation from January 2005.',
		period: 'From Jan 2005', fresh: 'About 3–4 weeks after each month; revised about 3, 7 and 14 months later', licence: CCBY,
		topics: ['embedded-solar', 'history', 'generation', 'demand', 'other-embedded'],
	},
	{
		id: 'guehmt', name: 'Installed distributed generation', publisher: EA, dataset: 'Report GUEHMT',
		url: 'https://www.emi.ea.govt.nz/Retail/Reports/GUEHMT',
		what: 'Installed distributed generation each month, from the registry, by grid exit point (Root NSP) and fuel; solar also by systems up to 10 kW and over 10 kW.',
		use: 'Embedded solar capacity at each grid exit point; the split by fuel of other embedded generation where no public document states it.',
		period: 'From Aug 2013', fresh: 'Monthly', licence: CCBY,
		topics: ['embedded-solar', 'history', 'capacity', 'other-embedded'],
	},
	// ---------- weather ----------
	{
		id: 'satellite', name: 'Satellite irradiance', publisher: 'Open-Meteo (Himawari, JMA/JAXA)', dataset: 'Satellite Radiation API',
		url: 'https://open-meteo.com/en/docs/satellite-radiation-api',
		what: 'Sunshine reaching the ground (global and diffuse irradiance) every 10 minutes, from the Himawari geostationary satellite.',
		use: 'Embedded solar, live and from 2016, at 35 points.',
		period: 'From 2016', fresh: 'About 45 minutes behind real time', licence: CCBY,
		topics: ['embedded-solar', 'history'],
	},
	{
		id: 'era5', name: 'ERA5 reanalysis', publisher: 'Open-Meteo (Copernicus ERA5)', dataset: 'Historical Weather API',
		url: 'https://open-meteo.com/en/docs/historical-weather-api',
		what: 'Hourly modelled irradiance on a ~30 km grid, reconstructed from weather observations.',
		use: 'Embedded solar from August 2013 to 2015, before the satellite archive starts.',
		period: 'Decades', fresh: 'About 5 days behind', licence: CCBY,
		topics: ['embedded-solar', 'history'],
	},
	{
		id: 'forecast', name: 'Weather forecast irradiance', publisher: 'Open-Meteo', dataset: 'Forecast API',
		url: 'https://open-meteo.com/en/docs',
		what: 'Forecast irradiance.',
		use: 'A fallback for live embedded solar, only if the satellite data stops arriving.',
		period: 'Forecast', fresh: 'Hourly', licence: CCBY,
		topics: ['embedded-solar'],
	},
	// ---------- emission factors ----------
	{
		id: 'genesis', name: 'Quarterly performance reports', publisher: 'Genesis Energy',
		url: 'https://www.genesisenergy.co.nz/investors/reports-and-presentations',
		what: 'Each quarter, Huntly’s Rankine output, the share of their fuel that was coal, coal and gas burned, and generation emissions.',
		use: 'The Rankines’ coal share each quarter from July 2020, and the coal factor fitted to their reported emissions.',
		period: 'From FY21 (Jul 2020) in use', fresh: 'About 3 weeks after each quarter', licence: 'Published figures (cited)',
		topics: ['emissions'],
	},
	{
		id: 'mbie', name: 'Electricity statistics', publisher: 'Ministry of Business, Innovation and Employment', dataset: 'Electricity data tables (quarterly generation by fuel)',
		url: 'https://www.mbie.govt.nz/building-and-energy/energy-and-natural-resources/energy-statistics-and-modelling/energy-statistics/electricity-statistics',
		what: 'Quarterly and annual electricity generation by fuel, including generation from coal.',
		use: 'The Rankines’ coal share before July 2020; checking the history’s annual totals.',
		period: 'From the 1970s', fresh: 'Quarterly', licence: CCBY,
		topics: ['emissions', 'history'],
	},
	{
		id: 'mfe', name: 'Measuring emissions guidance', publisher: 'Ministry for the Environment', dataset: 'Fuels: natural gas, stationary combustion',
		url: 'https://measuringemissionsguide.environment.govt.nz/3_fuels.html',
		what: 'Emission factors for fuels burned in New Zealand.',
		use: 'The natural gas factor, 54.1 kg CO₂e/GJ.',
		period: 'Current guidance', fresh: 'Yearly', licence: CCBY,
		topics: ['emissions'],
	},
	{
		id: 'nzga', name: 'Geothermal emissions working group', publisher: 'NZ Geothermal Association (McLean et al.)',
		url: 'https://www.nzgeothermal.org.nz/downloads/NZGA-Updates-from-emissions-working-group-2023.pdf',
		what: 'Each geothermal station’s operational emissions (gas released from the field) per kWh, for 2020, 2022 and 2023.',
		use: 'Each geothermal station’s own factor by year.',
		period: '2020, 2022, 2023', fresh: 'Each November (NZ Geothermal Workshop)', licence: 'Published figures (cited)',
		topics: ['emissions'],
	},
	{
		id: 'inventory', name: 'New Zealand’s Greenhouse Gas Inventory', publisher: 'Ministry for the Environment',
		url: 'https://environment.govt.nz/facts-and-science/climate-change/new-zealands-greenhouse-gas-inventory/',
		what: 'National emissions by sector and year.',
		use: 'Checking the history’s yearly emissions against the energy industries series.',
		period: 'From 1990', fresh: 'Yearly', licence: CCBY, check: true,
		topics: ['emissions'],
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
		use: 'Each geothermal station’s operational emissions for 2023 (table 2), and how reinjection is changing them.',
		topics: ['emissions'],
	},
	{
		id: 'nzga2023', title: 'CO₂ group presentation, Geothermal Week 2024', by: 'NZ Geothermal Association', date: '2024',
		url: 'https://www.nzgeothermal.org.nz/downloads/CO2-group-presentation-for-geo-week-2024_Final.pptx.pdf',
		use: '2023 operational emissions by station, including TOPP1 and GDL at 56 g CO₂e/kWh.',
		topics: ['emissions'],
	},
	{
		id: 'nzga2021', title: 'NZGA Strategic Project Update: CO₂ Reduction', by: 'McLean, NZ Geothermal Association', date: 'undated, with 2021’s figures',
		url: 'https://www.nzgeothermal.org.nz/downloads/CO2-Emissions-Reduction-project.pdf',
		use: '2021 lifecycle emissions by station, including TOPP1 (68) and GDL (55), from which we take the 10 g/kWh allowance.',
		topics: ['emissions'],
	},
	{
		id: 'eastland-geo', title: 'Geothermal', by: 'Eastland Generation', date: '2026',
		url: 'https://eastlandgeneration.nz/renewable-generation/geothermal/',
		use: 'TOPP1 (24 MW, 2012) and Geothermal Developments Ltd (9 MW, 2008), both at Kawerau.',
		topics: ['generation', 'emissions'],
	},
	{
		id: 'mclean2021', title: 'Geothermal Greenhouse Gas Emissions in New Zealand in 2020: Lifecycle and Operational Emissions',
		by: 'McLean and Richardson, New Zealand Geothermal Workshop', date: '2021',
		url: 'https://worldgeothermal.org/pdf/IGAstandard/NZGW/2021/111.pdf',
		use: 'Each geothermal station’s operational emissions for 2020 (table 3).',
		topics: ['emissions'],
	},
	{
		id: 'contact-gbp', title: 'Green Borrowing Programme update reports, FY23 to FY26', by: 'Contact Energy',
		url: 'https://contact.co.nz/greenborrowing',
		use: 'Each Contact geothermal station’s emissions intensity by year to June.',
		topics: ['emissions'],
	},
	{
		id: 'ojifs2025', title: 'Sustainability Report 2025', by: 'Oji Fibre Solutions', date: '2026',
		url: 'https://cdn.sanity.io/files/gz4vq3tx/production/b0136366ad00459a2e07e8a88f74fa366f5bf146.pdf',
		use: 'Kinleith’s fuels in 2025: 10.1 PJ of biomass and 2.1 PJ of fossil fuels. Electricity generated at each mill. Biomass CO₂ reported separately, as the GHG Protocol sets out.',
		topics: ['emissions', 'generation'],
	},
	{
		id: 'oji-ea', title: 'Submission on strengthening price discovery in the forward electricity markets', by: 'Oji Fibre Solutions, to the Electricity Authority', date: 'December 2024',
		url: 'https://www.ea.govt.nz/documents/9188/Oji_Fibre_Solutions.pdf',
		use: 'Oji describes its generation as biomass cogeneration.',
		topics: ['emissions'],
	},
	{
		id: 'topenergy', title: 'Sustainability Report 2025', by: 'Top Energy', date: '2025',
		url: 'https://topenergy.co.nz/assets/Sustainability-Report-2025_Final_Online.pdf',
		use: 'Ngāwhā: 2024 the first year all its geothermal emissions were avoided, with a Unique Emission Factor from the EPA.',
		topics: ['emissions'],
	},
	{
		id: 'times', title: 'TIMES-NZ documentation: emission factors', by: 'Energy Efficiency and Conservation Authority',
		url: 'https://times-nz-dev.readthedocs.io/en/stable/model_methodology/electricity/emission_factors.html',
		use: 'The assumed factor for Kawerau’s TOPP2 (0), and Ngāwhā’s OEC4 falling to 0 in 2024.',
		topics: ['emissions'],
	},
	{
		id: 'stack2020', title: '2020 Thermal Generation Stack Update Report', by: 'WSP for MBIE', date: 'October 2020',
		url: 'https://www.mbie.govt.nz/assets/2020-thermal-generation-stack-update-report.pdf',
		use: 'Heat rates for Huntly 5 and 6, Stratford’s peakers and Whirinaki (table 3-3); Kinleith’s fuels (section 3.1.3).',
		topics: ['emissions', 'generation'],
	},
	{
		id: 'mbie-elec', title: 'Electricity statistics', by: 'Ministry of Business, Innovation and Employment',
		url: 'https://www.mbie.govt.nz/building-and-energy/energy-and-natural-resources/energy-statistics-and-modelling/energy-statistics/electricity-statistics',
		use: 'Annual net generation, the check on the history’s yearly totals, hydro and geothermal.',
		topics: ['history'],
	},
	{
		id: 'mbie-methods', title: 'Energy statistics: sources and methods', by: 'Ministry of Business, Innovation and Employment',
		url: 'https://www.mbie.govt.nz/assets/Energy-statistics-sources-and-methods.pdf',
		use: 'How MBIE compiles those figures, and what it counts that the EA’s metering doesn’t.',
		topics: ['history'],
	},
	{
		id: 'stack2011', title: '2011 NZ Generation Data Update', by: 'Parsons Brinckerhoff for the Ministry of Economic Development', date: 'January 2012',
		url: 'https://www.mbie.govt.nz/dmsdocument/127-2011-nz-generation-data-update-v006a-pdf',
		use: 'Heat rates for Ōtāhuhu B, Southdown and the Taranaki Combined Cycle (table 3-1).',
		topics: ['emissions'],
	},
	{
		id: 'ipcc', title: '2019 Refinement to the 2006 IPCC Guidelines: Stationary Combustion', by: 'Intergovernmental Panel on Climate Change', date: '2019',
		url: 'https://www.ipcc-nggip.iges.or.jp/public/2019rf/pdf/2_Volume2/19R_V2_2_Ch02_Stationary_Combustion.pdf',
		use: 'CO₂ from burning biomass is an information item, left out of the energy sector’s total (section 2.3.3.4).',
		topics: ['emissions'],
	},
	{
		id: 'acm0004', title: 'ACM0004: Consolidated methodology for waste gas and/or heat for power generation', by: 'UNFCCC Clean Development Mechanism',
		url: 'https://cdm.unfccc.int/methodologies/DB/3NL6ELY805NDZHF4YZRPK94MAPALUB/view.html',
		use: 'Project emissions only from auxiliary fuel, so none from the waste gas itself. Since replaced by ACM0012.',
		topics: ['emissions'],
	},
	{
		id: 'em6', title: 'em6: Carbon Methodology, version 1.6', by: 'Energy Market Services', date: 'November 2025',
		url: 'https://www.ems.co.nz/documents/817/em6_carbon_intensity_1.6.pdf',
		use: 'Battery discharge left out of carbon intensity and the renewable share; em6’s emission factor for each generator.',
		topics: ['emissions', 'groupings'],
	},
	// ---------- the HVDC link ----------
	{
		id: 'hvdc-link', title: 'Transpower exploring future role of New Zealand’s inter-island HVDC electricity link', by: 'Transpower', date: '7 March 2024',
		url: 'https://www.transpower.co.nz/news/transpower-exploring-future-role-new-zealands-inter-island-hvdc-electricity-link',
		use: 'What the link connects, between Benmore and Haywards, and what it is used for.',
		topics: ['hvdc'],
	},
	// ---------- plants ----------
	{
		id: 'nzsteel', title: 'Energy resources and recovery', by: 'New Zealand Steel',
		url: 'https://www.nzsteel.co.nz/sustainability/our-environment/energy-resources-and-recovery/',
		use: 'Glenbrook’s two cogeneration plants, on waste gas from the multi-hearth furnaces and waste heat from the rotary kilns.',
		topics: ['generation', 'emissions'],
	},
	{
		id: 'kinleith', title: 'CHH Kinleith Cogeneration Plant', by: 'Bioenergy Association of New Zealand',
		url: 'https://www.bioenergy.org.nz/facility/chh-kinleith-cogeneration-plant',
		use: 'Kinleith’s boiler burns wood waste.',
		topics: ['generation'],
	},
	{
		id: 'tasman', title: 'Carbon reduction case study: Tasman Mill', by: 'Oji Fibre Solutions, Climate Leaders Coalition', date: '2022',
		url: 'https://climateleaderscoalition.org.nz/wp-content/uploads/2022/06/OjiFS-carbon-reduction-case-study_Tasman-Mill.pdf',
		use: 'The Tasman mill’s 2019 changes: black liquor burned in the recovery boiler, a power boiler closed, and more geothermal steam.',
		topics: ['generation'],
	},
	{
		id: 'manawa', title: 'Contact Energy completes Manawa Energy acquisition', by: 'Contact Energy, NZX announcement', date: '11 July 2025',
		url: 'https://announcements.nzx.com/announcement/454948',
		use: 'The date Contact took over Manawa Energy.',
		topics: ['groupings'],
	},
	{
		id: 'block', title: 'Electricity Industry Participation Code 2010, Part 1', by: 'Electricity Authority', date: '15 May 2025',
		url: 'https://www.ea.govt.nz/documents/7239/Part_1_-_Preliminary_provisions.pdf',
		use: 'Defines a block dispatch group: generating stations on one continuous water course under an agreement with the system operator. We have found no public list that names the groups.',
		topics: ['generation', 'history'],
	},
	{
		id: 'dispatch', title: 'Dispatch Policy and Guideline', by: 'Transpower, system operator', date: 'July 2019',
		url: 'https://www.transpower.co.nz/media/15187',
		use: 'Offered assets are “blocks” in the market system, which may be block dispatch groups or station dispatch groups (section 2.3).',
		topics: ['generation'],
	},
	{
		id: 'wikipedia', title: 'List of power stations in New Zealand', by: 'Wikipedia',
		url: 'https://en.wikipedia.org/wiki/List_of_power_stations_in_New_Zealand',
		use: 'Many of the capacity table’s dates and sizes, with each station’s own article. Every row of the table names its source.',
		topics: ['capacity'],
	},
	// ---------- offers and security of supply ----------
	{
		id: 'ea-offers', title: 'Current bids and offers data to be decommissioned and replaced on 28 Aug 2017', by: 'EMI forum, Electricity Authority', date: 'August 2017',
		url: 'https://forum.emi.ea.govt.nz/thread/bids-and-offers-data-current-files-to-be-decommissioned-and-replaced-on-28-august-2017/',
		use: 'Bids and offers before 13 December 2012 left out of the published files because of their poor quality.',
		topics: ['capacity'],
	},
	{
		id: 'sos', title: 'Security of supply', by: 'Transpower, system operator',
		url: 'https://transpower.co.nz/system-operator/security-supply',
		use: 'The system operator’s reports on whether there is enough generation, including the New Zealand Generation Balance.',
		topics: ['capacity'],
	},
	// ---------- solar ----------
	{
		id: 'dg-capacity', title: 'Batteries in Installed distributed generation trends', by: 'EMI forum, Electricity Authority',
		url: 'https://forum.emi.ea.govt.nz/thread/batteries-in-installed-distributed-generation-trends/',
		use: 'The registry’s capacity field is meant to hold the lesser of summed generation capacity and the inverter or injection limit.',
		topics: ['embedded-solar'],
	},
	{
		id: 'eeca-dcac', title: 'Solar PV and Battery Capacities and Costs', by: 'Miller, for the Energy Efficiency and Conservation Authority', date: 'January 2025',
		url: 'https://www.eeca.govt.nz/assets/EECA-Resources/Research-papers-guides/Appendix-Five-Solar-PV-capacities-and-costs.pdf',
		use: 'DC:AC ratios of 1.0 and 1.2 for New Zealand homes.',
		topics: ['embedded-solar'],
	},
	{
		id: 'niwa', title: 'Mean daily global radiation across selected New Zealand locations', by: 'NIWA climate averages 1991–2020, on Figure.NZ',
		url: 'https://figure.nz/chart/72IvcxUqOYF0xjMa',
		use: 'Long-term sunshine at Auckland, Wellington, Christchurch and Dunedin, to compare with the satellite.',
		topics: ['embedded-solar'],
	},
	{
		id: 'sa-peak', title: 'Rooftop solar smashes output records in two states, as home batteries dull grid impact in sunny Spring', by: 'RenewEconomy', date: '8 October 2026',
		url: 'https://reneweconomy.com.au/rooftop-solar-smashes-output-records-in-two-states-as-home-batteries-dull-grid-impact-in-sunny-spring/',
		use: 'South Australia’s 2,070 MW rooftop solar peak.',
		topics: ['embedded-solar'],
	},
	{
		id: 'cec', title: 'Rooftop solar and storage report, July–December 2025', by: 'Clean Energy Council', date: '2026',
		url: 'https://cleanenergycouncil.org.au/getmedia/16ed1cff-8ddb-423a-b3ad-3f9fa8e4d594/rooftop-solar-and-storage-biannual-report_july-december-2025.pdf',
		use: 'South Australia’s installed rooftop solar, 2.85 GW at the end of 2025 (figure 4).',
		topics: ['embedded-solar'],
	},
	{
		id: 'pvlib', title: 'pvlib python', by: 'pvlib project',
		url: 'https://pvlib-python.readthedocs.io/',
		use: 'The library the site’s PV model is checked against; its documentation gives the published reference for each model, Hay–Davies among them.',
		topics: ['embedded-solar'],
	},
	{
		id: 'noaa', title: 'Solar calculation details', by: 'NOAA Global Monitoring Laboratory',
		url: 'https://gml.noaa.gov/grad/solcalc/calcdetails.html',
		use: 'The sun position equations.',
		topics: ['embedded-solar'],
	},
	{
		id: 'ashrae', title: 'ASHRAE IAM model', by: 'PV Performance Modeling Collaborative, Sandia National Laboratories',
		url: 'https://pvpmc.sandia.gov/modeling-guide/1-weather-design-inputs/shading-soiling-and-reflection-losses/incident-angle-reflection-losses/ashrae-iam-model/',
		use: 'The reflection losses at low sun angles.',
		topics: ['embedded-solar'],
	},
	{
		id: 'sandia', title: 'Sandia cell temperature model', by: 'PV Performance Modeling Collaborative, Sandia National Laboratories',
		url: 'https://pvpmc.sandia.gov/modeling-guide/2-dc-module-iv/cell-temperature/sandia-cell-temperature-model/',
		use: 'Panel temperature.',
		topics: ['embedded-solar'],
	},
	{
		id: 'pvwatts', title: 'PVWatts Version 5 Manual', by: 'Dobos, National Renewable Energy Laboratory', date: '2014',
		url: 'https://www.osti.gov/biblio/1158421',
		use: 'DC output, the inverter limit and fixed losses.',
		topics: ['embedded-solar'],
	},
];

export const topic = (slug: string) => TOPICS.find((t) => t.slug === slug);
export const sourcesFor = (slug: string) => SOURCES.filter((s) => s.topics.includes(slug));
export const sourceHref = (id: string) => `/methods/sources#${id}`;
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
