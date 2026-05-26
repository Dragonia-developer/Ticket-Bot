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
  { id: 'server', label: 'Server Info', emoji: '🏠', description: 'Name, language, rules and support info' },
  { id: 'bot', label: 'Bot Status', emoji: '🟢', description: 'Discord status and activity text' },
  { id: 'panels', label: 'Ticket Panels', emoji: '🎟️', description: 'The message users click to open tickets' },
  { id: 'categories', label: 'Categories', emoji: '📂', description: 'Ticket types, staff roles and welcome text' },
  { id: 'businessHours', label: 'Business Hours', emoji: '🕒', description: 'Working hours and offline behavior' },
  { id: 'transcript', label: 'Transcripts', emoji: '📄', description: 'HTML files, logs and DM settings' },
  { id: 'ai', label: 'AI Assistant', emoji: '🤖', description: 'Prompt, server info, model and styles' },
  { id: 'messages', label: 'Bot Messages', emoji: '💬', description: 'Texts the bot sends to users' }
];

function configPreview(value) {
  return JSON.stringify(value, null, 2).slice(0, 950);
}

function yesNo(value, fallback = false) {
  const text = String(value ?? '').trim().toLowerCase();
  if (['yes', 'y', 'true', 'on', '1', 'evet', 'aktif', 'open'].includes(text)) return true;
  if (['no', 'n', 'false', 'off', '0', 'hayir', 'hayır', 'kapali', 'kapalı', 'closed'].includes(text)) return false;
  return fallback;
}

function splitList(value) {
  const text = String(value || '').trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    // Comma/newline lists are easier for non-technical users.
  }
  return text.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
}

function sectionHelpEmbed(config) {
  return new EmbedBuilder()
    .setColor(config.colors?.primary || '#3B82F6')
    .setTitle('📘 Values and Simple Paths')
    .setDescription('Use these when you press **Edit Selected** or **Advanced Path Edit**. Boolean means write `yes` or `no`.')
    .addFields(
      { name: '🏠 Server Info', value: '`server.name` -> server name\n`server.description` -> short server description\n`server.rules` -> rules shown to AI' },
      { name: '🟢 Bot Status', value: '`bot.presence.enabled` -> yes/no\n`bot.presence.type` -> Watching, Playing, Listening\n`bot.presence.name` -> status text' },
      { name: '🎟️ Ticket Panel', value: '`panels.support.title` -> panel title\n`panels.support.description` -> panel text\n`panels.support.footer` -> bottom text' },
      { name: '📂 Categories', value: '`categories.general.supportRoleIds` -> role IDs\n`categories.general.welcomeMessage` -> first ticket message\n`categories.general.discordCategoryId` -> parent category ID' },
      { name: '🕒 Business Hours', value: '`businessHours.enabled` -> yes/no\n`businessHours.days.monday[0].start` -> 18:45\n`messages.outsideHoursNotice` -> message inside ticket' },
      { name: '🤖 AI', value: '`ai.enabled` -> yes/no\n`ai.systemPrompt` -> opening prompt\n`ai.serverInfo` -> server knowledge for AI' },
      { name: '👤 User Placeholders', value: '`{opener}` -> user who opened the ticket\n`{ticketUser}` -> same as opener\n`{username}` -> opener name\n`{userId}` -> opener ID' },
      { name: '🛡️ Staff Placeholders', value: '`{claimer}` -> staff who claimed\n`{closer}` -> staff who closed\n`{staff}` -> staff member doing the action\n`{staffName}` -> staff name' },
      { name: '🎫 Ticket Placeholders', value: '`{channel}` -> ticket channel mention\n`{channelName}` -> ticket channel name\n`{ticketName}` -> ticket channel name\n`{category}` -> category name' },
      { name: '🌐 Server Placeholders', value: '`{guild}` -> Discord server name\n`{panel}` -> panel ID\n`{categoryId}` -> category ID' }
    )
    .setFooter({ text: 'Tip: IDs are copied from Discord developer mode.' });
}

