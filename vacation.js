// handlers/vacation.js
const {
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
} = require('discord.js');
const db = require('../database');
const config = require('../config');
const logger = require('../logger');
const audit = require('../utils').audit;
const { buildVacationModal, buildVacationReviewContainer, buildVacationPanel } = require('../utils/vacationPanel');
const { addBanner } = require('../utils/banner');
const { buildSuccessMessage, buildErrorMessage, buildWarningMessage } = require('../utils/messageBuilders');

module.exports = {
  buttonIds: ['vacation_submit'],
  modalPrefixes: ['vacation_modal'],

  async handleButton(interaction) {
    if (interaction.customId === 'vacation_submit') {
      interaction._handled = true;
      try {
        const modal = buildVacationModal();
        await interaction.showModal(modal);
      } catch (e) {
        logger.error('vacation showModal failed', { error: e.message, stack: e.stack });
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'Не удалось открыть форму.', flags: MessageFlags.Ephemeral }).catch(()=>{});
        }
      }
    }
  },

  async handleModal(interaction) {
    if (interaction.customId !== 'vacation_modal') return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(()=>{});

    try {
      const userId = interaction.user.id;
      const requestedFor = interaction.fields.getTextInputValue('vacation_until').trim();
      const reason = interaction.fields.getTextInputValue('vacation_reason').trim();

      const id = `vac_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
      const now = Date.now();

      db.db.prepare(`
        INSERT INTO vacation_requests (id,userId,requestedFor,reason,status,createdAt)
        VALUES (?,?,?,?,?,?)
      `).run(id, userId, requestedFor, reason, 'pending', now);

      const reviewChannelId = process.env.VACATION_REVIEW_CHANNEL_ID || config.REVIEW_CHANNEL_ID;
      const reviewCh = interaction.guild.channels.cache.get(reviewChannelId) || await interaction.guild.channels.fetch(reviewChannelId).catch(()=>null);

      let sent = null;
      if (reviewCh && reviewCh.isTextBased && reviewCh.isTextBased()) {
        const request = { id, userId, requestedFor, reason, status: 'pending' };
        const container = buildVacationReviewContainer(request);
        try {
          sent = await reviewCh.send({ components: [container], flags: 0 }).catch(()=>null);
          if (sent && sent.id) {
            db.db.prepare('UPDATE vacation_requests SET messageId=? WHERE id=?').run(sent.id, id);
          }
        } catch (e) {
          logger.warn('Failed to send vacation to review channel', { error: e.message });
        }
      }

      audit.log('vacation', 'Vacation request submitted', { id, userId, requestedFor, by: interaction.user.id });

      await interaction.editReply({ content: 'Заявка отправлена на рассмотрение.' }).catch(()=>{});
    } catch (e) {
      logger.error('vacation modal error', { error: e.message, stack: e.stack });
      await interaction.editReply({ content: 'Не удалось отправить заявку.' }).catch(()=>{});
    }
  },

  async handleButtonActionApproveReject(interaction) {
    // helper: used by interactionCreate dispatch if customId startsWith vacation_approve_ or vacation_reject_
  },
};