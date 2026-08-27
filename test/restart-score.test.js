const assert = require('node:assert/strict');
const test = require('node:test');
const { MatchTracker } = require('../src/match-tracker');
const { RestartScoreRestorer } = require('../src/restart-score');

function harness() {
  const commands = [];
  return {
    commands,
    gameRcon: { execute: async (command) => commands.push(command) },
  };
}

test('queues restoration until Round_Start and skips a 0-0 score', async () => {
  const tracker = new MatchTracker();
  tracker.startLo3('de_dust2');
  const { commands, gameRcon } = harness();
  const restorer = new RestartScoreRestorer({ matchTracker: tracker, gameRcon });

  assert.equal((await restorer.onRoundStart()).handled, false);
  restorer.queue();
  assert.deepEqual(commands, []);
  const result = await restorer.onRoundStart();
  assert.equal(result.handled, true);
  assert.equal(result.restored, false);
  assert.deepEqual(commands, []);
});

test('restores live and swapped-checkpoint scores after restarts', async () => {
  const tracker = new MatchTracker();
  const { commands, gameRcon } = harness();
  const restorer = new RestartScoreRestorer({ matchTracker: tracker, gameRcon });
  tracker.startLo3('de_dust2');
  tracker.applyRoundResult({ ct: 7, t: 5 });
  tracker.startLo3('de_dust2');

  restorer.queue();
  assert.deepEqual(commands, []);
  const checkpoint = await restorer.onRoundStart();
  assert.equal(checkpoint.command, 'setscore 5 7');

  tracker.applyRoundResult({ ct: 7, t: 8 });
  restorer.queue();
  const live = await restorer.onRoundStart();
  assert.equal(live.command, 'setscore 7 8');
  assert.deepEqual(commands, ['setscore 5 7', 'setscore 7 8']);
});