function configDashboard(config, sectionId = 'server') {
  const section = configSections.find((entry) => entry.id === sectionId) || configSections[0];
  const value = getByPath(publicConfig(config), section.id);
  const panels = Object.keys(config.panels || {}).join(', ') || 'none';
  const categories = Object.keys(config.categories || {}).join(', ') || 'none';
  const aiState = config.ai?.enabled ? `On (${config.ai.model || 'default model'})` : 'Off';
  const hoursState = config.businessHours?.enabled ? 'On' : 'Off';
  const embed = new EmbedBuilder()
    .setColor(config.colors?.primary || '#3B82F6')
    .setTitle('🎛️ Ticket Bot Control Panel')
    .setDescription([
      '**Only you can see this menu.**',
      'Pick a section below, then press **Edit Selected**.',
      'Each form explains the setting in plain English.'
    ].join('\n'))
    .addFields(
      { name: '🏠 Server', value: config.server?.name || 'Not set', inline: true },
      { name: '🎟️ Panels', value: panels.slice(0, 100), inline: true },
      { name: '📂 Categories', value: categories.slice(0, 100), inline: true },
      { name: '🕒 Business Hours', value: hoursState, inline: true },
      { name: '🤖 AI', value: aiState, inline: true },
      { name: '🧭 Quick Examples', value: '`yes` means enabled. `no` means disabled.\nTimes use 24-hour format: `18:45` and `19:20`.\nRole IDs can be pasted one per line.', inline: false },
      { name: `${section.emoji} Selected: ${section.label}`, value: `\`\`\`json\n${configPreview(value)}\n\`\`\`` }
    )
    .setFooter({ text: 'Tip: use Edit Value for small changes. Use config.json for big changes.' })
    .setTimestamp();
  const select = new StringSelectMenuBuilder()
    .setCustomId('config:view')
    .setPlaceholder('Choose a config section')
    .addOptions(configSections.map((entry) => ({
      label: entry.label,
      description: entry.description,
      emoji: entry.emoji,
      value: entry.id,
      default: entry.id === section.id
    })));
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`config:edit:${section.id}`).setLabel('Edit Selected').setEmoji('✏️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('config:values').setLabel('Values / Paths').setEmoji('📘').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('config:reload').setLabel('Reload File').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('config:export').setLabel('Download Config').setEmoji('📦').setStyle(ButtonStyle.Secondary)
  );
  const advanced = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('config:set').setLabel('Advanced Path Edit').setEmoji('🛠️').setStyle(ButtonStyle.Secondary)
  );
  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(select), buttons, advanced],
    ephemeral: true
  };
}

function input(id, label, placeholder, value = '', style = TextInputStyle.Short, required = false) {
  return new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId(id)
      .setLabel(label.slice(0, 45))
      .setPlaceholder(placeholder.slice(0, 100))
      .setValue(String(value ?? '').slice(0, style === TextInputStyle.Short ? 400 : 3900))
      .setStyle(style)
      .setRequired(required)
  );
}

