const {
  ActionRowBuilder,
  ActivityType,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  ModalBuilder,
  Partials,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
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

const configSections = [
  { id: 'server', label: 'Server', description: 'Name, language, rules and support info' },
  { id: 'bot', label: 'Bot Status', description: 'Presence and activity text' },
  { id: 'panels', label: 'Panels', description: 'Ticket panel text and layout' },
  { id: 'categories', label: 'Categories', description: 'Ticket types, staff roles and welcome text' },
  { id: 'businessHours', label: 'Business Hours', description: 'Working hours and outside-hours behavior' },
  { id: 'transcript', label: 'Transcripts', description: 'HTML transcript and DM settings' },
  { id: 'ai', label: 'AI Replies', description: 'Prompt, server info, model and styles' },
  { id: 'messages', label: 'Messages', description: 'All public bot messages' }
];

function configPreview(value) {
  return JSON.stringify(value, null, 2).slice(0, 950);
}

function configDashboard(config, sectionId = 'server') {
  const section = configSections.find((entry) => entry.id === sectionId) || configSections[0];
  const value = getByPath(publicConfig(config), section.id);
  const panels = Object.keys(config.panels || {}).join(', ') || 'none';
  const categories = Object.keys(config.categories || {}).join(', ') || 'none';
  const embed = new EmbedBuilder()
    .setColor(config.colors?.primary || '#3B82F6')
    .setTitle('Ticket Bot Config Panel')
    .setDescription('This private panel is only visible to you. Choose a section, export config, reload config, or open the edit form.')
    .addFields(
      { name: 'Server', value: config.server?.name || 'Not set', inline: true },
      { name: 'Panels', value: panels.slice(0, 100), inline: true },
      { name: 'Categories', value: categories.slice(0, 100), inline: true },
      { name: `Selected: ${section.label}`, value: `\`\`\`json\n${configPreview(value)}\n\`\`\`` }
    )
    .setFooter({ text: 'Use dot paths like server.name or panels.support.title when editing.' })
    .setTimestamp();
  const select = new StringSelectMenuBuilder()
    .setCustomId('config:view')
    .setPlaceholder('Choose a config section')
    .addOptions(configSections.map((entry) => ({
      label: entry.label,
      description: entry.description,
      value: entry.id,
      default: entry.id === section.id
    })));
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('config:set').setLabel('Edit Value').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('config:reload').setLabel('Reload').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('config:export').setLabel('Export').setStyle(ButtonStyle.Secondary)
  );
  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(select), buttons],
    ephemeral: true
  };
}

function configEditModal() {
  return new ModalBuilder()
    .setCustomId('config:set-modal')
    .setTitle('Edit Config Value')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('path')
          .setLabel('Config path')
          .setPlaceholder('Example: server.name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('value')
          .setLabel('New value')
          .setPlaceholder('Plain text, true, false, number, array or JSON object')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      )
    );
}

function applyPresence(config) {
  const presence = config.bot?.presence;
  if (!presence?.enabled || !client.user) return;
  const type = ActivityType[presence.type] ?? ActivityType.Watching;
  client.user.setPresence({
    status: presence.status || 'online',
    activities: presence.name ? [{ name: presence.name, type }] : []
  });
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
  if (subcommand === 'config') {
    return interaction.reply(configDashboard(config));
  }
  if (group === 'config' && subcommand === 'reload') {
    config = reloadConfig();
    applyPresence(config);
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
  applyPresence(getConfig());
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
    if (interaction.isStringSelectMenu() && interaction.customId === 'config:view') {
      if (!isStaff(interaction.member, config, null)) {
        return interaction.reply({ content: config.messages?.noPermission || 'No permission.', ephemeral: true });
      }
      return interaction.update(configDashboard(config, interaction.values[0]));
    }
    if (interaction.isButton()) {
      if (interaction.customId.startsWith('config:')) {
        if (!isStaff(interaction.member, config, null)) {
          return interaction.reply({ content: config.messages?.noPermission || 'No permission.', ephemeral: true });
        }
        if (interaction.customId === 'config:set') return interaction.showModal(configEditModal());
        if (interaction.customId === 'config:reload') {
          const nextConfig = reloadConfig();
          applyPresence(nextConfig);
          return interaction.update(configDashboard(nextConfig));
        }
        if (interaction.customId === 'config:export') {
          const buffer = Buffer.from(JSON.stringify(publicConfig(config), null, 2), 'utf8');
          return interaction.reply({
            content: 'Current config with secrets hidden.',
            files: [new AttachmentBuilder(buffer, { name: 'config.public.json' })],
            ephemeral: true
          });
        }
      }
      if (interaction.customId === 'ticket:claim') return claimTicket(interaction, config, true);
      if (interaction.customId === 'ticket:unclaim') return claimTicket(interaction, config, false);
      if (interaction.customId === 'ticket:transcript') return sendTranscript(interaction, config, false);
      if (interaction.customId === 'ticket:close') return closeTicket(interaction, config);
      if (interaction.customId === 'ticket:ai') return aiReply(interaction, config);
    }
    if (interaction.isModalSubmit() && interaction.customId === 'config:set-modal') {
      if (!isStaff(interaction.member, config, null)) {
        return interaction.reply({ content: config.messages?.noPermission || 'No permission.', ephemeral: true });
      }
      const dottedPath = interaction.fields.getTextInputValue('path').trim();
      const value = parseConfigValue(interaction.fields.getTextInputValue('value').trim());
      const nextConfig = updateConfig(dottedPath, value);
      applyPresence(nextConfig);
      return interaction.reply({
        content: `Updated \`${dottedPath}\`.\n\`\`\`json\n${JSON.stringify(value, null, 2).slice(0, 1600)}\n\`\`\``,
        embeds: configDashboard(nextConfig, dottedPath.split('.')[0]).embeds,
        components: configDashboard(nextConfig, dottedPath.split('.')[0]).components,
        ephemeral: true
      });
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
