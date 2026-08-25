require('dotenv').config();

const { Client, EmbedBuilder, Events, GatewayIntentBits } = require('discord.js');
const { loadConfig } = require('./config');
const { GoldSrcQuery } = require('./goldsrc-query');

const config = loadConfig();
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const gameServer = new GoldSrcQuery(config.gameServer);

client.once(Events.ClientReady, (readyClient) => {
  console.log(`popdog is online as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    await interaction.reply({
      content: `Pong! Discord gateway latency: ${client.ws.ping} ms`,
      ephemeral: true,
    });
    return;
  }

  if (interaction.commandName === 'cs' && interaction.options.getSubcommand() === 'status') {
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
  }
});

client.login(config.token).catch((error) => {
  console.error('Discord login failed:', error);
  process.exitCode = 1;
});

function shutdown(signal) {
  console.log(`Received ${signal}; shutting down.`);
  client.destroy();
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
