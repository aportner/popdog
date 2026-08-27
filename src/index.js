require('dotenv').config();

const {
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');
const { loadConfig } = require('./config');
const { availableBytes, formatBytes } = require('./disk-space');
const { GameCommandRouter } = require('./game-command-router');
const { GoldSrcLogReceiver } = require('./goldsrc-log-receiver');
const { GoldSrcQuery } = require('./goldsrc-query');
const { GoldSrcRcon, sanitizeSayText, sendPopdogSay } = require('./goldsrc-rcon');
const { registerLogTarget, unregisterLogTarget } = require('./log-registration');
const { createMapPoll } = require('./map-poll');
const { formatMatchStatus } = require('./match-status');
const { MatchStateStore } = require('./match-state-store');
const { MatchTracker, normalizeState } = require('./match-tracker');
const { RecordingGuard } = require('./recording-guard');

const config = loadConfig();
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const gameServer = new GoldSrcQuery(config.gameServer);
const gameLogs = new GoldSrcLogReceiver({
  ...config.gameLogs,
  secrets: [config.gameServer.rconPassword],
});
const rcon = new GoldSrcRcon({
  host: config.gameServer.host,
  port: config.gameServer.port,
  password: config.gameServer.rconPassword,
  timeoutMs: config.gameServer.rconTimeoutMs,
  passwordLabel: 'GOLDSRC_RCON_PASSWORD',
});
const hltvRcon = new GoldSrcRcon({
  host: config.hltv.host,
  port: config.hltv.port,
  password: config.hltv.password,
  timeoutMs: config.hltv.timeoutMs,
  passwordLabel: 'HLTV_ADMIN_PASSWORD',
  allowNoResponse: true,
});
let registeredLogTarget = false;
let shuttingDown = false;
const matchStore = new MatchStateStore(config.match.statePath);
const matchTracker = new MatchTracker({ maxRoundsPerHalf: config.match.maxRoundsPerHalf });
let matchWork = Promise.resolve();

function serializeMatchWork(task) {
  const run = matchWork.then(task);
  matchWork = run.catch((error) => console.error('Match lifecycle operation failed:', error));
  return run;
}

async function saveMatchState() {
  await matchStore.save(matchTracker.snapshot());
}

async function stopRecordingAndAnnounce() {
  const output = await hltvRcon.execute('stoprecording');
  const completed = String(output || '').match(/^Completed demo [a-zA-Z0-9_.-]+\.dem\.$/);
  if (completed) await sendPopdogSay(hltvRcon, completed[0]);
}

const recordingGuard = new RecordingGuard({
  gameServer,
  hltvRcon,
  diskPath: config.hltv.diskPath,
  minimumPlayers: config.hltv.minimumRecordingPlayers,
  lowPlayerGraceMs: config.hltv.lowPlayerGraceSeconds * 1000,
  minimumFreeBytes: config.hltv.minimumFreeGiB * 1024 ** 3,
  intervalMs: config.hltv.guardIntervalSeconds * 1000,
  onStop: async (reason) => {
    await sendPopdogSay(rcon, reason);
    await stopRecordingAndAnnounce();
  },
  onError: (error) => console.warn('Recording guard check failed:', error.message),
});

const gameCommands = new GameCommandRouter({
  gameRcon: rcon,
  hltvRcon,
  allowedSteamIds: config.gameCommands.allowedSteamIds,
  recordingPrefix: config.hltv.recordingPrefix,
  getDiskSpace: async () => {
    try {
      return formatBytes(await availableBytes(config.hltv.diskPath));
    } catch (error) {
      console.warn(`Could not check free space at ${config.hltv.diskPath}:`, error.message);
      return null;
    }
  },
  getStatusAnnouncement: async () => {
    const [gameResult, hltvResult] = await Promise.allSettled([
      gameServer.info(),
      hltvRcon.execute('status'),
    ]);
    return formatMatchStatus({
      gameInfo: gameResult.status === 'fulfilled' ? gameResult.value : null,
      hltvStatus: hltvResult.status === 'fulfilled' ? hltvResult.value : null,
      hltvAvailable: hltvResult.status === 'fulfilled',
      matchStatus: matchTracker.statusText(),
    });
  },
  onActionExecuted: ({ id, metadata }) =>
    serializeMatchWork(async () => {
      let result = { changed: false };
      if (id === 'lo3') {
        let map = matchTracker.snapshot().map;
        try {
          map = (await gameServer.info()).map || map;
        } catch (error) {
          console.warn('Could not query the map while starting LO3:', error.message);
        }
        result = matchTracker.startLo3(map);
      } else if (id === 'pregame') {
        result = matchTracker.enterPregame();
      } else if (id === 'setscore') {
        result = matchTracker.setScore(metadata.ct, metadata.t);
      } else if (id === 'matchreset') {
        result = matchTracker.reset();
      } else if (id === 'changelevel') {
        result = matchTracker.changeMap(metadata.map);
      }

      if (result.changed) await saveMatchState();
      if (id === 'changelevel') return [];
      return result.announcement ? [result.announcement] : [];
    }),
});

gameLogs.on('socketError', (error) => {
  console.error('ReHLDS log receiver error:', error);
});

if (config.gameLogs.debug) {
  gameLogs.on('event', (event) => console.log('[ReHLDS event]', event));
}

gameLogs.on('chat', (event) => {
  void gameCommands
    .handle(event)
    .then((result) => {
      if (!result.matched) return;
      if (!result.authorized) {
        console.warn(
          `Denied in-game command ${result.trigger} from ${event.player.name} (${result.authId})`,
        );
      } else if (result.executed) {
        console.log(
          `Executed ${result.executedCommands.join(' -> ')} for ` +
            `${event.player.name} (${result.authId})`,
        );
      }
    })
    .catch((error) => {
      console.error(`In-game command from ${event.player.authId} failed:`, error);
    });
});

gameLogs.on('event', (event) => {
  if (!['round_result', 'map_start'].includes(event.type)) return;
  void serializeMatchWork(async () => {
    const result =
      event.type === 'round_result'
        ? matchTracker.applyRoundResult(event)
        : matchTracker.changeMap(event.map);
    if (!result.changed) return;

    await saveMatchState();
    if (result.announcement) await sendPopdogSay(rcon, result.announcement);
    if (result.complete || event.type === 'map_start') {
      try {
        await stopRecordingAndAnnounce();
      } catch (error) {
        console.warn('Could not stop HLTV recording:', error.message);
      }
    }
  });
});

function canControlServer(interaction) {
  if (config.adminRoleId) {
    return interaction.member?.roles?.cache?.has(config.adminRoleId) ?? false;
  }
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

function rconCodeBlock(output) {
  const text = (output || 'Command sent; HLTV returned no output.')
    .replace(/```/g, 'ˋˋˋ')
    .slice(0, 1850);
  return `\`\`\`text\n${text}\n\`\`\``;
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`popdog is online as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    await interaction.reply({
      content: `Pong! Discord gateway latency: ${client.ws.ping} ms`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.commandName === 'hltv') {
    if (!canControlServer(interaction)) {
      await interaction.reply({
        content: 'You need the configured popdog admin role or Manage Server permission to do that.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const hltvSubcommand = interaction.options.getSubcommand();
    const command =
      hltvSubcommand === 'status'
        ? 'status'
        : interaction.options.getString('command', true);

    try {
      const output = await hltvRcon.execute(command);
      await interaction.editReply(rconCodeBlock(output));
    } catch (error) {
      console.error(`HLTV ${hltvSubcommand} command failed:`, error);
      await interaction.editReply(`Could not run the HLTV command: ${error.message}`);
    }
    return;
  }

  if (interaction.commandName === 'mappoll') {
    if (!canControlServer(interaction)) {
      await interaction.reply({
        content: 'You need the configured popdog admin role or Manage Server permission to do that.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      await interaction.reply({ poll: createMapPoll() });
    } catch (error) {
      console.error('Could not create the map poll:', error);
      const response = {
        content: `Could not create the map poll: ${error.message}`,
        flags: MessageFlags.Ephemeral,
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(response);
      } else {
        await interaction.reply(response);
      }
    }
    return;
  }

  if (interaction.commandName !== 'cs') return;
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'status') {
    await interaction.deferReply();

    try {
      const status = await gameServer.info();
      const embed = new EmbedBuilder()
        .setColor(0xd8a020)
        .setTitle(status.name || 'Counter-Strike 1.6 server')
        .addFields(
          { name: 'Map', value: status.map || 'Unknown', inline: true },
          { name: 'Players', value: `${status.players}/${status.maxPlayers}`, inline: true },
          { name: 'Ping', value: `${status.pingMs} ms`, inline: true },
          { name: 'Game', value: status.game || status.folder || 'Counter-Strike', inline: true },
          { name: 'Address', value: `${config.gameServer.host}:${config.gameServer.port}`, inline: true },
          { name: 'Password', value: status.passwordProtected ? 'Required' : 'No', inline: true },
        )
        .setFooter({ text: status.version ? `Server version ${status.version}` : 'ReHLDS server query' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Game server status query failed:', error);
      await interaction.editReply(`Could not query the CS 1.6 server: ${error.message}`);
    }
    return;
  }

  if (subcommand === 'say') {
    if (!canControlServer(interaction)) {
      await interaction.reply({
        content: 'You need the configured popdog admin role or Manage Server permission to do that.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const message = sanitizeSayText(interaction.options.getString('message', true));
    const sender = sanitizeSayText(interaction.member?.displayName || interaction.user.username);
    if (!message) {
      await interaction.reply({
        content: 'That message contains no usable characters.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await sendPopdogSay(rcon, `[Discord] ${sender}: ${message}`);
      await interaction.editReply('Message sent to the CS 1.6 server.');
    } catch (error) {
      console.error('Game server say command failed:', error);
      await interaction.editReply(`Could not send the message: ${error.message}`);
    }
  }
});

async function start() {
  try {
    const savedMatchState = await matchStore.load();
    matchTracker.state = normalizeState(savedMatchState, config.match.maxRoundsPerHalf);
    if (savedMatchState) console.log(`Loaded persisted match state (${matchTracker.state.phase})`);

    await gameLogs.start();
    recordingGuard.start();
    console.log(
      `Listening for ReHLDS logs on ${config.gameLogs.bindHost}:${config.gameLogs.port}/udp ` +
        `(allowing ${config.gameLogs.allowedHost})`,
    );
    if (config.gameLogs.natKeepalive) {
      console.log(
        `Keeping a UDP mapping open to ${config.gameLogs.gameHost}:${config.gameLogs.gamePort}`,
      );
    }

    if (config.gameLogs.autoConfigure) {
      if (!config.gameLogs.advertiseHost) {
        throw new Error(
          'GOLDSRC_LOG_ADVERTISE_HOST is required when the log receiver binds to 0.0.0.0',
        );
      }
      await registerLogTarget(
        rcon,
        config.gameLogs.advertiseHost,
        config.gameLogs.advertisePort,
      );
      registeredLogTarget = true;
      console.log(
        `Registered ReHLDS log destination ${config.gameLogs.advertiseHost}:` +
          `${config.gameLogs.advertisePort} through RCON`,
      );
    }
    if (config.gameCommands.allowedSteamIds.length === 0) {
      console.warn('No GOLDSRC_COMMAND_STEAM_IDS are configured; all in-game commands are disabled.');
    } else {
      console.log(`Loaded ${config.gameCommands.allowedSteamIds.length} in-game command admin(s)`);
    }
  } catch (error) {
    console.error('Could not initialize ReHLDS log ingestion:', error);
  }

  try {
    await client.login(config.token);
  } catch (error) {
    console.error('Discord login failed:', error);
    process.exitCode = 1;
  }
}

start();

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; shutting down.`);

  if (registeredLogTarget) {
    try {
      await unregisterLogTarget(
        rcon,
        config.gameLogs.advertiseHost,
        config.gameLogs.advertisePort,
      );
    } catch (error) {
      console.error('Could not remove the ReHLDS log destination:', error);
    }
  }

  gameLogs.close();
  recordingGuard.close();
  client.destroy();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
