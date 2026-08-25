const { InteractionContextType, SlashCommandBuilder } = require('discord.js');

const ping = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Check whether popdog is online')
  .setContexts(InteractionContextType.Guild);

const cs = new SlashCommandBuilder()
  .setName('cs')
  .setDescription('Counter-Strike 1.6 server commands')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((subcommand) =>
    subcommand.setName('status').setDescription('Show the game server status'),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('say')
      .setDescription('Send a message to players on the game server')
      .addStringOption((option) =>
        option
          .setName('message')
          .setDescription('Message to send')
          .setMinLength(1)
          .setMaxLength(180)
          .setRequired(true),
      ),
  );

module.exports = { commands: [ping.toJSON(), cs.toJSON()] };
