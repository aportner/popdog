const assert = require('node:assert/strict');
const test = require('node:test');
const { MatchTracker } = require('../src/match-tracker');

test('tracks an MR12 match across halftime using logical teams', () => {
  const tracker = new MatchTracker();
  tracker.startLo3('de_dust2');

  assert.equal(tracker.applyRoundResult({ ct: 6, t: 5 }).announcement,
    'Team A 6-5 Team B. Next round is the final round of the half.');
  assert.equal(tracker.applyRoundResult({ ct: 7, t: 5 }).halftime, true);
  assert.equal(tracker.snapshot().phase, 'halftime');

  tracker.startLo3('de_dust2');
  assert.equal(tracker.snapshot().phase, 'second_half');
  assert.equal(tracker.applyRoundResult({ ct: 3, t: 4 }).announcement,
    'Team A 11-8 Team B.');
  const final = tracker.applyRoundResult({ ct: 3, t: 6 });
  assert.equal(final.complete, true);
  assert.equal(final.announcement, 'Final: Team A 13-8 Team B.');
  assert.equal(tracker.snapshot().phase, 'pregame');
  assert.deepEqual(tracker.snapshot().lastCompleted.teamA, 13);
});

test('repeated LO3 discards only the provisional current-half score', () => {
  const tracker = new MatchTracker();
  tracker.startLo3('de_nuke');
  tracker.applyRoundResult({ ct: 2, t: 0 });
  const restartedFirst = tracker.startLo3('de_nuke');
  assert.match(restartedFirst.announcement, /2-0 was discarded/);
  assert.deepEqual(tracker.snapshot().currentHalf, { ct: 0, t: 0 });

  tracker.applyRoundResult({ ct: 7, t: 5 });
  tracker.startLo3('de_nuke');
  tracker.applyRoundResult({ ct: 1, t: 2 });
  tracker.startLo3('de_nuke');
  assert.deepEqual(tracker.snapshot().firstHalf, { ct: 7, t: 5 });
  assert.deepEqual(tracker.snapshot().currentHalf, { ct: 0, t: 0 });
  assert.equal(tracker.snapshot().phase, 'second_half');
});

test('pregame suspends and LO3 resumes the same half from zero', () => {
  const tracker = new MatchTracker();
  tracker.startLo3('de_train');
  tracker.applyRoundResult({ ct: 3, t: 2 });
  tracker.enterPregame();
  assert.equal(tracker.snapshot().phase, 'suspended');
  tracker.startLo3('de_train');
  assert.equal(tracker.snapshot().phase, 'first_half');
  assert.deepEqual(tracker.snapshot().currentHalf, { ct: 0, t: 0 });
});

test('cumulative scores are idempotent and a regulation tie remains active', () => {
  const tracker = new MatchTracker();
  tracker.startLo3('de_inferno');
  assert.equal(tracker.applyRoundResult({ ct: 1, t: 0 }).changed, true);
  assert.equal(tracker.applyRoundResult({ ct: 1, t: 0 }).duplicate, true);
  tracker.applyRoundResult({ ct: 6, t: 6 });
  tracker.startLo3('de_inferno');
  const tied = tracker.applyRoundResult({ ct: 6, t: 6 });
  assert.equal(tied.tied, true);
  assert.equal(tracker.snapshot().phase, 'tied');
  assert.equal(tracker.statusText(), 'Match: Team A 12-12 Team B (tied)');
});

test('map changes discard provisional matches but suspend checkpoints', () => {
  const provisional = new MatchTracker();
  provisional.startLo3('de_dust2');
  provisional.applyRoundResult({ ct: 2, t: 1 });
  provisional.changeMap('de_nuke');
  assert.equal(provisional.snapshot().phase, 'pregame');

  const checkpointed = new MatchTracker();
  checkpointed.startLo3('de_dust2');
  checkpointed.applyRoundResult({ ct: 7, t: 5 });
  const changed = checkpointed.changeMap('de_nuke');
  assert.equal(changed.changed, true);
  assert.equal(checkpointed.snapshot().phase, 'suspended');
  assert.deepEqual(checkpointed.snapshot().firstHalf, { ct: 7, t: 5 });
});
