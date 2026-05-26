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
  { id: 'logs', label: 'Logs', emoji: '📌', description: 'Log channel and logged events' },
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
    .setTitle('📘 Panel Values and Help')
    .setDescription('These values work inside panel messages, panel category welcome text, panel logs and ticket text.')
    .addFields(
      { name: '🎟️ Panel Profile', value: 'A panel is a full support profile. It has its own categories, staff roles, messages, hours, transcript, AI and logs.' },
      { name: '📂 Category Line Format', value: '`id | label | description | staffRoleIds | parentCategoryId | channelName`' },
      { name: '🕒 yes/no and time', value: '`yes` = enabled\n`no` = disabled\nUse time like `09:00 - 18:00`.' },
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
  const logState = config.logs?.enabled ? `On (${config.logs.channelId ? `<#${config.logs.channelId}>` : 'no channel'})` : 'Off';
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
      { name: '📌 Logs', value: logState, inline: true },
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
  const panelTools = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('config:panels').setLabel('Manage Panels').setEmoji('🎟️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('config:logs').setLabel('Log Settings').setEmoji('📌').setStyle(ButtonStyle.Secondary)
  );
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
    components: [panelTools, new ActionRowBuilder().addComponents(select), buttons, advanced],
    ephemeral: true
  };
}

