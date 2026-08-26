const STOP_RECORDING = {
  id: 'stoprecording',
  steps: [
    {
      target: 'hltv',
      command: 'stoprecording',
      announcePattern: /^Completed demo [a-zA-Z0-9_.-]+\.dem\.$/,
    },
  ],
};

const CAL_OVERTIME = {
  id: 'calot',
  steps: [{ target: 'game', command: 'exec calot.cfg' }],
};

const RESTART_ONE_SECOND = {
  id: 'rr1',
  steps: [{ target: 'game', command: 'sv_restart 1' }],
};

const SWAP_TEAMS = {
  id: 'swapteams',
  steps: [{ target: 'game', command: 'swapteams 1' }],
};

function endRound(command) {
  return {
    id: 'endround',
    steps: [{ target: 'game', command }],
  };
}

const RECORDING_STATUS_PATTERN =
  /(?:^|\r?\n)Recording to ([a-zA-Z0-9_.-]+\.dem), Length \d+(?:\.\d+)? sec\.(?:\r?\n|$)/;

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function createCommands(recordingPrefix) {
  return new Map([
    ['.lo3', { id: 'lo3', steps: [{ target: 'game', command: 'exec lo3.cfg' }] }],
    ['.pregame', { id: 'pregame', steps: [{ target: 'game', command: 'exec pregame.cfg' }] }],
    ['.cal', { id: 'cal', steps: [{ target: 'game', command: 'exec cal.cfg' }] }],
    ['.calot', CAL_OVERTIME],
    ['.ot', CAL_OVERTIME],
    ['.rr', RESTART_ONE_SECOND],
    ['.rr1', RESTART_ONE_SECOND],
    ['.rr3', { id: 'rr3', steps: [{ target: 'game', command: 'sv_restart 3' }] }],
    ['.swap', SWAP_TEAMS],
    ['.swapteams', SWAP_TEAMS],
    ['.draw', endRound('endround')],
    ['.ctwin', endRound('endround CT')],
    ['.twin', endRound('endround T')],
    [
      '.record',
      {
        id: 'record',
        steps: [
          {
            target: 'hltv',
            command: `record ${recordingPrefix}`,
            confirmRecording: true,
          },
        ],
      },
    ],
    ['.stop', STOP_RECORDING],
    ['.stoprecording', STOP_RECORDING],
  ]);
}

function resolveAction(message, commands) {
  const trimmedMessage = message.trim();
  const trigger = trimmedMessage.toLowerCase();
  const exactAction = commands.get(trigger);
  if (exactAction) return { trigger, action: exactAction };

  const setScoreMatch = trimmedMessage.match(
    /^\.(?:setscore|score)\s+([+-]?\d+)\s+([+-]?\d+)$/i,
  );
  if (setScoreMatch) {
    const scores = setScoreMatch.slice(1).map(Number);
    if (scores.every((score) => Number.isInteger(score) && score >= -2147483648 && score <= 2147483647)) {
      return {
        trigger,
        action: {
          id: 'setscore',
          steps: [{ target: 'game', command: `setscore ${scores[0]} ${scores[1]}` }],
        },
      };
    }
  }

  const mapMatch = trimmedMessage.match(/^\.(?:map|changelevel)\s+([a-zA-Z0-9_-]{1,64})$/i);
  if (!mapMatch) return { trigger, action: null };

  return {
    trigger,
    action: {
      id: 'changelevel',
      steps: [{ target: 'game', command: `changelevel ${mapMatch[1]}` }],
    },
  };
}

class GameCommandRouter {
  constructor({
    gameRcon,
    hltvRcon,
    allowedSteamIds = [],
    recordingPrefix = 'match',
    cooldownMs = 3000,
    now = Date.now,
    getDiskSpace = async () => null,
  }) {
    this.targets = new Map([
      ['game', gameRcon],
      ['hltv', hltvRcon],
    ]);
    this.allowedSteamIds = new Set(allowedSteamIds.map((id) => id.toUpperCase()));
    this.commands = createCommands(recordingPrefix);
    this.cooldownMs = cooldownMs;
    this.now = now;
    this.getDiskSpace = getDiskSpace;
    this.lastExecuted = new Map();
    this.inFlight = new Set();
  }

  async handle(event) {
    if (event.type !== 'chat') return { matched: false };

    const { trigger, action } = resolveAction(event.message, this.commands);
    if (!action) return { matched: false };

    const authId = event.player.authId.toUpperCase();
    if (!this.allowedSteamIds.has(authId)) {
      return { matched: true, authorized: false, executed: false, trigger, authId };
    }

    const lastRun = this.lastExecuted.get(action.id);
    const now = this.now();
    if (
      this.inFlight.has(action.id) ||
      (lastRun !== undefined && now - lastRun < this.cooldownMs)
    ) {
      return {
        matched: true,
        authorized: true,
        executed: false,
        trigger,
        authId,
        reason: 'cooldown',
      };
    }

    this.inFlight.add(action.id);
    const executedCommands = [];
    try {
      for (const step of action.steps) {
        const rcon = this.targets.get(step.target);
        if (!rcon) throw new Error(`${step.target} RCON is not configured`);
        const output = await rcon.execute(step.command);
        executedCommands.push(`${step.target}: ${step.command}`);
        let announcementMatch;
        let announcement;
        if (step.confirmRecording) {
          for (let attempt = 0; attempt < 5; attempt += 1) {
            const status = await rcon.execute('status');
            executedCommands.push(`${step.target}: status`);
            announcementMatch = String(status || '').match(RECORDING_STATUS_PATTERN);
            if (announcementMatch) break;
            if (attempt < 4) await wait(250);
          }

          if (!announcementMatch) {
            throw new Error('HLTV did not confirm the recording through its status output');
          }
          announcement = `Start recording to ${announcementMatch[1]}.`;
        } else {
          announcementMatch = step.announcePattern
            ? String(output || '').match(step.announcePattern)
            : null;
          announcement = announcementMatch?.[0];
        }

        if (announcementMatch) {
          if (action.id === 'record') {
            const diskSpace = await this.getDiskSpace();
            if (diskSpace) announcement += ` (${diskSpace} free)`;
          }
          const sayCommand = `say ${announcement}`;
          await rcon.execute(sayCommand);
          executedCommands.push(`${step.target}: ${sayCommand}`);
        }
      }
      this.lastExecuted.set(action.id, now);
      return {
        matched: true,
        authorized: true,
        executed: true,
        trigger,
        authId,
        executedCommands,
      };
    } finally {
      this.inFlight.delete(action.id);
    }
  }
}

module.exports = { createCommands, GameCommandRouter };
