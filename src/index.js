require('dotenv').config();

const { Client, Events, GatewayIntentBits } = require('discord.js');
const { loadConfig } = require('./config');

const config = loadConfig();
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

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
