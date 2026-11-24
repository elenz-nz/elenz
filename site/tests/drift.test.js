// Tests for the screen-burn drift (#lib/site/drift.js) on /dashboard and /landscape. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { driftAt, DRIFT_PX, STEP_MS } from '#lib/site/drift.js';

const DAY = 864e5;

test('the offset stays within DRIFT_PX, in whole pixels', () => {
  for (let t = 0; t < DAY; t += STEP_MS) {
    for (const v of driftAt(t)) {
      assert.ok(Number.isInteger(v));
      assert.ok(Math.abs(v) <= DRIFT_PX);
    }
  }
});

test('it moves at most one pixel a step, so nobody sees it move', () => {
  let [px, py] = driftAt(0);
  for (let t = STEP_MS; t < DAY; t += STEP_MS) {
    const [x, y] = driftAt(t);
    assert.ok(Math.abs(x - px) <= 1 && Math.abs(y - py) <= 1, `jumped at ${t}`);
    [px, py] = [x, y];
  }
});

test('over a few hours it visits most of the square', () => {
  const seen = new Set();
  for (let t = 0; t < 4 * 36e5; t += STEP_MS) seen.add(driftAt(t).join());
  assert.ok(seen.size >= 0.6 * (2 * DRIFT_PX + 1) ** 2, `only ${seen.size} positions`);
});
