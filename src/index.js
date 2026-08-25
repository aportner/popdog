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
const { GameCommandRouter } = require('./game-command-router');
const { GoldSrcLogReceiver } = require('./goldsrc-log-receiver');
const { GoldSrcQuery } = require('./goldsrc-query');
const { GoldSrcRcon, sanitizeSayText } = require('./goldsrc-rcon');
const { registerLogTarget, unregisterLogTarget } = require('./log-registration');

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
});
let registeredLogTarget = false;
let shuttingDown = false;
const gameCommands = new GameCommandRouter({
  rcon,
  allowedSteamIds: config.gameCommands.allowedSteamIds,
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
          `Executed ${result.rconCommand} for ${event.player.name} (${result.authId})`,
        );
      }
    })
    .catch((error) => {
      console.error(`In-game command from ${event.player.authId} failed:`, error);
    });
});

function canControlServer(interaction) {
  if (config.adminRoleId) {
    return interaction.member?.roles?.cache?.has(config.adminRoleId) ?? false;
  }
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
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
      await rcon.execute(`say "[Discord] ${sender}: ${message}"`);
      await interaction.editReply('Message sent to the CS 1.6 server.');
    } catch (error) {
      console.error('Game server say command failed:', error);
      await interaction.editReply(`Could not send the message: ${error.message}`);
    }
  }
});

async function start() {
  try {
    await gameLogs.start();
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
  client.destroy();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
