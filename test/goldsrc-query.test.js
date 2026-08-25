const assert = require('node:assert/strict');
const dgram = require('node:dgram');
const test = require('node:test');
const { GoldSrcQuery, parseInfoPacket } = require('../src/goldsrc-query');

const header = Buffer.from([0xff, 0xff, 0xff, 0xff]);

function sourceInfoPacket() {
  return Buffer.concat([
    header,
    Buffer.from([0x49, 48]),
    Buffer.from('Popdog Test\0de_dust2\0cstrike\0Counter-Strike\0'),
    Buffer.from([10, 0, 7, 32, 1]),
    Buffer.from('d'),
    Buffer.from('l'),
    Buffer.from([0, 1]),
    Buffer.from('1.1.2.7/Stdio\0'),
  ]);
}

test('parses a Source-style ReHLDS information response', () => {
  const info = parseInfoPacket(sourceInfoPacket());
  assert.equal(info.name, 'Popdog Test');
  assert.equal(info.map, 'de_dust2');
  assert.equal(info.players, 7);
  assert.equal(info.maxPlayers, 32);
  assert.equal(info.vacSecured, true);
  assert.equal(info.version, '1.1.2.7/Stdio');
});

test('parses a classic GoldSrc information response', () => {
  const packet = Buffer.concat([
    header,
    Buffer.from([0x6d]),
    Buffer.from('127.0.0.1:27015\0Popdog Classic\0de_nuke\0cstrike\0Counter-Strike\0'),
    Buffer.from([5, 16, 48]),
    Buffer.from('d'),
    Buffer.from('l'),
    Buffer.from([1, 0, 1, 0]),
  ]);

  const info = parseInfoPacket(packet);
  assert.equal(info.name, 'Popdog Classic');
  assert.equal(info.map, 'de_nuke');
  assert.equal(info.players, 5);
  assert.equal(info.maxPlayers, 16);
  assert.equal(info.passwordProtected, true);
  assert.equal(info.vacSecured, true);
});

test('answers an A2S_INFO challenge and returns server status', async (t) => {
  const server = dgram.createSocket('udp4');
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.bind(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  t.after(() => server.close());

  let requests = 0;
  server.on('message', (message, remote) => {
    requests += 1;
    if (requests === 1) {
      server.send(Buffer.concat([header, Buffer.from([0x41, 1, 2, 3, 4])]), remote.port, remote.address);
    } else {
      assert.deepEqual(message.subarray(-4), Buffer.from([1, 2, 3, 4]));
      server.send(sourceInfoPacket(), remote.port, remote.address);
    }
  });

  const query = new GoldSrcQuery({
    host: '127.0.0.1',
    port: server.address().port,
    timeoutMs: 1000,
  });
  const info = await query.info();

  assert.equal(requests, 2);
  assert.equal(info.name, 'Popdog Test');
  assert.equal(typeof info.pingMs, 'number');
});