function panelDashboard(config, selectedId = Object.keys(config.panels || {})[0] || 'support') {
  const panels = config.panels || {};
  const selected = panels[selectedId] || {};
  const options = Object.keys(panels).slice(0, 25).map((id) => ({
    label: id,
    description: `${panels[id].enabled === false ? 'Disabled' : 'Enabled'} - ${(panels[id].title || 'No title').slice(0, 60)}`,
    value: id,
    default: id === selectedId
  }));
  const embed = new EmbedBuilder()
    .setColor(config.colors?.primary || '#3B82F6')
    .setTitle('🎟️ Ticket Panel Manager')
    .setDescription([
      '**This is the first config screen.**',
      'Choose a panel below, create a new one, delete one, or open that panel settings.',
      'Each panel can have its own text, categories and log channel.'
    ].join('\n'))
    .addFields(
      { name: 'Selected Panel', value: `\`${selectedId}\``, inline: true },
      { name: 'Status', value: selected.enabled === false ? 'Disabled' : 'Enabled', inline: true },
      { name: 'Title', value: selected.title || 'Not set', inline: false },
      { name: 'Categories', value: (Array.isArray(selected.categories) ? selected.categories : Object.keys(selected.categories || {})).join(', ') || 'None', inline: false },
      { name: 'Panel Log', value: selected.logs?.enabled ? `Enabled ${selected.logs.channelId ? `(<#${selected.logs.channelId}>)` : '(no channel)'}` : 'Uses global log settings or disabled', inline: false }
    )
    .setFooter({ text: 'Tip: after creating a panel, use /ticket panel panel:<id> channel:#channel to send it.' });
  const rows = [];
  if (options.length) {
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('panel-manager:select')
        .setPlaceholder('Choose a panel')
        .addOptions(options)
    ));
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('panel-manager:create').setLabel('Create Panel').setEmoji('➕').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`panel-manager:edit:${selectedId}`).setLabel('Panel Config').setEmoji('✏️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`panel-manager:categories:${selectedId}`).setLabel('Panel Categories').setEmoji('📂').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`panel-manager:logs:${selectedId}`).setLabel('Panel Logs').setEmoji('📌').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`panel-manager:delete:${selectedId}`).setLabel('Delete').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
  ));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`panel-manager:messages:${selectedId}`).setLabel('Panel Messages').setEmoji('💬').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`panel-manager:hours:${selectedId}`).setLabel('Panel Hours').setEmoji('🕒').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`panel-manager:transcript:${selectedId}`).setLabel('Panel Transcript').setEmoji('📄').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`panel-manager:ai:${selectedId}`).setLabel('Panel AI').setEmoji('🤖').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('panel-manager:values').setLabel('Values / Help').setEmoji('📘').setStyle(ButtonStyle.Secondary)
  ));
  return { embeds: [embed], components: rows, ephemeral: true };
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
  if (sectionId === 'logs') {
    const events = config.logs?.events || {};
    return modal.setTitle('Log Settings').addComponents(
      input('logs.enabled', 'Use logs? yes/no', 'yes = send log messages to a channel', config.logs?.enabled ? 'yes' : 'no', TextInputStyle.Short, true),
      input('logs.channelId', 'Log channel ID', 'Paste the channel ID where logs should go.', config.logs?.channelId || ''),
      input('logs.events', 'What should be logged? yes/no list', 'ticketCreated=yes, ticketClosed=yes, aiReplyUsed=no', [
        `panelSent=${events.panelSent === false ? 'no' : 'yes'}`,
        `ticketCreated=${events.ticketCreated === false ? 'no' : 'yes'}`,
        `ticketClaimed=${events.ticketClaimed === false ? 'no' : 'yes'}`,
        `ticketUnclaimed=${events.ticketUnclaimed === false ? 'no' : 'yes'}`,
        `ticketClosed=${events.ticketClosed === false ? 'no' : 'yes'}`,
        `transcriptCreated=${events.transcriptCreated === false ? 'no' : 'yes'}`,
        `aiReplyUsed=${events.aiReplyUsed === false ? 'no' : 'yes'}`
      ].join('\n'), TextInputStyle.Paragraph, true)
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

function panelEditModal(panelId, config) {
  const panel = config.panels?.[panelId] || {};
  return new ModalBuilder()
    .setCustomId(`panel-manager:edit-modal:${panelId}`)
    .setTitle(`Edit Panel: ${panelId}`.slice(0, 45))
    .addComponents(
      input('enabled', 'Panel active? yes/no', 'yes = users can use this panel', panel.enabled === false ? 'no' : 'yes', TextInputStyle.Short, true),
      input('title', 'Panel title', 'Example: Support Center', panel.title || '', TextInputStyle.Short, true),
      input('description', 'Panel description', 'Main text users will read.', panel.description || '', TextInputStyle.Paragraph, true),
      input('categories', 'Categories on this panel', 'Example: general, billing, technical', (panel.categories || []).join(', '), TextInputStyle.Paragraph, true),
      input('footer', 'Footer text', 'Small text at the bottom of the panel.', panel.footer || '', TextInputStyle.Paragraph)
    );
}

function panelLogsModal(panelId, config) {
  const logs = config.panels?.[panelId]?.logs || {};
  const events = logs.events || {};
  return new ModalBuilder()
    .setCustomId(`panel-manager:logs-modal:${panelId}`)
    .setTitle(`Panel Logs: ${panelId}`.slice(0, 45))
    .addComponents(
      input('enabled', 'Use separate panel logs? yes/no', 'yes = this panel has its own log settings', logs.enabled ? 'yes' : 'no', TextInputStyle.Short, true),
      input('channelId', 'Panel log channel ID', 'Leave empty to use global logs or disable panel logs.', logs.channelId || ''),
      input('events', 'Events to log for this panel', 'ticketCreated=yes, ticketClosed=yes, aiReplyUsed=no', [
        `panelSent=${events.panelSent === false ? 'no' : 'yes'}`,
        `ticketCreated=${events.ticketCreated === false ? 'no' : 'yes'}`,
        `ticketClaimed=${events.ticketClaimed === false ? 'no' : 'yes'}`,
        `ticketUnclaimed=${events.ticketUnclaimed === false ? 'no' : 'yes'}`,
        `ticketClosed=${events.ticketClosed === false ? 'no' : 'yes'}`,
        `transcriptCreated=${events.transcriptCreated === false ? 'no' : 'yes'}`,
        `aiReplyUsed=${events.aiReplyUsed === false ? 'no' : 'yes'}`
      ].join('\n'), TextInputStyle.Paragraph, true)
    );
}

function panelMessagesModal(panelId, config) {
  const messages = config.panels?.[panelId]?.messages || {};
  return new ModalBuilder()
    .setCustomId(`panel-manager:messages-modal:${panelId}`)
    .setTitle(`Panel Messages: ${panelId}`.slice(0, 45))
    .addComponents(
      input('ticketCreated', 'Ticket created message', 'Example: {opener}, your ticket is ready: {channel}', messages.ticketCreated || config.messages?.ticketCreated || ''),
      input('ticketAlreadyOpen', 'Already open message', 'Shown when user already has a ticket.', messages.ticketAlreadyOpen || config.messages?.ticketAlreadyOpen || ''),
      input('ticketClaimed', 'Claim message', 'Example: Ticket claimed by {claimer}.', messages.ticketClaimed || config.messages?.ticketClaimed || ''),
      input('ticketUnclaimed', 'Unclaim message', 'Example: Ticket claim removed by {staff}.', messages.ticketUnclaimed || config.messages?.ticketUnclaimed || ''),
      input('ticketClosed', 'Close message', 'Example: Ticket closed by {closer}.', messages.ticketClosed || config.messages?.ticketClosed || '')
    );
}

function panelHoursModal(panelId, config) {
  const hours = config.panels?.[panelId]?.businessHours || config.businessHours || {};
  const monday = hours.days?.monday?.[0] || { start: '09:00', end: '18:00' };
  const messages = config.panels?.[panelId]?.messages || {};
  return new ModalBuilder()
    .setCustomId(`panel-manager:hours-modal:${panelId}`)
    .setTitle(`Panel Hours: ${panelId}`.slice(0, 45))
    .addComponents(
      input('enabled', 'Use panel business hours? yes/no', 'yes = this panel follows hours', hours.enabled ? 'yes' : 'no', TextInputStyle.Short, true),
      input('range', 'Open between what times?', 'Example: 18:45 - 19:20', `${monday.start || '09:00'} - ${monday.end || '18:00'}`, TextInputStyle.Short, true),
      input('allowTicketsOutsideHours', 'Allow outside hours? yes/no', 'yes = still open tickets after hours', hours.allowTicketsOutsideHours ? 'yes' : 'no', TextInputStyle.Short, true),
      input('sendNoticeInsideTicket', 'Send after-hours notice? yes/no', 'yes = post notice inside ticket', hours.sendNoticeInsideTicket ? 'yes' : 'no', TextInputStyle.Short, true),
      input('outsideHoursNotice', 'After-hours notice message', 'Example: Support is closed. Leave your message here.', messages.outsideHoursNotice || config.messages?.outsideHoursNotice || '', TextInputStyle.Paragraph)
    );
}

function panelTranscriptModal(panelId, config) {
  const transcript = config.panels?.[panelId]?.transcript || config.transcript || {};
  return new ModalBuilder()
    .setCustomId(`panel-manager:transcript-modal:${panelId}`)
    .setTitle(`Panel Transcript: ${panelId}`.slice(0, 45))
    .addComponents(
      input('enabled', 'Create transcripts? yes/no', 'yes = save ticket history as HTML', transcript.enabled ? 'yes' : 'no', TextInputStyle.Short, true),
      input('dmUser', 'DM transcript to user? yes/no', 'yes = send transcript after close', transcript.dmUser ? 'yes' : 'no', TextInputStyle.Short, true),
      input('logChannelId', 'Transcript log channel ID', 'Leave empty to use panel/global log settings.', transcript.logChannelId || ''),
      input('brandName', 'Transcript brand name', 'Example: Support Team', transcript.html?.brandName || config.transcript?.html?.brandName || ''),
      input('footerText', 'Transcript footer text', 'Small text at the bottom of transcript.', transcript.html?.footerText || config.transcript?.html?.footerText || '')
    );
}

function panelAiModal(panelId, config) {
  const ai = config.panels?.[panelId]?.ai || config.ai || {};
  return new ModalBuilder()
    .setCustomId(`panel-manager:ai-modal:${panelId}`)
    .setTitle(`Panel AI: ${panelId}`.slice(0, 45))
    .addComponents(
      input('enabled', 'Use AI for this panel? yes/no', 'yes = show AI Reply for this panel', ai.enabled ? 'yes' : 'no', TextInputStyle.Short, true),
      input('autoReply', 'Auto reply? yes/no', 'yes = AI may reply automatically', ai.autoReply ? 'yes' : 'no', TextInputStyle.Short, true),
      input('model', 'AI model', 'Example: gpt-4o-mini', ai.model || 'gpt-4o-mini'),
      input('systemPrompt', 'Panel AI opening prompt', 'Tell AI how to behave for this support profile.', ai.systemPrompt || config.ai?.systemPrompt || '', TextInputStyle.Paragraph),
      input('serverInfo', 'Panel AI knowledge', 'Links, rules, products, prices or common fixes.', ai.serverInfo || config.ai?.serverInfo || '', TextInputStyle.Paragraph)
    );
}

function panelCategoriesModal(panelId, config) {
  const panel = config.panels?.[panelId] || {};
  const ids = Array.isArray(panel.categories) ? panel.categories : Object.keys(panel.categories || {});
  const overrides = panel.categoryOverrides || {};
  const lines = ids.map((id) => {
    const category = { ...(config.categories?.[id] || {}), ...(overrides[id] || {}) };
    return [
      id,
      category.label || id,
      category.description || 'Support request',
      (category.supportRoleIds || []).join(','),
      category.discordCategoryId || '',
      category.channelName || `${id}-{username}`
    ].join(' | ');
  }).join('\n');
  return new ModalBuilder()
    .setCustomId(`panel-manager:categories-modal:${panelId}`)
    .setTitle(`Panel Categories: ${panelId}`.slice(0, 45))
    .addComponents(
      input('categories', 'Categories for this panel', 'id | label | description | roleIds | parentCategoryId | channelName', lines || 'general | General Support | General questions |  |  | ticket-{username}', TextInputStyle.Paragraph, true),
      input('welcomeTitle', 'Default welcome title', 'Example: Welcome, {opener}', panel.defaultWelcomeTitle || 'Welcome, {opener}'),
      input('welcomeMessage', 'Default welcome message', 'Used when category has no custom welcome message.', panel.defaultWelcomeMessage || 'Please describe your request clearly.', TextInputStyle.Paragraph),
      input('topic', 'Default ticket topic', 'Example: Ticket for {opener} | {category}', panel.defaultTopic || 'Ticket for {opener} | Category: {category}')
    );
}

function panelCreateModal() {
  return new ModalBuilder()
    .setCustomId('panel-manager:create-modal')
    .setTitle('Create New Panel')
    .addComponents(
      input('id', 'Panel ID', 'Example: support, reports, staff-help', '', TextInputStyle.Short, true),
      input('title', 'Panel title', 'Example: Support Center', '', TextInputStyle.Short, true),
      input('description', 'Panel description', 'Main text users will read.', 'Choose the topic that best matches your request.', TextInputStyle.Paragraph, true),
      input('categories', 'Categories on this panel', 'Example: general, billing, technical', 'general, billing, technical', TextInputStyle.Paragraph, true),
      input('footer', 'Footer text', 'Example: Please do not open duplicate tickets.', 'Please do not open duplicate tickets.', TextInputStyle.Paragraph)
    );
}

function normalizePanelId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
}

function panelFromModal(interaction, existing = {}) {
  const categories = splitList(readField(interaction, 'categories'));
  return {
    ...existing,
    enabled: yesNo(readField(interaction, 'enabled'), existing.enabled !== false),
    title: readField(interaction, 'title'),
    description: readField(interaction, 'description'),
    subtitle: existing.subtitle || 'Before opening a ticket',
    subtitleText: existing.subtitleText || 'Please choose the correct category and describe your issue clearly.',
    fields: existing.fields || [],
    footer: readField(interaction, 'footer'),
    image: existing.image || '',
    thumbnail: existing.thumbnail || '',
    logs: existing.logs || { enabled: false, channelId: '', events: {} },
    selectPlaceholder: existing.selectPlaceholder || 'Choose a support category',
    allowMultipleOpenTickets: Boolean(existing.allowMultipleOpenTickets),
    categories,
    categoryOverrides: existing.categoryOverrides || Object.fromEntries(categories.map((id) => [id, {}]))
  };
}

function parsePanelCategories(value, panel = {}) {
  const categories = [];
  const categoryOverrides = {};
  for (const rawLine of String(value || '').split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const [rawId, label, description, roleIds, parentId, channelName] = line.split('|').map((part) => part?.trim() || '');
    const id = normalizePanelId(rawId);
    if (!id) continue;
    categories.push(id);
    categoryOverrides[id] = {
      enabled: true,
      label: label || id,
      description: description || 'Support request',
      supportRoleIds: splitList(roleIds || ''),
      discordCategoryId: parentId || '',
      channelName: channelName || `${id}-{username}`,
      welcomeTitle: panel.defaultWelcomeTitle || 'Welcome, {opener}',
      welcomeMessage: panel.defaultWelcomeMessage || 'Please describe your request clearly.',
      topic: panel.defaultTopic || 'Ticket for {opener} | Category: {category}',
      aiStyle: 'friendly'
    };
  }
  return { categories, categoryOverrides };
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
  try {
    return interaction.fields.getTextInputValue(id).trim();
  } catch {
    return '';
  }
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

function parseEventToggles(value, current = {}) {
  const allowed = ['panelSent', 'ticketCreated', 'ticketClaimed', 'ticketUnclaimed', 'ticketClosed', 'transcriptCreated', 'aiReplyUsed'];
  const next = { ...current };
  for (const line of String(value || '').split(/\n|,/)) {
    const match = line.trim().match(/^([a-zA-Z]+)\s*[:=]\s*(.+)$/);
    if (!match) continue;
    const key = allowed.find((event) => event.toLowerCase() === match[1].toLowerCase());
    if (key) next[key] = yesNo(match[2], next[key] !== false);
  }
  for (const key of allowed) {
    if (next[key] === undefined) next[key] = true;
  }
  return next;
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
  if (sectionId === 'logs') {
    const current = getConfig();
    return updateMany([
      ['logs.enabled', yesNo(readField(interaction, 'logs.enabled'), current.logs?.enabled)],
      ['logs.channelId', readField(interaction, 'logs.channelId')],
      ['logs.events', parseEventToggles(readField(interaction, 'logs.events'), current.logs?.events)]
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
    return interaction.reply(panelDashboard(config));
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
    if (interaction.isStringSelectMenu() && interaction.customId === 'panel-manager:select') {
      if (!isStaff(interaction.member, config, null)) {
        return interaction.reply({ content: config.messages?.noPermission || 'No permission.', ephemeral: true });
      }
      return interaction.update(panelDashboard(config, interaction.values[0]));
    }
    if (interaction.isButton()) {
      if (interaction.customId.startsWith('config:')) {
        if (!isStaff(interaction.member, config, null)) {
          return interaction.reply({ content: config.messages?.noPermission || 'No permission.', ephemeral: true });
        }
        if (interaction.customId.startsWith('config:edit:')) {
          return interaction.showModal(configSectionModal(interaction.customId.split(':')[2], config));
        }
        if (interaction.customId === 'config:panels') return interaction.update(panelDashboard(config));
        if (interaction.customId === 'config:logs') {
          return interaction.update(configDashboard(config, 'logs'));
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
      if (interaction.customId.startsWith('panel-manager:')) {
        if (!isStaff(interaction.member, config, null)) {
          return interaction.reply({ content: config.messages?.noPermission || 'No permission.', ephemeral: true });
        }
        if (interaction.customId === 'panel-manager:create') return interaction.showModal(panelCreateModal());
        if (interaction.customId === 'panel-manager:values') {
          return interaction.reply({ embeds: [sectionHelpEmbed(config)], ephemeral: true });
        }
        if (interaction.customId.startsWith('panel-manager:edit:')) {
          return interaction.showModal(panelEditModal(interaction.customId.split(':')[2], config));
        }
        if (interaction.customId.startsWith('panel-manager:logs:')) {
          return interaction.showModal(panelLogsModal(interaction.customId.split(':')[2], config));
        }
        if (interaction.customId.startsWith('panel-manager:categories:')) {
          return interaction.showModal(panelCategoriesModal(interaction.customId.split(':')[2], config));
        }
        if (interaction.customId.startsWith('panel-manager:messages:')) {
          return interaction.showModal(panelMessagesModal(interaction.customId.split(':')[2], config));
        }
        if (interaction.customId.startsWith('panel-manager:hours:')) {
          return interaction.showModal(panelHoursModal(interaction.customId.split(':')[2], config));
        }
        if (interaction.customId.startsWith('panel-manager:transcript:')) {
          return interaction.showModal(panelTranscriptModal(interaction.customId.split(':')[2], config));
        }
        if (interaction.customId.startsWith('panel-manager:ai:')) {
          return interaction.showModal(panelAiModal(interaction.customId.split(':')[2], config));
        }
        if (interaction.customId.startsWith('panel-manager:delete:')) {
          const panelId = interaction.customId.split(':')[2];
          const nextPanels = { ...(config.panels || {}) };
          if (Object.keys(nextPanels).length <= 1) {
            return interaction.reply({ content: 'You must keep at least one panel.', ephemeral: true });
          }
          delete nextPanels[panelId];
          const nextConfig = updateConfig('panels', nextPanels);
          return interaction.update(panelDashboard(nextConfig));
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
    if (interaction.isModalSubmit() && interaction.customId === 'panel-manager:create-modal') {
      if (!isStaff(interaction.member, config, null)) {
        return interaction.reply({ content: config.messages?.noPermission || 'No permission.', ephemeral: true });
      }
      const panelId = normalizePanelId(readField(interaction, 'id'));
      if (!panelId) return interaction.reply({ content: 'Panel ID is required. Use letters, numbers, dash or underscore.', ephemeral: true });
      const current = getConfig();
      if (current.panels?.[panelId]) return interaction.reply({ content: `Panel \`${panelId}\` already exists.`, ephemeral: true });
      const nextPanels = {
        ...(current.panels || {}),
        [panelId]: panelFromModal(interaction, { enabled: true })
      };
      const nextConfig = updateConfig('panels', nextPanels);
      return interaction.reply({
        content: `Created panel \`${panelId}\`.`,
        embeds: panelDashboard(nextConfig, panelId).embeds,
        components: panelDashboard(nextConfig, panelId).components,
        ephemeral: true
      });
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith('panel-manager:edit-modal:')) {
      if (!isStaff(interaction.member, config, null)) {
        return interaction.reply({ content: config.messages?.noPermission || 'No permission.', ephemeral: true });
      }
      const panelId = interaction.customId.split(':')[2];
      const current = getConfig();
      const nextPanels = {
        ...(current.panels || {}),
        [panelId]: panelFromModal(interaction, current.panels?.[panelId] || {})
      };
      const nextConfig = updateConfig('panels', nextPanels);
      return interaction.reply({
        content: `Saved panel \`${panelId}\`.`,
        embeds: panelDashboard(nextConfig, panelId).embeds,
        components: panelDashboard(nextConfig, panelId).components,
        ephemeral: true
      });
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith('panel-manager:logs-modal:')) {
      if (!isStaff(interaction.member, config, null)) {
        return interaction.reply({ content: config.messages?.noPermission || 'No permission.', ephemeral: true });
      }
      const panelId = interaction.customId.split(':')[2];
      const current = getConfig();
      const panel = current.panels?.[panelId] || {};
      const nextPanels = {
        ...(current.panels || {}),
        [panelId]: {
          ...panel,
          logs: {
            enabled: yesNo(readField(interaction, 'enabled'), panel.logs?.enabled),
            channelId: readField(interaction, 'channelId'),
            events: parseEventToggles(readField(interaction, 'events'), panel.logs?.events)
          }
        }
      };
      const nextConfig = updateConfig('panels', nextPanels);
      return interaction.reply({
        content: `Saved log settings for panel \`${panelId}\`.`,
        embeds: panelDashboard(nextConfig, panelId).embeds,
        components: panelDashboard(nextConfig, panelId).components,
        ephemeral: true
      });
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith('panel-manager:categories-modal:')) {
      if (!isStaff(interaction.member, config, null)) {
        return interaction.reply({ content: config.messages?.noPermission || 'No permission.', ephemeral: true });
      }
      const panelId = interaction.customId.split(':')[2];
      const current = getConfig();
      const panel = current.panels?.[panelId] || {};
      const parsed = parsePanelCategories(readField(interaction, 'categories'), panel);
      if (!parsed.categories.length) {
        return interaction.reply({ content: 'Add at least one category line.', ephemeral: true });
      }
      const defaultWelcomeTitle = readField(interaction, 'welcomeTitle') || 'Welcome, {opener}';
      const defaultWelcomeMessage = readField(interaction, 'welcomeMessage') || 'Please describe your request clearly.';
      const defaultTopic = readField(interaction, 'topic') || 'Ticket for {opener} | Category: {category}';
      for (const id of parsed.categories) {
        parsed.categoryOverrides[id].welcomeTitle = panel.categoryOverrides?.[id]?.welcomeTitle || defaultWelcomeTitle;
        parsed.categoryOverrides[id].welcomeMessage = panel.categoryOverrides?.[id]?.welcomeMessage || defaultWelcomeMessage;
        parsed.categoryOverrides[id].topic = panel.categoryOverrides?.[id]?.topic || defaultTopic;
      }
      const nextPanels = {
        ...(current.panels || {}),
        [panelId]: {
          ...panel,
          categories: parsed.categories,
          categoryOverrides: parsed.categoryOverrides,
          defaultWelcomeTitle,
          defaultWelcomeMessage,
          defaultTopic
        }
      };
      const nextConfig = updateConfig('panels', nextPanels);
      return interaction.reply({
        content: `Saved categories for panel \`${panelId}\`.`,
        embeds: panelDashboard(nextConfig, panelId).embeds,
        components: panelDashboard(nextConfig, panelId).components,
        ephemeral: true
      });
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith('panel-manager:messages-modal:')) {
      if (!isStaff(interaction.member, config, null)) {
        return interaction.reply({ content: config.messages?.noPermission || 'No permission.', ephemeral: true });
      }
      const panelId = interaction.customId.split(':')[2];
      const current = getConfig();
      const panel = current.panels?.[panelId] || {};
      const nextPanels = {
        ...(current.panels || {}),
        [panelId]: {
          ...panel,
          messages: {
            ...(panel.messages || {}),
            ticketCreated: readField(interaction, 'ticketCreated'),
            ticketAlreadyOpen: readField(interaction, 'ticketAlreadyOpen'),
            ticketClaimed: readField(interaction, 'ticketClaimed'),
            ticketUnclaimed: readField(interaction, 'ticketUnclaimed'),
            ticketClosed: readField(interaction, 'ticketClosed')
          }
        }
      };
      const nextConfig = updateConfig('panels', nextPanels);
      return interaction.reply({
        content: `Saved messages for panel \`${panelId}\`.`,
        embeds: panelDashboard(nextConfig, panelId).embeds,
        components: panelDashboard(nextConfig, panelId).components,
        ephemeral: true
      });
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith('panel-manager:hours-modal:')) {
      if (!isStaff(interaction.member, config, null)) {
        return interaction.reply({ content: config.messages?.noPermission || 'No permission.', ephemeral: true });
      }
      const panelId = interaction.customId.split(':')[2];
      const current = getConfig();
      const panel = current.panels?.[panelId] || {};
      const range = parseTimeRange(readField(interaction, 'range'));
      const nextPanels = {
        ...(current.panels || {}),
        [panelId]: {
          ...panel,
          businessHours: {
            ...(panel.businessHours || {}),
            enabled: yesNo(readField(interaction, 'enabled'), panel.businessHours?.enabled),
            timezone: panel.businessHours?.timezone || current.businessHours?.timezone || current.timezone,
            allowTicketsOutsideHours: yesNo(readField(interaction, 'allowTicketsOutsideHours'), panel.businessHours?.allowTicketsOutsideHours),
            sendNoticeInsideTicket: yesNo(readField(interaction, 'sendNoticeInsideTicket'), panel.businessHours?.sendNoticeInsideTicket),
            days: {
              monday: [range],
              tuesday: [range],
              wednesday: [range],
              thursday: [range],
              friday: [range],
              saturday: panel.businessHours?.days?.saturday || [],
              sunday: panel.businessHours?.days?.sunday || []
            }
          },
          messages: {
            ...(panel.messages || {}),
            outsideHoursNotice: readField(interaction, 'outsideHoursNotice')
          }
        }
      };
      const nextConfig = updateConfig('panels', nextPanels);
      return interaction.reply({
        content: `Saved business hours for panel \`${panelId}\`.`,
        embeds: panelDashboard(nextConfig, panelId).embeds,
        components: panelDashboard(nextConfig, panelId).components,
        ephemeral: true
      });
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith('panel-manager:transcript-modal:')) {
      if (!isStaff(interaction.member, config, null)) {
        return interaction.reply({ content: config.messages?.noPermission || 'No permission.', ephemeral: true });
      }
      const panelId = interaction.customId.split(':')[2];
      const current = getConfig();
      const panel = current.panels?.[panelId] || {};
      const nextPanels = {
        ...(current.panels || {}),
        [panelId]: {
          ...panel,
          transcript: {
            ...(panel.transcript || {}),
            enabled: yesNo(readField(interaction, 'enabled'), panel.transcript?.enabled),
            dmUser: yesNo(readField(interaction, 'dmUser'), panel.transcript?.dmUser),
            saveToFile: panel.transcript?.saveToFile ?? current.transcript?.saveToFile ?? true,
            logChannelId: readField(interaction, 'logChannelId'),
            html: {
              ...(current.transcript?.html || {}),
              ...(panel.transcript?.html || {}),
              brandName: readField(interaction, 'brandName'),
              footerText: readField(interaction, 'footerText')
            }
          }
        }
      };
      const nextConfig = updateConfig('panels', nextPanels);
      return interaction.reply({
        content: `Saved transcript settings for panel \`${panelId}\`.`,
        embeds: panelDashboard(nextConfig, panelId).embeds,
        components: panelDashboard(nextConfig, panelId).components,
        ephemeral: true
      });
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith('panel-manager:ai-modal:')) {
      if (!isStaff(interaction.member, config, null)) {
        return interaction.reply({ content: config.messages?.noPermission || 'No permission.', ephemeral: true });
      }
      const panelId = interaction.customId.split(':')[2];
      const current = getConfig();
      const panel = current.panels?.[panelId] || {};
      const nextPanels = {
        ...(current.panels || {}),
        [panelId]: {
          ...panel,
          ai: {
            ...(panel.ai || {}),
            enabled: yesNo(readField(interaction, 'enabled'), panel.ai?.enabled),
            provider: panel.ai?.provider || current.ai?.provider || 'openai',
            apiKey: panel.ai?.apiKey || current.ai?.apiKey || '',
            model: readField(interaction, 'model') || current.ai?.model || 'gpt-4o-mini',
            systemPrompt: readField(interaction, 'systemPrompt'),
            serverInfo: readField(interaction, 'serverInfo'),
            autoReply: yesNo(readField(interaction, 'autoReply'), panel.ai?.autoReply),
            replyInTicket: panel.ai?.replyInTicket ?? current.ai?.replyInTicket ?? true,
            maxHistoryMessages: panel.ai?.maxHistoryMessages || current.ai?.maxHistoryMessages || 12,
            styles: panel.ai?.styles || current.ai?.styles || {},
            defaultStyle: panel.ai?.defaultStyle || current.ai?.defaultStyle || 'friendly',
            safety: panel.ai?.safety || current.ai?.safety || ''
          }
        }
      };
      const nextConfig = updateConfig('panels', nextPanels);
      return interaction.reply({
        content: `Saved AI settings for panel \`${panelId}\`.`,
        embeds: panelDashboard(nextConfig, panelId).embeds,
        components: panelDashboard(nextConfig, panelId).components,
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
