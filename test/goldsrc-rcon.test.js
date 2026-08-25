const assert = require('node:assert/strict');
const dgram = require('node:dgram');
const test = require('node:test');
const { GoldSrcRcon, sanitizeSayText } = require('../src/goldsrc-rcon');

const header = Buffer.from([0xff, 0xff, 0xff, 0xff]);

function packet(text, responseType = null) {
  return Buffer.concat([
    header,
    responseType === null ? Buffer.alloc(0) : Buffer.from([responseType]),
    Buffer.from(text),
    Buffer.from([0]),
  ]);
}

test('sends a command using the GoldSrc RCON challenge protocol', async (t) => {
  const server = dgram.createSocket('udp4');
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.bind(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  t.after(() => server.close());

  const requests = [];
  server.on('message', (message, remote) => {
    const text = message.subarray(4).toString().replace(/\0+$/g, '');
    requests.push(text);
    if (requests.length === 1) {
      server.send(packet('challenge rcon 12345\n'), remote.port, remote.address);
    } else {
      server.send(packet('Console: hello\n', 0x6c), remote.port, remote.address);
    }
  });

  const rcon = new GoldSrcRcon({
    host: '127.0.0.1',
    port: server.address().port,
    password: 'secret',
    timeoutMs: 1000,
  });
  const output = await rcon.execute('say "hello"');

  assert.deepEqual(requests, [
    'challenge rcon',
    'rcon 12345 "secret" say "hello"',
  ]);
  assert.equal(output, 'Console: hello');
});

test('requires an RCON password before opening a socket', async () => {
  const rcon = new GoldSrcRcon({ host: '127.0.0.1', password: null });
  await assert.rejects(rcon.execute('say "hello"'), /not configured/);
});

test('removes console-command delimiters from chat text', () => {
  assert.equal(sanitizeSayText('hello"; quit\nworld\\'), 'hello quitworld');
});
