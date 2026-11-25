// readUpTo (worker/body.js): a body sent without a length (chunked) is read no further than the limit.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readUpTo } from '../body.js';

const chunks = (...parts) => new ReadableStream({
  start(c) { for (const p of parts) c.enqueue(new TextEncoder().encode(p)); c.close(); },
});
const post = (body) => new Request('https://elenz.co.nz/data/beat', { method: 'POST', body, duplex: 'half' });

test('a body within the limit is read whole, across chunks', async () => {
  assert.equal(await readUpTo(post(chunks('{"p":', '"now"}')), 200), '{"p":"now"}');
  assert.equal(await readUpTo(post('x'.repeat(200)), 200), 'x'.repeat(200));
  assert.equal(await readUpTo(new Request('https://elenz.co.nz/data/beat'), 200), '');
});

test('a longer body gives null, and reading stops once past the limit', async () => {
  let pulled = 0;
  const endless = new ReadableStream({ pull(c) { pulled += 1; c.enqueue(new Uint8Array(100)); } });
  assert.equal(await readUpTo(post(endless), 200), null);
  assert.ok(pulled < 10, `read ${pulled} chunks`);
  assert.equal(await readUpTo(post('x'.repeat(201)), 200), null);
});
