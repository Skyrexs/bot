// handlers/verification.js
const db = require('../database');
const config = require('../config');
const logger = require('../logger');
const { MessageFlags } = require('discord.js');
const { addBanner } = require('../utils/banner');
const { buildSuccessMessage, buildErrorMessage } = require('../utils/messageBuilders');
const audit = require('../utils').audit;

module.exports = {
  selectIds: ['verification_select'],
  modalPrefixes: ['verification_modal'],
  buttonIds: [],

  async handleSelect(interaction) {
    // If you later want a select to open verification modal
  },

  async handleModal(interaction) {
    if (!interaction.customId.startsWith('verification_modal')) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(()=>{});
    try {
      const name = interaction.fields.getTextInputValue('v_name') || interaction.user.tag;
      const details = interaction.fields.getTextInputValue('v_details') || '';
      const id = `ver_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
      const now = Date.now();
      db.db.prepare(`INSERT INTO verification_requests (id,userId,answers,status,messageId,createdAt) VALUES (?,?,?,?,?,?)`)
        .run(id, interaction.user.id, JSON.stringify([{label:'name',value:name},{label:'details',value:details}]), 'pending', null, now);

      const reviewChannelId = process.env.VERIFICATION_REVIEW_CHANNEL_ID || config.REVIEW_CHANNEL_ID;
      const ch = await interaction.guild.channels.fetch(reviewChannelId).catch(()=>null);
      if (ch && ch.isTextBased && ch.isTextBased()) {
        const container = buildVerificationReviewContainer({ id, userId: interaction.user.id, answers: [{label:'name',value:name},{label:'details',value:details}], status:'pending' });
        const sent = await ch.send({ components: [container], flags: 0 }).catch(()=>null);
        if (sent) db.db.prepare('UPDATE verification_requests SET messageId=? WHERE id=?').run(sent.id, id);
      }

      audit.log('verification','Submitted', { id, user: interaction.user.id });
      await interaction.editReply({ content: 'Ваша заявка на верификацию отправлена.' }).catch(()=>{});
    } catch (e) {
      logger.error('verification modal error', { error: e.message, stack: e.stack });
      await interaction.editReply({ content: 'Ошибка отправки верификации.' }).catch(()=>{});
    }
  }
};

function buildVerificationReviewContainer(req) {
  const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  const c = new ContainerBuilder().setAccentColor(0x7C4DFF);
  addBanner(c);
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Верификация — заявка`));
  c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`Пользователь: <@${req.userId}>\n\nОтветы:\n${(req.answers||[]).map(a=>`**${a.label}**\n${a.value}\n`).join('\n')}`));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`verification_accept_${req.id}`).setLabel('Принять').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`verification_reject_${req.id}`).setLabel('Отклонить').setStyle(ButtonStyle.Danger)
  ));
  return c;
}