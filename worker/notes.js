// /data/plant-notes: the Elenz team's own notes on each plant, written on the private research page (/plants/research)
// and kept by the Worker in Workers KV, never in the repository (design decision, 19 Nov 2026). Every request needs the
// research page's key, the Worker secret SCREENS_KEY, in the x-elenz-key header, on every host: a branch preview opens
// the research page without a key, but the notes live in the same KV namespace as the site (wrangler.jsonc, previews),
// so a preview without the secret has no notes. A wrong or missing key gets 404, like any address that isn't there.
//
//   GET    /data/plant-notes          every plant's note: { notes: { <slug>: { text, at } } } (at: ms since 1970)
//   PUT    /data/plant-notes/<slug>   body { text, base }: saves the note (empty text deletes it) and answers { text, at }.
//                                     base is the `at` the page last read (null for none); if the stored note has changed
//                                     since (another device saved), the answer is 409 with the stored note, and nothing
//                                     is written. base "any" writes over it.
//
// One KV key per plant, plant-notes/<slug>, so two plants' notes never overwrite each other. KV is eventually consistent:
// a note saved on one device can take up to a minute to show on another.

export const NOTES_URL = '/data/plant-notes';
export const NOTES_PREFIX = 'plant-notes/';
export const MAX_NOTE = 20000;   // characters in one note
const MAX_BODY = 100000;         // bytes in a request
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });
const notFound = () => new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });

/** Answers /data/plant-notes and /data/plant-notes/<slug>; null for any other address. */
export async function plantNotes(request, env, url, { keyMatches, siteHost }) {
  const path = url.pathname;
  if (path !== NOTES_URL && !path.startsWith(NOTES_URL + '/')) return null;
  // a preview with no key set says so, so its research page can explain; on elenz.co.nz it's a plain 404
  if (!env.SCREENS_KEY && url.hostname !== siteHost) return json({ error: 'no key is set for this address' }, 503);
  if (!(await keyMatches(request.headers.get('x-elenz-key'), env.SCREENS_KEY))) return notFound();
  if (!env.DATA) return json({ error: 'the notes store is not connected' }, 503);
  try {
    if (path === NOTES_URL) {
      if (request.method !== 'GET') return new Response(null, { status: 405, headers: { allow: 'GET' } });
      return json({ notes: await readAll(env.DATA) });
    }
    const slug = decodeURIComponent(path.slice(NOTES_URL.length + 1));
    if (!SLUG.test(slug) || slug.length > 80) return notFound();
    if (request.method !== 'PUT') return new Response(null, { status: 405, headers: { allow: 'PUT' } });
    if (Number(request.headers.get('content-length') || 0) > MAX_BODY) return json({ error: 'too long' }, 413);
    const raw = await request.text();
    if (raw.length > MAX_BODY) return json({ error: 'too long' }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: 'not JSON' }, 400); }
    if (!body || typeof body.text !== 'string') return json({ error: 'text missing' }, 400);
    const text = body.text.replace(/\r\n?/g, '\n').replace(/\s+$/, '');
    if (text.length > MAX_NOTE) return json({ error: `a note can be at most ${MAX_NOTE} characters` }, 413);
    const key = NOTES_PREFIX + slug;
    if (body.base !== 'any') {
      const now = await env.DATA.get(key, 'json');
      if ((now?.at ?? null) !== (body.base ?? null)) return json({ conflict: true, note: now }, 409);
    }
    if (!text) {
      await env.DATA.delete(key);
      return json({ text: '', at: null });
    }
    const note = { text, at: Date.now() };
    await env.DATA.put(key, JSON.stringify(note), { metadata: { at: note.at } });
    return json(note);
  } catch (e) {
    console.log(`plant notes: ${e && e.message}`);
    return json({ error: 'the notes store could not be reached; try again in a minute' }, 503);
  }
}

/** Every note, by plant: list the keys, then read each (only plants with a note have a key). */
async function readAll(DATA) {
  const names = [];
  let cursor;
  do {
    const page = await DATA.list({ prefix: NOTES_PREFIX, cursor });
    names.push(...page.keys.map((k) => k.name));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  const notes = {};
  await Promise.all(names.map(async (name) => {
    const n = await DATA.get(name, 'json');
    if (n && typeof n.text === 'string' && n.text) notes[name.slice(NOTES_PREFIX.length)] = n;
  }));
  return notes;
}
