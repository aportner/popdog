const dgram = require('node:dgram');
const dns = require('node:dns/promises');
const { EventEmitter } = require('node:events');

const CONNECTIONLESS_HEADER = Buffer.from([0xff, 0xff, 0xff, 0xff]);
const LOG_STRING_RESPONSE = 0x52; // S2A_LOGSTRING ('R')
const INFO_REQUEST = Buffer.concat([
  CONNECTIONLESS_HEADER,
  Buffer.from([0x54]),
  Buffer.from('Source Engine Query\0', 'ascii'),
]);
const TIMESTAMP_PATTERN = /^L (?<timestamp>\d{2}\/\d{2}\/\d{4} - \d{2}:\d{2}:\d{2}): (?<message>.*)$/;
const CHAT_PATTERN = /^"(?<name>.*)<(?<userId>\d+)><(?<authId>[^>]*)><(?<team>[^>]*)>" (?<verb>say|say_team) "(?<chat>.*)"(?<dead> \(dead\))?$/;
const ROUND_RESULT_PATTERN = /^(?:Team "(?<winner>CT|TERRORIST)"|World) triggered "(?<reason>[^"]+)" \(CT "(?<ct>\d+)"\) \(T "(?<t>\d+)"\)$/;
const MAP_START_PATTERN = /^Started map "(?<map>[a-zA-Z0-9_-]{1,64})"/;

function cleanText(value) {
  return value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').trim();
}

function parseLogPacket(packet) {
  if (packet.length < 5 || !packet.subarray(0, 4).equals(CONNECTIONLESS_HEADER)) {
    return [];
  }

  let payload;
  if (packet[4] === LOG_STRING_RESPONSE) {
    // Newer S2A_LOGSTRING packet: 0xffffffff + 'R' + line.
    payload = packet.subarray(5);
  } else if (packet.length >= 8 && packet.subarray(4, 8).toString('ascii') === 'log ') {
    // Classic GoldSrc packet: 0xffffffff + 'log ' + line.
    payload = packet.subarray(8);
  } else {
    return [];
  }

  return payload
    .toString('utf8')
    .replace(/\0+$/g, '')
    .split(/\r?\n/)
    .map(cleanText)
    .filter(Boolean);
}

function redactLogLine(line, secrets) {
  let redacted = line;
  for (const secret of secrets) {
    if (secret) redacted = redacted.split(secret).join('[REDACTED]');
  }
  return redacted;
}

function parseLogLine(raw) {
  const timestampMatch = raw.match(TIMESTAMP_PATTERN);
  const timestamp = timestampMatch?.groups.timestamp || null;
  const message = timestampMatch?.groups.message || raw;
  const chatMatch = message.match(CHAT_PATTERN);

  const roundResultMatch = message.match(ROUND_RESULT_PATTERN);
  if (roundResultMatch) {
    return {
      type: 'round_result',
      timestamp,
      winner: roundResultMatch.groups.winner || null,
      reason: roundResultMatch.groups.reason,
      ct: Number(roundResultMatch.groups.ct),
      t: Number(roundResultMatch.groups.t),
      raw,
    };
  }

  const mapStartMatch = message.match(MAP_START_PATTERN);
  if (mapStartMatch) {
    return { type: 'map_start', timestamp, map: mapStartMatch.groups.map, raw };
  }

  if (!chatMatch) return { type: 'log', timestamp, message, raw };

  return {
    type: 'chat',
    timestamp,
    message: chatMatch.groups.chat,
    teamOnly: chatMatch.groups.verb === 'say_team',
    dead: Boolean(chatMatch.groups.dead),
    player: {
      name: chatMatch.groups.name,
      userId: Number(chatMatch.groups.userId),
      authId: chatMatch.groups.authId,
      team: chatMatch.groups.team,
    },
    raw,
  };
}

class GoldSrcLogReceiver extends EventEmitter {
  constructor({
    bindHost = '0.0.0.0',
    port = 27500,
    allowedHost,
    natKeepalive = false,
    keepaliveIntervalMs = 15_000,
    gameHost,
    gamePort = 27015,
    secrets = [],
  }) {
    super();
    this.bindHost = bindHost;
    this.port = port;
    this.allowedHost = allowedHost;
    this.natKeepalive = natKeepalive;
    this.keepaliveIntervalMs = keepaliveIntervalMs;
    this.gameHost = gameHost;
    this.gamePort = gamePort;
    this.secrets = secrets.filter(Boolean);
    this.socket = null;
    this.keepaliveTimer = null;
    this.allowedAddresses = new Set();
  }

  async start() {
    if (this.socket) throw new Error('GoldSrc log receiver is already running');

    const addresses = await dns.lookup(this.allowedHost, { family: 4, all: true });
    this.allowedAddresses = new Set(addresses.map(({ address }) => address));
    const socket = dgram.createSocket('udp4');
    this.socket = socket;

    socket.on('message', (packet, remote) => {
      if (!this.allowedAddresses.has(remote.address)) return;

      for (const unredacted of parseLogPacket(packet)) {
        const raw = redactLogLine(unredacted, this.secrets);
        const event = parseLogLine(raw);
        this.emit('line', raw);
        this.emit('event', event);
        if (event.type === 'chat') this.emit('chat', event);
      }
    });

    await new Promise((resolve, reject) => {
      const onStartupError = (error) => {
        this.socket = null;
        socket.close();
        reject(error);
      };
      socket.once('error', onStartupError);
      socket.bind(this.port, this.bindHost, () => {
        socket.off('error', onStartupError);
        socket.on('error', (error) => this.emit('socketError', error));
        if (this.natKeepalive) this.startNatKeepalive();
        resolve();
      });
    });
  }

  startNatKeepalive() {
    if (!this.gameHost) throw new Error('gameHost is required when NAT keepalive is enabled');

    const send = () => {
      this.socket?.send(INFO_REQUEST, this.gamePort, this.gameHost, (error) => {
        if (error) this.emit('socketError', error);
      });
    };
    send();
    this.keepaliveTimer = setInterval(send, this.keepaliveIntervalMs);
  }

  address() {
    return this.socket?.address() || null;
  }

  close() {
    clearInterval(this.keepaliveTimer);
    this.keepaliveTimer = null;
    if (!this.socket) return;
    const socket = this.socket;
    this.socket = null;
    socket.close();
  }
}

module.exports = { GoldSrcLogReceiver, parseLogLine, parseLogPacket, redactLogLine };
