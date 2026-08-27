const PHASES = new Set([
  'pregame',
  'first_half',
  'halftime',
  'second_half',
  'tied',
  'suspended',
]);

function freshState(maxRoundsPerHalf) {
  return {
    version: 1,
    phase: 'pregame',
    resumePhase: null,
    map: null,
    maxRoundsPerHalf,
    currentHalf: { ct: 0, t: 0 },
    firstHalf: null,
    lastCompleted: null,
  };
}

function validScore(score) {
  return (
    score &&
    Number.isInteger(score.ct) &&
    Number.isInteger(score.t) &&
    score.ct >= 0 &&
    score.t >= 0
  );
}

function normalizeState(state, maxRoundsPerHalf) {
  if (!state || state.version !== 1 || !PHASES.has(state.phase)) {
    return freshState(maxRoundsPerHalf);
  }
  if (!validScore(state.currentHalf)) return freshState(maxRoundsPerHalf);
  if (state.firstHalf && !validScore(state.firstHalf)) return freshState(maxRoundsPerHalf);

  return {
    ...freshState(maxRoundsPerHalf),
    ...state,
    maxRoundsPerHalf,
    currentHalf: { ...state.currentHalf },
    firstHalf: state.firstHalf ? { ...state.firstHalf } : null,
  };
}

class MatchTracker {
  constructor({ maxRoundsPerHalf = 12, state = null } = {}) {
    this.state = normalizeState(state, maxRoundsPerHalf);
  }

  snapshot() {
    return structuredClone(this.state);
  }

  startLo3(map = null) {
    const previous = this.state.phase;
    let discarded = null;

    if (previous === 'pregame') {
      this.state = freshState(this.state.maxRoundsPerHalf);
      this.state.phase = 'first_half';
      this.state.map = map;
    } else if (previous === 'halftime') {
      this.state.phase = 'second_half';
      this.state.currentHalf = { ct: 0, t: 0 };
    } else if (previous === 'tied') {
      return { changed: false, phase: previous, announcement: null };
    } else {
      const resumePhase = previous === 'suspended' ? this.state.resumePhase : previous;
      if (resumePhase === 'halftime') {
        this.state.phase = 'second_half';
      } else {
        this.state.phase = resumePhase === 'second_half' ? 'second_half' : 'first_half';
      }
      discarded = { ...this.state.currentHalf };
      this.state.currentHalf = { ct: 0, t: 0 };
      this.state.resumePhase = null;
    }

    if (map) this.state.map = map;
    const total = discarded ? discarded.ct + discarded.t : 0;
    return {
      changed: true,
      phase: this.state.phase,
      announcement:
        total > 0
          ? `LO3 restarted the current half; provisional score CT ${discarded.ct}-${discarded.t} T was discarded.`
          : null,
    };
  }

  enterPregame() {
    if (this.state.phase === 'pregame') return { changed: false };
    if (this.state.phase !== 'suspended') this.state.resumePhase = this.state.phase;
    this.state.phase = 'suspended';
    return { changed: true, announcement: 'Match tracking suspended in pregame.' };
  }

  reset() {
    const map = this.state.map;
    this.state = freshState(this.state.maxRoundsPerHalf);
    this.state.map = map;
    return { changed: true, announcement: 'Match tracking reset.' };
  }

  changeMap(map) {
    if (!map || map === this.state.map) return { changed: false };
    const previousMap = this.state.map;

    if (this.state.phase === 'pregame' || !this.state.firstHalf) {
      this.state = freshState(this.state.maxRoundsPerHalf);
      this.state.map = map;
      return { changed: true, announcement: null };
    }

    if (this.state.phase !== 'suspended') this.state.resumePhase = this.state.phase;
    this.state.phase = 'suspended';
    this.state.map = map;
    return {
      changed: true,
      announcement: `Match tracking suspended after map changed from ${previousMap || 'unknown'} to ${map}.`,
    };
  }