function configSectionModal(sectionId, config) {
  const modal = new ModalBuilder().setCustomId(`config:section-modal:${sectionId}`);
  if (sectionId === 'server') {
    return modal.setTitle('Server Info').addComponents(
      input('server.name', 'Server name', 'Example: Dragonia Community', config.server?.name, TextInputStyle.Short, true),
      input('server.description', 'What is this server?', 'Short description for staff, users and AI.', config.server?.description, TextInputStyle.Paragraph),
      input('server.language', 'Main language', 'Example: English', config.server?.language),
      input('server.rules', 'Simple rules', 'Example: Be respectful. Do not spam.', config.server?.rules, TextInputStyle.Paragraph),
      input('server.supportInfo', 'Support info', 'Example: We reply between 09:00 and 18:00.', config.server?.supportInfo, TextInputStyle.Paragraph)
    );
  }
  if (sectionId === 'bot') {
    return modal.setTitle('Bot Status').addComponents(
      input('bot.presence.enabled', 'Show bot status? yes/no', 'yes = show status, no = hide custom status', config.bot?.presence?.enabled ? 'yes' : 'no', TextInputStyle.Short, true),
      input('bot.presence.status', 'Online status', 'online, idle, dnd, invisible', config.bot?.presence?.status || 'online'),
      input('bot.presence.type', 'Activity type', 'Watching, Playing, Listening, Competing', config.bot?.presence?.type || 'Watching'),
      input('bot.presence.name', 'Status text', 'Example: support tickets', config.bot?.presence?.name || 'support tickets')
    );
  }
  if (sectionId === 'panels') {
    const panel = config.panels?.support || {};
    return modal.setTitle('Main Ticket Panel').addComponents(
      input('panels.support.title', 'Panel title', 'Example: Support Center', panel.title, TextInputStyle.Short, true),
      input('panels.support.description', 'Panel description', 'Explain what users should do.', panel.description, TextInputStyle.Paragraph, true),
      input('panels.support.subtitleText', 'Small helper text', 'Example: Pick the correct category.', panel.subtitleText, TextInputStyle.Paragraph),
      input('panels.support.selectPlaceholder', 'Dropdown placeholder', 'Example: Choose a support category', panel.selectPlaceholder),
      input('panels.support.footer', 'Panel footer text', 'Example: Do not open duplicate tickets.', panel.footer)
    );
  }
  if (sectionId === 'categories') {
    const category = config.categories?.general || {};
    return modal.setTitle('General Category').addComponents(
      input('categories.general.label', 'Category name', 'Example: General Support', category.label, TextInputStyle.Short, true),
      input('categories.general.description', 'Category description', 'Shown in the ticket dropdown.', category.description, TextInputStyle.Paragraph),
      input('categories.general.supportRoleIds', 'Staff role IDs', 'Paste role IDs. One per line is okay.', (category.supportRoleIds || []).join('\n'), TextInputStyle.Paragraph),
      input('categories.general.discordCategoryId', 'Parent category ID', 'Discord category ID where tickets open.', category.discordCategoryId),
      input('categories.general.welcomeMessage', 'Welcome message', 'First message inside a new ticket.', category.welcomeMessage, TextInputStyle.Paragraph)
    );
  }
  if (sectionId === 'businessHours') {
    const monday = config.businessHours?.days?.monday?.[0] || { start: '09:00', end: '18:00' };
    return modal.setTitle('Business Hours').addComponents(
      input('businessHours.enabled', 'Use business hours? yes/no', 'yes = active, no = always open', config.businessHours?.enabled ? 'yes' : 'no', TextInputStyle.Short, true),
      input('businessHours.range', 'Open between what times?', 'Example: 18:45 - 19:20', `${monday.start || '09:00'} - ${monday.end || '18:00'}`, TextInputStyle.Short, true),
      input('businessHours.allowTicketsOutsideHours', 'Allow tickets outside hours? yes/no', 'yes = users can open tickets after hours', config.businessHours?.allowTicketsOutsideHours ? 'yes' : 'no', TextInputStyle.Short, true),
      input('businessHours.sendNoticeInsideTicket', 'Send after-hours message? yes/no', 'yes = bot writes a notice inside the ticket', config.businessHours?.sendNoticeInsideTicket ? 'yes' : 'no', TextInputStyle.Short, true),
      input('messages.outsideHoursNotice', 'After-hours message', 'Message sent when support is closed.', config.messages?.outsideHoursNotice, TextInputStyle.Paragraph)
    );
  }
  if (sectionId === 'transcript') {
    return modal.setTitle('Transcripts').addComponents(
      input('transcript.enabled', 'Create transcripts? yes/no', 'yes = save ticket history as HTML', config.transcript?.enabled ? 'yes' : 'no', TextInputStyle.Short, true),
      input('transcript.dmUser', 'DM transcript to user? yes/no', 'yes = send transcript in DM after close', config.transcript?.dmUser ? 'yes' : 'no', TextInputStyle.Short, true),
      input('transcript.logChannelId', 'Transcript log channel ID', 'Channel where transcripts are posted.', config.transcript?.logChannelId),
      input('transcript.html.brandName', 'Transcript brand name', 'Example: Dragonia Support', config.transcript?.html?.brandName),
      input('transcript.html.footerText', 'Transcript footer text', 'Small text at the bottom of HTML files.', config.transcript?.html?.footerText)
    );
  }
  if (sectionId === 'ai') {
    return modal.setTitle('AI Assistant').addComponents(
      input('ai.enabled', 'Use AI assistant? yes/no', 'yes = staff can use AI Reply button', config.ai?.enabled ? 'yes' : 'no', TextInputStyle.Short, true),
      input('ai.autoReply', 'AI auto reply? yes/no', 'yes = AI may answer user messages automatically', config.ai?.autoReply ? 'yes' : 'no', TextInputStyle.Short, true),
      input('ai.model', 'AI model', 'Example: gpt-4o-mini', config.ai?.model || 'gpt-4o-mini'),
      input('ai.systemPrompt', 'Opening prompt', 'Tell AI how to behave.', config.ai?.systemPrompt, TextInputStyle.Paragraph),
      input('ai.serverInfo', 'Server knowledge', 'Links, prices, plans, common fixes, rules.', config.ai?.serverInfo, TextInputStyle.Paragraph)
    );
  }
  if (sectionId === 'messages') {
    return modal.setTitle('Bot Messages').addComponents(
      input('messages.ticketCreated', 'Ticket created message', 'Example: Your ticket has been created: {channel}', config.messages?.ticketCreated),
      input('messages.ticketAlreadyOpen', 'Already open message', 'Shown when user has an open ticket.', config.messages?.ticketAlreadyOpen),
      input('messages.outsideHoursBlocked', 'Blocked after-hours message', 'Shown when tickets are closed.', config.messages?.outsideHoursBlocked, TextInputStyle.Paragraph),
      input('messages.ticketClosed', 'Ticket closed message', 'Example: Ticket closed by {user}.', config.messages?.ticketClosed),
      input('messages.aiReplyPrefix', 'AI reply title', 'Example: Suggested answer', config.messages?.aiReplyPrefix)
    );
  }
  return configEditModal();
}

