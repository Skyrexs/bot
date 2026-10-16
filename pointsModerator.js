const { addBanner } = require('../utils/banner');
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} = require('discord.js');

const config = require('../config');
const db = require('../database');
const logger = require('../logger');
const utils = require('../utils');
const audit = utils.audit;
const { hasModeratorAccess } = require('../utils/permissions');

function hasModeratorRole(member) {
  return hasModeratorAccess(member);
}

function buildFinalRequestContainer(req, status, reviewer, amount = null, reason = null, balance = null) {
  const accepted = status === 'completed';
  const rejected = status === 'rejected';

  const color = accepted ? 0x00C853 : rejected ? 0xFF3B30 : 0x777777;
  const title = accepted
    ? 'ЗАЯВКА НА БАЛЛЫ • ВЫПОЛНЕНО'
    : 'ЗАЯВКА НА БАЛЛЫ • ОТКЛОНЕНА';

  const action = req.type === 'earn' ? 'начисление' : 'списание';

  const container = new ContainerBuilder().setAccentColor(color);

  addBanner(container);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${accepted ? '<a:ok8:1509635360475582565>' : '<:ef6a0fe397194e72b3454290f31581e5:1507121440346865786>'} ${title}`
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setSpacing(SeparatorSpacingSize.Large)
      .setDivider(true)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### <:754816forreal:1470442212020981963> Заявитель\n` +
      `> **Пользователь:** <@${req.userId}>\n` +
      `> **ID:** \`${req.userId}\`\n` +
      `> **Имя / статик:** ${req.name || '—'}`
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setSpacing(SeparatorSpacingSize.Small)
      .setDivider(true)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### <:865725soldado:1470440231663567091> Детали\n` +
      `> **Тип:** ${req.type === 'earn' ? 'Получение' : 'Трата'}\n` +
      `> **Причина:** ${req.reasonType || '—'}\n` +
      `> **Результат:** ${accepted ? `**${action} ${amount} балл(ов)**` : '**заявка отклонена**'}` +
      (accepted && balance !== null ? `\n> **Баланс после операции:** **${Number(balance).toFixed(1)}**` : '') +
      (reason ? `\n> **Комментарий:** ${reason}` : '')
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setSpacing(SeparatorSpacingSize.Small)
      .setDivider(true)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### <a:483a045a18644d3c8de001ce288bc40a:1507119681474007151> Решение\n` +
      `**Рассмотрел:** <@${reviewer}>\n` +
      `**Время:** <t:${Math.floor(Date.now() / 1000)}:F>\n\n` +
      `-# REQUEST ID: ${req.id}`
    )
  );

  return container;
}

function buildPendingRequestContainer(req) {
  const container = new ContainerBuilder().setAccentColor(0x7C4DFF);
  addBanner(container);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## <a:483a045a18644d3c8de001ce288bc40a:1507119681474007151> ЗАЯВКА НА ${req.type === 'earn' ? 'ПОЛУЧЕНИЕ' : 'СПИСАНИЕ'} БАЛЛОВ <@&1435546968586715238> <@&1435517582365950012> <a:483a045a18644d3c8de001ce288bc40a:1507119681474007151>`
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setSpacing(SeparatorSpacingSize.Large)
      .setDivider(true)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### <:754816forreal:1470442212020981963> Заявитель\n` +
      `> <@${req.userId}> • \`${req.userId}\`\n` +
      `> **Имя / статик:** ${req.name || '—'}`
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setSpacing(SeparatorSpacingSize.Small)
      .setDivider(true)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### <a:dddd:1507119555166601318> Запрос\n` +
      `> **Операция:** ${req.type === 'earn' ? 'Начислить' : 'Списать'} баллы\n` +
      `> **Причина:** ${req.reasonType || '—'}\n` +
      `> **Детали:** ${req.details || '—'}\n` +
      `> **Доказательства:** ${req.proof || '—'}`
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setSpacing(SeparatorSpacingSize.Small)
      .setDivider(true)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### <a:3342emoshit:1507119849971650583> Действие модератора\n` +
      `После **принятия** откроется форма, где можно указать точное количество баллов.\n` +
      `После **отклонения** можно указать причину отказа.\n\n` +
      `-# REQUEST ID: ${req.id}`
    )
  );

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`points_accept_${req.id}`)
        .setLabel('Принять и указать баллы')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`points_reject_${req.id}`)
        .setLabel('Отклонить')
        .setStyle(ButtonStyle.Danger)
    )
  );

  return container;
}