  setScore(ct, t) {
    if (!['first_half', 'halftime', 'second_half'].includes(this.state.phase)) {
      return { changed: false, announcement: null };
    }
    return this.applyScore(ct, t, { corrected: true });
  }

  applyRoundResult({ ct, t }) {
    if (!['first_half', 'second_half'].includes(this.state.phase)) {
      return { changed: false, ignored: true };
    }
    return this.applyScore(ct, t);
  }

  applyScore(ct, t, { corrected = false } = {}) {
    if (!validScore({ ct, t })) return { changed: false, ignored: true };
    const max = this.state.maxRoundsPerHalf;
    if (ct + t > max) {
      const phase = this.state.phase;
      this.state.phase = 'suspended';
      this.state.resumePhase = phase;
      return {
        changed: true,
        suspended: true,
        announcement: `Match tracking suspended: server half score CT ${ct}-${t} T exceeds MR${max}.`,
      };
    }
    if (ct === this.state.currentHalf.ct && t === this.state.currentHalf.t) {
      return { changed: false, duplicate: true };
    }

    this.state.currentHalf = { ct, t };
    const halfTotal = ct + t;

    if (this.state.phase === 'first_half' || this.state.phase === 'halftime') {
      if (halfTotal === max) {
        this.state.firstHalf = { ct, t };
        this.state.phase = 'halftime';
        return {
          changed: true,
          halftime: true,
          announcement: `Halftime: CT ${ct}-${t} T. Swap sides and use .lo3.`,
        };
      }
      if (this.state.phase === 'halftime') {
        this.state.firstHalf = null;
        this.state.phase = 'first_half';
      }
      return {
        changed: true,
        announcement: this.scoreAnnouncement({ corrected, finalRound: halfTotal === max - 1 }),
      };
    }

    const score = this.sideScore();
    const target = max + 1;
    if (score.ct >= target || score.t >= target) {
      const completed = {
        map: this.state.map,
        ct: score.ct,
        t: score.t,
        completedAt: new Date().toISOString(),
      };
      const announcement = `Final: CT ${score.ct}-${score.t} T.`;
      const map = this.state.map;
      this.state = freshState(max);
      this.state.map = map;
      this.state.lastCompleted = completed;
      return { changed: true, complete: true, announcement, completed };
    }

    if (halfTotal === max && score.ct === score.t) {
      this.state.phase = 'tied';
      return {
        changed: true,
        tied: true,
        announcement: `Regulation tied CT ${score.ct}-${score.t} T. Recording continues for overtime.`,
      };
    }

    return {
      changed: true,
      announcement: this.scoreAnnouncement({ corrected, finalRound: halfTotal === max - 1 }),
    };
  }

  sideScore() {
    if (!this.state.firstHalf) {
      return { ...this.state.currentHalf };
    }
    const scoreOnSwappedSides =
      ['second_half', 'tied'].includes(this.state.phase) ||
      (this.state.phase === 'suspended' &&
        ['second_half', 'tied'].includes(this.state.resumePhase));
    if (scoreOnSwappedSides) {
      return {
        ct: this.state.firstHalf.t + this.state.currentHalf.ct,
        t: this.state.firstHalf.ct + this.state.currentHalf.t,
      };
    }
    return { ...this.state.firstHalf };
  }

  scoreAnnouncement({ corrected = false, finalRound = false } = {}) {
    const score = this.sideScore();
    let message = `${corrected ? 'Score corrected: ' : ''}CT ${score.ct}-${score.t} T.`;
    if (finalRound) message += ' Next round is the final round of the half.';
    return message;
  }

  statusText() {
    if (this.state.phase === 'pregame') return null;
    const score = this.sideScore();
    const phase = this.state.phase.replace('_', ' ');
    return `Match: CT ${score.ct}-${score.t} T (${phase})`;
  }
}

module.exports = { freshState, MatchTracker, normalizeState };
