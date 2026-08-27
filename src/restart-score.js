class RestartScoreRestorer {
  constructor({ matchTracker, gameRcon }) {
    this.matchTracker = matchTracker;
    this.gameRcon = gameRcon;
    this.pending = false;
  }

  queue() {
    this.pending = true;
  }

  async onRoundStart() {
    if (!this.pending) return { handled: false, restored: false, command: null, score: null };
    this.pending = false;

    const score = this.matchTracker.restartScore();
    if (!score) return { handled: true, restored: false, command: null, score: null };

    const command = `setscore ${score.ct} ${score.t}`;
    await this.gameRcon.execute(command);
    return { handled: true, restored: true, command, score };
  }
}

module.exports = { RestartScoreRestorer };
