const { addBanner } = require('../utils/banner');
const {
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const config = require('../config');
const db = require('../database');
const { saveApplication, getApplication, setApplicationMessageId, setCooldown, getCooldown, deleteApplication, addToBlacklist, getBlacklist, logApplicationHistory } = db;
const logger = require('../logger');
const utils = require('../utils');
const audit = utils.audit;
const { hasModeratorAccess } = require('../utils/permissions');

function hasModeratorRole(member) {
  return hasModeratorAccess(member);
}

async function safeEphemeralReply(interaction, content) {
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  } catch (err) {
    const message = String(err?.message || '');
    if (err?.code === 10062 || /Unknown interaction/i.test(message)) {
      logger.warn('Interaction expired when trying to reply to user', { userId: interaction.user?.id });
      return;
    }
    logger.error('safeEphemeralReply failed', { error: err.message, stack: err.stack });
  }
}

module.exports = {
  selectIds: ['application_select'],
  buttonPrefixes: ['app_accept_', 'app_interview_', 'app_reject_', 'app_blacklist_'],
  modalPrefixes: ['application_modal', 'app_reject_modal_', 'app_blacklist_modal_'],

  async handleSelect(interaction) {
    const val = interaction.values?.[0];
    if (interaction.customId === 'application_select' && val === 'submit_application') {
      if (interaction.isAcknowledged?.()) return;

      const modal = new ModalBuilder().setCustomId('application_modal').setTitle('Заявка в семью BENZO');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('app_name').setLabel('Ваши Имя Фамилия и Статический ID').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setPlaceholder('Пример: Wex Benzo | 1337')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('app_age').setLabel('Ваш Возраст').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2).setPlaceholder('Укажите Ваш реальный возраст')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('app_level').setLabel('Ваш часовой пояс и онлайн').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setPlaceholder('Напишите Ваш часовой пояс и средний суточный онлайн')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('app_reason').setLabel('Расскажите о себе').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000).setPlaceholder('Распишите Ваш опыт в игре, в каких семьях играли и т.п')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('app_online').setLabel('Почему именно BENZO?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000).setPlaceholder('Почему Вы выбрали именно нас'))
      );

      try {
        return await interaction.showModal(modal);
      } catch (err) {
        if (err?.code === 10062 || /Unknown interaction|Interaction has already been acknowledged/i.test(err?.message || '')) {
          return;
        }
        throw err;
      }
    }
  },

  async handleModal(interaction) {
    if (interaction.customId === 'application_modal') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

      try {
        const userId       = interaction.user.id;
        const nickname     = interaction.fields.getTextInputValue('app_name');
        const age          = interaction.fields.getTextInputValue('app_age');
        const level        = interaction.fields.getTextInputValue('app_level');
        const reason       = interaction.fields.getTextInputValue('app_reason');
        const onlineAndExp = interaction.fields.getTextInputValue('app_online');

        const blacklist = getBlacklist();
        if (blacklist.some(b => b.userId === userId)) {
          await interaction.editReply({ content: 'Вы находитесь в чёрном списке и не можете подать заявку.' }).catch(()=>{});
          return;
        }

        const cooldown = getCooldown(userId);
        if (cooldown && cooldown.expiresAt && cooldown.expiresAt > new Date()) {
          const remainingMs = cooldown.expiresAt.getTime() - Date.now();
          const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
          await interaction.editReply({ content: `Вы не можете подать заявку ещё ${remainingDays} ${remainingDays === 1 ? 'день' : 'дня'}.` }).catch(()=>{});
          return;
        }

        saveApplication({ userId, userTag: interaction.user.tag, nickname, age, level, reason, onlineAndExp });
        logApplicationHistory(userId, interaction.user.tag, 'submitted', `Nickname: ${nickname}, Age: ${age}, Level: ${level}`, interaction.user.id);
        audit.log('applications', 'Application saved', { userId, nickname, age, level });

        const container = new ContainerBuilder().setAccentColor(0x000000);

        addBanner(container);
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## <a:483a045a18644d3c8de001ce288bc40a:1507119681474007151> НОВАЯ ЗАЯВКА В СЕМЬЮ <@&1435546968586715238> <@&1435517582365950012> <a:483a045a18644d3c8de001ce288bc40a:1507119681474007151>`));
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true));
        
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### <:754816forreal:1470442212020981963> Информация о заявителе`));
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `**Пользователь:** <@${userId}> (\`${interaction.user.tag}\`)\n` +
          `**Discord ID:** \`${userId}\``
        ));
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### <:865725soldado:1470440231663567091> Ответы на вопросы`));
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `**Имя Фамилия, Статик:**\n${nickname}\n\n` +
          `**Возраст:**\n${age}\n\n` +
          `**Часовой пояс и онлайн:**\n${level}\n\n` +
          `**О себе:**\n${reason}\n\n` +
          `**Почему мы:**\n${onlineAndExp || '—'}`
        ));
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        container.addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`app_accept_${userId}`).setLabel('Принять').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`app_interview_${userId}`).setLabel('Обзвон').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`app_reject_${userId}`).setLabel('Отклонить').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`app_blacklist_${userId}`).setLabel('В ЧС').setStyle(ButtonStyle.Secondary)
          )
        );

        logger.info('Application submission: fetching review channel', { userId, reviewChannelId: config.REVIEW_CHANNEL_ID });
        const reviewChannel = await interaction.guild.channels.fetch(config.REVIEW_CHANNEL_ID).catch((e) => {
          logger.warn('Failed to fetch review channel', { error: e?.message });
          return null;
        });
        if (!reviewChannel) {
          audit.log('error', 'Review channel not found for application', { reviewChannelId: config.REVIEW_CHANNEL_ID });
          await safeEphemeralReply(interaction, 'Канал для рассмотрения заявок не найден. Обратитесь к администратору.');
          return;
        }

        let sentMsg = null;
        let reviewSent = false;
        try {
          logger.info('Attempting to send application to review channel (components v2)', { userId, channelId: reviewChannel.id });
          sentMsg = await reviewChannel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
          reviewSent = !!sentMsg;
          logger.info('Application sent to review (components)', { userId, messageId: sentMsg?.id });
        } catch (e) {
          logger.warn('Failed to send application to review with components v2', { error: e?.message });
          try {
            logger.info('Attempting fallback plain send to review channel', { userId, channelId: reviewChannel.id });
            sentMsg = await reviewChannel.send({ content: `Новая заявка в семью BENZO от <@${userId}>`, allowedMentions: { parse: [] } });
            reviewSent = !!sentMsg;
            logger.info('Application sent to review (fallback plain)', { userId, messageId: sentMsg?.id });
          } catch (fallbackError) {
            logger.error('Failed to send application to review (all attempts)', { error: fallbackError?.message });
            audit.log('error', 'Application post to review failed', { userId, error: fallbackError?.message }).catch(() => {});
            // Remove saved application to avoid stale state when nothing was posted
            deleteApplication(userId);
            await safeEphemeralReply(interaction, 'Не удалось отправить заявку на рассмотрение. Попробуйте ещё раз.');
            return;
          }
        }

        let metadataPersisted = true;
        try {
          logger.info('Persisting application metadata', { userId, messageId: sentMsg?.id });
          setApplicationMessageId(userId, sentMsg.id);
          setCooldown(userId, Date.now() + (config.COOLDOWN_DAYS || 7) * 24 * 60 * 60 * 1000);
          logger.info('Application metadata persisted', { userId, messageId: sentMsg?.id });
        } catch (dbErr) {
          metadataPersisted = false;
          logger.warn('Failed to persist application metadata after review post', { userId, messageId: sentMsg?.id, error: dbErr?.message });
          audit.log('warning', 'Application posted but metadata persistence failed', { userId, messageId: sentMsg?.id, error: dbErr?.message }).catch(() => {});
        }

        audit.log('applications', 'Application posted to review', { userId, messageId: sentMsg?.id, channelId: reviewChannel.id, metadataPersisted, reviewSent }).catch(() => {});

        await interaction.editReply({ content: 'Ваша заявка отправлена на рассмотрение.' }).catch(() => {});
      } catch (err) {
        logger.error('Ошибка handleApplicationModal', { error: err.message, stack: err.stack });
        audit.log('error', 'handleApplicationModal failed', { error: err.message });
        await interaction.editReply({ content: 'Ваша заявка отправлена на рассмотрение.' }).catch(() => {});
      }
      return;
    }

    if (interaction.customId.startsWith('app_reject_modal_') || interaction.customId.startsWith('app_blacklist_modal_')) {
      if (!hasModeratorRole(interaction.member)) {
        return interaction.reply({
          content: 'У вас нет прав на обработку заявок.',
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
      }
    }

    if (interaction.customId.startsWith('app_reject_modal_')) {
      const parts = interaction.customId.replace('app_reject_modal_', '').split('_');
      const userId = parts[0];
      const messageId = parts[1];
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const reason = interaction.fields.getTextInputValue('reject_reason') || 'Не указана причина';
      const rawApp = getApplication(userId) || { userId, userTag: userId };
      const app = { ...rawApp, answers: utils.parseAppAnswers(rawApp) };
      const user = await interaction.client.users.fetch(userId).catch(()=>null);
      if (user) await utils.sendDM(user, { accentColor: 0xFF0000, title: 'Заявка отклонена', body: `Ваша заявка отклонена.\n\nПричина: ${reason}\nРассмотрел: <@${interaction.user.id}>`, footer: 'BENZO' }).catch(()=>{});
      deleteApplication(userId);
      logApplicationHistory(userId, app.userTag || userId, 'rejected', `Reason: ${reason}, By: ${interaction.user.tag}`, interaction.user.id);
      try {
        const resultContainer = utils.buildReviewResult(app, 'app', 'rejected', `<@${interaction.user.id}>`, reason, { withButtons: false });
        if (messageId && messageId !== '0') {
          const original = await interaction.channel?.messages.fetch(messageId).catch(()=>null);
          if (original) await original.edit({ components: [resultContainer] }).catch(()=>{});
        }
        await interaction.editReply({ content: 'Заявка отклонена и сообщение обновлено.' }).catch(()=>{});
      } catch (e) { logger.warn('Failed to edit review message on reject', { error: e.message }); }
      audit.log('applications', 'Application rejected', { userId, by: interaction.user.id, reason });
      return;
    }

    if (interaction.customId.startsWith('app_blacklist_modal_')) {
      const parts = interaction.customId.replace('app_blacklist_modal_', '').split('_');
      const userId = parts[0];
      const messageId = parts[1];
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const reason = interaction.fields.getTextInputValue('blacklist_reason') || 'Не указана причина';
      const user = await interaction.client.users.fetch(userId).catch(()=>null);
      addToBlacklist(userId, user?.tag || userId, reason, interaction.user.id);
      deleteApplication(userId);
      logApplicationHistory(userId, user?.tag || userId, 'blacklisted', `Reason: ${reason}, By: ${interaction.user.tag}`, interaction.user.id);
      audit.log('applications', 'Application user blacklisted', { userId, by: interaction.user.id, reason });
      try {
        const resultContainer = utils.buildReviewResult({ userId, userTag: user?.tag || userId }, 'app', 'blacklisted', `<@${interaction.user.id}>`, reason, { withButtons: false });
        if (messageId && messageId !== '0') {
          const original = await interaction.channel?.messages.fetch(messageId).catch(()=>null);
          if (original) await original.edit({ components: [resultContainer] }).catch(()=>{});
        }
        await interaction.editReply({ content: 'Пользователь добавлен в ЧС и сообщение обновлено.' }).catch(()=>{});
      } catch (e) { logger.warn('Failed to edit review message on blacklist', { error: e.message }); }
      return;
    }
  },

  async handleButton(interaction) {
    if (!hasModeratorRole(interaction.member)) {
      return interaction.reply({
        content: 'У вас нет прав на обработку заявок.',
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }

    const id = interaction.customId;

    if (id.startsWith('app_accept_')) {
      const userId = id.replace('app_accept_', '');
      const rawApp = getApplication(userId) || { userId, userTag: userId };
      const app = { ...rawApp, answers: utils.parseAppAnswers(rawApp) };
      const user = await interaction.client.users.fetch(userId).catch(()=>null);
      if (user) await utils.sendDM(user, { accentColor: 0x00C853, title: 'Заявка принята', body: `Поздравляем! Ваша заявка принята. Ожидайте сообщения для обзвона.`, footer: 'BENZO' }).catch(()=>{});

      try {
        const guild = interaction.guild;
        const member = await guild.members.fetch(userId).catch(()=>null);
        if (member) {
          const rolesToAdd = [];
          if (config.FAMILY_TEST_ROLE_ID) rolesToAdd.push(config.FAMILY_TEST_ROLE_ID);
          if (config.FAMILY_BENZO_ROLE_ID) rolesToAdd.push(config.FAMILY_BENZO_ROLE_ID);
          if (rolesToAdd.length) await member.roles.add(rolesToAdd, `Application accepted by ${interaction.user.tag}`).catch(()=>{});
        }
      } catch (e) { logger.warn('Failed to assign family roles on application accept', { error: e.message }); }

      deleteApplication(userId);
      logApplicationHistory(userId, app.userTag || userId, 'accepted', `By: ${interaction.user.tag}`, interaction.user.id);
      try { const resultContainer = utils.buildReviewResult(app, 'app', 'accepted', `<@${interaction.user.id}>`, null, { withButtons: false }); await interaction.update({ components: [resultContainer] }).catch(()=>{}); } catch (e) { logger.warn('Failed to edit review message on accept', { error: e.message }); }
      audit.log('applications', 'Application accepted', { userId, by: interaction.user.id });
      return;
    }

    if (id.startsWith('app_interview_')) {
      const userId = id.replace('app_interview_', '');
      const rawApp = getApplication(userId) || { userId, userTag: userId };
      const app = { ...rawApp, answers: utils.parseAppAnswers(rawApp) };
      const user = await interaction.client.users.fetch(userId).catch(()=>null);
      if (user) await utils.sendDM(user, { accentColor: 0xFFD700, title: 'Приглашение на обзвон', body: `Ваша заявка прошла до этапа обзвона. Ожидайте сообщение от лидера/старшего состава.`, footer: 'BENZO' }).catch(()=>{});
      logApplicationHistory(userId, app.userTag || userId, 'interview', `By: ${interaction.user.tag}`, interaction.user.id);
      try { const resultContainer = utils.buildReviewResult(app, 'app', 'interview', `<@${interaction.user.id}>`); await interaction.update({ components: [resultContainer] }).catch(()=>{}); } catch (e) { logger.warn('Failed to edit review message on interview', { error: e.message }); }
      audit.log('applications', 'Application interview scheduled', { userId, by: interaction.user.id });
      return;
    }

    if (id.startsWith('app_reject_')) {
      const userId = id.replace('app_reject_', '');
      const modal = new ModalBuilder().setCustomId(`app_reject_modal_${userId}_${interaction.message?.id || '0'}`).setTitle('Отклонение заявки');
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reject_reason').setLabel('Причина отклонения').setStyle(TextInputStyle.Paragraph).setRequired(true).setMinLength(3)));
      interaction._handled = true;
      return interaction.showModal(modal).catch(async (err) => {
        logger.warn('Failed to show reject modal', { error: err.message });
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'Не удалось открыть форму.', flags: MessageFlags.Ephemeral }).catch(()=>{});
        }
      });
    }

    if (id.startsWith('app_blacklist_')) {
      const userId = id.replace('app_blacklist_', '');
      const modal = new ModalBuilder().setCustomId(`app_blacklist_modal_${userId}_${interaction.message?.id || '0'}`).setTitle('Добавление в ЧС');
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('blacklist_reason').setLabel('Причина').setStyle(TextInputStyle.Paragraph).setRequired(true)));
      interaction._handled = true;
      return interaction.showModal(modal).catch(async (err) => {
        logger.warn('Failed to show blacklist modal', { error: err.message });
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'Не удалось открыть форму.', flags: MessageFlags.Ephemeral }).catch(()=>{});
        }
      });
    }
  },
};