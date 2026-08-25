const dgram = require('node:dgram');

const CONNECTIONLESS_HEADER = Buffer.from([0xff, 0xff, 0xff, 0xff]);

function rconPacket(text) {
  return Buffer.concat([
    CONNECTIONLESS_HEADER,
    Buffer.from(text, 'utf8'),
    Buffer.from([0]),
  ]);
}

function responseText(message) {
  if (message.length < 4 || !message.subarray(0, 4).equals(CONNECTIONLESS_HEADER)) {
    return null;
  }

  // GoldSrc prefixes console output with A2A_PRINT ('l'). Challenge responses
  // do not have this byte, so only strip it when present.
  const offset = message[4] === 0x6c ? 5 : 4;
  return message.subarray(offset).toString('utf8').replace(/\0+$/g, '');
}

function sanitizeSayText(value) {
  // Quotes/semicolons could terminate the argument or append console commands.
  return String(value)
    .replace(/[";\\\r\n\0]/g, '')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim();
}

class GoldSrcRcon {
  constructor({ host, port = 27015, password, timeoutMs = 2500 }) {
    this.host = host;
    this.port = port;
    this.password = password;
    this.timeoutMs = timeoutMs;
  }

  execute(command) {
    if (!this.password) {
      return Promise.reject(new Error('GOLDSRC_RCON_PASSWORD is not configured'));
    }
    if (/["\r\n\0]/.test(this.password)) {
      return Promise.reject(new Error('GOLDSRC_RCON_PASSWORD contains unsupported characters'));
    }

    const cleanCommand = String(command).replace(/[\r\n\0]/g, ' ').trim();
    if (!cleanCommand) return Promise.reject(new Error('RCON command cannot be empty'));

    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket('udp4');
      const output = [];
      let challenge = null;
      let timer;
      let quietTimer;
      let settled = false;

      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearTimeout(quietTimer);
        socket.close();

        if (error) return reject(error);
        const response = output.join('').trim();
        if (/Bad rcon_password/i.test(response)) {
          return reject(new Error('ReHLDS rejected GOLDSRC_RCON_PASSWORD'));
        }
        if (/banned from this server/i.test(response)) {
          return reject(new Error('The popdog host is banned from ReHLDS RCON'));
        }
        resolve(response);
      };

      const send = (data) => socket.send(data, (error) => error && finish(error));

      socket.on('error', (error) => finish(error));
      socket.on('message', (message) => {
        const text = responseText(message);
        if (text === null) return;

        if (challenge === null) {
          const match = text.match(/challenge\s+rcon\s+(-?\d+)/i);
          if (!match) return finish(new Error(`Unexpected RCON challenge response: ${text || '<empty>'}`));
          challenge = match[1];
          send(rconPacket(`rcon ${challenge} "${this.password}" ${cleanCommand}`));
          return;
        }

        output.push(text);
        clearTimeout(quietTimer);
        // A response can span multiple UDP datagrams.
        quietTimer = setTimeout(() => finish(), 150);
      });

      timer = setTimeout(
        () => finish(new Error(`Timed out using RCON at ${this.host}:${this.port}/udp`)),
        this.timeoutMs,
      );

      socket.connect(this.port, this.host, () => send(rconPacket('challenge rcon')));
    });
  }
}

module.exports = { GoldSrcRcon, responseText, sanitizeSayText };
