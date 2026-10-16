const { addBanner } = require('../utils/banner');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  PermissionsBitField,
  ChannelType,
} = require('discord.js');
const config = require('../config');
const logger = require('../logger');
const utils = require('../utils');
const audit = utils.audit;
const { createTierTicket, getOpenTierTicketByUser, getSetting } = require('../database');


module.exports = {
  buttonIds: ['tier_panel_btn'],

  async handleButton(interaction) {
    const customId = interaction.customId;

    if (customId === 'tier_panel_btn') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const userId = interaction.user.id;
      const guild = interaction.guild;
      if (!guild) {
        await interaction.editReply({ content: 'Команда доступна только на сервере.' }).catch(()=>{});
        return;
      }

      const tierOpen = require('../database').getSetting('tier_open', '1') === '1';
      if (!tierOpen) {
        await interaction.editReply({ content: 'Приём заявок на TIER закрыт администратором.' }).catch(()=>{});
        return;
      }

      const member = await guild.members.fetch(userId).catch(()=>null);
      const roles = config.TIER_ROLES || {};
      if (member && ((roles.TIER_1 && member.roles.cache.has(roles.TIER_1)) || (roles.TIER_2 && member.roles.cache.has(roles.TIER_2)) || (roles.TIER_3 && member.roles.cache.has(roles.TIER_3)))) {
        audit.log('tier', 'User attempted to request tier but already has one', { userId });
        await interaction.editReply({ content: 'У вас уже есть тир — нельзя подавать повторно.' }).catch(()=>{});
        return;
      }

      const open = getOpenTierTicketByUser(userId);
      if (open) {
        await interaction.editReply({ content: 'У вас уже открыт тикет на рассмотрении.' }).catch(()=>{});
        return;
      }

      if (!config.TIER_TICKET_CATEGORY_ID) {
        await interaction.editReply({ content: 'Категория для тикетов не настроена в config.' }).catch(()=>{});
        return;
      }

      const usernameSafe = interaction.user.username.toLowerCase().replace(/[^a-z0-9\-]/g, '-').slice(0, 90);
      const channelName = `${usernameSafe}-${interaction.user.id.slice(0,5)}`;

      let parent;
      try { parent = await guild.channels.fetch(config.TIER_TICKET_CATEGORY_ID).catch(()=>null); } catch (e) { parent = null; }

      const everyone = guild.roles.everyone;
      const overwrites = [
        { id: everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: userId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
      ];
      if (config.TIER_CHECKER_ROLE_ID) {
        overwrites.push({
          id: config.TIER_CHECKER_ROLE_ID,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.ManageMessages,
          ],
        });
      }
      if (guild.members.me) {
        overwrites.push({
          id: guild.members.me.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.ManageChannels,
            PermissionsBitField.Flags.ManageMessages,
          ],
        });
      }

      let ch;
      try {
        ch = await guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: parent ? parent.id : undefined,
          permissionOverwrites: overwrites,
          reason: `Ticket TIER created by ${interaction.user.tag}`,
        });
      } catch (err) {
        logger.error('Ошибка создания тикет-канала', { error: err.message });
        audit.log('error', 'Failed to create tier ticket channel', { error: err.message, userId });
        await interaction.editReply({ content: 'Не удалось создать канал тикета.' }).catch(()=>{});
        return;
      }

      audit.log('tier', 'Ticket channel created', { userId, channelId: ch.id });

      const container = new ContainerBuilder().setAccentColor(0x000000);

      addBanner(container);
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Тикет на получение TIER`));
      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true));
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Пользователь:** <@${userId}> (\`${interaction.user.tag}\`)\n**ID:** \`${userId}\``));
      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true));
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`Нажмите ниже чтобы выдать тир или отклонить заявку.`));

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`tier_give_${userId}`).setLabel('Выдать тир').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`tier_reject_${userId}`).setLabel('Отклонить').setStyle(ButtonStyle.Danger)
      );

      let sent;
      try {
        container.addActionRowComponents(row);
        sent = await ch.send({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
        }).catch(()=>null);
        await sent?.pin().catch(()=>{});
      } catch (e) { logger.warn('Не удалось отправить сообщение в тикет-канал', { error: e.message }); }

      createTierTicket(userId, ch.id, [], sent?.id || null);
      audit.log('tier', 'Tier ticket record created', { userId, channelId: ch.id });

      await interaction.editReply({ content: `Тикет создан: <#${ch.id}>. Ожидайте ответа проверяющего.` }).catch(()=>{});
      return;
    }
  },
};