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

function harness(options = {}) {
  const game = [];
  const hltv = [];
  const hltvOutput = new Map([
    ['record scrim', ''],
    [
      'status',
      '--- HLTV Status ---\nRecording to scrim-2608261937-aim_map_deagle.dem, Length 0.2 sec.',
    ],
    ['stoprecording', 'Completed demo scrim-2608261937-aim_map_deagle.dem.'],
  ]);
  const router = new GameCommandRouter({
    gameRcon: {
      execute: async (command) => {
        game.push(command);
        return '';
      },
    },
    hltvRcon: {
      execute: async (command) => {
        hltv.push(command);
        return hltvOutput.get(command) || '';
      },
    },
    allowedSteamIds: ['STEAM_0:1:3465'],
    recordingPrefix: 'scrim',
    getDiskSpace: async () => '42.5 GiB',
    ...options,
  });
  return { game, hltv, router };
}

test('executes game config commands for an allowed Steam ID', async () => {
  const { game, hltv, router } = harness();

  assert.equal((await router.handle(chat('.lo3'))).executed, true);
  assert.equal((await router.handle(chat('  .PREGAME  '))).executed, true);
  assert.deepEqual(game, ['exec lo3.cfg', 'exec pregame.cfg']);
  assert.deepEqual(hltv, []);
});

test('starts an HLTV recording and announces it through HLTV', async () => {
  const { game, hltv, router } = harness();

  assert.equal((await router.handle(chat('.record'))).executed, true);
  assert.deepEqual(hltv, [
    'record scrim',
    'status',
    'say Start recording to scrim-2608261937-aim_map_deagle.dem. (42.5 GiB free)',
  ]);
  assert.deepEqual(game, []);
});

test('still announces a recording when the disk-space check has no result', async () => {
  const { hltv, router } = harness({ getDiskSpace: async () => null });

  assert.equal((await router.handle(chat('.record'))).executed, true);
  assert.deepEqual(hltv, [
    'record scrim',
    'status',
    'say Start recording to scrim-2608261937-aim_map_deagle.dem.',
  ]);
});

test('both stop aliases stop recording without stopping HLTV', async () => {
  let now = 1000;
  const { hltv, router } = harness({ cooldownMs: 3000, now: () => now });

  assert.equal((await router.handle(chat('.stop'))).executed, true);
  assert.equal((await router.handle(chat('.stoprecording'))).reason, 'cooldown');
  now += 3001;
  assert.equal((await router.handle(chat('.stoprecording'))).executed, true);
  assert.deepEqual(hltv, [
    'stoprecording',
    'say Completed demo scrim-2608261937-aim_map_deagle.dem.',
    'stoprecording',
    'say Completed demo scrim-2608261937-aim_map_deagle.dem.',
  ]);
  assert.equal(hltv.includes('stop'), false);
});

test('does not forward unexpected HLTV output into game chat', async () => {
  const hltv = [];
  const router = new GameCommandRouter({
    gameRcon: { execute: async () => '' },
    hltvRcon: {
      execute: async (command) => {
        hltv.push(command);
        return command === 'record scrim' ? 'Usage: record <filename>; quit' : 'Not recording.';
      },
    },
    recordingPrefix: 'scrim',
    allowedSteamIds: ['STEAM_0:1:3465'],
  });

  await assert.rejects(
    router.handle(chat('.record')),
    /HLTV did not confirm the recording through its status output/,
  );
  assert.deepEqual(hltv, ['record scrim', 'status', 'status', 'status', 'status', 'status']);
});

test('denies known commands from an unapproved Steam ID', async () => {
  const { game, hltv, router } = harness();

  const result = await router.handle(chat('.record', 'STEAM_0:0:999'));
  assert.equal(result.authorized, false);
  assert.deepEqual(game, []);
  assert.deepEqual(hltv, []);
});

test('ignores unknown text and suppresses immediate duplicate execution', async () => {
  const commands = [];
  let now = 1000;
  const router = new GameCommandRouter({
    gameRcon: { execute: async (command) => commands.push(command) },
    hltvRcon: { execute: async () => {} },
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
