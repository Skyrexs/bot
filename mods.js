const { MessageFlags } = require('discord.js');
const { getModItem } = require('../utils/modsPanel');
const logger = require('../logger');

module.exports = {
  selectIds: ['mods_panel_select'],
  async handleSelect(interaction) {
    const val = interaction.values?.[0];
    if (!val) {
      return interaction.reply({ content: 'Неверная опция', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    const item = getModItem(val);
    if (!item) {
      return interaction.reply({ content: 'Мод не найден', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    try {
      const container = item.build();
      await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | 64 }).catch(() => {});
    } catch (e) {
      logger.error('mods select handler error', { error: e.message });
      await interaction.reply({ content: 'Ошибка при загрузке информации о моде.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  },
};
