// The power landscape's view (/landscape): which mode it opens in, what shows on the picture and how fast the replay
// runs. Kept in the address, so a link (or a wall-screen link, with kiosk=1) opens the same view, and in this browser
// (localStorage `elenz-landscape`, on /privacy), as the dashboards keep their layout (dashboard/layout.js).

export const STORE_KEY = 'elenz-landscape';
export const MODES = ['now', 'replay', 'play'];
/** How long the 24-hour replay takes, in minutes. */
export const SPEEDS = [1, 3, 10];
/** cards: null follows the mode (the pop-up cards are off in the replay, which moves too fast to read them, and on
 * otherwise); true or false is the viewer's own choice for this mode. */
export const DEFAULT = Object.freeze({ mode: 'now', names: true, numbers: true, birds: true, calm: false, cards: null, speed: 1 });

/** Whether the pop-up cards show. */
export const cardsOn = (p) => (p.cards == null ? p.mode !== 'replay' : p.cards);

/** Any stored or linked view made safe: unknown values fall back to the default. */
export function clean(p) {
	const v = p && typeof p === 'object' ? p : {};
	const bool = (x, d) => (typeof x === 'boolean' ? x : d);
	return {
		mode: MODES.includes(v.mode) ? v.mode : DEFAULT.mode,
		names: bool(v.names, DEFAULT.names),
		numbers: bool(v.numbers, DEFAULT.numbers),
		birds: bool(v.birds, DEFAULT.birds),
		calm: bool(v.calm, DEFAULT.calm),
		cards: typeof v.cards === 'boolean' ? v.cards : null,
		speed: SPEEDS.includes(v.speed) ? v.speed : DEFAULT.speed,
	};
}

const FLAGS = ['names', 'numbers', 'birds', 'calm', 'cards'];
/** The view in an address (mode, names=0, numbers=0, birds=0, calm=1, cards=0 or 1, speed=3), or null when the address
 * says nothing about it. */
export function fromQuery(q) {
	if (!['mode', ...FLAGS, 'speed'].some((k) => q.has(k))) return null;
	const p = { mode: q.get('mode'), speed: Number(q.get('speed')) };
	for (const k of FLAGS) if (q.has(k)) p[k] = q.get(k) === '1';
	return clean(p);
}

/** The view as an address query: only what differs from the default, so a plain link stays plain. */
export function toQuery(p, extra = {}) {
	const v = clean(p), q = new URLSearchParams();
	if (v.mode !== DEFAULT.mode) q.set('mode', v.mode);
	for (const k of FLAGS) if (v[k] !== DEFAULT[k] && v[k] != null) q.set(k, v[k] ? '1' : '0');
	if (v.speed !== DEFAULT.speed) q.set('speed', String(v.speed));
	for (const [k, x] of Object.entries(extra)) if (x) q.set(k, x);
	const s = q.toString();
	return s ? '?' + s : '';
}

export function load() {
	try { return clean(JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null')); } catch { return clean(null); }
}
export function save(p) {
	try { localStorage.setItem(STORE_KEY, JSON.stringify(clean(p))); } catch { /* private mode or full: the address still holds it */ }
}
