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

function loadConfig() {
  return {
    token: required('DISCORD_TOKEN'),
    clientId: required('DISCORD_CLIENT_ID'),
    guildId: required('DISCORD_GUILD_ID'),
    gameServer: {
      host: process.env.GOLDSRC_HOST?.trim() || '127.0.0.1',
      port: integer('GOLDSRC_PORT', 27015, 1, 65535),
      timeoutMs: integer('GOLDSRC_QUERY_TIMEOUT_MS', 2500, 250, 30_000),
    },
  };
}

module.exports = { loadConfig };
