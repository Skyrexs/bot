const { addBanner } = require('../utils/banner');
const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  PermissionsBitField,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} = require('discord.js');

const logger = require('../logger');
const config = require('../config');
const db = require('../database');
const {
  getTierTicketByChannel,
  closeTierTicket,
  deleteTierApplicationByUser,
  deleteTierTicketByUser,
  setCooldown,
} = db;
const utils = require('../utils');
const audit = utils.audit;

function canModerate(member) {
  return Boolean(
    member &&
    config.TIER_CHECKER_ROLE_ID &&
    member.roles.cache.has(config.TIER_CHECKER_ROLE_ID)
  );
}

function buildTierChoiceContainer(userId) {
  const container = new ContainerBuilder().setAccentColor(0x7C4DFF);
  addBanner(container);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## <a:483a045a18644d3c8de001ce288bc40a:1507119681474007151> ВЫДАЧА TIER\n\n` +
      `Пользователь: <@${userId}>\n\n` +
      `Выберите уровень, который необходимо выдать.`
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setSpacing(SeparatorSpacingSize.Small)
      .setDivider(true)
  );

  const options = Object.keys(config.TIER_ROLES || {})
    .filter((key) => config.TIER_ROLES[key])
    .map((key) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(key.replace(/_/g, ' '))
        .setValue(key)
    );

  const select = new StringSelectMenuBuilder()
    .setCustomId(`tier_give_select_${userId}`)
    .setPlaceholder('Выберите TIER')
    .addOptions(options);

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(select)
  );

  return container;
}

