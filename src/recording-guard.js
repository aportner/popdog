const { availableBytes } = require('./disk-space');
const { HLTV_RECORDING_STATUS_PATTERN } = require('./match-status');

class RecordingGuard {
  constructor({
    gameServer,
    hltvRcon,
    diskPath,
    minimumPlayers = 3,
    lowPlayerGraceMs = 300_000,
    minimumFreeBytes = 5 * 1024 ** 3,
    intervalMs = 60_000,
    getAvailableBytes = availableBytes,
    now = Date.now,
    onStop,
    onError = () => {},
  }) {
    this.gameServer = gameServer;
    this.hltvRcon = hltvRcon;
    this.diskPath = diskPath;
    this.minimumPlayers = minimumPlayers;
    this.lowPlayerGraceMs = lowPlayerGraceMs;
    this.minimumFreeBytes = minimumFreeBytes;
    this.intervalMs = intervalMs;
    this.getAvailableBytes = getAvailableBytes;
    this.now = now;
    this.onStop = onStop;
    this.onError = onError;
    this.lowPlayerSince = null;
    this.timer = null;
    this.checking = false;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(
      () => void this.check().catch((error) => this.onError(error)),
      this.intervalMs,
    );
    this.timer.unref?.();
  }

  close() {
    clearInterval(this.timer);
    this.timer = null;
  }

  async check() {
    if (this.checking) return null;
    this.checking = true;
    try {
      const hltvStatus = await this.hltvRcon.execute('status');
      if (!HLTV_RECORDING_STATUS_PATTERN.test(String(hltvStatus || ''))) {
        this.lowPlayerSince = null;
        return null;
      }

      const freeBytes = await this.getAvailableBytes(this.diskPath);
      if (freeBytes < this.minimumFreeBytes) {
        const reason = `recording stopped because disk space fell below ${this.minimumFreeBytes / 1024 ** 3} GiB`;
        await this.onStop(reason);
        this.lowPlayerSince = null;
        return reason;
      }

      const info = await this.gameServer.info();
      // ReHLDS counts bots and the connected HLTV proxy as players.
      const humanPlayers = Math.max(0, info.players - (info.bots || 0) - 1);
      if (humanPlayers >= this.minimumPlayers) {
        this.lowPlayerSince = null;
        return null;
      }

      const now = this.now();
      this.lowPlayerSince ??= now;
      if (now - this.lowPlayerSince < this.lowPlayerGraceMs) return null;

      const reason =
        `recording stopped after ${Math.round(this.lowPlayerGraceMs / 1000)} seconds ` +
        `below ${this.minimumPlayers} human players`;
      await this.onStop(reason);
      this.lowPlayerSince = null;
      return reason;
    } finally {
      this.checking = false;
    }
  }
}

module.exports = { RecordingGuard };
