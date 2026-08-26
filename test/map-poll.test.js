const assert = require('node:assert/strict');
const test = require('node:test');
const {
  MAP_POLL_DURATION_HOURS,
  MAP_POLL_OPTIONS,
  MAP_POLL_QUESTION,
  createMapPoll,
} = require('../src/map-poll');

test('builds the standard 24-hour multiselect map poll', () => {
  assert.deepEqual(createMapPoll(), {
    question: { text: 'Map voting time! Please pick your favorites:' },
    answers: [
      { text: 'de_aztec' },
      { text: 'de_cbble' },
      { text: 'de_cpl_fire' },
      { text: 'de_cpl_mill' },
      { text: 'de_dust2' },
      { text: 'de_inferno' },
      { text: 'de_mirage' },
      { text: 'de_nuke' },
      { text: 'de_prodigy' },
      { text: 'de_train' },
    ],
    duration: 24,
    allowMultiselect: true,
  });
  assert.equal(MAP_POLL_QUESTION, 'Map voting time! Please pick your favorites:');
  assert.equal(MAP_POLL_DURATION_HOURS, 24);
  assert.equal(MAP_POLL_OPTIONS.length, 10);
});

test('returns fresh poll data for each interaction', () => {
  const first = createMapPoll();
  const second = createMapPoll();

  assert.notEqual(first, second);
  assert.notEqual(first.answers, second.answers);
  assert.notEqual(first.answers[0], second.answers[0]);
});