function configEditModal() {
  return new ModalBuilder()
    .setCustomId('config:set-modal')
    .setTitle('Edit One Config Setting')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('path')
          .setLabel('What do you want to change?')
          .setPlaceholder('Example: server.name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('value')
          .setLabel('New value')
          .setPlaceholder('Example: My Cool Server, true, false, or [\"role_id\"]')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      )
    );
}

function readField(interaction, id) {
  return interaction.fields.getTextInputValue(id).trim();
}

function updateMany(entries) {
  let nextConfig = getConfig();
  for (const [path, value] of entries) {
    nextConfig = updateConfig(path, value);
  }
  return nextConfig;
}

function parseTimeRange(value) {
  const match = String(value || '').match(/(\d{1,2}):(\d{2})\s*(?:-|to|until|,)\s*(\d{1,2}):(\d{2})/i);
  if (!match) return { start: '09:00', end: '18:00' };
  const startHour = Math.min(23, Number(match[1])).toString().padStart(2, '0');
  const startMinute = Math.min(59, Number(match[2])).toString().padStart(2, '0');
  const endHour = Math.min(23, Number(match[3])).toString().padStart(2, '0');
  const endMinute = Math.min(59, Number(match[4])).toString().padStart(2, '0');
  return { start: `${startHour}:${startMinute}`, end: `${endHour}:${endMinute}` };
}

