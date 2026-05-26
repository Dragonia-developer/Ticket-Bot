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

function buildPanel(panelId, config) {
  const panel = config.panels?.[panelId];
  if (!panel || !panel.enabled) throw new Error(`Panel not found or disabled: ${panelId}`);
  const embed = new EmbedBuilder()
    .setColor(config.colors?.primary || '#5865F2')
    .setTitle(panel.title || 'Support')
    .setDescription(panel.description || 'Open a ticket below.');
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
  await interaction.reply({ content: config.messages?.panelSent || 'Ticket panel sent.', ephemeral: true });
}

function controls(config, ticket) {
  const claimEnabled = config.claim?.enabled;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:close').setLabel('Close').setEmoji('🔒').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket:transcript').setLabel('Transcript').setEmoji('📄').setStyle(ButtonStyle.Secondary)
  );
  if (claimEnabled) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(ticket.claimedBy ? 'ticket:unclaim' : 'ticket:claim')
        .setLabel(ticket.claimedBy ? 'Unclaim' : 'Claim')
        .setEmoji('🙋')
        .setStyle(ticket.claimedBy ? ButtonStyle.Secondary : ButtonStyle.Primary)
    );
  }
  if (config.ai?.enabled) {
    row.addComponents(new ButtonBuilder().setCustomId('ticket:ai').setLabel('AI Reply').setEmoji('🤖').setStyle(ButtonStyle.Success));
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
        content: fillTemplate(config.messages?.ticketAlreadyOpen, { channel: channel ? `<#${channel.id}>` : existing.channelId }),
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
  const name = sanitizeChannelName(fillTemplate(category.channelName || 'ticket-{username}', {
    username: interaction.user.username,
    userId: interaction.user.id,
    category: categoryId
  }));
  const channel = await interaction.guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: category.discordCategoryId || null,
    topic: fillTemplate(category.topic || 'Ticket for {user}', {
      user: interaction.user.tag,
      userId: interaction.user.id,
      category: category.label || categoryId
    }),
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

  const embed = new EmbedBuilder()
    .setColor(config.colors?.primary || '#5865F2')
    .setTitle(fillTemplate(category.welcomeTitle || 'Welcome, {user}', { user: interaction.user.username }))
    .setDescription(fillTemplate(category.welcomeMessage || 'Please describe your request.', { user: `<@${interaction.user.id}>` }))
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
    await channel.send({ content: config.messages?.outsideHoursNotice });
  }
  await interaction.reply({
    content: fillTemplate(config.messages?.ticketCreated, { channel: `<#${channel.id}>` }),
    ephemeral: true
  });
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
  await interaction.update({ components: controls(config, ticket) });
  await interaction.followUp({
    content: fillTemplate(claimed ? config.messages?.ticketClaimed : config.messages?.ticketUnclaimed, { user: `<@${interaction.user.id}>` })
  });
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
    await interaction.channel.send(fillTemplate(config.messages?.ticketClosed, { user: `<@${interaction.user.id}>` }));
    await interaction.channel.delete('Ticket closed').catch(() => null);
    return;
  }
  const transcript = await createTranscript(interaction.channel, ticket, config);
  const owner = await interaction.client.users.fetch(ticket.ownerId).catch(() => null);
  if (config.transcript?.dmUser && owner) {
    await owner.send({
      content: fillTemplate(config.messages?.dmTranscript, { ticketName: interaction.channel.name }),
      files: [transcript.attachment]
    }).catch(() => interaction.followUp({ content: config.messages?.dmTranscriptFailed, ephemeral: true }));
  }
  const logId = category?.logChannelId || config.transcript?.logChannelId;
  const logChannel = logId ? await interaction.guild.channels.fetch(logId).catch(() => null) : null;
  if (logChannel?.isTextBased()) {
    await logChannel.send({ content: `Transcript for ${interaction.channel.name}`, files: [transcript.attachment] });
  }
  await interaction.editReply({ content: `Transcript generated: ${transcript.filePath}` });
  if (closeAfter) {
    ticket.status = 'closed';
    ticket.closedAt = new Date().toISOString();
    ticket.closedBy = interaction.user.id;
    tickets[ticket.channelId] = ticket;
    saveTickets(config, tickets);
    await interaction.channel.send(fillTemplate(config.messages?.ticketClosed, { user: `<@${interaction.user.id}>` }));
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
