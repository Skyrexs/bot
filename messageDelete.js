const { Events } = require('discord.js');
const logger = require('../logger');
const audit = require('../utils').audit;
const db = require('../database');

module.exports = {
  name: Events.MessageDelete,

  async execute(message) {
    try {
      if (!message.guild) return;

      const capt = db.getAllCaughtLists().find((x) => x.messageId === message.id);
      const mcl = db.getAllMCLLists().find((x) => x.messageId === message.id);

      await audit.log('message', 'Сообщение удалено', {
        guildId: message.guild.id,
        channelId: message.channelId,
        messageId: message.id,
        authorId: message.author?.id || null,
        authorTag: message.author?.tag || null,
        content: message.content?.slice(0, 3000) || '',
        relatedRoster: capt
          ? { type: 'CAPT', id: capt.id, preserved: true }
          : mcl
            ? { type: 'MCL', id: mcl.id, preserved: true }
            : null,
      });
    } catch (e) {
      logger.error('Ошибка messageDelete', {
        error: e.message,
        stack: e.stack,
      });
    }
  },
};
