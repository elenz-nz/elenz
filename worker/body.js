// Reading a request's body with a limit, for the addresses anyone can post to (worker/index.js, the heartbeat).
// No imports, so tests/body.test.js runs it in Node.

// A request's body as text, read no further than max bytes (null if it's longer): a body sent without a length isn't
// read whole into memory.
export async function readUpTo(request, max) {
  if (!request.body) return '';
  const reader = request.body.getReader(), parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) { reader.releaseLock(); return null; }   // the rest is left unread
    parts.push(value);
  }
  const all = new Uint8Array(n);
  let at = 0;
  for (const p of parts) { all.set(p, at); at += p.byteLength; }
  return new TextDecoder().decode(all);
}