function applySectionModal(interaction, sectionId) {
  if (sectionId === 'server') {
    return updateMany([
      ['server.name', readField(interaction, 'server.name')],
      ['server.description', readField(interaction, 'server.description')],
      ['server.language', readField(interaction, 'server.language')],
      ['server.rules', readField(interaction, 'server.rules')],
      ['server.supportInfo', readField(interaction, 'server.supportInfo')]
    ]);
  }
  if (sectionId === 'bot') {
    const current = getConfig();
    return updateMany([
      ['bot.presence.enabled', yesNo(readField(interaction, 'bot.presence.enabled'), current.bot?.presence?.enabled)],
      ['bot.presence.status', readField(interaction, 'bot.presence.status') || 'online'],
      ['bot.presence.type', readField(interaction, 'bot.presence.type') || 'Watching'],
      ['bot.presence.name', readField(interaction, 'bot.presence.name') || 'support tickets']
    ]);
  }
  if (sectionId === 'panels') {
    return updateMany([
      ['panels.support.title', readField(interaction, 'panels.support.title')],
      ['panels.support.description', readField(interaction, 'panels.support.description')],
      ['panels.support.subtitleText', readField(interaction, 'panels.support.subtitleText')],
      ['panels.support.selectPlaceholder', readField(interaction, 'panels.support.selectPlaceholder')],
      ['panels.support.footer', readField(interaction, 'panels.support.footer')]
    ]);
  }
  if (sectionId === 'categories') {
    return updateMany([
      ['categories.general.label', readField(interaction, 'categories.general.label')],
      ['categories.general.description', readField(interaction, 'categories.general.description')],
      ['categories.general.supportRoleIds', splitList(readField(interaction, 'categories.general.supportRoleIds'))],
      ['categories.general.discordCategoryId', readField(interaction, 'categories.general.discordCategoryId')],
      ['categories.general.welcomeMessage', readField(interaction, 'categories.general.welcomeMessage')]
    ]);
  }
  if (sectionId === 'businessHours') {
    const current = getConfig();
    const range = parseTimeRange(readField(interaction, 'businessHours.range'));
    const weekdays = {
      monday: [range],
      tuesday: [range],
      wednesday: [range],
      thursday: [range],
      friday: [range],
      saturday: current.businessHours?.days?.saturday || [],
      sunday: current.businessHours?.days?.sunday || []
    };
    return updateMany([
      ['businessHours.enabled', yesNo(readField(interaction, 'businessHours.enabled'), current.businessHours?.enabled)],
      ['businessHours.days', weekdays],
      ['businessHours.allowTicketsOutsideHours', yesNo(readField(interaction, 'businessHours.allowTicketsOutsideHours'), current.businessHours?.allowTicketsOutsideHours)],
      ['businessHours.sendNoticeInsideTicket', yesNo(readField(interaction, 'businessHours.sendNoticeInsideTicket'), current.businessHours?.sendNoticeInsideTicket)],
      ['messages.outsideHoursNotice', readField(interaction, 'messages.outsideHoursNotice')]
    ]);
  }
  if (sectionId === 'transcript') {
    const current = getConfig();
    return updateMany([
      ['transcript.enabled', yesNo(readField(interaction, 'transcript.enabled'), current.transcript?.enabled)],
      ['transcript.dmUser', yesNo(readField(interaction, 'transcript.dmUser'), current.transcript?.dmUser)],
      ['transcript.logChannelId', readField(interaction, 'transcript.logChannelId')],
      ['transcript.html.brandName', readField(interaction, 'transcript.html.brandName')],
      ['transcript.html.footerText', readField(interaction, 'transcript.html.footerText')]
    ]);
  }
  if (sectionId === 'ai') {
    const current = getConfig();
    return updateMany([
      ['ai.enabled', yesNo(readField(interaction, 'ai.enabled'), current.ai?.enabled)],
      ['ai.autoReply', yesNo(readField(interaction, 'ai.autoReply'), current.ai?.autoReply)],
      ['ai.model', readField(interaction, 'ai.model') || 'gpt-4o-mini'],
      ['ai.systemPrompt', readField(interaction, 'ai.systemPrompt')],
      ['ai.serverInfo', readField(interaction, 'ai.serverInfo')]
    ]);
  }
  if (sectionId === 'messages') {
    return updateMany([
      ['messages.ticketCreated', readField(interaction, 'messages.ticketCreated')],
      ['messages.ticketAlreadyOpen', readField(interaction, 'messages.ticketAlreadyOpen')],
      ['messages.outsideHoursBlocked', readField(interaction, 'messages.outsideHoursBlocked')],
      ['messages.ticketClosed', readField(interaction, 'messages.ticketClosed')],
      ['messages.aiReplyPrefix', readField(interaction, 'messages.aiReplyPrefix')]
    ]);
  }
  return getConfig();
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
        if (interaction.customId.startsWith('config:edit:')) {
          return interaction.showModal(configSectionModal(interaction.customId.split(':')[2], config));
        }
        if (interaction.customId === 'config:set') return interaction.showModal(configEditModal());
        if (interaction.customId === 'config:values') {
          return interaction.reply({ embeds: [sectionHelpEmbed(config)], ephemeral: true });
        }
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
    if (interaction.isModalSubmit() && interaction.customId.startsWith('config:section-modal:')) {
      if (!isStaff(interaction.member, config, null)) {
        return interaction.reply({ content: config.messages?.noPermission || 'No permission.', ephemeral: true });
      }
      const sectionId = interaction.customId.split(':')[2];
      const nextConfig = applySectionModal(interaction, sectionId);
      applyPresence(nextConfig);
      const dashboard = configDashboard(nextConfig, sectionId);
      return interaction.reply({
        content: `Saved **${configSections.find((entry) => entry.id === sectionId)?.label || sectionId}** settings.`,
        embeds: dashboard.embeds,
        components: dashboard.components,
        ephemeral: true
      });
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
