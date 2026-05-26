const path = require('node:path');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder
} = require('discord.js');
const { generateAiReply } = require('./ai');
const { createTranscript } = require('./transcript');
const {
  businessHoursOpen,
  fillTemplate,
  isStaff,
  readJson,
  sanitizeChannelName,
  writeJson
} = require('./utils');

function ticketsFile(config) {
  return path.resolve(__dirname, '..', config.storage?.ticketsFile || 'data/tickets.json');
}

function loadTickets(config) {
  return readJson(ticketsFile(config), {});
}

function saveTickets(config, tickets) {
  writeJson(ticketsFile(config), tickets);
}

async function sendLog(guild, config, eventName, title, description, fields = [], panelId = null) {
  const panelLogs = panelId ? config.panels?.[panelId]?.logs : null;
  const logs = panelLogs?.enabled ? panelLogs : config.logs;
  if (!logs?.enabled || !logs.channelId || logs.events?.[eventName] === false) return;
  const channel = await guild.channels.fetch(logs.channelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  const embed = new EmbedBuilder()
    .setColor(config.colors?.neutral || '#2B2D31')
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
  if (fields.length) embed.addFields(fields);
  await channel.send({ embeds: [embed] }).catch(() => null);
}

function ticketTemplateData({ guild, channel, ticket, category, actor, owner }) {
  const ownerId = owner?.id || ticket?.ownerId;
  const actorId = actor?.id;
  const categoryName = category?.label || ticket?.categoryId || '';
  return {
    user: ownerId ? `<@${ownerId}>` : '',
    opener: ownerId ? `<@${ownerId}>` : '',
    ticketUser: ownerId ? `<@${ownerId}>` : '',
    username: owner?.username || ticket?.username || '',
    userId: ownerId || '',
    staff: actorId ? `<@${actorId}>` : '',
    actor: actorId ? `<@${actorId}>` : '',
    claimer: actorId ? `<@${actorId}>` : '',
    closer: actorId ? `<@${actorId}>` : '',
    staffName: actor?.username || actor?.tag || '',
    channel: channel ? `<#${channel.id}>` : '',
    channelName: channel?.name || '',
    ticketName: channel?.name || '',
    category: categoryName,
    categoryId: ticket?.categoryId || '',
    panel: ticket?.panelId || '',
    guild: guild?.name || ''
  };
}

function buildPanel(panelId, config) {
  const panel = config.panels?.[panelId];
  if (!panel || !panel.enabled) throw new Error(`Panel not found or disabled: ${panelId}`);
  const serverName = config.server?.name || panel.serverName;
  const embed = new EmbedBuilder()
    .setColor(config.colors?.primary || '#5865F2')
    .setTitle(panel.title || 'Support')
    .setDescription(panel.description || 'Open a ticket below.')
    .setTimestamp();
  if (serverName) embed.setAuthor({ name: serverName });
  if (panel.subtitle) {
    embed.addFields({ name: panel.subtitle, value: panel.subtitleText || 'Choose a category below.', inline: false });
  }
  if (Array.isArray(panel.fields)) {
    for (const field of panel.fields.slice(0, 6)) {
      if (field.name && field.value) {
        embed.addFields({ name: field.name, value: field.value, inline: Boolean(field.inline) });
      }
    }
  }
  if (panel.footer) embed.setFooter({ text: panel.footer });
  if (panel.image) embed.setImage(panel.image);
  if (panel.thumbnail) embed.setThumbnail(panel.thumbnail);

  const categories = (panel.categories || [])
    .map((id) => ({ id, category: config.categories?.[id] }))
    .filter((entry) => entry.category?.enabled);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`ticket:open:${panelId}`)
    .setPlaceholder(panel.selectPlaceholder || 'Select a ticket category')
    .addOptions(categories.map(({ id, category }) => ({
      label: category.label || id,
      description: category.description?.slice(0, 100) || 'Open a ticket',
      value: id,
      emoji: category.emoji || undefined
    })));
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
}

