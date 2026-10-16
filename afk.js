const { MessageFlags } = require('discord.js');
const { setAFK, removeAFK, getAFK } = require('../database');
const utils = require('../utils');
const audit = utils.audit;
const { buildSuccessMessage, buildWarningMessage } = utils;
const logger = require('../logger');

module.exports = {
  buttonIds: ['afk_set', 'afk_remove'],
  async handleButton(interaction) {
    const id = interaction.customId;
    try {
      if (id === 'afk_set') {
        const benzoRoleId = require('../config').BENZO_ROLE_ID;
        if (!benzoRoleId || !interaction.member?.roles?.cache?.has(benzoRoleId)) {
          return interaction.reply({
            components: [buildWarningMessage('Доступ закрыт', 'В АФК могут вставать только участники с ролью BENZO.')],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
          }).catch(() => {});
        }

        const existing = getAFK(interaction.user.id, interaction.guild.id);
        if (existing) {
          return interaction.reply({ components: [buildWarningMessage('Уже в АФК', 'Вы уже находитесь в АФК.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(()=>{});
        }
        setAFK(interaction.user.id, interaction.guild.id);
        await utils.logAFKEvent(interaction.user.id, interaction.guild.id, 'afk').catch(()=>{});
        await utils.updateAFKPanelMessage(interaction.client, interaction.guild.id).catch(()=>{});
        await interaction.reply({ components: [buildSuccessMessage('Вы в АФК', 'Вы встали в АФК.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(()=>{});
        audit.log('afk', 'User set AFK', { user: interaction.user.id, guild: interaction.guild.id });
        return;
      }

      if (id === 'afk_remove') {
        const existing = getAFK(interaction.user.id, interaction.guild.id);
        if (!existing) {
          return interaction.reply({ components: [buildWarningMessage('Не в АФК', 'Вы не находитесь в АФК.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(()=>{});
        }
        removeAFK(interaction.user.id, interaction.guild.id);
        await utils.logAFKEvent(interaction.user.id, interaction.guild.id, 'returned').catch(()=>{});
        await utils.updateAFKPanelMessage(interaction.client, interaction.guild.id).catch(()=>{});
        await interaction.reply({ components: [buildSuccessMessage('Вышли из АФК', 'Вы вышли из АФК.')], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(()=>{});
        audit.log('afk', 'User removed AFK', { user: interaction.user.id, guild: interaction.guild.id });
        return;
      }
    } catch (e) {
      logger.error('afk handler error', { error: e.message, stack: e.stack });
      audit.log('error', 'afk handler error', { error: e.message });
      try { if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: 'Ошибка при обработке АФК', flags: MessageFlags.Ephemeral }); else await interaction.editReply({ content: 'Ошибка при обработке АФК' }); } catch {}
    }
  }
};