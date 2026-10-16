// Shared data and helpers for the "Inside the wholesale market" series (the posts whose meta has series: 'wholesale-market').
// The figures come from analysis/wholesale_prices.py, which writes ../data/wholesale-prices.json (all parts) and
// ../data/wholesale-months.json (Part 4's month charts), and prints every figure quoted in the text.
import D from '../data/wholesale-prices.json';
import { num } from '../charts/util.js';

export { D };
export const SERIES = 'wholesale-market';

export const dollars = (v: number) => `$${num(v)}/MWh`;
const MON = new Intl.DateTimeFormat('en-NZ', { month: 'long', year: 'numeric', timeZone: 'UTC' });
export const monthName = (ym: string) => MON.format(new Date(ym + '-01T00:00:00Z'));

// the site's fuel colours and names, in stack order
export const FUELS = [
	{ k: 'geo', name: 'Geothermal', tok: '--f-geo' },
	{ k: 'coal', name: 'Coal/gas, Rankine', tok: '--f-coal' },
	{ k: 'gas', name: 'Gas', tok: '--f-gas' },
	{ k: 'diesel', name: 'Diesel', tok: '--f-diesel' },
	{ k: 'hydro', name: 'Hydro', tok: '--f-hydro' },
	{ k: 'wind', name: 'Wind', tok: '--f-wind' },
	{ k: 'solar', name: 'Solar', tok: '--f-solar' },
	{ k: 'batt', name: 'Battery', tok: '--f-batt' },
];

// the cover every part shares: each month's Haywards price since 1996, under the part's own title
export const cover = (part: number, title: string[]) => ({
	values: D.months.HAY, start: D.months.start, title,
	kicker: `Inside the wholesale market · Part ${part}`,
	note: "Each column is one month's average price at Haywards, 1996–2026",
});

// the slugs of the parts, so each can link to the others by name
export const PARTS = {
	works: '/articles/how-the-wholesale-market-works',
	history: '/articles/thirty-years-of-wholesale-prices',
	water: '/articles/water-gas-and-the-price',
	extremes: '/articles/the-most-expensive-and-cheapest-months',
	money: '/articles/where-the-money-is-made',
	bill: '/articles/from-the-wholesale-price-to-your-power-bill',
	when: '/articles/when-and-where-the-price-changes',
};
