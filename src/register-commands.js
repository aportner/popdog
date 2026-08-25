require('dotenv').config();

const { REST, Routes } = require('discord.js');
const { commands } = require('./commands');
const { loadConfig } = require('./config');

async function main() {
  const config = loadConfig();
  const rest = new REST().setToken(config.token);

  const registered = await rest.put(
    Routes.applicationGuildCommands(config.clientId, config.guildId),
    { body: commands },
  );

  console.log(`Registered ${registered.length} guild command(s).`);
}

main().catch((error) => {
  console.error('Could not register Discord commands:', error);
  process.exitCode = 1;
});
