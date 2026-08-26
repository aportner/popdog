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

const hltv = new SlashCommandBuilder()
  .setName('hltv')
  .setDescription('Control the HLTV proxy')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((subcommand) =>
    subcommand.setName('status').setDescription('Show HLTV proxy status'),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('rcon')
      .setDescription('Run an HLTV console command')
      .addStringOption((option) =>
        option
          .setName('command')
          .setDescription('HLTV command to execute')
          .setMinLength(1)
          .setMaxLength(500)
          .setRequired(true),
      ),
  );

const mappoll = new SlashCommandBuilder()
  .setName('mappoll')
  .setDescription('Start the standard 24-hour map vote')
  .setContexts(InteractionContextType.Guild);

module.exports = { commands: [ping.toJSON(), cs.toJSON(), hltv.toJSON(), mappoll.toJSON()] };
