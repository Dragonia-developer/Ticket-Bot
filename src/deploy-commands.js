const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { getConfig } = require('./config');

const config = getConfig();

const commands = [
  new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ticket system commands')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) => subcommand
      .setName('panel')
      .setDescription('Send a ticket panel to a channel')
      .addStringOption((option) => option.setName('panel').setDescription('Panel id from config.json').setRequired(true).setAutocomplete(true))
      .addChannelOption((option) => option.setName('channel').setDescription('Where to send the panel').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommand((subcommand) => subcommand
      .setName('config')
      .setDescription('Open the private config control panel'))
].map((command) => command.toJSON());

async function main() {
  if (!config.token || config.token === 'YOUR_DISCORD_BOT_TOKEN') throw new Error('Set token in config.json first.');
  if (!config.clientId || config.clientId === 'YOUR_APPLICATION_CLIENT_ID') throw new Error('Set clientId in config.json first.');
  const rest = new REST({ version: '10' }).setToken(config.token);
  if (config.guildId) {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commands });
    console.log(`Deployed ${commands.length} guild command(s) to ${config.guildId}.`);
  } else {
    await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
    console.log(`Deployed ${commands.length} global command(s). Global commands may take up to one hour to appear.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
