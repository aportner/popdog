const assert = require('node:assert/strict');
const test = require('node:test');
const { GameCommandRouter } = require('../src/game-command-router');
const { parseLogLine } = require('../src/goldsrc-log-receiver');

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

test('executes commands from an allowed dead player', async () => {
  const { game, router } = harness({ allowedSteamIds: ['STEAM_0:1:2'] });
  const event = parseLogLine(
    'L 08/25/2026 - 12:34:56: "Ada<3><STEAM_0:1:2><CT>" say ".cal" (dead)',
  );

  assert.equal((await router.handle(event)).executed, true);
  assert.deepEqual(game, ['exec cal.cfg']);
});

test('executes CAL and restart commands, with aliases sharing a cooldown', async () => {
  let now = 1000;
  const { game, router } = harness({ cooldownMs: 3000, now: () => now });

  assert.equal((await router.handle(chat('.cal'))).executed, true);
  assert.equal((await router.handle(chat('.calot'))).executed, true);
  assert.equal((await router.handle(chat('.ot'))).reason, 'cooldown');
  assert.equal((await router.handle(chat('.rr'))).executed, true);
  assert.equal((await router.handle(chat('.rr1'))).reason, 'cooldown');
  assert.equal((await router.handle(chat('.rr3'))).executed, true);
  now += 3001;
  assert.equal((await router.handle(chat('.ot'))).executed, true);
  assert.equal((await router.handle(chat('.rr1'))).executed, true);
  assert.deepEqual(game, [
    'exec cal.cfg',
    'exec calot.cfg',
    'sv_restart 1',
    'sv_restart 3',
    'exec calot.cfg',
    'sv_restart 1',
  ]);
});

test('changes to a validated map through either alias', async () => {
  let now = 1000;
  const { game, router } = harness({ cooldownMs: 3000, now: () => now });

  assert.equal((await router.handle(chat('.map de_dust2'))).executed, true);
  assert.equal((await router.handle(chat('.changelevel de_nuke'))).reason, 'cooldown');
  now += 3001;
  assert.equal((await router.handle(chat(' .CHANGELEVEL de-nuke '))).executed, true);
  assert.deepEqual(game, ['changelevel de_dust2', 'changelevel de-nuke']);
});

test('rejects unsafe or malformed map names without sending RCON', async () => {
  const { game, router } = harness();

  for (const command of [
    '.map',
    '.map de_dust2; quit',
    '.changelevel de_dust2.cfg',
    '.map ../de_dust2',
    `.map ${'a'.repeat(65)}`,
  ]) {
    assert.equal((await router.handle(chat(command))).matched, false);
  }
  assert.deepEqual(game, []);
});

test('sets team scores from validated signed 32-bit integers', async () => {
  let now = 1000;
  const { game, router } = harness({ cooldownMs: 3000, now: () => now });

  assert.equal((await router.handle(chat('.setscore 12 9'))).executed, true);
  assert.equal((await router.handle(chat('.score 13 10'))).reason, 'cooldown');
  now += 3001;
  assert.equal((await router.handle(chat(' .SCORE +001 -2 '))).executed, true);
  assert.deepEqual(game, ['setscore 12 9', 'setscore 1 -2']);
});

test('rejects unsafe or malformed score arguments without sending RCON', async () => {
  const { game, router } = harness();

  for (const command of [
    '.setscore',
    '.setscore 1',
    '.setscore 1 2 3',
    '.setscore 1.5 2',
    '.setscore 1 2; quit',
    '.setscore 2147483648 0',
    '.setscore 0 -2147483649',
    '.score 1 2; quit',
  ]) {
    assert.equal((await router.handle(chat(command))).matched, false);
  }
  assert.deepEqual(game, []);
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