async function sendPanel(interaction, panelId, channel, config) {
  await channel.send(buildPanel(panelId, config));
  await sendLog(interaction.guild, config, 'panelSent', 'Panel Sent', `Panel \`${panelId}\` was sent to <#${channel.id}> by <@${interaction.user.id}>.`, [], panelId);
  await interaction.reply({ content: config.messages?.panelSent || 'Ticket panel sent.', ephemeral: true });
}

function controls(config, ticket) {
  const claimEnabled = config.claim?.enabled;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:close').setLabel('Close').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket:transcript').setLabel('Transcript').setStyle(ButtonStyle.Secondary)
  );
  if (claimEnabled) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(ticket.claimedBy ? 'ticket:unclaim' : 'ticket:claim')
        .setLabel(ticket.claimedBy ? 'Unclaim' : 'Claim')
        
        .setStyle(ticket.claimedBy ? ButtonStyle.Secondary : ButtonStyle.Primary)
    );
  }
  if (config.ai?.enabled) {
    row.addComponents(new ButtonBuilder().setCustomId('ticket:ai').setLabel('AI Reply').setStyle(ButtonStyle.Success));
  }
  return [row];
}

async function openTicket(interaction, panelId, categoryId, config) {
  const panel = config.panels?.[panelId];
  const category = config.categories?.[categoryId];
  if (!panel?.enabled || !category?.enabled) {
    return interaction.reply({ content: 'This ticket category is not available.', ephemeral: true });
  }

  const open = businessHoursOpen(config);
  if (!open && !config.businessHours?.allowTicketsOutsideHours) {
    return interaction.reply({ content: config.messages?.outsideHoursBlocked, ephemeral: true });
  }

  const tickets = loadTickets(config);
  if (!panel.allowMultipleOpenTickets) {
    const existing = Object.values(tickets).find((ticket) => (
      ticket.guildId === interaction.guildId &&
      ticket.ownerId === interaction.user.id &&
      ticket.panelId === panelId &&
      ticket.status === 'open'
    ));
    if (existing) {
      const channel = interaction.guild.channels.cache.get(existing.channelId);
      return interaction.reply({
        content: fillTemplate(config.messages?.ticketAlreadyOpen, ticketTemplateData({
          guild: interaction.guild,
          channel,
          ticket: existing,
          category: config.categories?.[existing.categoryId],
          owner: interaction.user
        })),
        ephemeral: true
      });
    }
  }

  const everyone = interaction.guild.roles.everyone;
  const supportRoles = [
    ...(config.permissions?.adminRoles || []),
    ...(config.permissions?.managerRoles || []),
    ...(category.supportRoleIds || [])
  ].filter(Boolean);
  const overwrites = [
    { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
    ...supportRoles.map((roleId) => ({ id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ManageMessages] }))
  ];
  const baseData = ticketTemplateData({
    guild: interaction.guild,
    ticket: { ownerId: interaction.user.id, username: interaction.user.username, categoryId, panelId },
    category,
    owner: interaction.user
  });
  const name = sanitizeChannelName(fillTemplate(category.channelName || 'ticket-{username}', baseData));
  const channel = await interaction.guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: category.discordCategoryId || null,
    topic: fillTemplate(category.topic || 'Ticket for {user}', { ...baseData, channelName: name, ticketName: name }),
    permissionOverwrites: overwrites
  });
  const ticket = {
    channelId: channel.id,
    guildId: interaction.guildId,
    ownerId: interaction.user.id,
    username: interaction.user.tag,
    panelId,
    categoryId,
    status: 'open',
    claimedBy: null,
    createdAt: new Date().toISOString()
  };
  tickets[channel.id] = ticket;
  saveTickets(config, tickets);
  const templateData = ticketTemplateData({
    guild: interaction.guild,
    channel,
    ticket,
    category,
    owner: interaction.user
  });

  const embed = new EmbedBuilder()
    .setColor(config.colors?.primary || '#5865F2')
    .setTitle(fillTemplate(category.welcomeTitle || 'Welcome, {user}', templateData))
    .setDescription(fillTemplate(category.welcomeMessage || 'Please describe your request.', templateData))
    .addFields(
      { name: 'User', value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Category', value: category.label || categoryId, inline: true }
    );
  await channel.send({
    content: [`<@${interaction.user.id}>`, ...supportRoles.map((roleId) => `<@&${roleId}>`)].join(' '),
    embeds: [embed],
    components: controls(config, ticket)
  });
  if (!open && config.businessHours?.sendNoticeInsideTicket) {
    await channel.send({ content: fillTemplate(config.messages?.outsideHoursNotice, templateData) });
  }
  await interaction.reply({
    content: fillTemplate(config.messages?.ticketCreated, templateData),
    ephemeral: true
  });
  await sendLog(interaction.guild, config, 'ticketCreated', 'Ticket Created', `${templateData.opener} opened ${templateData.channel}.`, [
    { name: 'Category', value: templateData.category || categoryId, inline: true },
    { name: 'Panel', value: panelId, inline: true }
  ], panelId);
}

