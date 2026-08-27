const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { MatchStateStore } = require('../src/match-state-store');

test('atomically persists and reloads match state', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'popdog-match-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new MatchStateStore(path.join(directory, 'nested', 'match.json'));
  const state = { version: 1, phase: 'first_half', currentHalf: { ct: 2, t: 1 } };

  assert.equal(await store.load(), null);
  await store.save(state);
  assert.deepEqual(await store.load(), state);
});
