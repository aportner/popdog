const dgram = require('node:dgram');

const CONNECTIONLESS_HEADER = Buffer.from([0xff, 0xff, 0xff, 0xff]);
const INFO_REQUEST = Buffer.concat([
  CONNECTIONLESS_HEADER,
  Buffer.from([0x54]),
  Buffer.from('Source Engine Query\0', 'ascii'),
]);

class PacketReader {
  constructor(buffer, offset = 0) {
    this.buffer = buffer;
    this.offset = offset;
  }

  ensure(bytes) {
    if (this.offset + bytes > this.buffer.length) {
      throw new Error('ReHLDS returned a truncated status packet');
    }
  }

  byte() {
    this.ensure(1);
    return this.buffer[this.offset++];
  }

  uint16() {
    this.ensure(2);
    const value = this.buffer.readUInt16LE(this.offset);
    this.offset += 2;
    return value;
  }

  string() {
    const end = this.buffer.indexOf(0, this.offset);
    if (end === -1) throw new Error('ReHLDS returned an invalid status string');
    const value = this.buffer.toString('utf8', this.offset, end);
    this.offset = end + 1;
    return value;
  }

  character() {
    return String.fromCharCode(this.byte());
  }
}

function parseSourceInfo(reader) {
  const protocol = reader.byte();
  const name = reader.string();
  const map = reader.string();
  const folder = reader.string();
  const game = reader.string();
  reader.uint16(); // Steam application ID
  const players = reader.byte();
  const maxPlayers = reader.byte();
  const bots = reader.byte();
  const serverType = reader.character();
  const environment = reader.character();
  const visibility = reader.byte();
  const vac = reader.byte();
  const version = reader.string();

  return {
    name,
    map,
    folder,
    game,
    players,
    maxPlayers,
    bots,
    protocol,
    serverType,
    environment,
    passwordProtected: visibility === 1,
    vacSecured: vac === 1,
    version,
  };
}

function parseLegacyInfo(reader) {
  const address = reader.string();
  const name = reader.string();
  const map = reader.string();
  const folder = reader.string();
  const game = reader.string();
  const players = reader.byte();
  const maxPlayers = reader.byte();
  const protocol = reader.byte();
  const serverType = reader.character();
  const environment = reader.character();
  const visibility = reader.byte();

  // Legacy packets may include a mod-info section before VAC/bot counts.
  const isMod = reader.byte();
  if (isMod) {
    reader.string();
    reader.string();
    // Empty field, mod version, download size, server-only flag, custom-DLL flag.
    reader.ensure(11);
    reader.offset += 11;
  }

  const vac = reader.offset < reader.buffer.length ? reader.byte() : 0;
  const bots = reader.offset < reader.buffer.length ? reader.byte() : 0;

  return {
    address,
    name,
    map,
    folder,
    game,
    players,
    maxPlayers,
    bots,
    protocol,
    serverType,
    environment,
    passwordProtected: visibility === 1,
    vacSecured: vac === 1,
    version: null,
  };
}

function parseInfoPacket(message) {
  if (message.length < 5 || !message.subarray(0, 4).equals(CONNECTIONLESS_HEADER)) {
    throw new Error('ReHLDS returned an invalid status packet');
  }

  const reader = new PacketReader(message, 5);
  const responseType = message[4];
  if (responseType === 0x49) return parseSourceInfo(reader);
  if (responseType === 0x6d) return parseLegacyInfo(reader);
  throw new Error(`Unexpected ReHLDS status response type: 0x${responseType.toString(16)}`);
}

class GoldSrcQuery {
  constructor({ host, port = 27015, timeoutMs = 2500 }) {
    this.host = host;
    this.port = port;
    this.timeoutMs = timeoutMs;
  }

  info() {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket('udp4');
      const startedAt = process.hrtime.bigint();
      let timer;
      let settled = false;
      let challenged = false;

      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.close();
        if (error) reject(error);
        else resolve(result);
      };

      socket.on('error', (error) => finish(error));
      socket.on('message', (message) => {
        if (message.length >= 9 && message.subarray(0, 4).equals(CONNECTIONLESS_HEADER) && message[4] === 0x41) {
          if (challenged) return finish(new Error('ReHLDS sent more than one query challenge'));
          challenged = true;
          socket.send(Buffer.concat([INFO_REQUEST, message.subarray(5, 9)]));
          return;
        }

        try {
          const info = parseInfoPacket(message);
          const elapsed = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
          finish(null, { ...info, pingMs: Math.round(elapsed) });
        } catch (error) {
          finish(error);
        }
      });

      timer = setTimeout(
        () => finish(new Error(`Timed out querying ${this.host}:${this.port}/udp`)),
        this.timeoutMs,
      );

      socket.connect(this.port, this.host, () => socket.send(INFO_REQUEST));
    });
  }
}

module.exports = { GoldSrcQuery, parseInfoPacket };