module.exports = {
  buttonPrefixes: ['tier_give_', 'tier_reject_'],
  selectPrefixes: ['tier_give_select_'],

  async handleButton(interaction) {
    if (!canModerate(interaction.member)) {
      return interaction.reply({
        content: 'У вас нет прав на обработку TIER.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const id = interaction.customId;

    if (id.startsWith('tier_give_')) {
      const userId = id.replace('tier_give_', '');

      if (!Object.values(config.TIER_ROLES || {}).some(Boolean)) {
        return interaction.reply({
          content: 'Роли TIER не настроены.',
          flags: MessageFlags.Ephemeral,
        });
      }

      return interaction.reply({
        components: [buildTierChoiceContainer(userId)],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    if (id.startsWith('tier_reject_')) {
      const userId = id.replace('tier_reject_', '');

      try {
        const guild = interaction.guild;
        const channel = interaction.channel;
        const ticket = getTierTicketByChannel(channel.id);

        setCooldown(
          userId,
          Date.now() + 7 * 24 * 60 * 60 * 1000
        );

        if (ticket) closeTierTicket(ticket.id);
        deleteTierApplicationByUser(userId);
        deleteTierTicketByUser(userId);

        const result = utils.buildErrorMessage(
          'TIER • ЗАЯВКА ОТКЛОНЕНА',
          `### <:ef6a0fe397194e72b3454290f31581e5:1507121440346865786> Решение\n` +
          `> **Пользователь:** <@${userId}>\n` +
          `> **Рассмотрел:** <@${interaction.user.id}>\n` +
          `> **Время:** <t:${Math.floor(Date.now() / 1000)}:F>\n\n` +
          `### <:865725soldado:1470440231663567091> Повторная заявка\n` +
          `> Следующая подача доступна через **7 дней**.`
        );

        await interaction.update({
          components: [result],
        }).catch(() => {});

        await archiveTicket(channel, guild);

        const user = await interaction.client.users
          .fetch(userId)
          .catch(() => null);

        if (user) {
          await utils.sendDM(user, {
            accentColor: 0xFF3B30,
            title: 'Заявка на TIER отклонена',
            body:
              `Ваша заявка была отклонена.\n\n` +
              `Повторная подача будет доступна через **7 дней**.\n` +
              `Рассмотрел: <@${interaction.user.id}>`,
            footer: 'BENZO • TIER',
          }).catch(() => {});
        }

        await audit.log('tier', 'TIER заявка отклонена', {
          userId,
          by: interaction.user.id,
          ticketId: ticket?.id,
        });
      } catch (e) {
        logger.error('tier_reject handler error', {
          error: e.message,
          stack: e.stack,
        });
        await audit.log('error', 'TIER reject failed', {
          error: e.message,
          userId,
        });
        await interaction.followUp({
          content: 'Не удалось отклонить заявку.',
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
      }
    }
  },

  async handleSelect(interaction) {
    if (!canModerate(interaction.member)) {
      return interaction.reply({
        content: 'У вас нет прав на выдачу TIER.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!interaction.customId.startsWith('tier_give_select_')) return;

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    try {
      const userId = interaction.customId.replace('tier_give_select_', '');
      const choice = interaction.values?.[0];
      const roleId = choice
        ? config.TIER_ROLES?.[choice]
        : null;

      if (!roleId) {
        return interaction.editReply({
          content: 'Роль TIER не найдена.',
        });
      }

      const guild = interaction.guild;
      const member = await guild.members
        .fetch(userId)
        .catch(() => null);

      if (!member) {
        return interaction.editReply({
          content: 'Пользователь не найден на сервере.',
        });
      }

      const allTierRoles = Object.values(config.TIER_ROLES || {})
        .filter(Boolean);

      const previousTierRoles = allTierRoles.filter((id) => member.roles.cache.has(id));
      try {
        await member.roles.remove(
          allTierRoles,
          `Replacing TIER by ${interaction.user.tag}`
        );
        await member.roles.add(
          roleId,
          `TIER given by ${interaction.user.tag}`
        );
      } catch (roleError) {
        if (previousTierRoles.length) {
          await member.roles.add(
            previousTierRoles,
            `Rollback after failed TIER replacement by ${interaction.user.tag}`
          ).catch(() => {});
        }
        logger.error('TIER role update failed', {
          error: roleError.message,
          stack: roleError.stack,
          userId,
          roleId,
        });
        await audit.log('error', 'TIER role update failed', {
          error: roleError.message,
          userId,
          roleId,
          by: interaction.user.id,
        }).catch(() => {});
        return interaction.editReply({
          content: 'Не удалось изменить роли TIER. Проверьте, что бот выше ролей TIER и имеет право Manage Roles.',
        });
      }

      setCooldown(
        userId,
        Date.now() + 90 * 24 * 60 * 60 * 1000
      );

      const channel = interaction.channel;
      const ticket = getTierTicketByChannel(channel.id);

      if (ticket) closeTierTicket(ticket.id);
      deleteTierApplicationByUser(userId);
      deleteTierTicketByUser(userId);

      const result = utils.buildSuccessMessage(
        'TIER • ЗАЯВКА ВЫПОЛНЕНА',
        `### <a:483a045a18644d3c8de001ce288bc40a:1507119681474007151> Результат\n` +
        `> **Пользователь:** <@${userId}>\n` +
        `> **Выдано:** **${choice.replace(/_/g, ' ')}**\n` +
        `> **Рассмотрел:** <@${interaction.user.id}>\n` +
        `> **Время:** <t:${Math.floor(Date.now() / 1000)}:F>`
      );

      if (ticket?.messageId) {
        const msg = await channel.messages
          .fetch(ticket.messageId)
          .catch(() => null);

        if (msg) {
          await msg.edit({
            components: [result],
          }).catch(() => {});
        }
      }

      await archiveTicket(channel, guild);

      const user = await interaction.client.users
        .fetch(userId)
        .catch(() => null);

      if (user) {
        await utils.sendDM(user, {
          accentColor: 0x00C853,
          title: 'Вам выдан TIER',
          body:
            `Поздравляем! Вам выдан **${choice.replace(/_/g, ' ')}**.\n\n` +
            `Повторная заявка будет доступна через **90 дней**.\n` +
            `Рассмотрел: <@${interaction.user.id}>`,
          footer: 'BENZO • TIER',
        }).catch(() => {});
      }

      await audit.log('tier', 'TIER выдан', {
        userId,
        by: interaction.user.id,
        role: roleId,
        choice,
        ticketId: ticket?.id,
      });

      return interaction.editReply({
        content: `Готово. Пользователю выдан **${choice.replace(/_/g, ' ')}**.`,
      });
    } catch (e) {
      logger.error('tier select handler error', {
        error: e.message,
        stack: e.stack,
      });

      await audit.log('error', 'TIER give failed', {
        error: e.message,
      });

      return interaction.editReply({
        content: 'Не удалось выдать TIER.',
      });
    }
  },
};

async function archiveTicket(channel, guild) {
  if (!channel || !guild) return;

  try {
    if (config.TIER_ARCHIVE_CATEGORY_ID) {
      await channel.setParent(config.TIER_ARCHIVE_CATEGORY_ID).catch(() => {});
    }

    const everyone = guild.roles.everyone;
    const overwrites = [
      {
        id: everyone.id,
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
    ];

    if (config.TIER_CHECKER_ROLE_ID) {
      overwrites.push({
        id: config.TIER_CHECKER_ROLE_ID,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.SendMessages,
        ],
      });
    }

    if (guild.members.me) {
      overwrites.push({
        id: guild.members.me.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ManageChannels,
          PermissionsBitField.Flags.ManageMessages,
        ],
      });
    }

    await channel.permissionOverwrites.set(overwrites).catch(() => {});
  } catch (e) {
    logger.warn('Failed to archive TIER channel', {
      error: e.message,
    });
  }
}
