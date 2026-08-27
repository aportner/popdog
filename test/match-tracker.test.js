const assert = require('node:assert/strict');
const test = require('node:test');
const { MatchTracker } = require('../src/match-tracker');

test('tracks an MR12 match across halftime using current CT and T sides', () => {
  const tracker = new MatchTracker();
  tracker.startLo3('de_dust2');

  assert.equal(tracker.applyRoundResult({ ct: 6, t: 5 }).announcement,
    'Round over. Score: CT 6-5 T. Next round is the final round of the half.');
  const halftime = tracker.applyRoundResult({ ct: 7, t: 5 });
  assert.equal(halftime.halftime, true);
  assert.equal(halftime.announcement, 'Halftime: CT 7-5 T. Swap sides and use .lo3.');
  assert.equal(tracker.snapshot().phase, 'halftime');
  assert.equal(tracker.statusText(), 'Match: CT 7-5 T (halftime)');

  tracker.startLo3('de_dust2');
  assert.equal(tracker.snapshot().phase, 'second_half');
  assert.equal(tracker.statusText(), 'Match: CT 5-7 T (second half)');
  assert.deepEqual(tracker.restartScore(), { ct: 5, t: 7 });
  assert.equal(tracker.applyRoundResult({ ct: 8, t: 11 }).announcement,
    'Round over. Score: CT 8-11 T.');
  const final = tracker.applyRoundResult({ ct: 8, t: 13 });
  assert.equal(final.complete, true);
  assert.equal(final.announcement, 'Final: CT 8-13 T.');
  assert.equal(tracker.snapshot().phase, 'pregame');
  assert.deepEqual(tracker.snapshot().lastCompleted.t, 13);
});

test('repeated LO3 discards only the provisional current-half score', () => {
  const tracker = new MatchTracker();
  tracker.startLo3('de_nuke');
  assert.equal(tracker.restartScore(), null);
  tracker.applyRoundResult({ ct: 2, t: 0 });
  assert.deepEqual(tracker.restartScore(), { ct: 2, t: 0 });
  const restartedFirst = tracker.startLo3('de_nuke');
  assert.match(restartedFirst.announcement, /CT 2-0 T was discarded/);
  assert.deepEqual(tracker.snapshot().currentHalf, { ct: 0, t: 0 });
  assert.equal(tracker.restartScore(), null);

  tracker.applyRoundResult({ ct: 7, t: 5 });
  tracker.startLo3('de_nuke');
  tracker.applyRoundResult({ ct: 6, t: 9 });
  tracker.startLo3('de_nuke');
  assert.deepEqual(tracker.snapshot().firstHalf, { ct: 7, t: 5 });
  assert.deepEqual(tracker.snapshot().currentHalf, { ct: 0, t: 0 });
  assert.equal(tracker.snapshot().phase, 'second_half');
  assert.deepEqual(tracker.restartScore(), { ct: 5, t: 7 });
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

test('suspended second-half status retains the swapped CT and T score', () => {
  const tracker = new MatchTracker();
  tracker.startLo3('de_train');
  tracker.applyRoundResult({ ct: 7, t: 5 });
  tracker.startLo3('de_train');
  tracker.applyRoundResult({ ct: 7, t: 8 });
  tracker.enterPregame();

  assert.equal(tracker.statusText(), 'Match: CT 7-8 T (suspended)');
});

test('cumulative scores are idempotent and a regulation tie remains active', () => {
  const tracker = new MatchTracker();
  tracker.startLo3('de_inferno');
  assert.equal(tracker.applyRoundResult({ ct: 1, t: 0 }).changed, true);
  assert.equal(tracker.applyRoundResult({ ct: 1, t: 0 }).duplicate, true);
  tracker.applyRoundResult({ ct: 6, t: 6 });
  tracker.startLo3('de_inferno');
  const tied = tracker.applyRoundResult({ ct: 12, t: 12 });
  assert.equal(tied.tied, true);
  assert.equal(tracker.snapshot().phase, 'tied');
  assert.equal(tracker.statusText(), 'Match: CT 12-12 T (tied)');
});

test('announces match point when exactly one side reaches MR12', () => {
  const halftimeMatchPoint = new MatchTracker();
  halftimeMatchPoint.startLo3('de_nuke');
  const halftime = halftimeMatchPoint.applyRoundResult({ ct: 12, t: 0 });
  assert.equal(
    halftime.announcement,
    'Halftime: CT 12-0 T. Match point. Swap sides and use .lo3.',
  );

  const secondHalfMatchPoint = new MatchTracker();
  secondHalfMatchPoint.startLo3('de_nuke');
  secondHalfMatchPoint.applyRoundResult({ ct: 6, t: 6 });
  secondHalfMatchPoint.startLo3('de_nuke');
  const round = secondHalfMatchPoint.applyRoundResult({ ct: 11, t: 12 });
  assert.equal(
    round.announcement,
    'Round over. Score: CT 11-12 T. Match point. Next round is the final round of the half.',
  );
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
