const assert = require('node:assert/strict');
const test = require('node:test');
const {
  logTarget,
  registerLogTarget,
  unregisterLogTarget,
} = require('../src/log-registration');

test('registers and unregisters one exact ReHLDS log destination', async () => {
  const commands = [];
  const rcon = { execute: async (command) => commands.push(command) };

  await registerLogTarget(rcon, '203.0.113.8', 27500);
  await unregisterLogTarget(rcon, '203.0.113.8', 27500);

  assert.deepEqual(commands, [
    'logaddress_del 203.0.113.8 27500',
    'log on',
    'logaddress_add 203.0.113.8 27500',
    'logaddress_del 203.0.113.8 27500',
  ]);
});

test('rejects command delimiters in advertised log hosts', () => {
  assert.throws(() => logTarget('127.0.0.1;quit', 27500), /IPv4 address or hostname/);
});
