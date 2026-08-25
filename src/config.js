function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function integer(name, fallback, minimum, maximum) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function boolean(name, fallback = false) {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  throw new Error(`${name} must be true or false`);
}

function loadConfig() {
  const gameServerHost = process.env.GOLDSRC_HOST?.trim() || '127.0.0.1';
  const gameServerPort = integer('GOLDSRC_PORT', 27015, 1, 65535);
  const logBindHost = process.env.GOLDSRC_LOG_BIND_HOST?.trim() || '0.0.0.0';
  const logPort = integer('GOLDSRC_LOG_PORT', 27500, 1, 65535);

  return {
    token: required('DISCORD_TOKEN'),
    clientId: required('DISCORD_CLIENT_ID'),
    guildId: required('DISCORD_GUILD_ID'),
    adminRoleId: process.env.DISCORD_ADMIN_ROLE_ID?.trim() || null,
    gameServer: {
      host: gameServerHost,
      port: gameServerPort,
      timeoutMs: integer('GOLDSRC_QUERY_TIMEOUT_MS', 2500, 250, 30_000),
      rconPassword: process.env.GOLDSRC_RCON_PASSWORD?.trim() || null,
      rconTimeoutMs: integer('GOLDSRC_RCON_TIMEOUT_MS', 2500, 250, 30_000),
    },
    gameLogs: {
      bindHost: logBindHost,
      port: logPort,
      allowedHost: process.env.GOLDSRC_LOG_ALLOWED_HOST?.trim() || gameServerHost,
      debug: boolean('GOLDSRC_LOG_DEBUG'),
      autoConfigure: boolean('GOLDSRC_LOG_AUTO_CONFIGURE', true),
      advertiseHost:
        process.env.GOLDSRC_LOG_ADVERTISE_HOST?.trim() ||
        (logBindHost === '0.0.0.0' ? null : logBindHost),
      advertisePort: integer('GOLDSRC_LOG_ADVERTISE_PORT', logPort, 1, 65535),
      natKeepalive: boolean('GOLDSRC_LOG_NAT_KEEPALIVE'),
      keepaliveIntervalMs: integer('GOLDSRC_LOG_KEEPALIVE_INTERVAL_MS', 15_000, 5_000, 60_000),
      gameHost: gameServerHost,
      gamePort: gameServerPort,
    },
  };
}

module.exports = { loadConfig };
