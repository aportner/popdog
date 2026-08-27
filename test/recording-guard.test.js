const assert = require('node:assert/strict');
const test = require('node:test');
const { RecordingGuard } = require('../src/recording-guard');

function harness(options = {}) {
  const stops = [];
  let now = 1000;
  let players = 3;
  let freeBytes = 20 * 1024 ** 3;
  const guard = new RecordingGuard({
    gameServer: { info: async () => ({ players, bots: 0 }) },
    hltvRcon: {
      execute: async () =>
        'Recording to match-2608271536-de_dust2.dem, Length 10.0 sec.',
    },
    diskPath: '/demos',
    minimumPlayers: 3,
    lowPlayerGraceMs: 5000,
    minimumFreeBytes: 5 * 1024 ** 3,
    getAvailableBytes: async () => freeBytes,
    now: () => now,
    onStop: async (reason) => stops.push(reason),
    ...options,
  });
  return {
    guard,
    stops,
    setNow: (value) => { now = value; },
    setPlayers: (value) => { players = value; },
    setFreeBytes: (value) => { freeBytes = value; },
  };
}

test('stops recording after the low-human-player grace period', async () => {
  const { guard, stops, setNow, setPlayers } = harness();
  // Three reported slots means two humans after excluding the HLTV proxy.
  setPlayers(3);
  assert.equal(await guard.check(), null);
  setNow(5999);
  assert.equal(await guard.check(), null);
  setNow(6000);
  assert.match(await guard.check(), /below 3 human players/);
  assert.equal(stops.length, 1);
});

test('cancels the low-player timer when the population recovers', async () => {
  const { guard, stops, setNow, setPlayers } = harness();
  setPlayers(2);
  await guard.check();
  setNow(4000);
  setPlayers(4);
  await guard.check();
  setNow(10_000);
  setPlayers(2);
  await guard.check();
  assert.deepEqual(stops, []);
});

test('stops immediately below the configured free-space floor', async () => {
  const { guard, stops, setFreeBytes } = harness();
  setFreeBytes(4 * 1024 ** 3);
  assert.match(await guard.check(), /disk space fell below 5 GiB/);
  assert.equal(stops.length, 1);
});

test('does nothing when HLTV is not recording', async () => {
  const { guard, stops } = harness({
    hltvRcon: { execute: async () => 'Not recording.' },
  });
  assert.equal(await guard.check(), null);
  assert.deepEqual(stops, []);
});
