const assert = require('node:assert/strict');
const dgram = require('node:dgram');
const { once } = require('node:events');
const test = require('node:test');
const {
  GoldSrcLogReceiver,
  parseLogLine,
  parseLogPacket,
  redactLogLine,
} = require('../src/goldsrc-log-receiver');

const header = Buffer.from([0xff, 0xff, 0xff, 0xff, 0x52]);
const chatLine = 'L 08/25/2026 - 12:34:56: "Ada<3><STEAM_0:1:2><CT>" say ".lo3"';

test('parses GoldSrc log packets and structured chat events', () => {
  const packet = Buffer.concat([header, Buffer.from(`${chatLine}\n\0`)]);
  assert.deepEqual(parseLogPacket(packet), [chatLine]);
  assert.deepEqual(parseLogLine(chatLine), {
    type: 'chat',
    timestamp: '08/25/2026 - 12:34:56',
    message: '.lo3',
    teamOnly: false,
    dead: false,
    player: {
      name: 'Ada',
      userId: 3,
      authId: 'STEAM_0:1:2',
      team: 'CT',
    },
    raw: chatLine,
  });
});

test('parses dead-player chat as a command-capable chat event', () => {
  const deadChatLine =
    'L 08/25/2026 - 12:34:56: "Ada<3><STEAM_0:1:2><CT>" say_team ".rr" (dead)';

  const event = parseLogLine(deadChatLine);
  assert.equal(event.type, 'chat');
  assert.equal(event.message, '.rr');
  assert.equal(event.teamOnly, true);
  assert.equal(event.dead, true);
  assert.equal(event.player.authId, 'STEAM_0:1:2');
});

test('parses cumulative round results and map starts', () => {
  const resultLine =
    'L 08/27/2026 - 15:22:38: Team "TERRORIST" triggered "Hostages_Not_Rescued" (CT "0") (T "1")';
  assert.deepEqual(parseLogLine(resultLine), {
    type: 'round_result',
    timestamp: '08/27/2026 - 15:22:38',
    winner: 'TERRORIST',
    reason: 'Hostages_Not_Rescued',
    ct: 0,
    t: 1,
    raw: resultLine,
  });

  const mapLine = 'L 08/27/2026 - 15:23:00: Started map "de_nuke" (CRC "123")';
  assert.deepEqual(parseLogLine(mapLine), {
    type: 'map_start',
    timestamp: '08/27/2026 - 15:23:00',
    map: 'de_nuke',
    raw: mapLine,
  });
});

test('parses classic GoldSrc log framing', () => {
  const packet = Buffer.concat([
    Buffer.from([0xff, 0xff, 0xff, 0xff]),
    Buffer.from(`log ${chatLine}\n\0`),
  ]);
  assert.deepEqual(parseLogPacket(packet), [chatLine]);
});

test('redacts configured secrets before emitting logs', () => {
  const line = 'Rcon: "rcon 12345 "very-secret" status"';
  assert.equal(
    redactLogLine(line, ['very-secret']),
    'Rcon: "rcon 12345 "[REDACTED]" status"',
  );
});

test('receives a log event over UDP from the allowed host', async (t) => {
  const receiver = new GoldSrcLogReceiver({
    bindHost: '127.0.0.1',
    port: 0,
    allowedHost: '127.0.0.1',
  });
  await receiver.start();
  t.after(() => receiver.close());

  const sender = dgram.createSocket('udp4');
  t.after(() => sender.close());
  const eventPromise = once(receiver, 'chat');
  const packet = Buffer.concat([header, Buffer.from(`${chatLine}\n\0`)]);
  sender.send(packet, receiver.address().port, '127.0.0.1');

  const [event] = await eventPromise;
  assert.equal(event.message, '.lo3');
  assert.equal(event.player.authId, 'STEAM_0:1:2');
});

test('sends NAT keepalives from the same socket that receives logs', async (t) => {
  const server = dgram.createSocket('udp4');
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.bind(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  t.after(() => server.close());

  const keepalivePromise = once(server, 'message');
  const receiver = new GoldSrcLogReceiver({
    bindHost: '127.0.0.1',
    port: 0,
    allowedHost: '127.0.0.1',
    natKeepalive: true,
    keepaliveIntervalMs: 60_000,
    gameHost: '127.0.0.1',
    gamePort: server.address().port,
  });
  await receiver.start();
  t.after(() => receiver.close());

  const [packet, remote] = await keepalivePromise;
  assert.equal(remote.port, receiver.address().port);
  assert.equal(packet.subarray(0, 5).toString('hex'), 'ffffffff54');
});
