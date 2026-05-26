const { AttachmentBuilder, Client, EmbedBuilder, GatewayIntentBits, Partials } = require('discord.js');
const { getConfig, reloadConfig, updateConfig } = require('./config');
const { getByPath, isStaff, parseConfigValue } = require('./utils');
const {
  aiReply,
  claimTicket,
  closeTicket,
  maybeAutoAi,
  openTicket,
  sendPanel,
  sendTranscript
} = require('./tickets');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

function publicConfig(config) {
  const copy = JSON.parse(JSON.stringify(config));
  if (copy.token) copy.token = '[hidden]';
  if (copy.ai?.apiKey) copy.ai.apiKey = '[hidden]';
  return copy;
}

function setupEmbed(config) {
  const missing = [];
  if (!config.token || config.token === 'YOUR_DISCORD_BOT_TOKEN') missing.push('token');
  if (!config.clientId || config.clientId === 'YOUR_APPLICATION_CLIENT_ID') missing.push('clientId');
  const panels = Object.keys(config.panels || {});
  const categories = Object.keys(config.categories || {});
  return new EmbedBuilder()
    .setColor(missing.length ? config.colors?.warning || '#F1C40F' : config.colors?.success || '#2ECC71')
    .setTitle('Ticket Bot Setup')
    .setDescription(missing.length ? `Missing required values: \`${missing.join('`, `')}\`` : 'Core setup is ready.')
    .addFields(
      { name: 'Panels', value: panels.length ? panels.map((id) => `\`${id}\``).join(', ') : 'None', inline: true },
      { name: 'Categories', value: categories.length ? categories.map((id) => `\`${id}\``).join(', ') : 'None', inline: true },
      { name: 'AI', value: config.ai?.enabled ? `Enabled (${config.ai.model})` : 'Disabled', inline: true }
    );
}

async function handleTicketCommand(interaction) {
  let config = getConfig();
  if (!isStaff(interaction.member, config, null)) {
    return interaction.reply({ content: config.messages?.noPermission || 'No permission.', ephemeral: true });
  }

  const subcommand = interaction.options.getSubcommand();
  const group = interaction.options.getSubcommandGroup(false);

  if (subcommand === 'panel') {
    return sendPanel(interaction, interaction.options.getString('panel', true), interaction.options.getChannel('channel', true), config);
  }
  if (subcommand === 'setup') {
    return interaction.reply({ embeds: [setupEmbed(config)], ephemeral: true });
  }
  if (group === 'config' && subcommand === 'reload') {
    config = reloadConfig();
    return interaction.reply({ content: config.messages?.configReloaded || 'Configuration reloaded.', ephemeral: true });
  }
  if (group === 'config' && subcommand === 'get') {
    const dottedPath = interaction.options.getString('path', true);
    const value = getByPath(config, dottedPath);
    return interaction.reply({
      content: `\`${dottedPath}\`\n\`\`\`json\n${JSON.stringify(value, null, 2)?.slice(0, 1800)}\n\`\`\``,
      ephemeral: true
    });
  }
  if (group === 'config' && subcommand === 'set') {
    const dottedPath = interaction.options.getString('path', true);
    const value = parseConfigValue(interaction.options.getString('value', true));
    updateConfig(dottedPath, value);
    return interaction.reply({
      content: `Updated \`${dottedPath}\` to:\n\`\`\`json\n${JSON.stringify(value, null, 2)?.slice(0, 1600)}\n\`\`\``,
      ephemeral: true
    });
  }
  if (group === 'config' && subcommand === 'export') {
    const buffer = Buffer.from(JSON.stringify(publicConfig(config), null, 2), 'utf8');
    return interaction.reply({
      content: 'Current config with secrets hidden.',
      files: [new AttachmentBuilder(buffer, { name: 'config.public.json' })],
      ephemeral: true
    });
  }
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  try {
    const config = getConfig();
    if (interaction.isAutocomplete() && interaction.commandName === 'ticket') {
      const focused = interaction.options.getFocused(true);
      if (focused.name === 'panel') {
        const panels = Object.keys(config.panels || {})
          .filter((id) => id.toLowerCase().includes(String(focused.value).toLowerCase()))
          .slice(0, 25)
          .map((id) => ({ name: id, value: id }));
        return interaction.respond(panels);
      }
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'ticket') {
      return handleTicketCommand(interaction);
    }
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('ticket:open:')) {
      const panelId = interaction.customId.split(':')[2];
      return openTicket(interaction, panelId, interaction.values[0], config);
    }
    if (interaction.isButton()) {
      if (interaction.customId === 'ticket:claim') return claimTicket(interaction, config, true);
      if (interaction.customId === 'ticket:unclaim') return claimTicket(interaction, config, false);
      if (interaction.customId === 'ticket:transcript') return sendTranscript(interaction, config, false);
      if (interaction.customId === 'ticket:close') return closeTicket(interaction, config);
      if (interaction.customId === 'ticket:ai') return aiReply(interaction, config);
    }
  } catch (error) {
    console.error(error);
    const payload = { content: `Error: ${error.message}`, ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null);
    else await interaction.reply(payload).catch(() => null);
  }
});

client.on('messageCreate', async (message) => {
  await maybeAutoAi(message, getConfig()).catch(console.error);
});

const config = getConfig();
if (!config.token || config.token === 'YOUR_DISCORD_BOT_TOKEN') {
  console.error('Set your Discord bot token in config.json before starting.');
  process.exit(1);
}

client.login(config.token);
