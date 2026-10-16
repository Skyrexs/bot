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
const logger = require('../logger');
const utils = require('../utils');
const audit = utils.audit;

function hasModeratorRole(member) {
  if (!member) return false;
  if (config.HIGH_STAFF_ROLE_ID && member.roles.cache.has(config.HIGH_STAFF_ROLE_ID)) return true;
  return Array.isArray(config.ADMIN_ROLES) &&
    config.ADMIN_ROLES.some((id) => id && member.roles.cache.has(id));
}

const PROMO_REVIEW_CHANNEL_ID =
  process.env.PROMO_REVIEW_CHANNEL_ID || config.REVIEW_CHANNEL_ID;

module.exports = {
  buttonIds: ['promo_panel_btn'],
  buttonPrefixes: ['promo_accept_', 'promo_reject_'],
  modalPrefixes: ['promo_modal'],

  async handleButton(interaction) {
    const id = interaction.customId;

    if (id === 'promo_panel_btn') {
      const modal = new ModalBuilder()
        .setCustomId('promo_modal')
        .setTitle('Заявка на повышение');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('promo_name')
            .setLabel('Имя Фамилия и Статик')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('promo_activity')
            .setLabel('Сколько находитесь в семье?')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(500)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('promo_reasons')
            .setLabel('Скрины и откаты с МП')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(500)
        )
      );

      interaction._handled = true;
      await audit.log('promotion', 'Открыта форма повышения', {
        userId: interaction.user.id,
      });
      return interaction.showModal(modal);
    }

    if (id.startsWith('promo_accept_') || id.startsWith('promo_reject_')) {
      if (!hasModeratorRole(interaction.member)) {
        return interaction.reply({
          content: 'У вас нет прав на обработку заявок на повышение.',
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
      }

      const userId = id.replace(/^promo_(?:accept|reject)_/, '');
      const accepted = id.startsWith('promo_accept_');

      try {
        const guild = interaction.guild;
        const member = await guild?.members.fetch(userId).catch(() => null);

        if (accepted && member) {
          // Promote from academy/test role to main role if configured.
          if (config.ACADEMY_ROLE_ID) {
            await member.roles.remove(
              config.ACADEMY_ROLE_ID,
              `Promotion accepted by ${interaction.user.tag}`
            ).catch(() => {});
          }

          if (config.MAIN_ROLE_ID) {
            await member.roles.add(
              config.MAIN_ROLE_ID,
              `Promotion accepted by ${interaction.user.tag}`
            ).catch((e) => {
              logger.warn('Failed to add main role after promotion', {
                error: e.message,
                userId,
              });
            });
          }
        }

        const container = buildPromotionResult(
          userId,
          accepted ? 'accepted' : 'rejected',
          interaction.user.id
        );

        await interaction.update({
          components: [container],
        }).catch(() => {});

        const user = await interaction.client.users.fetch(userId).catch(() => null);
        if (user) {
          await utils.sendDM(user, {
            accentColor: accepted ? 0x00C853 : 0xFF3B30,
            title: accepted
              ? 'Повышение принято'
              : 'Повышение отклонено',
            body: accepted
              ? `Поздравляем! Ваша заявка на повышение принята.\nРассмотрел: <@${interaction.user.id}>`
              : `Ваша заявка на повышение отклонена.\nРассмотрел: <@${interaction.user.id}>`,
            footer: 'GUCCI • PROMOTION',
          }).catch(() => {});
        }

        await audit.log(
          'promotion',
          accepted ? 'Повышение принято' : 'Повышение отклонено',
          {
            userId,
            by: interaction.user.id,
          }
        );
      } catch (e) {
        logger.error('promotion decision error', {
          error: e.message,
          stack: e.stack,
        });
        await audit.log('error', 'Promotion decision failed', {
          error: e.message,
          userId,
        });
      }
    }
  },

  async handleModal(interaction) {
    if (interaction.customId !== 'promo_modal') return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const name = interaction.fields.getTextInputValue('promo_name').trim();
      const activity = interaction.fields.getTextInputValue('promo_activity').trim();
      const reasons = interaction.fields.getTextInputValue('promo_reasons').trim();

      const container = new ContainerBuilder().setAccentColor(0x7C4DFF);

      addBanner(container);

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## ⭐ ЗАЯВКА НА ПОВЫШЕНИЕ\n` +
          `-# GUCCI • PROMOTION REVIEW`
        )
      );

      container.addSeparatorComponents(
        new SeparatorBuilder()
          .setSpacing(SeparatorSpacingSize.Large)
          .setDivider(true)
      );

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### 👤 Заявитель\n` +
          `> **Пользователь:** <@${interaction.user.id}>\n` +
          `> **Discord ID:** \`${interaction.user.id}\`\n` +
          `> **Имя / статик:** ${name}`
        )
      );

      container.addSeparatorComponents(
        new SeparatorBuilder()
          .setSpacing(SeparatorSpacingSize.Small)
          .setDivider(true)
      );

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### 📈 Активность в семье\n${activity}`
        )
      );

      container.addSeparatorComponents(
        new SeparatorBuilder()
          .setSpacing(SeparatorSpacingSize.Small)
          .setDivider(true)
      );

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### 🎬 Скрины / откаты с МП\n${reasons}`
        )
      );

      container.addSeparatorComponents(
        new SeparatorBuilder()
          .setSpacing(SeparatorSpacingSize.Small)
          .setDivider(true)
      );

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### ⚖️ Решение\n` +
          `Проверьте активность, доказательства и соответствие требованиям.\n\n` +
          `-# REQUESTED BY <@${interaction.user.id}> • <t:${Math.floor(Date.now() / 1000)}:F>`
        )
      );

      container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`promo_accept_${interaction.user.id}`)
            .setLabel('Принять и повысить')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`promo_reject_${interaction.user.id}`)
            .setLabel('Отклонить')
            .setStyle(ButtonStyle.Danger)
        )
      );

      const reviewCh = await interaction.guild.channels
        .fetch(PROMO_REVIEW_CHANNEL_ID)
        .catch(() => null);

      if (!reviewCh) {
        return interaction.editReply({
          content: 'Канал для рассмотрения заявок не найден.',
        });
      }

      await reviewCh.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });

      await audit.log('promotion', 'Создана заявка на повышение', {
        userId: interaction.user.id,
        name,
        channelId: reviewCh.id,
      });

      return interaction.editReply({
        content: 'Заявка на повышение отправлена на рассмотрение.',
      });
    } catch (e) {
      logger.error('promo modal error', {
        error: e.message,
        stack: e.stack,
      });
      await audit.log('error', 'Promotion application failed', {
        error: e.message,
        userId: interaction.user.id,
      });
      return interaction.editReply({
        content: 'Не удалось отправить заявку.',
      });
    }
  },
};

function buildPromotionResult(userId, status, reviewerId) {
  const accepted = status === 'accepted';

  const container = new ContainerBuilder()
    .setAccentColor(accepted ? 0x00C853 : 0xFF3B30);

  addBanner(container);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${accepted ? '✅ ПОВЫШЕНИЕ ПРИНЯТО' : '❌ ПОВЫШЕНИЕ ОТКЛОНЕНО'}`
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setSpacing(SeparatorSpacingSize.Large)
      .setDivider(true)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### 👤 Заявитель\n` +
      `> <@${userId}> • \`${userId}\`\n\n` +
      `### ⚖️ Решение\n` +
      `> **Статус:** ${accepted ? 'ПРИНЯТО' : 'ОТКЛОНЕНО'}\n` +
      `> **Рассмотрел:** <@${reviewerId}>\n` +
      `> **Время:** <t:${Math.floor(Date.now() / 1000)}:F>`
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setSpacing(SeparatorSpacingSize.Small)
      .setDivider(true)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      accepted
        ? `### 🎉 Следующий статус\nПользователь переведён на основной семейный уровень.`
        : `### ℹ️ Следующий шаг\nПри необходимости пользователь может подать новую заявку согласно правилам семьи.`
    )
  );

  return container;
}
