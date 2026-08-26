const MAP_POLL_QUESTION = 'Map voting time! Please pick your favorites:';
const MAP_POLL_DURATION_HOURS = 24;
const MAP_POLL_OPTIONS = [
  'de_aztec',
  'de_cbble',
  'de_cpl_fire',
  'de_cpl_mill',
  'de_dust2',
  'de_inferno',
  'de_mirage',
  'de_nuke',
  'de_prodigy',
  'de_train',
];

function createMapPoll() {
  return {
    question: { text: MAP_POLL_QUESTION },
    answers: MAP_POLL_OPTIONS.map((text) => ({ text })),
    duration: MAP_POLL_DURATION_HOURS,
    allowMultiselect: true,
  };
}

module.exports = {
  MAP_POLL_DURATION_HOURS,
  MAP_POLL_OPTIONS,
  MAP_POLL_QUESTION,
  createMapPoll,
};