async function findTicket(interaction, config) {
  const tickets = loadTickets(config);
  const ticket = tickets[interaction.channelId];
  if (!ticket || ticket.status !== 'open') {
    await interaction.reply({ content: config.messages?.notTicket || 'This channel is not a ticket channel.', ephemeral: true });
    return { tickets, ticket: null };
  }
  return { tickets, ticket };
}

async function claimTicket(interaction, config, claimed) {
  const { tickets, ticket } = await findTicket(interaction, config);
  if (!ticket) return;
  const category = config.categories?.[ticket.categoryId];
  if (!isStaff(interaction.member, config, category)) {
    return interaction.reply({ content: config.messages?.noPermission, ephemeral: true });
  }
  ticket.claimedBy = claimed ? interaction.user.id : null;
  tickets[ticket.channelId] = ticket;
  saveTickets(config, tickets);
  if (claimed && config.claim?.renameOnClaim) {
    await interaction.channel.setName(sanitizeChannelName(`${config.claim.claimedPrefix || 'claimed'}-${interaction.channel.name}`)).catch(() => null);
  }
  const templateData = ticketTemplateData({
    guild: interaction.guild,
    channel: interaction.channel,
    ticket,
    category,
    actor: interaction.user
  });
  await interaction.update({ components: controls(config, ticket) });
  await interaction.followUp({
    content: fillTemplate(claimed ? config.messages?.ticketClaimed : config.messages?.ticketUnclaimed, templateData)
  });
  await sendLog(interaction.guild, config, claimed ? 'ticketClaimed' : 'ticketUnclaimed', claimed ? 'Ticket Claimed' : 'Ticket Unclaimed', `${templateData.staff} ${claimed ? 'claimed' : 'unclaimed'} ${templateData.channel}.`, [
    { name: 'Category', value: templateData.category || ticket.categoryId, inline: true }
  ], ticket.panelId);
}

