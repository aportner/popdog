const assert = require('node:assert/strict');
const test = require('node:test');
const { GameCommandRouter } = require('../src/game-command-router');

function chat(message, authId = 'STEAM_0:1:3465') {
  return {
    type: 'chat',
    message,
    player: { name: 'Admin', userId: 1, authId, team: 'CT' },
  };
}

test('executes only fixed commands for an allowed Steam ID', async () => {
  const commands = [];
  const router = new GameCommandRouter({
    rcon: { execute: async (command) => commands.push(command) },
    allowedSteamIds: ['STEAM_0:1:3465'],
  });

  assert.equal((await router.handle(chat('.lo3'))).executed, true);
  assert.equal((await router.handle(chat('  .PREGAME  '))).executed, true);
  assert.deepEqual(commands, ['exec lo3.cfg', 'exec pregame.cfg']);
});

test('denies known commands from an unapproved Steam ID', async () => {
  const commands = [];
  const router = new GameCommandRouter({
    rcon: { execute: async (command) => commands.push(command) },
    allowedSteamIds: ['STEAM_0:1:3465'],
  });

  const result = await router.handle(chat('.lo3', 'STEAM_0:0:999'));
  assert.equal(result.authorized, false);
  assert.deepEqual(commands, []);
});

test('ignores unknown text and suppresses immediate duplicate execution', async () => {
  const commands = [];
  let now = 1000;
  const router = new GameCommandRouter({
    rcon: { execute: async (command) => commands.push(command) },
    allowedSteamIds: ['STEAM_0:1:3465'],
    cooldownMs: 3000,
    now: () => now,
  });

  assert.equal((await router.handle(chat('.lo3; quit'))).matched, false);
  assert.equal((await router.handle(chat('.lo3'))).executed, true);
  assert.equal((await router.handle(chat('.lo3'))).reason, 'cooldown');
  now += 3001;
  assert.equal((await router.handle(chat('.lo3'))).executed, true);
  assert.deepEqual(commands, ['exec lo3.cfg', 'exec lo3.cfg']);
});
