const { MessageFlags } = require('discord.js');
const db = require('../database');
const config = require('../config');
const logger = require('../logger');
const utils = require('../utils');
const { hasModeratorAccess } = require('../utils/permissions');

module.exports = {
  buttonPrefixes: ['approve_vac_', 'reject_vac_'],

  async handleButton(interaction) {
    if (!interaction.customId) return;
    const id = interaction.customId;

    if (id.startsWith('approve_vac_')) {
      if (!hasModeratorAccess(interaction.member)) return interaction.reply({ content: 'У вас нет прав', flags: MessageFlags.Ephemeral }).catch(()=>{});
      const vacId = id.replace('approve_vac_', '');
      const req = db.getVacationRequest(vacId);
      if (!req) return interaction.reply({ content: 'Заявка не найдена', flags: MessageFlags.Ephemeral }).catch(()=>{});

      try {
        const guild = interaction.guild;
        const member = await guild.members.fetch(req.userId).catch(()=>null);
        if (member && config.VACATION_ROLE_ID) {
          await member.roles.add(config.VACATION_ROLE_ID, `Vacation approved by ${interaction.user.tag}`).catch(()=>{});
        }

        db.updateVacationRequest(vacId, { status: 'approved', reviewerId: interaction.user.id, handledAt: Date.now() });

        // Update original message if present
        if (req.messageId) {
          const ch = await interaction.channel.fetch().catch(()=>null);
          // best-effort: edit the message where it was posted
          try {
            const original = await interaction.channel.messages.fetch(req.messageId).catch(()=>null);
            if (original) {
              const container = utils.buildSuccessMessage('Заявка одобрена', `Заявка на отпуск пользователя <@${req.userId}> одобрена.`);
              await original.edit({ components: [container] }).catch(()=>{});
            }
          } catch (e) {}
        }

        try { await utils.sendDM(await interaction.client.users.fetch(req.userId).catch(()=>null), { accentColor: 0x00C853, title: 'Заявка одобрена', body: `Ваша заявка на отпуск одобрена.` }); } catch (e) {}

        await interaction.reply({ content: 'Заявка одобрена.', flags: MessageFlags.Ephemeral }).catch(()=>{});
      } catch (e) {
        logger.error('approve vacation error', { error: e.message, stack: e.stack });
        await interaction.reply({ content: 'Ошибка при одобрении.', flags: MessageFlags.Ephemeral }).catch(()=>{});
      }
    }

    if (id.startsWith('reject_vac_')) {
      if (!hasModeratorAccess(interaction.member)) return interaction.reply({ content: 'У вас нет прав', flags: MessageFlags.Ephemeral }).catch(()=>{});
      const vacId = id.replace('reject_vac_', '');
      const req = db.getVacationRequest(vacId);
      if (!req) return interaction.reply({ content: 'Заявка не найдена', flags: MessageFlags.Ephemeral }).catch(()=>{});
      try {
        db.updateVacationRequest(vacId, { status: 'rejected', reviewerId: interaction.user.id, handledAt: Date.now() });
        try { await utils.sendDM(await interaction.client.users.fetch(req.userId).catch(()=>null), { accentColor: 0xFF3B30, title: 'Заявка отклонена', body: `Ваша заявка на отпуск отклонена.` }); } catch (e) {}
        // edit original request to show rejected
        if (req.messageId) {
          try {
            const original = await interaction.channel.messages.fetch(req.messageId).catch(()=>null);
            if (original) {
              const container = utils.buildErrorMessage('Заявка отклонена', `Заявка на отпуск пользователя <@${req.userId}> отклонена.`);
              await original.edit({ components: [container] }).catch(()=>{});
            }
          } catch (e) {}
        }
        await interaction.reply({ content: 'Заявка отклонена.', flags: MessageFlags.Ephemeral }).catch(()=>{});
      } catch (e) {
        logger.error('reject vacation error', { error: e.message, stack: e.stack });
        await interaction.reply({ content: 'Ошибка при отклонении.', flags: MessageFlags.Ephemeral }).catch(()=>{});
      }
    }
  }
};
