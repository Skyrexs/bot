const { Events } = require('discord.js');
const logger = require('../logger');
const audit = require('../utils').audit;

module.exports = {
  name: Events.MessageUpdate,

  async execute(oldMessage, newMessage) {
    try {
      if (!newMessage.guild || newMessage.author?.bot) return;

      const oldContent = oldMessage.content || '';
      const newContent = newMessage.content || '';

      if (
        oldContent === newContent &&
        oldMessage.attachments?.size === newMessage.attachments?.size
      ) return;

      await audit.log('message', 'Сообщение изменено', {
        guildId: newMessage.guild.id,
        channelId: newMessage.channelId,
        messageId: newMessage.id,
        authorId: newMessage.author?.id || null,
        authorTag: newMessage.author?.tag || null,
        oldContent: oldContent.slice(0, 2000),
        newContent: newContent.slice(0, 2000),
      });
    } catch (e) {
      logger.error('Ошибка messageUpdate', {
        error: e.message,
        stack: e.stack,
      });
    }
  },
};
