const assert = require('node:assert/strict');
const test = require('node:test');
const { formatMatchStatus } = require('../src/match-status');

test('formats the current map, player count, and HLTV recording state', () => {
  const status = formatMatchStatus({
    gameInfo: { map: 'de_dust2', players: 10, maxPlayers: 12 },
    hltvStatus:
      '--- HLTV Status ---\nRecording to match-2608261937-de_dust2.dem, Length 42.2 sec.',
  });

  assert.equal(status, '[Popdog] de_dust2 | 10/12 players | HLTV: recording');
});

test('reports partial status when queries are unavailable and sanitizes map text', () => {
  assert.equal(
    formatMatchStatus({ gameInfo: null, hltvStatus: null, hltvAvailable: false }),
    '[Popdog] unknown | ?/? players | HLTV: unavailable',
  );
  assert.equal(
    formatMatchStatus({
      gameInfo: { map: 'de_dust2; quit', players: 2, maxPlayers: 12 },
      hltvStatus: 'Not recording.',
    }),
    '[Popdog] de_dust2 quit | 2/12 players | HLTV: not recording',
  );
});
