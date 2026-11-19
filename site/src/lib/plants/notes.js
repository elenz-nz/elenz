// The Elenz team's own notes on each plant, on the private research page: read and saved through the Worker
// (worker/notes.js, /data/plant-notes), which keeps them in Workers KV, never in the repository. Every call carries the
// research page's key from its address (?key=...) in the x-elenz-key header. docs/architecture.md, Plant pages (the
// research page).

export const NOTES_URL = '/data/plant-notes';
export const MAX_NOTE = 20000;   // as worker/notes.js

/** @typedef {{ text: string, at: number | null }} Note */
/** @typedef {'nokey' | 'badkey' | 'unset' | 'error'} NotesProblem */

/** What the page says when the notes can't be read, by problem. */
export const PROBLEMS = /** @type {Record<NotesProblem, string>} */ ({
  nokey: 'Notes need the page’s key: open this page with ?key=… in its address.',
  badkey: 'The key in this page’s address doesn’t open the notes.',
  unset: 'This address has no key set, so it can’t keep notes (a branch preview needs SCREENS_KEY in its Previews settings).',
  error: 'The notes couldn’t be read just now.',
});

/** The key in the page's address, or ''. */
export const keyOf = (/** @type {string} */ search) => new URLSearchParams(search || '').get('key') || '';

/**
 * Every plant's note: { ok: true, notes } or { ok: false, problem }.
 * @returns {Promise<{ ok: true, notes: Record<string, Note> } | { ok: false, problem: NotesProblem }>}
 */
export async function loadNotes(/** @type {string} */ key, fetcher = fetch) {
  if (!key) return { ok: false, problem: 'nokey' };
  try {
    const r = await fetcher(NOTES_URL, { headers: { 'x-elenz-key': key }, cache: 'no-store' });
    if (r.ok) return { ok: true, notes: (await r.json()).notes ?? {} };
    if (r.status === 404) return { ok: false, problem: 'badkey' };
    if (r.status === 503 && /no key/.test((await r.json().catch(() => ({}))).error ?? '')) return { ok: false, problem: 'unset' };
    return { ok: false, problem: 'error' };
  } catch {
    return { ok: false, problem: 'error' };
  }
}

/**
 * Saves one plant's note. base: the `at` of the note this page last read (null for none), or 'any' to write over
 * whatever is stored. Answers { ok: true, note }, { ok: false, conflict: note } when another device saved since, or
 * { ok: false, error }.
 * @returns {Promise<{ ok: true, note: Note } | { ok: false, conflict: Note | null } | { ok: false, error: string }>}
 */
export async function saveNote(/** @type {string} */ key, /** @type {string} */ slug, /** @type {string} */ text,
  /** @type {number | null | 'any'} */ base, fetcher = fetch) {
  try {
    const r = await fetcher(`${NOTES_URL}/${encodeURIComponent(slug)}`, {
      method: 'PUT', headers: { 'x-elenz-key': key, 'content-type': 'application/json' }, body: JSON.stringify({ text, base }),
    });
    const body = await r.json().catch(() => ({}));
    if (r.ok) return { ok: true, note: body };
    if (r.status === 409) return { ok: false, conflict: body.note ?? null };
    return { ok: false, error: body.error || `not saved (HTTP ${r.status})` };
  } catch {
    return { ok: false, error: 'not saved: no connection' };
  }
}

/** Today's date as a note's line starts, e.g. "19 Nov 2026: ". */
export const dateStamp = (/** @type {Date} */ d = new Date()) =>
  new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'short', year: 'numeric' }).format(d).replace(/\.$/, '') + ': ';

/** When a note was saved, for the page: "saved 19 Nov 2026, 4:40 pm". */
export const savedAt = (/** @type {number | null} */ at) => (at
  ? `saved ${new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(at))}`
  : '');
