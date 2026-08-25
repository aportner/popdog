function logTarget(host, port) {
  if (!host || !/^[a-zA-Z0-9.-]+$/.test(host)) {
    throw new Error('GOLDSRC_LOG_ADVERTISE_HOST must be an IPv4 address or hostname');
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('GOLDSRC_LOG_ADVERTISE_PORT must be a valid UDP port');
  }
  return `${host} ${port}`;
}

async function registerLogTarget(rcon, host, port) {
  const target = logTarget(host, port);
  // Remove only our exact endpoint, preserving any unrelated log consumers.
  await rcon.execute(`logaddress_del ${target}`);
  await rcon.execute('log on');
  await rcon.execute(`logaddress_add ${target}`);
  return target;
}

async function unregisterLogTarget(rcon, host, port) {
  await rcon.execute(`logaddress_del ${logTarget(host, port)}`);
}

module.exports = { logTarget, registerLogTarget, unregisterLogTarget };