module.exports = {
  buttonPrefixes: ['points_accept_', 'points_reject_'],
  modalPrefixes: ['points_amount_modal_', 'points_reject_modal_'],

  async handleButton(interaction) {
    if (!hasModeratorRole(interaction.member)) {
      return interaction.reply({
        content: 'У вас нет прав на обработку заявок.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const id = interaction.customId;

    if (id.startsWith('points_accept_')) {
      const requestId = id.replace('points_accept_', '');
      const req = db.getPointsRequest(requestId);

      if (!req || req.status !== 'pending') {
        return interaction.reply({
          content: 'Заявка уже обработана или не найдена.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const modal = new ModalBuilder()
        .setCustomId(`points_amount_modal_${requestId}`)
        .setTitle(
          req.type === 'earn'
            ? 'Начислить баллы'
            : 'Списать баллы'
        );

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('points_amount')
            .setLabel(
              req.type === 'earn'
                ? 'Сколько начислить?'
                : 'Сколько списать?'
            )
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(5)
            .setPlaceholder('Например: 1 или 5')
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('points_comment')
            .setLabel('Комментарий модератора')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(500)
            .setPlaceholder('Необязательно')
        )
      );

      interaction._handled = true;
      return interaction.showModal(modal);
    }

    if (id.startsWith('points_reject_')) {
      const requestId = id.replace('points_reject_', '');
      const req = db.getPointsRequest(requestId);

      if (!req || req.status !== 'pending') {
        return interaction.reply({
          content: 'Заявка уже обработана или не найдена.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const modal = new ModalBuilder()
        .setCustomId(`points_reject_modal_${requestId}`)
        .setTitle('Отклонить заявку');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('reject_reason')
            .setLabel('Причина отказа')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMinLength(3)
            .setMaxLength(800)
        )
      );

      interaction._handled = true;
      return interaction.showModal(modal);
    }
  },

  async handleModal(interaction) {
    if (!hasModeratorRole(interaction.member)) {
      return interaction.reply({
        content: 'У вас нет прав на обработку заявок.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const cid = interaction.customId;

    if (cid.startsWith('points_amount_modal_')) {
      const requestId = cid.replace('points_amount_modal_', '');
      const req = db.getPointsRequest(requestId);

      if (!req || req.status !== 'pending') {
        return interaction.reply({
          content: 'Заявка уже обработана или не найдена.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const amount = Number(
        interaction.fields.getTextInputValue('points_amount').replace(',', '.')
      );
      const comment =
        interaction.fields.getTextInputValue('points_comment')?.trim() || null;

      if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) {
        return interaction.reply({
          content: 'Количество баллов должно быть числом от 0.1 до 100000.',
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!db.claimPointsRequest(requestId, interaction.user.id)) {
        return interaction.reply({
          content: 'Заявка уже обрабатывается или была обработана другим модератором.',
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        let success = false;

        if (req.type === 'earn') {
          success = db.addPoints(req.userId, amount, {
            type: 'request_earn',
            reason: req.reasonType,
            relatedRequestId: requestId,
            performedBy: interaction.user.id,
          });
        } else {
          success = db.removePoints(req.userId, amount, {
            type: 'request_spend',
            reason: req.reasonType,
            relatedRequestId: requestId,
            performedBy: interaction.user.id,
          });
        }

        if (!success) {
          db.updatePointsRequest(requestId, {
            status: 'pending',
            reviewerId: null,
            handledAt: null,
          });
          return interaction.editReply({
            content:
              'Недостаточно баллов для списания либо операция не может быть выполнена. Заявка снова доступна для обработки.',
          });
        }

        db.setPointsRequestStatus(
          requestId,
          'completed',
          interaction.user.id,
          amount
        );

        const balance = db.getPoints(req.userId);

        const resultContainer = buildFinalRequestContainer(
          req,
          'completed',
          interaction.user.id,
          amount,
          comment,
          balance
        );

        const reviewMessage = interaction.message || (req.messageId && interaction.channel
          ? await interaction.channel.messages.fetch(req.messageId).catch(() => null)
          : null);
        if (reviewMessage) {
          await reviewMessage.edit({
            components: [resultContainer],
          }).catch(() => {});
        }

        const user = await interaction.client.users.fetch(req.userId).catch(() => null);
        if (user) {
          await utils.sendDM(user, {
            accentColor: 0x00C853,
            title: 'Заявка по баллам выполнена',
            body:
              `Ваша заявка обработана.\n\n` +
              `**Операция:** ${req.type === 'earn' ? 'начисление' : 'списание'}\n` +
              `**Количество:** ${amount}\n` +
              `**Баланс:** ${Number(balance).toFixed(1)}\n` +
              (comment ? `**Комментарий:** ${comment}` : ''),
            footer: 'BENZO • POINTS',
          }).catch(() => {});
        }

        await audit.log('points', 'Points request completed', {
          requestId,
          userId: req.userId,
          type: req.type,
          amount,
          balance,
          by: interaction.user.id,
        });

        return interaction.editReply({
          content: `Готово. ${req.type === 'earn' ? 'Начислено' : 'Списано'} **${amount}** балл(ов). Новый баланс: **${Number(balance).toFixed(1)}**.`,
        });
      } catch (e) {
        db.updatePointsRequest(requestId, {
          status: 'pending',
          reviewerId: null,
          handledAt: null,
        });
        logger.error('points amount modal error', {
          error: e.message,
          stack: e.stack,
        });
        await audit.log('error', 'Points amount modal failed', {
          requestId,
          error: e.message,
        });
        return interaction.editReply({
          content: 'Не удалось выполнить операцию с баллами.',
        });
      }
    }

    if (cid.startsWith('points_reject_modal_')) {
      const requestId = cid.replace('points_reject_modal_', '');
      const req = db.getPointsRequest(requestId);

      if (!req || req.status !== 'pending') {
        return interaction.reply({
          content: 'Заявка уже обработана или не найдена.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const reason =
        interaction.fields.getTextInputValue('reject_reason').trim();

      if (!db.claimPointsRequest(requestId, interaction.user.id)) {
        return interaction.reply({
          content: 'Заявка уже обрабатывается или была обработана другим модератором.',
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      db.setPointsRequestStatus(
        requestId,
        'rejected',
        interaction.user.id,
        null
      );

      const resultContainer = buildFinalRequestContainer(
        req,
        'rejected',
        interaction.user.id,
        null,
        reason,
        null
      );

      const reviewMessage = interaction.message || (req.messageId && interaction.channel
        ? await interaction.channel.messages.fetch(req.messageId).catch(() => null)
        : null);
      if (reviewMessage) {
        await reviewMessage.edit({
          components: [resultContainer],
        }).catch(() => {});
      }

      const user = await interaction.client.users.fetch(req.userId).catch(() => null);
      if (user) {
        await utils.sendDM(user, {
          accentColor: 0xFF3B30,
          title: 'Заявка по баллам отклонена',
          body: `Ваша заявка была отклонена.\n\n**Причина:** ${reason}`,
          footer: 'BENZO • POINTS',
        }).catch(() => {});
      }

      await audit.log('points', 'Points request rejected', {
        requestId,
        userId: req.userId,
        reason,
        by: interaction.user.id,
      });

      return interaction.editReply({
        content: 'Заявка отклонена, причина сохранена.',
      });
    }
  },

  buildPendingRequestContainer,
};
