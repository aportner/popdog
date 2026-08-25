const COMMANDS = new Map([
  ['.lo3', 'exec lo3.cfg'],
  ['.pregame', 'exec pregame.cfg'],
]);

class GameCommandRouter {
  constructor({ rcon, allowedSteamIds = [], cooldownMs = 3000, now = Date.now }) {
    this.rcon = rcon;
    this.allowedSteamIds = new Set(allowedSteamIds.map((id) => id.toUpperCase()));
    this.cooldownMs = cooldownMs;
    this.now = now;
    this.lastExecuted = new Map();
    this.inFlight = new Set();
  }

  async handle(event) {
    if (event.type !== 'chat') return { matched: false };

    const trigger = event.message.trim().toLowerCase();
    const rconCommand = COMMANDS.get(trigger);
    if (!rconCommand) return { matched: false };

    const authId = event.player.authId.toUpperCase();
    if (!this.allowedSteamIds.has(authId)) {
      return { matched: true, authorized: false, executed: false, trigger, authId };
    }

    const lastRun = this.lastExecuted.get(trigger);
    const now = this.now();
    if (this.inFlight.has(trigger) || (lastRun !== undefined && now - lastRun < this.cooldownMs)) {
      return { matched: true, authorized: true, executed: false, trigger, authId, reason: 'cooldown' };
    }

    this.inFlight.add(trigger);
    try {
      await this.rcon.execute(rconCommand);
      this.lastExecuted.set(trigger, now);
      return { matched: true, authorized: true, executed: true, trigger, authId, rconCommand };
    } finally {
      this.inFlight.delete(trigger);
    }
  }
}

module.exports = { COMMANDS, GameCommandRouter };
