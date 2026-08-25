const { InteractionContextType, SlashCommandBuilder } = require('discord.js');

const ping = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Check whether popdog is online')
  .setContexts(InteractionContextType.Guild);

module.exports = { commands: [ping.toJSON()] };
