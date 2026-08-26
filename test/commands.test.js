const assert = require('node:assert/strict');
const test = require('node:test');
const { commands } = require('../src/commands');

test('registers the mappoll guild command without user-supplied options', () => {
  const mappoll = commands.find((command) => command.name === 'mappoll');

  assert.ok(mappoll);
  assert.equal(mappoll.description, 'Start the standard 24-hour map vote');
  assert.deepEqual(mappoll.contexts, [0]);
  assert.deepEqual(mappoll.options, []);
});