async function sendTranscript(interaction, config, closeAfter = false) {
  const { tickets, ticket } = await findTicket(interaction, config);
  if (!ticket) return;
  const category = config.categories?.[ticket.categoryId];
  if (!isStaff(interaction.member, config, category) && interaction.user.id !== ticket.ownerId) {
    return interaction.reply({ content: config.messages?.noPermission, ephemeral: true });
  }
  await interaction.deferReply({ ephemeral: true });
  if (!config.transcript?.enabled) {
    await interaction.editReply({ content: 'Transcript is disabled in config.' });
    if (!closeAfter) return;
    ticket.status = 'closed';
    ticket.closedAt = new Date().toISOString();
    ticket.closedBy = interaction.user.id;
    tickets[ticket.channelId] = ticket;
    saveTickets(config, tickets);
    await interaction.channel.send(fillTemplate(config.messages?.ticketClosed, ticketTemplateData({
      guild: interaction.guild,
      channel: interaction.channel,
      ticket,
      category,
      actor: interaction.user
    })));
    await interaction.channel.delete('Ticket closed').catch(() => null);
    return;
  }
  const transcript = await createTranscript(interaction.channel, ticket, config);
  const owner = await interaction.client.users.fetch(ticket.ownerId).catch(() => null);
  if (config.transcript?.dmUser && owner) {
    await owner.send({
      content: fillTemplate(config.messages?.dmTranscript, ticketTemplateData({
        guild: interaction.guild,
        channel: interaction.channel,
        ticket,
        category,
        actor: interaction.user,
        owner
      })),
      files: [transcript.attachment]
    }).catch(() => interaction.followUp({ content: config.messages?.dmTranscriptFailed, ephemeral: true }));
  }
  const logId = category?.logChannelId || config.transcript?.logChannelId;
  const logChannel = logId ? await interaction.guild.channels.fetch(logId).catch(() => null) : null;
  if (logChannel?.isTextBased()) {
    await logChannel.send({ content: `Transcript for ${interaction.channel.name}`, files: [transcript.attachment] });
  }
  await sendLog(interaction.guild, config, 'transcriptCreated', 'Transcript Created', `Transcript generated for <#${interaction.channel.id}> by <@${interaction.user.id}>.`, [], ticket.panelId);
  await interaction.editReply({ content: `Transcript generated: ${transcript.filePath}` });
  if (closeAfter) {
    ticket.status = 'closed';
    ticket.closedAt = new Date().toISOString();
    ticket.closedBy = interaction.user.id;
    tickets[ticket.channelId] = ticket;
    saveTickets(config, tickets);
    await interaction.channel.send(fillTemplate(config.messages?.ticketClosed, ticketTemplateData({
      guild: interaction.guild,
      channel: interaction.channel,
      ticket,
      category,
      actor: interaction.user,
      owner
    })));
    await sendLog(interaction.guild, config, 'ticketClosed', 'Ticket Closed', `<@${interaction.user.id}> closed <#${interaction.channel.id}>.`, [
      { name: 'Category', value: category?.label || ticket.categoryId, inline: true }
    ], ticket.panelId);
    await interaction.channel.delete('Ticket closed').catch(() => null);
  }
}

async function closeTicket(interaction, config) {
  await sendTranscript(interaction, config, true);
}

async function aiReply(interaction, config) {
  const { ticket } = await findTicket(interaction, config);
  if (!ticket) return;
  const category = config.categories?.[ticket.categoryId];
  if (!isStaff(interaction.member, config, category)) {
    return interaction.reply({ content: config.messages?.noPermission, ephemeral: true });
  }
  await interaction.deferReply({ ephemeral: config.ai?.replyInTicket === false });
  const reply = await generateAiReply(interaction.channel, ticket, category, config);
  if (!reply) return interaction.editReply(config.messages?.aiDisabled || 'AI is disabled.');
  const content = `**${config.messages?.aiReplyPrefix || 'Suggested answer'}**\n${reply}`;
  await sendLog(interaction.guild, config, 'aiReplyUsed', 'AI Reply Used', `<@${interaction.user.id}> generated an AI reply in <#${interaction.channel.id}>.`, [], ticket.panelId);
  return interaction.editReply(content);
}

async function maybeAutoAi(message, config) {
  if (!config.ai?.enabled || !config.ai?.autoReply || message.author.bot) return;
  const tickets = loadTickets(config);
  const ticket = tickets[message.channelId];
  if (!ticket || ticket.status !== 'open' || ticket.ownerId !== message.author.id) return;
  const category = config.categories?.[ticket.categoryId];
  const reply = await generateAiReply(message.channel, ticket, category, config).catch(() => null);
  if (reply) await message.channel.send(`**${config.messages?.aiReplyPrefix || 'Suggested answer'}**\n${reply}`);
}

module.exports = {
  aiReply,
  buildPanel,
  claimTicket,
  closeTicket,
  maybeAutoAi,
  openTicket,
  sendPanel,
  sendTranscript
};
