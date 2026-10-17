// Data and methods: how each series on the site is built, and every dataset it comes from.
//
// /methods is the overview, /methods/sources lists every dataset (SOURCES below), and each topic has its own page at
// /methods/<slug>, written as one Svelte file in ./pages/<slug>.svelte (ordinary markup, using the classes in
// methods.css). The page's header (title, summary, where it is shown) and its "Data used" box come from TOPICS and
// SOURCES, so a dataset is described once and every page that uses it lists it the same way.
//
// When a method changes: update its page, set `updated` on its topic, and keep the dataset entries in step.
import type { Component } from 'svelte';

export type Topic = {
	slug: string;
	title: string;
	summary: string; // one or two sentences under the title, and on the overview's cards
	shownOn: [string, string][]; // [label, href]: where the series appears on the site
	estimate?: boolean; // modelled rather than measured
	updated: string; // YYYY-MM-DD: when the page was last checked against the code
};

export const TOPICS: Topic[] = [
	{
		slug: 'generation',
		title: 'Generation',
		summary: 'What each plant and fuel is generating: the dispatch data for the live week, metered output for history, each unit mapped to its plant and fuel.',
		shownOn: [['Tracker', '/tracker'], ['Now', '/now']],
		updated: '2026-10-17',
	},
	{
		slug: 'embedded-solar',
		title: 'Embedded solar',
		summary: 'Solar on local networks that isn’t dispatched, mostly rooftops. Nobody measures it as it happens, so it is modelled from installed capacity and satellite sunshine.',
		shownOn: [['Tracker', '/tracker'], ['Now', '/now']],
		estimate: true,
		updated: '2026-10-17',
	},
	{
		slug: 'demand',
		title: 'Demand',
		summary: 'Electricity taken from the grid in each island, with embedded solar added back for underlying demand, and the Tiwai Point smelter on its own.',
		shownOn: [['Tracker', '/tracker'], ['Now', '/now']],
		updated: '2026-10-17',
	},
	{
		slug: 'hvdc',
		title: 'HVDC transfer',
		summary: 'Power flowing between the islands on the HVDC link: metered in history, estimated for the live week because the dispatch data doesn’t include it.',
		shownOn: [['Tracker', '/tracker'], ['Prices', '/tracker/prices'], ['Now', '/now']],
		estimate: true,
		updated: '2026-10-17',
	},
	{
		slug: 'prices',
		title: 'Wholesale prices',
		summary: 'Spot prices at the island reference nodes and four more, dispatch prices for the live week and final prices for history, and the figures the Prices tab derives from them.',
		shownOn: [['Tracker', '/tracker'], ['Prices', '/tracker/prices'], ['Now', '/now']],
		updated: '2026-10-17',
	},
	{
		slug: 'price-explainer',
		title: 'Price explainer',
		summary: 'The “Why is the price high?” panel on the Now page: what counts as usual, when it is highlighted or opens by itself, and how the likely price setter is found.',
		shownOn: [['Now', '/now']],
		updated: '2026-10-17',
	},
	{
		slug: 'emissions',
		title: 'Emissions intensity',
		summary: 'Greenhouse gas per kilowatt-hour generated, from each fuel’s output and emission factor. Every factor the site uses is listed here, with where it comes from.',
		shownOn: [['Tracker', '/tracker'], ['Now', '/now']],
		updated: '2026-10-17',
	},
	{
		slug: 'groupings',
		title: 'Renewable share and groupings',
		summary: 'How fuels are counted as renewable or fossil, flexible or variable, and how plants are grouped by site, hydro scheme and owner.',
		shownOn: [['Tracker', '/tracker'], ['Now', '/now']],
		updated: '2026-10-17',
	},
	{
		slug: 'capacity',
		title: 'Installed capacity',
		summary: 'How much each plant could generate, and when that changed, back to 1997: the basis for the Generation tab’s capacity factors and dispatchable headroom.',
		shownOn: [['Tracker', '/tracker']],
		updated: '2026-10-18',
	},
	{
		slug: 'history',
		title: 'History since 1997',
		summary: 'How the record back to August 1997 is put together from metered data, the daily dispatch files and the live feed, where the sources hand over, and the known gaps.',
		shownOn: [['Tracker', '/tracker'], ['Prices', '/tracker/prices']],
		updated: '2026-10-17',
	},
	{
		slug: 'records',
		title: 'Records',
		summary: 'The highest and lowest half-hours, months and runs since 1997: which data they rest on, when a record is official or provisional, and what is left out.',
		shownOn: [['Records', '/records'], ['Now', '/now']],
		updated: '2026-10-17',
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
		use: 'The live week: generation by unit, island load, prices, the Tiwai smelter (TWI2201). Also the inputs to the HVDC estimate and the price explainer.',
		period: 'The last month or so', fresh: 'Usually 1–2 minutes after each interval starts', licence: CCBY,
		topics: ['generation', 'demand', 'prices', 'hvdc', 'price-explainer', 'history', 'records'],
	},
	{
		id: 'dispatch', name: 'Dispatch prices and volumes', publisher: EA, dataset: 'DispatchAndPricing/NodalPricesAndVolumes',
		url: EMI + 'DispatchAndPricing/NodalPricesAndVolumes',
		what: 'The same dispatch cases as the real-time feed, one file a day, for connection points with load or generation (no bus nodes).',
		use: 'Fills gaps in the live week; history for the weeks since the latest metered month; plants the metering doesn’t have (batteries, new solar farms).',
		period: 'From 10 Sep 2020', fresh: '1–4 days late', licence: CCBY,
		topics: ['generation', 'demand', 'prices', 'history', 'records'],
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
		use: 'The likely price setter in the price explainer, from the final offers of the newest published day; offered capacity for the Generation tab’s dispatchable headroom, every half-hour from 2013.',
		period: 'January 2013 on, daily files', fresh: 'The day after', licence: CCBY,
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
		topics: ['generation', 'demand', 'history', 'capacity', 'records'],
	},
	{
		id: 'embedded', name: 'Embedded generation', publisher: EA, dataset: 'Metered_data/Embedded_generation',
		url: EMI + 'Metered_data/Embedded_generation',
		what: 'Half-hourly energy injected at connection points on local networks.',
		use: 'Stations on local networks before 2009, and their gross output where Generation_MD records it net of local load.',
		period: 'From Oct 1998 (most points from Apr 1999)', fresh: 'About 2 weeks after each month', licence: CCBY,
		topics: ['generation', 'history', 'capacity', 'records'],
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
		use: 'The smelter’s load in history.',
		period: 'From Oct 1996', fresh: 'About 2 weeks after each month', licence: CCBY,
		topics: ['demand', 'history', 'records'],
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
		use: 'Checking the embedded solar model against metered exports, and the output of embedded solar farms.',
		period: 'Monthly', fresh: 'About a week after each month', licence: CCBY, check: true,
		topics: ['embedded-solar'],
	},
	{
		id: 'guehmt', name: 'Installed distributed generation', publisher: EA, dataset: 'Report GUEHMT',
		url: 'https://www.emi.ea.govt.nz/Retail/Reports/GUEHMT',
		what: 'Installed solar on local networks each month, from the registry, by grid exit point (Root NSP), for systems up to 10 kW and over 10 kW.',
		use: 'Embedded solar capacity at each grid exit point.',
		period: 'From Aug 2013', fresh: 'Monthly', licence: CCBY,
		topics: ['embedded-solar', 'history', 'capacity'],
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

export const topic = (slug: string) => TOPICS.find((t) => t.slug === slug);
export const sourcesFor = (slug: string) => SOURCES.filter((s) => s.topics.includes(slug));
export const sourceHref = (id: string) => `/methods/sources#${id}`;

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
